from collections.abc import Callable, Coroutine
from functools import partial
from typing import Any, cast
from unittest.mock import patch

from hypothesis import HealthCheck, given, settings, strategies as st

from engine.cache import Memory, cache
from engine.error import Fault
from engine.http import Request, Response, Route
from engine.json import json
from engine.net import net
from engine.test import Bench, Client, Reply, stage
import asyncio, time

EXAMPLES = 1200
ROUNDS   = 10_000_000
WORD     = 128
SHOWN    = 512
SHARES   = (0.5, 0.95, 0.99)
FIELDS   = ("data", "code", "message", "reason", "errors", "meta")
STATUSES = (200, 201, 202, 400, 404, 409, 422, 500, 503)
VERBS    = ("POST", "PUT", "PATCH")
BASES    = ("http://", "https://")
WORDS    = ("ok", "conflict", "taken", "x")
WHOLE    = 2 ** 53
BRIEF    = 64
SCALARS  = st.none() | st.booleans() | st.integers(-WHOLE, WHOLE) | st.floats(allow_nan=False, allow_infinity=False) | st.text(max_size=12)
VALUES   = st.recursive(
    SCALARS, lambda inner: st.lists(inner, max_size=4) | st.dictionaries(st.text(max_size=8), inner, max_size=4), max_leaves=12,
)
WILD     = VALUES | st.binary(max_size=16) | st.tuples(SCALARS) | st.builds(object) | st.integers() | st.text(max_size=200)
HEADERS  = st.dictionaries(st.text(max_size=8).map(str.lower), st.text(max_size=8), max_size=4)
ENVELOPE = st.fixed_dictionaries({ "code": st.sampled_from(WORDS) | SCALARS, "reason": st.none() | st.sampled_from(WORDS) | VALUES })
ASKED    = st.none() | st.sampled_from(WORDS)
LEADS    = st.sampled_from(BASES).flatmap(lambda head: st.text(max_size=40).map(head.__add__))
PAYLOADS = VALUES.map(json.encode) | st.binary(max_size=256) | st.text(max_size=64).map(str.encode)
STRICT   = settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
remote   = Client("http://127.0.0.1:1")
loop     = asyncio.new_event_loop()

def run [T] ( work: Coroutine[Any, Any, T] ) -> T:

    return loop.run_until_complete(work)

def word ( asked: object ) -> str:

    return asked[:WORD] if type(asked) is str else type(asked).__name__

def caught ( work: Callable[[], object] ) -> Fault | None:

    try: work()
    except Fault as fault: return fault

    return None

def refused ( work: Coroutine[Any, Any, object] ) -> Fault:

    try: work.send(None)
    except Fault as fault: return fault
    finally: work.close()

    raise AssertionError("not refused")

def told ( fault: Fault | None ) -> tuple[str | None, object]:

    return (None, None) if fault is None else (fault.reason, fault.errors)

def expected ( reason: str, asked: object, sound: bool = False ) -> tuple[str | None, object]:

    return (None, None) if sound else (f"test.{reason}", { reason: [word(asked)] })

def shown ( body: bytes ) -> Any:

    if not body: return None

    try: return json.decode(body)
    except Fault: return body.decode("utf-8", "replace")

def scripted ( spans: list[int] ) -> partial[int]:

    ticks = [0]

    for span in spans: ticks.extend((ticks[-1] + span, ticks[-1] + span + 3))

    return partial(next, iter(ticks))

@STRICT
@given(st.integers(-1000, 1000), WILD, HEADERS, WILD)
def replies_read_any_body ( status: int, body: object, headers: dict[str, str], name: object ) -> None:

    reply = Reply(status, body, headers)
    held  = body if isinstance(body, dict) else {}
    reads = (reply.data, reply.code, reply.message, reply.reason, reply.errors, reply.meta)

    for field, read in zip(FIELDS, reads, strict=True): assert read() == held.get(field)

    assert reply.ok() == (status in range(200, 300))
    assert reply.header(cast("Any", name)) == (headers.get(name.lower()) if type(name) is str else None)

    for key, value in headers.items():

        if key.upper().lower() == key: assert (reply.header(key), reply.header(key.upper())) == (value, value)

@STRICT
@given(st.lists(st.integers(0, 10 ** 12), min_size=1, max_size=64), st.integers(0, 3), st.booleans())
def quantiles_follow_the_nearest_rank ( spans: list[int], warm: int, awaited: bool ) -> None:

    bench = Bench(rounds=len(spans), warm=warm, echo=False)
    calls = [0]

    def work () -> None: calls[0] += 1

    async def tick () -> None: calls[0] += 1

    with patch.object(time, "perf_counter_ns", scripted(spans)):

        sample = run(bench.measure_async("spans", tick, len(spans))) if awaited else bench.measure("spans", work)

    ordered = sorted(span / 1000 for span in spans)
    count   = len(ordered)

    assert (sample.rounds, calls, sample.low, sample.high) == (count, [warm + count], ordered[0], ordered[-1])
    assert sample.low <= sample.p50 <= sample.p95 <= sample.p99 <= sample.high

    for share, found in zip(SHARES, (sample.p50, sample.p95, sample.p99), strict=True):

        below = sum(1 for value in ordered if value < found)
        upto  = sum(1 for value in ordered if value <= found)

        assert found in ordered
        assert below <= count * share
        assert upto > count * share or found == ordered[-1]

    assert (bench.samples(), bench.dump()) == ([sample], [sample.dump()])
    assert sample.line().endswith(f"n={count}")

    bench.clear()

    assert bench.samples() == []

@STRICT
@given(WILD, WILD, WILD, WILD)
def bench_refuses_strays ( rounds: object, warm: object, name: object, work: object ) -> None:

    counted = type(rounds) is int and 1 <= rounds <= ROUNDS
    warmed  = type(warm) is int and 0 <= warm <= ROUNDS
    named   = type(name) is str and 0 < len(name) <= WORD
    brief   = type(rounds) is not int or rounds <= BRIEF
    bench   = Bench(1, 0, echo=False)

    assert told(caught(partial(Bench, cast("Any", rounds), 0, echo=False))) == expected("rounds", rounds, counted)
    assert told(caught(partial(Bench, 1, cast("Any", warm), echo=False))) == expected("warm", warm, warmed)
    assert told(caught(partial(bench.measure, cast("Any", name), bool))) == expected("name", name, named)
    assert told(caught(partial(bench.measure, "work", cast("Any", work)))) == expected("work", work)
    assert told(caught(partial(Bench.run, cast("Any", work)))) == ("test.work", None)
    assert [sample.name for sample in bench.samples()] == ([name] if named else [])

    if brief:

        asked = partial(bench.measure, "work", bool, cast("Any", rounds))

        assert told(caught(asked)) == expected("rounds", rounds, counted or rounds is None)

@STRICT
@given(st.sampled_from(STATUSES), ENVELOPE | WILD, st.sampled_from(STATUSES), ASKED, ASKED)
def expect_names_the_first_mismatch ( got: int, body: object, status: int, code: str | None, reason: str | None ) -> None:

    reply = Reply(got, body)
    held  = body if isinstance(body, dict) else {}
    wrong = None

    if reason is not None and held.get("reason") != reason: wrong = "reason"
    if code is not None and held.get("code") != code: wrong = "code"
    if got != status: wrong = "status"

    fault = caught(partial(remote.expect, reply, status, code, reason))

    assert told(fault) == ((None, None) if wrong is None else (f"test.{wrong}", None))
    assert len(fault.message if fault else "") <= SHOWN + 64

    if wrong is None: assert remote.expect(reply, status, code, reason) is reply

@STRICT
@given(st.text(max_size=160) | LEADS | WILD, st.text(max_size=160) | WILD, VALUES)
def clients_refuse_what_they_cannot_reach ( base: object, path: object, data: object ) -> None:

    sound = type(base) is str and base.startswith(BASES)

    assert told(caught(partial(Client, cast("Any", base)))) == expected("base", base, sound)

    if type(path) is not str or not path.startswith("/"):

        assert told(refused(remote.call("GET", cast("Any", path)))) == expected("path", path)

    if data is not None:

        assert told(refused(remote.call("POST", "/", data, raw=b"{}"))) == ("test.body", { "body": ["bytes"] })

async def back ( request: Request ) -> Any:

    return Response.raw(request.body, int(request.query("status") or 200), "application/octet-stream")

stage.wire()

opened = stage.client(stage.application(Route.match(VERBS, "/back", back, "back")))
wired  = run(opened.__aenter__())

@STRICT
@given(PAYLOADS, st.sampled_from(STATUSES), st.sampled_from(VERBS), VALUES, st.booleans())
def the_client_shows_what_came_back ( payload: bytes, status: int, verb: str, value: object, encoded: bool ) -> None:

    sent  = json.encode(value) if encoded and value is not None else b"" if encoded else payload
    reply = run(wired.call(verb, "/back", value if encoded else None, { "status": status }, None if encoded else payload))

    assert (reply.status, reply.ok(), reply.body) == (status, status < 300, shown(sent))
    assert all(name == name.lower() for name in reply.headers)
    assert reply.header("X-Request-Id")
    assert reply.header("content-type") == "application/octet-stream"

replies_read_any_body()
quantiles_follow_the_nearest_rank()
bench_refuses_strays()
expect_names_the_first_mismatch()
clients_refuse_what_they_cannot_reach()
the_client_shows_what_came_back()

run(opened.__aexit__(None, None, None))
run(net.close())
loop.close()
cache.use(Memory())

print(f"fuzz test  examples={EXAMPLES * 6}  ok")
