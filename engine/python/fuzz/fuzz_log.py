from engine.log import log, Render
from engine.log.arch import OPAQUE, SECRETS, STEMS
from hypothesis import given, settings, strategies as st
from pathlib import Path
import time, os

EXAMPLES  = 900
MARK      = "Zq9"
SAFE      = "abcdxyz0123 _"
NAMES     = ["password", "passwd", "passphrase", "db_pwd", "secret", "client_secret", "token", "access_token", "apiKey", "api-key", "private_key", "access_key", "credential", "cookie", "session_id", "signature", "authorization", "otp", "pin", "cvv", "jwt", "x-sig", "cardPin", "smsOtp", "dbPass", "SMTP_PASS", "app_key", "signingKey", "csrf", "urlSig"]
GAPS      = ["=", ": ", " = ", ":", '": ', "' : ", "]=", '\\": ', " => ", " == ", " := ", "' => ", "=== "]
SCHEMES   = ["https", "postgres", "amqp", "redis", "git+ssh", "mongodb+srv"]
FRAGMENTS = ["://", "@", "eyJ", "=", ":", '"', "'", "\\", " ", "&", "?", ".", "Bearer ", "password", "token", "a", "Zz09_-", "\n", "/", "#", "]", "ey", "J"]
LETTERS   = "abceiknoprstvwyABCEIKNOPRSTVWY_-. 9"
WILD      = st.text(st.characters(exclude_categories=()), max_size=40)
NOISE     = st.lists(st.sampled_from(FRAGMENTS), max_size=12).map("".join)
SOLID     = st.text("ABCDEFGHJKLMNPRSTUVWXYZabcdfghjkmnpqrstuvwxyz0123456789", min_size=13, max_size=40).map(lambda text: MARK + text)
SPACED    = st.text("ABCDEFabcdef0123456789 ,;&=:@/", min_size=13, max_size=40).map(lambda text: MARK + text)
SIGNED    = st.text("ABCDEFabcdef0123456789@:!$,;=", min_size=13, max_size=40).map(lambda text: MARK + text)
PLAIN     = st.recursive(
    st.one_of(st.none(), st.booleans(), st.integers(), st.floats(allow_nan=False), st.text(SAFE, max_size=12)),
    lambda inner: st.one_of(st.lists(inner, max_size=4), st.dictionaries(st.text(SAFE, max_size=6), inner, max_size=4)),
    max_leaves=12,
)
WILDTREE  = st.recursive(
    st.one_of(st.none(), st.booleans(), st.integers(), st.floats(), WILD, st.binary(max_size=12), NOISE),
    lambda inner: st.one_of(st.lists(inner, max_size=4), st.tuples(inner, inner), st.dictionaries(st.one_of(WILD, st.integers(), NOISE), inner, max_size=4)),
    max_leaves=16,
)

log.setup("info", "json", Path(os.devnull))

def nest ( path: list[str | int], leaf: object ) -> object:

    held = leaf

    for step in reversed(path): held = { step: held, "n": 1 } if isinstance(step, str) else [0] * (step % 3) + [held]

    return held

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.one_of(WILD, NOISE, st.lists(st.one_of(WILD, NOISE), max_size=6).map("".join)))
def scrub_never_crashes_and_settles ( text: str ) -> None:

    once = Render.scrub(text)

    assert Render.scrub(once) == once
    assert Render.grade(text) in (0, 1, 2)
    assert Render.mask(text).count("***") >= 1

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.one_of(st.sampled_from(NAMES), NOISE, st.text(LETTERS, max_size=24), WILD), st.text(LETTERS, max_size=6), st.text(LETTERS, max_size=6))
def stems_cover_every_graded_name ( name: str, before: str, after: str ) -> None:

    whole = f"{before}{name}{after}"
    found = SECRETS.search(whole)
    slow  = 0 if found is None else 2 if found.lastgroup or OPAQUE.search(whole, found.end()) else 1

    assert Render.grade(whole) == slow
    assert not (whole.isascii() and slow) or STEMS.search(whole.lower()) is not None

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.sampled_from(NAMES), st.sampled_from(GAPS), SOLID, NOISE, NOISE, st.booleans())
def named_secrets_never_survive ( name: str, gap: str, secret: str, before: str, after: str, upper: bool ) -> None:

    shown = name.upper() if upper and name.islower() else name

    assert secret not in Render.scrub(f"{before} {shown}{gap}{secret}{after}")
    assert secret not in Render.scrub(f"{before} https://host/path?a=1&{shown}={secret}&z=2 {after}")
    assert secret not in Render.scrub(f"{before}\n--{shown}={secret} {after}")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.sampled_from(NAMES), SPACED, NOISE, NOISE, st.sampled_from(['"', "'"]))
def quoted_secrets_never_survive ( name: str, secret: str, before: str, after: str, quote: str ) -> None:

    assert secret not in Render.scrub(f"{before} {name}={quote}{secret}{quote}{after}")
    assert secret not in Render.scrub(f"{before} {quote}{name}{quote}: {quote}{secret}{quote}{after}")
    assert secret not in Render.scrub(f"{before} Form({name}={quote}{secret}{quote}){after}")
    assert secret not in Render.scrub(f"{before} Form({name}=b{quote}{secret}{quote}){after}")
    assert secret not in Render.scrub(f"{before} {quote}{name}{quote} => {quote}{secret}{quote},{after}")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.sampled_from(SCHEMES), SIGNED, SOLID, NOISE, NOISE, st.sampled_from(["user", "", "x-access-token", "a.b"]))
def carried_secrets_never_survive ( scheme: str, signed: str, solid: str, before: str, after: str, user: str ) -> None:

    assert signed not in Render.scrub(f"{before} {scheme}://{user}:{signed}@db.internal:5432/app {after}")
    assert solid not in Render.scrub(f"{before} {scheme}://{solid}@host/path{after}")
    assert solid not in Render.scrub(f"{before} Bearer {solid}{after}")
    assert solid not in Render.scrub(f"{before} https://host/cb?code={solid}&state=1 {after}")
    assert solid not in Render.scrub(f"{before} https://host/api?key={solid} {after}")

    jwt = f"eyJhbGciOiJIUzI1NiJ9.eyJ{solid}.{solid}"

    assert jwt not in Render.scrub(f"{before} {jwt} {after}")
    assert solid not in Render.scrub(f"{before} {jwt} {after}")

    pem = f"-----BEGIN EC PRIVATE KEY-----\n{solid}\n{signed}\n-----END EC PRIVATE KEY-----"

    assert solid not in Render.scrub(f"{before} {pem} {after}")
    assert signed not in Render.scrub(f"{before} {pem[:-20]}")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.sampled_from(NAMES), SOLID, st.lists(st.one_of(st.text(SAFE, min_size=1, max_size=6), st.integers(0, 5)), max_size=6), WILDTREE)
def nested_secrets_never_survive ( name: str, secret: str, path: list[str | int], other: object ) -> None:

    tree = nest(path, { name: secret, "other": other, "held": { name: [secret] } })

    assert secret not in repr(Render.clean({ name: [secret] }))
    assert secret not in repr(Render.clean(nest(path, { name: secret, "other": other })))
    assert secret not in repr(Render.clean(nest(path, f"{name}={secret}")))
    assert secret not in repr(Render.clean(nest(path, (f"amqp://app:{secret}@mq/", { 1, 2 }))))

    with log.capture() as events: log.info("fuzz", tree=tree, **{ name: secret, "text": f"{name}: {secret}" })

    assert secret not in repr(events)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(PLAIN, WILDTREE)
def plain_trees_pass_and_wild_trees_never_crash ( plain: object, wild: object ) -> None:

    assert Render.clean(plain) == plain

    Render.clean(wild)

    with log.capture() as events: log.info("fuzz", plain=plain, wild=wild)

    assert events[0]["plain"] == plain

@settings(max_examples=EXAMPLES // 5, deadline=None, database=None)
@given(st.lists(st.sampled_from(FRAGMENTS), min_size=1, max_size=24), st.integers(1, 4000))
def soup_stays_linear ( pieces: list[str], times: int ) -> None:

    blob    = "".join(pieces) * times
    started = time.perf_counter()

    Render.scrub(blob)

    assert time.perf_counter() - started < 2

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.sampled_from(NAMES), SOLID, st.integers(257, 4096), st.booleans())
def long_keys_never_hide_the_secret_name ( name: str, secret: str, count: int, at_start: bool ) -> None:

    key = name + "_" + "x" * count if at_start else "x" * count + "_" + name

    assert secret not in repr(Render.clean({ key: secret }))
    assert secret not in Render.scrub(f"{key}={secret}")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(0, 5), st.integers(0, 5), st.integers(), st.integers())
def captures_and_spans_preserve_events ( before: int, inside: int, initial: int, changed: int ) -> None:

    with log.capture() as outer:

        for _ in range(before): log.info("before")

        with log.capture() as inner:

            for _ in range(inside): log.info("inside")

        with log.span("span", count=initial, ms=-1) as facts:

            facts.update(count=changed, event="wrong", level="critical", ms=-2)

    assert len(outer) == before + inside + 1 and len(inner) == inside
    assert outer[-1]["event"] == "span" and outer[-1]["count"] == changed and outer[-1]["ms"] >= 0


@settings(max_examples=1000, deadline=None, database=None)
@given(st.lists(st.booleans(), min_size=6, max_size=6), st.text(alphabet="abcXYZ0123456789_-", min_size=16, max_size=80))
def bearer_case_never_exposes_credentials ( upper: list[bool], secret: str ) -> None:

    scheme = "".join(letter.upper() if chosen else letter for letter, chosen in zip("bearer", upper, strict=True))

    assert Render.scrub(f"{scheme} {secret}") == f"{scheme} ***"

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(min_value=1, max_value=4), st.sampled_from(["local", "public"]), SOLID, SOLID)
def paseto_payloads_are_redacted ( version: int, purpose: str, payload: str, footer: str ) -> None:

    text = f"v{version}.{purpose}.{payload}.{footer}"
    assert Render.scrub(f"received {text} next") == "received *** next"
    assert Render.clean({ "detail": [text] }) == { "detail": ["***"] }

paseto_payloads_are_redacted()

bearer_case_never_exposes_credentials()

long_keys_never_hide_the_secret_name()
captures_and_spans_preserve_events()
scrub_never_crashes_and_settles()
stems_cover_every_graded_name()
named_secrets_never_survive()
quoted_secrets_never_survive()
carried_secrets_never_survive()
nested_secrets_never_survive()
plain_trees_pass_and_wild_trees_never_crash()
soup_stays_linear()
log.close()

print("fuzz log  properties=12  max_examples=per-property settings  ok")
