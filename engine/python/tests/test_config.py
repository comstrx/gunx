from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from engine.config import Config, Env, Settings
from engine.error import Code, Fault
from engine.validate import Shape, field
from pathlib import Path
from typing import Annotated, ClassVar, Literal
from uuid import UUID
import os, pytest

SECRET = "hunter2secret-hunter2"

class Inner(Shape):

    host : str
    port : int = 1

class AppConfig(Settings):

    prefix: ClassVar[str] = "APP"

    name    : str = "Engine"
    port    : int = 8000
    debug   : bool = False
    origins : list[str] = field(default_factory=list)
    ratio   : float = 1.0
    secret  : str | None = None
    tags    : dict[str, str] = field(default_factory=dict)

class Wide(Settings):

    prefix: ClassVar[str] = "W_"

    name    : str
    level   : Literal["a", "b"] = "a"
    price   : Decimal = Decimal("1.5")
    when    : datetime | None = None
    ident   : UUID | None = None
    inner   : Inner | None = None
    hosts   : tuple[str, ...] = ()
    ports   : list[int] = field(default_factory=list)
    flags   : set[str] = field(default_factory=set)
    size    : Annotated[int, "rows"] = 1
    limit   : int | None = None
    live    : bool | None = None
    api_key : Literal["hs", "rs"] | None = None

class Shown(Settings):

    prefix: ClassVar[str] = "SHOWN"

    database     : str = f"postgres://app:{SECRET}@db.internal:5432/app?sslmode=require&password={SECRET}"
    api_url      : str = f"https://user:{SECRET}@api.example.com:8443/v1/hook/abcdef?token={SECRET}"
    hook_url     : str = f"https://hooks.example.com/services/T000/B000/{SECRET}"
    cache_url    : str = "redis://127.0.0.1:6379/13"
    plain_url    : str = "http://127.0.0.1:1"
    sentry_dsn   : str = f"https://{SECRET}@o1.ingest.example.io/42"
    mirror_urls  : list[str] = field(default_factory=lambda: [f"amqp://app:{SECRET}@mq:5672/v", f"not a url {SECRET}"])
    backup_urls  : tuple[str, ...] = (f"s3://{SECRET}@bucket/key",)
    callback_uri : str = f"https://[::1]:8443/cb?code={SECRET}"
    password     : str = SECRET
    api_key      : str = SECRET
    salt         : str = SECRET
    token_url    : str = f"https://auth.example.com/oauth/{SECRET}"
    tags         : dict[str, str] = field(default_factory=lambda: { "password": SECRET, "plain": "ok" })
    note         : str = f"connect with token={SECRET} please"
    empty_url    : str = ""
    live         : bool = True
    port         : int = 8000
    owner        : str | None = None

class Release(Settings):

    prefix: ClassVar[str] = "REL"

    name       : str = "engine"
    secret     : str = "lab-only"
    api_url    : str = "http://127.0.0.1:1"
    passphrase : str = "lab"
    hook_uri   : str = "http://127.0.0.1:2"
    pepper     : str = ""
    token      : str | None = None
    key_ring   : list[str] = field(default_factory=list)
    port       : int = 8000

@pytest.fixture
def fresh () -> Iterator[Env]:

    kept = dict(os.environ)

    for key in [key for key in os.environ if key.startswith(("ENGINE_", "T_"))]: del os.environ[key]

    yield Env()

    os.environ.clear()
    os.environ.update(kept)

def refused ( found: pytest.ExceptionInfo[Fault], reason: str ) -> str:

    assert found.value.code is Code.INTERNAL and found.value.reason == reason

    return found.value.message

def test_settings_bind_to_the_environment_with_coercion () -> None:

    source = { "APP_PORT": "9000", "APP_DEBUG": "yes", "APP_ORIGINS": "a,b", "APP_RATIO": "0.5", "APP_SECRET": "supersecrettoken", "APP_TAGS": '{"k":"v"}' }
    loaded = AppConfig.load(source)

    assert (loaded.name, loaded.port, loaded.debug, loaded.origins, loaded.ratio) == ("Engine", 9000, True, ["a", "b"], 0.5)
    assert loaded.tags == { "k": "v" } and loaded.secret == "supersecrettoken"
    assert AppConfig.keys()["port"] == "APP_PORT" and AppConfig.head() == "APP_" and Wide.head() == "W_"
    assert loaded.describe()["secret"] == "su***en" and loaded.describe()["port"] == 9000
    assert AppConfig.load({ "APP_ORIGINS": '["x"]' }).origins == ["x"] and AppConfig.load({ "APP_NAME": "" }).name == "Engine"

    wide = Wide.load({
        "W_NAME": "x", "W_LEVEL": "b", "W_PRICE": "2.50", "W_WHEN": "2026-01-02T03:04:05Z", "W_SIZE": "7",
        "W_IDENT": "0190d6f4-0000-7000-8000-000000000000", "W_INNER": '{"host":"h","port":"7"}', "W_HOSTS": "a, b",
        "W_PORTS": "1,2", "W_FLAGS": "x,x,y", "W_LIMIT": "5", "W_LIVE": "off",
    })

    assert (wide.level, wide.price, wide.size, wide.limit, wide.live) == ("b", Decimal("2.50"), 7, 5, False)
    assert wide.when == datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC) and wide.inner == Inner(host="h", port=7)
    assert wide.ident == UUID("0190d6f4-0000-7000-8000-000000000000")
    assert (wide.hosts, wide.ports, wide.flags) == (("a", "b"), [1, 2], { "x", "y" })

def test_settings_refuse_by_naming_the_key_and_never_the_secret () -> None:

    with pytest.raises(Fault) as bad: AppConfig.load({ "APP_PORT": "many", "APP_DEBUG": "maybe" })

    assert refused(bad, "config.env") == "APP_PORT: Cannot parse integer; APP_DEBUG: Cannot parse boolean"
    assert sorted(bad.value.errors or {}) == ["APP_DEBUG", "APP_PORT"]

    with pytest.raises(Fault) as absent: Wide.load({})

    assert refused(absent, "config.shape") == "W_NAME: is required" and absent.value.errors == { "W_NAME": ["is required"] }

    cases = {
        "W_LEVEL": "zzz", "W_PRICE": "abc", "W_WHEN": "tomorrow", "W_IDENT": "nope", "W_INNER": '{"port":"x"}',
        "W_PORTS": "1,two", "W_FLAGS": "[1,[2]]", "W_SIZE": "9" * 5000, "W_LIMIT": SECRET, "W_LIVE": SECRET,
        "W_API_KEY": SECRET,
    }

    for key, text in cases.items():

        with pytest.raises(Fault) as found: Wide.load({ "W_NAME": "x", key: text })

        assert found.value.reason in ("config.env", "config.shape") and list(found.value.errors or {}) == [key]
        assert found.value.message.startswith(f"{key}: ") and SECRET not in repr(found.value.dump())

    with pytest.raises(Fault) as broken: Wide.load({ "W_NAME": "x", "W_INNER": "{host", "W_API_KEY": SECRET })

    assert refused(broken, "config.env") == "W_INNER: Malformed JSON"

    with pytest.raises(Fault) as garbled: Wide.load({ "W_NAME": "th\udce9", "W_PORTS": "\ud800", "W_API_KEY": "\udcff" })

    assert refused(garbled, "config.env") == "W_NAME: is not valid text; W_PORTS: is not valid text; W_API_KEY: is not valid text"

    with pytest.raises(Fault) as hidden: Wide.load({ "W_NAME": "x", "W_API_KEY": "zz", "W_LEVEL": "zz" })

    assert refused(hidden, "config.shape") in ("W_API_KEY: is invalid", "W_LEVEL: Invalid enum value 'zz'")

def test_describe_hides_credentials_and_keeps_origins () -> None:

    shown = Shown.load({}).describe()

    assert SECRET not in repr(shown)
    assert shown["database"] == "postgres://app:***@db.internal:5432/app?sslmode=require&password=***"
    assert shown["api_url"] == "https://***@api.example.com:8443/***"
    assert shown["hook_url"] == "https://hooks.example.com/***" and shown["cache_url"] == "redis://127.0.0.1:6379/***"
    assert shown["plain_url"] == "http://127.0.0.1:1" and shown["sentry_dsn"] == "https://***@o1.ingest.example.io/***"
    assert shown["mirror_urls"] == ["amqp://***@mq:5672/***", "***"] and shown["backup_urls"] == ["s3://***@bucket/***"]
    assert shown["callback_uri"] == "https://[::1]:8443/***" and shown["password"] == "***"
    assert shown["api_key"] == "hu***r2" and shown["salt"] == "hu***r2" and shown["token_url"] == "ht***r2"
    assert shown["tags"] == { "password": "***", "plain": "ok" } and shown["note"] == "connect with token=*** please"
    assert (shown["empty_url"], shown["live"], shown["port"], shown["owner"]) == ("", True, 8000, None)
    assert Shown.marked("WEBHOOK") and Shown.marked("db_pwd") and Shown.marked("redirect_uri")
    assert not Shown.marked("curious") and not Shown.marked("name")

def test_registry_holds_groups_once () -> None:

    held  = Config()
    first = held.register("app", AppConfig, { "APP_NAME": "One" })

    assert held.register("app", AppConfig, { "APP_NAME": "Two" }) is first and first.name == "One"
    assert held.get("app") is first and held.has("app") and held.names() == ("app",)
    assert held.reload("app", { "APP_NAME": "Two" }).describe()["name"] == "Two" and held.of(AppConfig).name == "Two"
    assert held.describe() == { "app": held.get("app").describe() }

    with pytest.raises(Fault) as taken: held.register("app", Wide, { "W_NAME": "x" })

    assert refused(taken, "config.taken") == "Settings app are already AppConfig" and held.of(AppConfig).name == "Two"

    held.register("wide", Wide, { "W_NAME": "x" })

    source = { "APP_NAME": "x", "APP_NAMX": "typo", "W_NAME": "x", "W_TYPO": "1", "WIDE": "1", "ENGINE_ENV": "local", "PATH": "/bin" }

    assert held.stray(source) == ["APP_NAMX", "W_TYPO"] and AppConfig.stray(source) == ["APP_NAMX"]
    assert Settings.stray(source) == [] and Config().stray(source) == [] and held.names() == ("app", "wide")
    assert held.forget("app") and not held.forget("app") and held.forget("wide")

    with pytest.raises(Fault) as missing: held.get("app")

    assert refused(missing, "config.group") == "Settings app are not registered"

    with pytest.raises(Fault): held.reload("nothing")
    with pytest.raises(Fault): held.of(AppConfig)

    held.clear()

    assert held.names() == () and held.describe() == {}

def test_env_files_and_readers ( fresh: Env, tmp_path: Path ) -> None:

    (tmp_path / ".env").write_text('T_A=1\nexport T_B="two words" # note\n# comment\n\nT_C=\'c\'\nT_D=plain # trailing\n')
    (tmp_path / ".env.local").write_text("T_A=override\n")

    assert fresh.stage() == "local" and fresh.loaded() == () and fresh.describe() == { "stage": "local", "files": [] }
    assert [Path(path).name for path in fresh.load(tmp_path)] == [".env.local", ".env"] and fresh.text("T_A") == "override"
    assert fresh.text("T_B") == "two words" and fresh.text("T_C") == "c" and fresh.text("T_D") == "plain"
    assert fresh.load(tmp_path, (".env",), override=True) and fresh.text("T_A") == "1"
    assert fresh.load(tmp_path) and fresh.text("T_A") == "1" and fresh.load(tmp_path / "none") == []
    assert [Path(path).name for path in fresh.loaded()] == [".env.local", ".env"] and fresh.has("T_A")
    assert fresh.describe() == { "stage": "local", "files": [".env.local", ".env"] }

    fresh.set("ENGINE_ENV", "staging")

    (tmp_path / ".env.staging").write_text("T_S=staged\n")

    assert fresh.stage() == "staging" and len(fresh.load(tmp_path)) == 2 and fresh.text("T_S") == "staged"

    fresh.set("T_N", "42")
    fresh.set("T_F", "1.5")
    fresh.set("T_B2", "true")
    fresh.set("T_L", "x, y")
    fresh.set("T_E", "")

    assert fresh.integer("T_N") == 42 and fresh.integer("T_MISSING", 7) == 7 and fresh.integer("T_E", 9) == 9
    assert fresh.number("T_F") == 1.5 and fresh.boolean("T_B2") and not fresh.boolean("T_MISSING")
    assert fresh.list("T_L") == ["x", "y"] and fresh.list("T_MISSING", ("d",)) == ["d"] and fresh.list("T_E") == []
    assert fresh.need("T_N") == "42" and "T_N" in fresh.all("T_") and "PATH" not in fresh.all("T_")

    fresh.forget("T_N")
    fresh.forget("T_N")

    assert not fresh.has("T_N") and fresh.text("T_N", "gone") == "gone"

    for key in ("T_MISSING", "T_E"):

        with pytest.raises(Fault) as missing: fresh.need(key)

        assert refused(missing, "env.missing") == f"{key} is required"

    fresh.set("T_BAD", SECRET)

    for reader in (fresh.integer, fresh.number, fresh.boolean):

        with pytest.raises(Fault) as bad: reader("T_BAD")

        assert refused(bad, "env.value").startswith("T_BAD: ") and SECRET not in repr(bad.value.dump())

    for key, value in (("", "1"), ("A=B", "1"), ("A\x00", "1"), ("T_NUL", "1\x00")):

        with pytest.raises(Fault) as named: fresh.set(key, value)

        assert refused(named, "env.name") and not fresh.has("T_NUL")

    for stage in ("../../etc", "a b", "x" * 33, "prod/1"):

        os.environ["ENGINE_ENV"] = stage

        with pytest.raises(Fault) as staged: fresh.load(tmp_path)

        assert refused(staged, "env.stage") == "ENGINE_ENV: is not a stage name"

def test_env_files_parse_strictly ( fresh: Env, tmp_path: Path ) -> None:

    path  = tmp_path / "case.env"
    reads = {
        b"A=1\nB = two words  # note\nexport C='single $HOME ${A}'\nD=\"dq \\\"x\\\" ${A}\\n\\$X\"\nE=\nF=#kept\nG= #note\n_H=1\n":
            { "A": "1", "B": "two words", "C": "single $HOME ${A}", "D": 'dq "x" 1\n$X', "E": "", "F": "#kept", "G": "", "_H": "1" },
        b'\xef\xbb\xbfA=1\r\nB="x\r\ny"\r\n\r\n# c\r\nC=3': { "A": "1", "B": "x\ny", "C": "3" },
        b"A=1\rB=2\r": { "A": "1", "B": "2" },
        b'KEY="-----BEGIN-----\nabc\ndef\n-----END-----"\nNEXT=1\n': { "KEY": "-----BEGIN-----\nabc\ndef\n-----END-----", "NEXT": "1" },
        b"A=pa$$word$1\nB=${\nC=$\nD=$HOME\n": { "A": "pa$$word$1", "B": "${", "C": "$", "D": "$HOME" },
        b"A=\"x\" # y\nB='z'#w\nC=1\t# x\n": { "A": "x", "B": "z", "C": "1" },
        b"  export   A  =  1  \nA=2\nB=b=c==\nC=it's \"x\"\n": { "A": "2", "B": "b=c==", "C": 'it\'s "x"' },
        b'A="a\\tb\\\\c\\qd\\\'e"\n': { "A": "a\tb\\c\\qd'e" },
        "A=مرحبا \U0001f680\n".encode(): { "A": "مرحبا \U0001f680" },
        b"# a\n\n   \n\t# b": {},
        b"": {},
    }

    for body, expected in reads.items():

        path.write_bytes(body)

        assert fresh.read(path) == expected

    path.write_bytes(b"".join(b"K%d=%d\n" % (number, number) for number in range(20000)))

    assert len(fresh.read(path)) == 20000 and os.environ.get("K1") is None

    wrong = {
        b"lower=1\n": "line 1 is malformed", b"A=1\nJUST\n": "line 2 is malformed", b'A=1\n\n# c\nB="open\nC=3\n': "line 4 is malformed",
        b'A="x" y\n': "line 1 is malformed", b"export A\n": "line 1 is malformed", b"1A=1\n": "line 1 is malformed",
        b"A=1\nB='open\n": "line 2 is malformed", b"A=1\nB=a\x00b\n": "line 2 is malformed", b"=1\n": "line 1 is malformed",
        b'A="multi\nline"\nB C=1\n': "line 3 is malformed", b"A-B=1\n": "line 1 is malformed",
    }

    for body, line in wrong.items():

        path.write_bytes(body)

        with pytest.raises(Fault) as found: fresh.read(path)

        assert refused(found, "env.line") == f"{path}: {line}" and found.value.errors == { str(path): [line] }

    files = {
        b"A=\xff\xfe\n": "cannot be read, UnicodeDecodeError", b"A=" + b"x" * (1 << 20) + b"\n": "is too large",
    }

    for body, why in files.items():

        path.write_bytes(body)

        with pytest.raises(Fault) as found: fresh.read(path)

        assert refused(found, "env.file") == f"{path}: {why}"

    for other in (tmp_path / "none.env", tmp_path, Path("/dev/zero")):

        with pytest.raises(Fault) as found: fresh.read(other)

        assert refused(found, "env.file") == f"{other}: cannot be read, FileNotFoundError"

    path.write_bytes(f"T_SECRET={SECRET}\nbroken line\n".encode())

    with pytest.raises(Fault) as leaked: fresh.load(tmp_path, ("case.env",))

    assert refused(leaked, "env.line") and SECRET not in repr(leaked.value.dump()) and not fresh.has("T_SECRET")

def test_references_bind_late_across_files ( fresh: Env, tmp_path: Path ) -> None:

    (tmp_path / ".env").write_text("T_HOST=base\nT_URL=http://${T_HOST}:${T_PORT}\nT_PORT=80\nT_BASE=1\nT_RAW='${T_HOST}'\n")
    (tmp_path / ".env.local").write_text('T_HOST=stage\nT_MIX="${T_BASE}-${T_HOST}\\n${T_REAL}"\nT_REAL=file\n')

    fresh.set("T_REAL", "real")

    assert len(fresh.load(tmp_path)) == 2
    assert (fresh.text("T_HOST"), fresh.text("T_URL"), fresh.text("T_RAW")) == ("stage", "http://stage:80", "${T_HOST}")
    assert fresh.text("T_MIX") == "1-stage\nreal" and fresh.text("T_REAL") == "real"

    fresh.set("T_HOST", "live")

    assert fresh.read(tmp_path / ".env")["T_URL"] == "http://live:80"
    assert fresh.read(tmp_path / ".env", override=True)["T_URL"] == "http://base:80"
    assert fresh.load(tmp_path, override=True) and fresh.text("T_URL") == "http://stage:80" and fresh.text("T_REAL") == "file"

    path = tmp_path / "case.env"

    path.write_text("PATH=${PATH}:/opt/x\nT_A=${T_B}\nT_B=${T_C}\nT_C=end\n")

    assert fresh.read(path) == { "PATH": f"{os.environ['PATH']}:/opt/x", "T_A": "end", "T_B": "end", "T_C": "end" }

    path.write_text("T_0=1\n" + "".join(f"T_{number}=${{T_{number - 1}}}\n" for number in range(1, 40)))

    assert set(fresh.read(path).values()) == { "1" }

    path.write_text("".join(f"T_{number}=${{T_{number + 1}}}\n" for number in range(15)) + "T_15=end\n")

    assert set(fresh.read(path).values()) == { "end" }

    wrong = {
        "T_A=1\nT_B=${T_NOPE}\n": "line 2 refers to T_NOPE, which is not set",
        "T_A=${T_A}\n": "line 1 refers to T_A, which loops or nests too deep",
        'T_A=${T_B}\nT_B=${T_C}\nT_C="${T_A}"\n': "line 3 refers to T_A, which loops or nests too deep",
        "".join(f"T_{number}=${{T_{number + 1}}}\n" for number in range(17)) + "T_17=end\n": "line 16 refers to T_16, which loops or nests too deep",
        "T_0=" + "x" * 4096 + "\n" + "".join(f"T_{number}=${{T_{number - 1}}}${{T_{number - 1}}}\n" for number in range(1, 15)): "line 9 refers to T_7, which grows too large",
    }

    for body, expected in wrong.items():

        path.write_text(body)

        with pytest.raises(Fault) as found: fresh.read(path)

        assert refused(found, "env.reference") == f"{path}: {expected}"

    fresh.set("T_HUGE", "x" * 600_000)

    path.write_text("T_A=${T_HUGE}\nT_B=${T_HUGE}\n")

    with pytest.raises(Fault) as huge: fresh.read(path)

    assert refused(huge, "env.reference") == f"{path}: line 2 refers to T_HUGE, which grows too large"

def test_production_refuses_baked_secrets_and_addresses () -> None:

    assert Release.load({}).secret == "lab-only" and Release.load({ "ENGINE_ENV": "local" }).api_url == "http://127.0.0.1:1"
    assert Release.load({ "ENGINE_ENV": "staging" }).passphrase == "lab"

    with pytest.raises(Fault) as found: Release.load({ "ENGINE_ENV": "production", "REL_SECRET": "", "REL_PORT": "x" })

    baked = "must come from the environment in production"

    assert refused(found, "config.env").startswith(f"REL_SECRET: {baked}; REL_API_URL: {baked}; REL_PASSPHRASE: {baked}")
    assert set(found.value.errors or {}) == { "REL_SECRET", "REL_API_URL", "REL_PASSPHRASE", "REL_HOOK_URI", "REL_PORT" }

    vault   = { "REL_SECRET": "from-the-vault", "REL_API_URL": "https://api.example.com", "REL_PASSPHRASE": "p", "REL_HOOK_URI": "https://h" }
    shipped = Release.load({ "ENGINE_ENV": "production", **vault })

    assert (shipped.secret, shipped.api_url, shipped.token, shipped.port) == ("from-the-vault", "https://api.example.com", None, 8000)
    assert (shipped.pepper, shipped.key_ring, shipped.name) == ("", [], "engine")
