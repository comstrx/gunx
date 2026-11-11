from engine.config import Env, Settings
from engine.error import Code, Fault
from engine.validate import field, Shape
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from random import Random
from tempfile import TemporaryDirectory
from typing import ClassVar, Final, Literal
from uuid import UUID
import os, re

EXAMPLES = 1000
MARK     = "Zq9"
KEY      = re.compile(r"_*[A-Z][A-Z0-9_]*")
SOUP     = [b"A", b"B_1", b"=", b'"', b"'", b"\n", b"\r", b"\r\n", b"#", b" ", b"\t", b"${", b"}", b"\\", b"export ", b"_", b"$", b"\x00", b"\xff", b"\xef\xbb\xbf", "\u00e9".encode(), b"a b", b"${A}", b"${B_1}", b"${PATH}"]
WILD     = st.text(st.characters(exclude_categories=()), max_size=40)
CLEAN    = st.text(st.characters(exclude_categories=["Cs"], exclude_characters="\x00"), max_size=30)
NAME     = st.builds(lambda lead, rest: f"{lead}F{rest}", st.sampled_from(["", "_", "__"]), st.text("ABCXYZ019_", max_size=10))
SOLID    = st.text("ABCDEFGHJKLMNPRSTUVWXYZabcdfghjkmnpqrstuvwxyz0123456789", min_size=13, max_size=40).map(lambda text: MARK + text)
SIGNED   = st.text("ABCDEFabcdef0123456789@:!$,;=/?#[]\\ ", min_size=13, max_size=40).map(lambda text: MARK + text)
HOSTS    = st.sampled_from(["db.internal", "127.0.0.1", "[::1]", "api.example.com", "mq"])
SCHEMES  = st.sampled_from(["https", "postgres", "amqp", "redis", "mongodb+srv"])
PIECES   = st.lists(st.one_of(st.text("abc-/:. 9", max_size=5), st.integers(0, 8)), max_size=3)
KEPT     = dict(os.environ)
HS: Final = "hs"
LAB      = "lab"

class Inner(Shape):

    host : str
    port : int = 1

class Fuzzed(Settings):

    prefix: ClassVar[str] = "FZ"

    name        : str = "x"
    port        : int = 1
    ratio       : float = 0.5
    live        : bool = False
    level       : Literal["a", "b"] = "a"
    price       : Decimal = Decimal(1)
    when        : datetime | None = None
    ident       : UUID | None = None
    inner       : Inner | None = None
    hosts       : tuple[str, ...] = ()
    ports       : list[int] = field(default_factory=list)
    tags        : dict[str, str] = field(default_factory=dict)
    database    : str = ""
    api_url     : str = ""
    hook_url    : str = ""
    mirror_urls : list[str] = field(default_factory=list)
    password    : str = ""
    api_key     : str = ""
    salt        : str = ""
    token_kind  : Literal["hs", "rs"] = HS
    edge_secret : str = LAB
    note        : str = ""

env    = Env()
folder = TemporaryDirectory()
path   = Path(folder.name) / "case.env"
KEYS   = sorted(Fuzzed.keys().values())
KNOWN  = { *KEYS, "FZ" }
READERS: tuple[Callable[[str], object], ...] = (env.integer, env.number, env.boolean, env.list)
TYPED  = ["FZ_PORT", "FZ_RATIO", "FZ_LIVE", "FZ_PRICE", "FZ_WHEN", "FZ_IDENT", "FZ_INNER", "FZ_PORTS", "FZ_TAGS", "FZ_TOKEN_KIND"]

def tried [T] ( work: Callable[[], T] ) -> T | Fault:

    try: return work()
    except Fault as fault: return fault

def written ( key: str, value: str, style: int ) -> str:

    bare = value == value.strip() and not re.search(r"[\r\n]|[ \t]#|\$\{|^[\"']", value)

    if style == 0 and bare: return f"{key}={value}\n"
    if style == 1 and "'" not in value and "\r" not in value: return f"export {key} = '{value}' # note\n"

    held = value.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$").replace("\n", "\\n").replace("\r", "\\r")

    return f'{key}="{held}"\n'

def loops ( bodies: list[list[str | int]] ) -> bool:

    count = len(bodies)
    state = [0] * count

    def walk ( index: int ) -> bool:

        if index >= count or state[index] == 1: return True
        if state[index] == 2: return False

        state[index] = 1
        wrong        = any(walk(piece) for piece in bodies[index] if isinstance(piece, int))
        state[index] = 2

        return wrong

    return any(walk(index) for index in range(count))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.binary(max_size=120), st.lists(st.sampled_from(SOUP), max_size=30).map(b"".join)), st.booleans())
def wild_files_read_or_refuse ( body: bytes, override: bool ) -> None:

    path.write_bytes(body)

    found = tried(lambda: env.read(path, override))

    if isinstance(found, Fault):

        assert found.code is Code.INTERNAL
        assert found.reason in ("env.line", "env.file", "env.reference")
        assert found.message.startswith(f"{path}: ")
        assert list(found.errors or {}) == [str(path)]

        return

    assert all(KEY.fullmatch(key) for key in found)
    assert all("\x00" not in value for value in found.values())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.tuples(NAME, CLEAN, st.integers(0, 2)), max_size=6), st.sampled_from(["", "\ufeff"]), st.sampled_from(["", "# note\n", "\n \t\n"]))
def written_pairs_read_back ( pairs: list[tuple[str, str, int]], lead: str, gap: str ) -> None:

    path.write_text(lead + gap.join(written(key, value, style) for key, value, style in pairs), encoding="utf-8", newline="")

    assert env.read(path, override=True) == { key: value for key, value, _ in pairs }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(PIECES, min_size=1, max_size=8), st.randoms(use_true_random=False))
def references_settle_like_the_model ( bodies: list[list[str | int]], order: Random ) -> None:

    lines = [f'R{index}="' + "".join(piece if isinstance(piece, str) else f"${{R{piece}}}" for piece in body) + '"\n' for index, body in enumerate(bodies)]
    model: dict[str, str] = {}

    def settle ( index: int ) -> str:

        key = f"R{index}"

        if key not in model: model[key] = "".join(piece if isinstance(piece, str) else settle(piece) for piece in bodies[index])

        return model[key]

    order.shuffle(lines)
    path.write_text("".join(lines))

    found = tried(lambda: env.read(path, override=True))

    if isinstance(found, Fault):

        assert found.reason == "env.reference"
        assert loops(bodies)

        return

    assert not loops(bodies)
    assert found == { f"R{index}": settle(index) for index in range(len(bodies)) }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(st.sampled_from([*KEYS, "FZ_STRAY", "ENGINE_ENV"]), st.one_of(WILD, SOLID, st.sampled_from(["production", "1", "[1]", '{"a":"b"}', '{"host":"h"}', "a,b", "true", ""])), max_size=8))
def wild_settings_load_or_refuse ( source: dict[str, str] ) -> None:

    loaded = tried(lambda: Fuzzed.load(source))

    if isinstance(loaded, Fault):

        assert loaded.code is Code.INTERNAL
        assert loaded.reason in ("config.env", "config.shape")
        assert loaded.errors
        assert set(loaded.errors) <= KNOWN
        assert loaded.message

        return

    assert set(loaded.describe()) == set(Fuzzed.keys())
    assert set(Fuzzed.stray(source)) <= { "FZ_STRAY" }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(TYPED), SOLID)
def typed_values_never_reach_a_fault ( key: str, secret: str ) -> None:

    refused = tried(lambda: Fuzzed.load({ key: secret }))

    assert isinstance(refused, Fault)
    assert secret not in repr(refused.dump())
    assert list(refused.errors or {}) == [key]

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SOLID, SIGNED, SCHEMES, HOSTS, st.sampled_from(["user", "", "x-access-token", "a.b"]), st.integers(1, 65535))
def describe_never_shows_a_credential ( secret: str, signed: str, scheme: str, host: str, user: str, port: int ) -> None:

    shown = Fuzzed.load({
        "FZ_DATABASE": f"{scheme}://{user}:{secret}@{host}:{port}/app?sslmode=require&password={secret}",
        "FZ_API_URL": f"{scheme}://{user}:{signed}@{host}:{port}/v1/{secret}?token={secret}#{secret}",
        "FZ_HOOK_URL": f"https://{host}/services/{secret}",
        "FZ_MIRROR_URLS": f"{scheme}://{secret}@{host}/x,{scheme}://{user}:{signed}@{host},{secret}",
        "FZ_PASSWORD": secret, "FZ_API_KEY": signed, "FZ_SALT": secret, "FZ_EDGE_SECRET": signed,
        "FZ_TAGS": f'{{"password":"{secret}","client_secret":"{secret}","plain":"ok"}}',
        "FZ_NOTE": f"connect with token={secret} or {scheme}://{user}:{secret}@{host}",
    }).describe()

    assert secret not in repr(shown)
    assert signed not in repr(shown)
    assert shown["hook_url"] == f"https://{host}/***"
    assert shown["tags"]["plain"] == "ok"

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(NAME, WILD), st.one_of(WILD, st.sampled_from(["1", "1.5", "yes", "a, b", ""])))
def variables_set_or_refuse ( key: str, value: str ) -> None:

    if key in KEPT: return

    refused = tried(lambda: env.set(key, value))

    if isinstance(refused, Fault):

        assert refused.reason == "env.name"
        assert not env.has(key)

        return

    assert env.has(key)
    assert env.text(key) == value
    assert not value or env.need(key) == value

    for reader in READERS:

        read = tried(partial(reader, key))

        if not isinstance(read, Fault): continue

        assert read.reason == "env.value"
        assert read.message.startswith(f"{key}: ")

    env.forget(key)

    assert not env.has(key)
    assert env.text(key, "gone") == "gone"

wild_files_read_or_refuse()
written_pairs_read_back()
references_settle_like_the_model()
wild_settings_load_or_refuse()
typed_values_never_reach_a_fault()
describe_never_shows_a_credential()
variables_set_or_refuse()
folder.cleanup()

assert dict(os.environ) == KEPT

print(f"fuzz config  examples={EXAMPLES * 7}  ok")
