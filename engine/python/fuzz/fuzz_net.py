from collections.abc import AsyncIterator
from engine.error import Code, Fault
from engine.net import Egress, Remote, net
from hypothesis import HealthCheck, given, settings, strategies as st
from ipaddress import IPv4Address, IPv6Address, ip_address
from typing import Any
from urllib.parse import unquote
import asyncio, re

EXAMPLES = 1500
LABEL    = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
INSIDE   = ("127.0.0.1", "[::1]", "[::ffff:127.0.0.1]", "2130706433", "127.1", "0177.0.0.1", "0x7f.0.0.1", "169.254.169.254", "[64:ff9b::7f00:1]", "[::7f00:1]", "0.0.0.0", "0", "[::]", "10.0.0.1", "192.168.1.1", "172.16.0.1", "[fc00::1]", "[fe80::1]", "100.64.0.1", "localhost")  # noqa: S104
STRICT   = Egress()
LOCAL    = Egress(allow_private=True, ports=frozenset())
HOSTS    = st.one_of(st.sampled_from([*INSIDE, "example.com", "a.b.c.test", "xn--80ak6aa92e.com", "münchen.de", "127。0。0。1", "exa mple.com", "a_b.test", "-a.test", "a..b", "ex%41mple.com", "8.8.8.8", "[2606:4700::1111]"]), st.text(max_size=20))
URLS     = st.builds("{}://{}{}{}".format, st.sampled_from(["http", "https", "HTTP", "ftp", "file", ""]), HOSTS, st.sampled_from(["", ":80", ":443", ":8080", ":0", ":65536", ":abc"]), st.sampled_from(["", "/", "/a/b?c=d#e", "/x y"]))

loop = asyncio.new_event_loop()

async def pieces ( raw: bytes, cut: int ) -> AsyncIterator[bytes]:

    for index in range(0, len(raw), max(1, cut)): yield raw[index:index + max(1, cut)]

async def parse ( raw: bytes, cut: int ) -> list[tuple[str, str]]:

    return [event async for event in net.sse(pieces(raw, cut))]

async def split ( raw: bytes, cut: int, limit: int ) -> list[bytes]:

    return [line async for line in net.lines(pieces(raw, cut), limit)]

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

def tried ( work: Any ) -> Any:

    try: return run(work)
    except Fault as fault: return fault

def checked ( url: str ) -> Any:

    try: return STRICT.check(url)
    except Fault as fault: return fault

def denied ( text: str ) -> Fault | None:

    try: net.segment(text)
    except Fault as fault: return fault

    return None

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=200), st.integers(min_value=1, max_value=50))
def any_bytes_parse_without_raising ( raw: bytes, cut: int ) -> None:

    events = run(parse(raw, cut))

    assert isinstance(events, list)
    assert all(type(event) is str and type(data) is str for event, data in events)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.tuples(st.from_regex(r"[a-z]{1,8}", fullmatch=True), st.from_regex(r"[ -~]{0,30}", fullmatch=True)), min_size=1, max_size=8), st.integers(min_value=1, max_value=20))
def framed_events_round_trip_at_any_chunking ( events: list[tuple[str, str]], cut: int ) -> None:

    raw = "".join(f"event: {name}\ndata: {data}\n\n" for name, data in events).encode()

    assert run(parse(raw, cut)) == list(events)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.binary(max_size=24).filter(lambda line: b"\n" not in line), max_size=8), st.booleans(), st.integers(min_value=1, max_value=40), st.integers(min_value=1, max_value=30))
def lines_split_exactly_or_refuse_a_long_one ( lines: list[bytes], ended: bool, cut: int, limit: int ) -> None:

    raw  = b"\n".join(lines) + (b"\n" if ended and lines else b"")
    long = any(len(line) > limit for line in lines)

    made = tried(split(raw, cut, limit))

    if isinstance(made, Fault):

        assert made.code is Code.TOO_LARGE
        assert made.reason == "net.line"
        assert long

        return

    assert not long
    assert made == (lines if ended or not lines or lines[-1] else lines[:-1])

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.ip_addresses(), st.text(max_size=20)))
def only_a_global_address_is_public ( given: object ) -> None:

    text    = str(given)
    private = STRICT.private(text)

    if isinstance(given, IPv4Address | IPv6Address):

        held = given

        if isinstance(held, IPv6Address) and held.ipv4_mapped is not None: held = held.ipv4_mapped
        elif isinstance(held, IPv6Address) and (int(held) >> 32) in (0x64FF9B0000000000000000, 0): held = IPv4Address(int(held) & 0xFFFFFFFF)

        assert private == (not held.is_global or held.is_multicast), text

    else: assert private

    assert LOCAL.private(text) == private

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(URLS)
def egress_checks_never_raise_raw_and_only_admit_sound_hosts ( url: str ) -> None:

    made = checked(url)

    if isinstance(made, Fault):

        assert made.code in (Code.BAD_REQUEST, Code.FORBIDDEN)
        assert made.reason in ("parse.url", "net.port", "net.private", "net.host")

        return

    assert made.scheme in ("http", "https")
    assert made.port is None or 1 <= made.port <= 65535
    assert made.host.isascii()

    try: ip_address(made.host)
    except ValueError: assert all(LABEL.match(label) for label in made.host.split(".")), made.host
    else: assert not STRICT.private(made.host)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=24), st.sampled_from(["", "/", "/a", "a/b", "http://other.test/x", "https://api.test/y", "/../z"]))
def segments_and_remote_urls_stay_on_their_origin ( text: str, path: str ) -> None:

    remote = Remote(net, "https://api.test/base/", { "X-Key": "k" }, STRICT)

    if text in ("", ".", ".."):

        refused = denied(text)

        assert refused is not None
        assert refused.reason == "net.segment"

    else:

        quoted = net.segment(text)

        assert not set(quoted) & set("/?#")
        assert unquote(quoted) == text

    joined = remote.url(path)

    if path.startswith(("http://", "https://")): assert joined == path
    else: assert joined == "https://api.test/base/" + path.lstrip("/") if path else "https://api.test/base"

    assert remote.owns("https://api.test/anything")
    assert not remote.owns("https://other.test/")
    assert not remote.owns("http://api.test/")
    assert not remote.owns("not a url")
    assert remote.owns(joined) == (not path.startswith("http://"))

any_bytes_parse_without_raising()
framed_events_round_trip_at_any_chunking()
lines_split_exactly_or_refuse_a_long_one()
only_a_global_address_is_public()
egress_checks_never_raise_raw_and_only_admit_sound_hosts()
segments_and_remote_urls_stay_on_their_origin()

loop.close()

print(f"fuzz net  examples={EXAMPLES * 6}  ok")
