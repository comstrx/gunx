from engine.context import context
from engine.error import Code, Fault
from engine.log import Log, Logger, Render, log
from engine.log.sink import Sink
from structlog.typing import EventDict
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
import asyncio, json, os, structlog
from pathlib import Path
from typing import override
import pytest, time

def pem ( kind: str, body: str, closed: bool = True ) -> str:

    head = f"-----BEGIN {kind}PRIVATE KEY-----\n{body}"

    return f"{head}\n-----END {kind}PRIVATE KEY-----" if closed else head

SCRUBBED = [
    ("postgres://user:pw@host/db", "postgres://user:***@host/db"),
    ("postgres://user:p@ss@host/db", "postgres://user:***@host/db"),
    ("redis://:pw@host", "redis://:***@host"),
    ("https://ghp_abcdefTOKEN@github.com/o/r", "https://***@github.com/o/r"),
    ("https://x-access-token:ghp_abc@github.com/o/r.git", "https://x-access-token:***@github.com/o/r.git"),
    ("https://user@domain:pa:ss@host:5432/db?sslmode=require", "https://user@domain:***@host:5432/db?sslmode=require"),
    ("git+ssh://git:pw@host/o/r", "git+ssh://git:***@host/o/r"),
    ("jdbc:postgresql://app:pw@db:5432/x", "jdbc:postgresql://app:***@db:5432/x"),
    ("a://b:c@d e://f:g@h", "a://b:***@d e://f:***@h"),
    ("A://@PASS:@", "A://@PASS:***@"),
    ('BEARER:PASS=" "0', "BEARER:***"),
    ('BEARER:PASS=" "0 next', "BEARER:*** next"),
    ("Bearer  authorization=== Zq90000000000000", "Bearer *** ***"),
    ("Bearer =Bearer  Bearer Zq90000000000000", "Bearer =***"),
    ("token=basic Bearer Zq90000000000000 x", "token=*** x"),
    ('cookie: token="b\nc"0 x', "cookie: ***"),
    ("x_token=a;cookie:b c d", "x_token=***"),
    ("https://token:abcdef@host/x?token=abc", "https://token:***@host/x?token=***"),
    ("https://host/path", "https://host/path"),
    ("see http://example.com and mail bob@x.com", "see http://example.com and mail bob@x.com"),
    ("https://api.example.com/v1/pay?api_key=abcdef123456&amount=5", "https://api.example.com/v1/pay?api_key=***&amount=5"),
    ("https://s3/x?X-Amz-Signature=abcd&X-Amz-Credential=AKIA/2026&X-Amz-Date=1", "https://s3/x?X-Amz-Signature=***&X-Amz-Credential=***&X-Amz-Date=1"),
    ("https://app/cb?code=4/0Abc&state=xyz", "https://app/cb?code=***&state=xyz"),
    ("https://maps/api?key=AIzaSyXXXX&q=cairo", "https://maps/api?key=***&q=cairo"),
    ("https://a/b?sig=abc%2Fdef&se=2026", "https://a/b?sig=***&se=2026"),
    ("Authorization: Bearer abcdefghijklmnopqrstuvwx", "Authorization: ***"),
    ("authorization=Basic dXNlcjpwYXNz", "authorization=***"),
    ("got Bearer abcdefghijklmnopqrstuvwx from client", "got Bearer *** from client"),
    ("the bearer of news", "the bearer of news"),
    ('{"password": "hun\\"ter2", "n": 1}', '{"password": "***", "n": 1}'),
    ('{"password":"hunter2","n":1}', '{"password":"***","n":1}'),
    ("{'password': 'hunter2', 'n': 1}", "{'password': '***', 'n': 1}"),
    ('{\\"password\\": \\"hunter2\\"}', '{\\"password\\": ***'),
    ("Login(email='a@b.c', password='hunter2')", "Login(email='a@b.c', password='***')"),
    ("host=db user=x password=sec,ret dbname=y", "host=db user=x password=*** dbname=y"),
    ("Server=x;Password=abc;Database=y", "Server=x;Password=***"),
    ("Cookie: theme=dark; session=abc123", "Cookie: ***"),
    ('Authorization: Digest username="bob", realm="x y", response="6629fae49393a05397450978507c4ef1"', "Authorization: ***"),
    ("Bearer = password: hunter2-hunter2", "Bearer = *** ***"),
    ('secret=password:"x y" tail', "secret=*** tail"),
    ("Set-Cookie: sid=abc; Path=/\nContent-Type: text/html", "Set-Cookie: ***\nContent-Type: text/html"),
    ("user[password]=hunter2&user[name]=bob", "user[password]=***&user[name]=bob"),
    ("--password=hunter2 --verbose", "--password=*** --verbose"),
    ("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXNpZw tail", "jwt *** tail"),
    ("'password' => 'hun ter2', 'name' => 'bob'", "'password' => '***', 'name' => 'bob'"),
    ('if password == "hun ter2": deny', 'if password == "***": deny'),
    ('password := "hun ter2"', 'password := "***"'),
    ("Login(password=b'hun ter2', name='bob')", "Login(password='***', name='bob')"),
    ("cardPin=1234 smsOtp: 987654 dbPass=abc DB_PASS=abc bypass=1 PINNED=1", "cardPin=*** smsOtp: *** dbPass=*** DB_PASS=*** bypass=1 PINNED=1"),
    ("APP_KEY=base64:abcd signing-key=abc cache_key=user:7 routing_key=orders", "APP_KEY=*** signing-key=*** cache_key=user:7 routing_key=orders"),
    ("X-CSRF-Token: abc123 urlSig=abcd design=flat", "X-CSRF-Token: *** urlSig=*** design=flat"),
    (f"key {pem('RSA ', 'MIIEow\nIBAAK')} tail", "key *** tail"),
    (f"cut {pem('', 'MIIEvQIBADANBg', closed=False)}", "cut ***"),
    ("-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----"),
    ("pin=1234 mapping=ok spin=3", "pin=*** mapping=ok spin=3"),
    ("otp: 123456 hotpath=1", "otp: *** hotpath=1"),
    ("status code: 500", "status code: 500"),
    ("passed=3 failed=0", "passed=3 failed=0"),
    ("2026-11-10T12:30:00Z", "2026-11-10T12:30:00Z"),
    ("password=", "password="),
    ("secret", "secret"),
]

BLOBS = [
    "a" * 200_000 + "://", "a://" * 50_000, "eyJ" * 70_000, "password=" * 30_000, ("n" * 64 + " ") * 4_000 + "=",
    "password" + " " * 200_000 + "x", 'password="' + "\\" * 100_001, "Bearer " * 30_000 + "x" * 100_000,
    "u://" + "@" * 200_000, ":" * 200_000, "eyJaaaaa" + ".aaaaa" * 40_000, "u://" + "x" * 200_000,
    "cookie=" * 30_000, "token=bearer " * 20_000, "password='" * 30_000, 'token="' + "secret='" * 30_000,
    pem("", "", closed=False)[:-1] * 8_000, pem("", "", closed=False)[:-1] + "-----END " * 20_000, "secret=cookie:" * 20_000,
]

class Form:

    @override
    def __repr__ ( self ) -> str:

        return "Form(email='a@b.c', password='hunter2')"

def broken () -> None:

    raise ValueError("cannot reach postgres://app:hunter2@db/x")

def test_masks_by_length_and_scrubs_text () -> None:

    assert Render.mask("short") == "***" and Render.mask("fifteen-chars-x") == "***"
    assert Render.mask("supersecrettoken") == "su***en" and Render.mask(12345678901234567890) == "12***90"
    assert (Render.grade("PASSWORD"), Render.grade("apiKey"), Render.grade("card_pin"), Render.grade("order")) == (2, 1, 2, 0)
    assert (Render.grade("spin"), Render.grade("design"), Render.grade("passed"), Render.grade("x-sig")) == (0, 0, 0, 1)
    assert (Render.grade("cardPin"), Render.grade("userOTP"), Render.grade("dbPass"), Render.grade("SMTP_PASS")) == (2, 2, 2, 2)
    assert (Render.grade("bypass"), Render.grade("PINNED"), Render.grade("passport"), Render.grade("Spin")) == (0, 0, 0, 0)
    assert (Render.grade("appKey"), Render.grade("cache_key"), Render.grade("urlSig"), Render.grade("signal")) == (1, 0, 1, 0)

    for text, expected in SCRUBBED:

        assert Render.scrub(text) == expected
        assert Render.scrub(expected) == expected

    assert (Render.hide("supersecrettoken"), Render.hide("supersecrettoken", 2), Render.hide(["a"]), Render.hide(7)) == ("su***en", "***", "***", "***")
    assert (Render.hide(None), Render.hide(value=True, grade=2), Render.grade("\u017fecret"), Render.grade("to\u212aen")) == (None, True, 1, 1)

    plain = "order 17 was placed by tenant t-9"

    assert Render.scrub(plain) is plain

def test_origin_keeps_where_and_drops_the_rest () -> None:

    shown = {
        "postgres://app:hunter2secret@db.internal:5432/app?sslmode=require": "postgres://***@db.internal:5432/***",
        "https://hooks.example.com/services/T000/B000/hunter2secret": "https://hooks.example.com/***",
        "https://0123456789abcdef@o1.ingest.example.io/42": "https://***@o1.ingest.example.io/***",
        "https://[::1]:8443/cb?code=hunter2secret": "https://[::1]:8443/***",
        "amqp://app:p@ss:w0rd@mq/": "amqp://***@mq",
        "HTTP://USER@H:80/": "http://***@h:80",
        "http://127.0.0.1:1": "http://127.0.0.1:1",
        "http://h/#": "http://h",
        "http://h/?": "http://h",
    }

    for text, expected in shown.items(): assert Render.origin(text) == expected

    wild: tuple[object, ...] = ("http://user:12/ss@host", "postgres://u:pa#ss@host/db", "postgres://u:pa?ss@host/db", "localhost:5432", "http://h:99999/", "http://[::1", "//host/x", "http://ho st/x", "http://h\u00e9/x", "hunter2secret", "", 7)

    for odd in wild: assert Render.origin(odd) == "***"

def test_cleans_nested_values_and_objects () -> None:

    held  = { "a": { "password": "x" * 40, "b": [{ "api_key": "abcdefghijklmnopqrstuvwxyz" }, "u://a:b@c"], "token": None, "session": True } }
    deep  = { 1: { 2: { 3: { 4: { 5: { 6: { 7: { 8: { 9: "deep" } } } } } } } } }
    loop: list[object] = []

    loop.append(loop)

    assert Render.clean(held) == { "a": { "password": "***", "b": [{ "api_key": "ab***yz" }, "u://a:***@c"], "token": None, "session": True } }
    assert Render.clean(deep) == { 1: { 2: { 3: { 4: { 5: { 6: { 7: { 8: "***" } } } } } } } }
    assert Render.clean(loop) == [[[[[[[["***"]]]]]]]]
    assert Render.clean({ "secrets": { "a": 1 }, "tokens": ["x", "y"], "pin": 1234 }) == { "secrets": "***", "tokens": "***", "pin": "***" }
    assert Render.clean(Form()) == "Form(email='a@b.c', password='***')" and Render.clean(b"password=abc") == "b'password=***"
    assert Render.clean(("u://a:b@c", { "k" }, 3.5, None)) == ["u://a:***@c", ["k"], 3.5, None]

    kept = Path("/srv/app")

    assert Render.clean(kept) == repr(kept) and Render.clean(7) == 7

def test_redaction_stays_linear () -> None:

    for blob in BLOBS:

        started = time.perf_counter()

        Render.scrub(blob)

        assert time.perf_counter() - started < 2

def test_events_carry_context_and_redaction () -> None:

    log.setup("debug", "json")

    with log.capture() as events, context.scope(request_id="req-1", actor="hidden", locale="ar"):

        log.info("hello", password="hunter22-hunter22-hunter22", url="amqp://guest:guest@127.0.0.1/", count=3, tokens=5)
        log.info("nested", payload={ "user": { "password": "hunter2", "name": "bob" }, "hook": "https://h/x?token=abc" })
        log.info("free", detail="upstream said Authorization: Bearer abcdefghijklmnop", api_key="abcdefghijklmnopqrstuvwxyz", form=Form())

        try: broken()
        except ValueError: log.exception("database.failed")

    assert events[0]["event"] == "hello"
    assert events[0]["request_id"] == "req-1" and events[0]["locale"] == "ar" and "actor" not in events[0]
    assert events[0]["password"] == "***" and events[0]["url"] == "amqp://guest:***@127.0.0.1/" and events[0]["count"] == 3
    assert events[0]["tokens"] == "***"
    assert events[0]["level"] == "info" and events[0]["timestamp"].endswith("Z")
    assert events[1]["payload"] == { "user": { "password": "***", "name": "bob" }, "hook": "https://h/x?token=***" }
    assert events[2]["detail"] == "upstream said Authorization: ***" and events[2]["api_key"] == "ab***yz"
    assert events[2]["form"] == "Form(email='a@b.c', password='***')"
    assert "postgres://app:***@db/x" in events[3]["exception"] and "hunter2" not in events[3]["exception"]
    assert "hunter2" not in repr(events)

def test_level_filters_and_describes () -> None:

    log.setup("warning")

    assert log.level() == "warning" and log.enabled("error") and not log.enabled("info")
    assert log.level_of("nothing") == log.level_of("info")
    assert log.describe() == { "level": "warning", "renderer": "console", "file": None, "dropped": 0 }

    with log.capture() as events:

        log.debug("dropped")
        log.at("warning", "kept")
        log.at("nothing", "info-dropped")

    assert [event["event"] for event in events] == ["kept"]

    log.setup("debug")

def test_span_measures_and_reports_failures () -> None:

    log.setup("debug")

    with log.capture() as events:

        with log.span("work", step=1) as facts: facts["rows"] = 2

        with pytest.raises(Fault), log.span("broken"): raise Fault.wrap(ValueError("x"))

    assert events[0]["event"] == "work" and events[0]["rows"] == 2 and events[0]["step"] == 1 and events[0]["ms"] >= 0
    assert events[1]["event"] == "broken.failed" and events[1]["error"] == "Fault" and events[1]["level"] == "error"

def test_bound_loggers_and_files ( tmp_path: Path ) -> None:

    target = tmp_path / "logs" / "app.log"

    log.setup("info", "json", target)
    log.bind(job="x").unbind("job").info("written", n=1)
    log.close()

    assert '"event":"written"' in target.read_text().replace(" ", "")

    log.setup("debug")

def test_a_failing_sink_drops_the_line_and_never_raises ( tmp_path: Path ) -> None:

    log.setup("info", "json", Path("/dev/full"))
    log.info("disk.full", order=1)
    log.error("disk.full", order=2)

    assert log.describe()["dropped"] == 2

    log.close()
    log.close()
    log.info("after.close")

    assert log.describe()["dropped"] == 3

    target = tmp_path / "app.log"

    log.setup("info", "console", target)
    log.info("wild", text="\ud800 \x00 \u202e")
    log.get("child").warning("kept")

    assert log.describe()["dropped"] == 0 and target.read_text().count("\n") == 2

    log.setup("debug", "json")

def test_debugging_is_a_plain_flag () -> None:

    log.setup("debug")

    assert (log.debugging, log.enabled("debug")) == (True, True)

    log.setup("info")

    assert (log.debugging, log.enabled("debug"), log.enabled("warning")) == (False, False, True)

@pytest.mark.parametrize("name", ["x" * 300 + "_password", "password_" + "x" * 300, "x" * 300 + "_token_" + "x" * 300])
def test_long_names_keep_full_redaction ( name: str ) -> None:

    value = "hunter22-hunter22-hunter22"

    assert value not in repr(Render.clean({ name: value }))
    assert value not in Render.scrub(f"{name}={value}")
    assert Render.clean({ "x" * 600: "ordinary" }) == { "x" * 600: "ordinary" }

def test_capture_nested_empty_scopes_restore_the_outer () -> None:

    local = Log()
    local.setup(file=Path(os.devnull))

    with local.capture() as outer:

        with local.capture() as inner: pass

        local.info("outer")

        with local.capture() as second: local.info("both")

        local.info("last")

    local.info("after")

    assert [event["event"] for event in outer] == ["outer", "both", "last"]
    assert inner == [] and [event["event"] for event in second] == ["both"]

    local.close()

async def test_capture_isolates_sibling_tasks_and_cancellation () -> None:

    local = Log()
    local.setup(file=Path(os.devnull))
    ready = asyncio.Event()
    resume = asyncio.Event()

    async def first () -> list[EventDict]:

        with local.capture() as events:

            ready.set()
            await resume.wait()
            local.info("first")

        return events

    async def second () -> list[EventDict]:

        await ready.wait()

        with local.capture() as events:

            local.info("second")
            resume.set()

        return events

    left, right = await asyncio.gather(first(), second())

    assert [event["event"] for event in left] == ["first"]
    assert [event["event"] for event in right] == ["second"]

    with pytest.raises(asyncio.CancelledError), local.capture() as cancelled, local.span("cancelled"):

        raise asyncio.CancelledError

    assert cancelled[0]["error"] == "CancelledError"

    with local.capture() as fresh: local.info("fresh")

    assert len(cancelled) == 1 and fresh[0]["event"] == "fresh"

    local.close()

async def test_inherited_capture_stops_when_its_owner_closes () -> None:

    local = Log()
    local.setup(file=Path(os.devnull))
    ready = asyncio.Event()
    resume = asyncio.Event()

    async def child () -> None:

        local.info("inside")
        ready.set()
        await resume.wait()
        local.info("outside")

    with local.capture() as events:

        task = asyncio.create_task(child())
        await ready.wait()

    resume.set()
    await task

    assert [event["event"] for event in events] == ["inside"]

    local.close()

def test_instances_and_external_structlog_config_are_isolated ( tmp_path: Path ) -> None:

    before = structlog.get_config().copy()
    first, second = Log(), Log()

    first.setup("info", "json", tmp_path / "first.log")
    second.setup("error", "json", tmp_path / "second.log")

    with first.capture() as a, second.capture() as b:

        first.get("worker").info("first")
        second.info("filtered")
        second.get().error("second")

    first.close()
    second.close()

    assert [event["event"] for event in a] == ["first"] and a[0]["logger"] == "worker"
    assert [event["event"] for event in b] == ["second"]
    assert json.loads((tmp_path / "first.log").read_text())["event"] == "first"
    assert json.loads((tmp_path / "second.log").read_text())["event"] == "second"
    assert structlog.get_config() == before

def test_failed_setup_preserves_current_sink_and_config ( tmp_path: Path ) -> None:

    local = Log()
    target = tmp_path / "kept.log"

    local.setup("info", "json", target)
    bound = local.bind(job="keep")
    before = local.describe()

    with pytest.raises(Fault) as failed: local.setup("error", "console", tmp_path)

    assert failed.value.reason == "log.open" and isinstance(failed.value.__cause__, OSError)

    assert local.describe() == before

    bound.info("bound")
    local.info("live")
    local.close()

    assert [json.loads(line)["event"] for line in target.read_text().splitlines()] == ["bound", "live"]

def test_span_merges_fields_and_owns_reserved_metadata () -> None:

    local = Log()
    local.setup(file=Path(os.devnull))
    failure = Fault(Code.INTERNAL, reason="original")

    with local.capture() as events:

        with local.span("work", rows=1, ms=-1) as fields:

            fields.update(rows=2, ms=-2, event="spoofed", level="critical")

        with pytest.raises(Fault) as caught, local.span("broken", error="wrong", ms=-1) as fields:

            fields.update(error="also-wrong", ms=-2, event="spoofed", level="critical")

            raise failure

    assert events[0]["event"] == "work" and events[0]["level"] == "info" and events[0]["rows"] == 2
    assert events[0]["ms"] >= 0 and events[1]["ms"] >= 0
    assert events[1]["event"] == "broken.failed" and events[1]["error"] == "Fault"
    assert caught.value is failure

    local.close()

def test_span_preserves_original_error_when_logging_fails () -> None:

    class Broken:

        def error ( self, *_: object, **__: object ) -> None: raise RuntimeError("logging failed")

    failure = ValueError("business failure")

    with pytest.raises(ValueError, match="business failure") as caught, Logger(Broken()).span("broken"): raise failure

    assert caught.value is failure

def test_objects_cannot_serialize_secrets_after_redaction ( tmp_path: Path ) -> None:

    class Hidden:

        @override
        def __repr__ ( self ) -> str: return "safe"

        @override
        def __str__ ( self ) -> str: return "password=unredacted"

        def __structlog__ ( self ) -> dict[str, str]: return { "password": "unredacted" }

    class Broken:

        @override
        def __repr__ ( self ) -> str: raise ValueError("unredacted")

    local = Log()

    for renderer in ("json", "console"):

        target = tmp_path / f"{renderer}.log"

        local.setup("info", renderer, target)
        local.info("objects", data=Hidden(), broken=Broken(), nested=[Hidden()])
        local.close()

        text = target.read_text()

        assert "unredacted" not in text and "safe" in text and "***" in text

def test_json_output_handles_extreme_values_and_line_injection ( tmp_path: Path ) -> None:

    local = Log()
    target = tmp_path / "values.log"

    local.setup("info", "json", target)
    local.info("one\nforged", large=2**128, wild="\ud800", payload={ 1: "a", None: "b" })
    local.close()

    lines = target.read_text().splitlines()

    assert len(lines) == 1

    event = json.loads(lines[0])

    assert event["event"] == "one\nforged" and event["large"] == 2**128 and event["wild"] == "\ud800"

def test_sink_serializes_writes_and_counts_failures () -> None:

    stream = StringIO()
    sink = Sink(stream)

    def write ( number: int ) -> None:

        for _ in range(100): sink.msg(str(number))

    with ThreadPoolExecutor(max_workers=2) as workers: list(workers.map(write, range(2)))

    assert len(stream.getvalue().splitlines()) == 200 and sink.dropped == 0

    sink.close()

    with ThreadPoolExecutor(max_workers=2) as workers: list(workers.map(write, range(2)))

    assert sink.dropped == 200

def test_bound_facade_levels_and_shared_context ( tmp_path: Path ) -> None:

    local = Log()

    local.setup("debug", "json", tmp_path / "levels.log")

    with context.scope(request_id="owned"), local.capture() as events:

        local.share(locale="ar")
        assert local.shared()["locale"] == "ar"
        local.unshare("locale")
        bound = local.bind(job="x").unbind("job", "missing")

        for level in ("debug", "info", "warning", "error", "critical"):

            getattr(local, level)("direct")
            getattr(bound, level)("bound")
            local.at(level.upper(), "at")
            bound.at(level.upper(), "bound.at")

        bound.at("unknown", "fallback")

    assert len(events) == 21
    assert all(event["request_id"] == "owned" and "job" not in event for event in events)
    assert events[-1]["level"] == "info"
    assert "locale" not in events[0]

    local.close()

def test_captures_do_not_cross_threads () -> None:

    local = Log()
    local.setup("info", "json", Path(os.devnull))

    def work ( number: int ) -> list[EventDict]:

        with local.capture() as events:

            for _ in range(20): local.info("thread", worker=number)

        return events

    with ThreadPoolExecutor(max_workers=2) as workers: found = list(workers.map(work, range(2)))

    assert len(found[0]) == len(found[1]) == 20
    assert all(event["worker"] == index for index, events in enumerate(found) for event in events)

    local.close()

def test_redaction_bounds_cycles_and_never_mutates_input ( tmp_path: Path ) -> None:

    local = Log()
    local.setup("info", "json", tmp_path / "cycle.log")
    original = { "password": "hunter2", "values": [1, 2] }
    loop: list[object] = []
    loop.append(loop)

    with local.capture() as events: local.info("safe", original=original, loop=loop)

    local.close()

    assert original == { "password": "hunter2", "values": [1, 2] }
    assert events[0]["original"] == { "password": "***", "values": [1, 2] }
    assert "hunter2" not in (tmp_path / "cycle.log").read_text()
    assert json.loads((tmp_path / "cycle.log").read_text())["loop"] == [[[[[[[["***"]]]]]]]]

def test_secret_objects_are_hidden_without_invoking_them () -> None:

    class Unknown:

        @override
        def __str__ ( self ) -> str: raise AssertionError("secret object was inspected")

    assert Render.hide(Unknown()) == "***"
    assert Render.clean({ "token": Unknown() }) == { "token": "***" }

@pytest.mark.parametrize("scheme", ["BEARER", "bEaReR", "BeArEr", "bearer", "Bearer"])
def test_free_text_bearer_redaction_is_case_insensitive ( scheme: str ) -> None:

    secret = "example_credential_0123456789"
    text = f"received {scheme} {secret}"

    assert Render.scrub(text) == f"received {scheme} ***"
    assert secret not in str(Render.clean({ "detail": [text] }))

@pytest.mark.parametrize("version", [1, 2, 3, 4])
@pytest.mark.parametrize("purpose", ["local", "public"])
def test_paseto_payloads_and_footers_never_reach_log_output ( version: int, purpose: str ) -> None:

    credential = f"v{version}.{purpose}." + "a" * 90 + ".Zm9vdGVy"
    assert Render.scrub(f"received {credential} from upstream") == "received *** from upstream"
    assert Render.clean({ "detail": [credential] }) == { "detail": ["***"] }

    logger = Log()

    with logger.capture() as events: logger.info("upstream", detail=credential)

    assert events[-1]["detail"] == "***"
    assert Render.scrub("v4.local.configuration docs") == "v4.local.configuration docs"
    assert Render.scrub("servicev4.local." + "a" * 90).startswith("servicev4.local.")
