from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any, cast

from engine.error import Code, Fault
from engine.health import Health, Probe
from engine.log import log
from engine.thread import thread
import asyncio, inspect, pytest

class Word(str):

    __slots__ = ()

class Odd:

    def __bool__ ( self ) -> bool: raise ValueError("ambiguous")

async def good () -> bool: return True

async def value () -> bool: raise ValueError("driver broke")

async def key () -> bool: raise KeyError("x")

async def stopped () -> bool: raise asyncio.CancelledError

async def nothing () -> bool: return cast("bool", None)

async def odd () -> bool: return cast("bool", Odd())

async def word () -> bool: return cast("bool", "up")

def plain () -> bool: return True

def flat () -> bool: return False

def thrown () -> bool: raise OSError("gone")

def later () -> Awaitable[bool]: return asyncio.ensure_future(good())

def faint () -> Awaitable[bool]: return asyncio.ensure_future(nothing())

def refused ( work: Callable[[], object] ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL

    return caught.value

async def test_probes_decide_readiness () -> None:

    health = Health()

    async def bad () -> bool: raise Fault(Code.UNAVAILABLE)

    async def slow () -> bool:

        await asyncio.sleep(1)

        return True

    assert await health.ready() == (True, { "status": "ok", "checks": {} })
    assert health.register("db", good) == Probe("db", good, critical=True, timeout=2.0) == Probe("db", good)
    assert type(health.register("db", good, timeout=3).timeout) is float

    health.register("cache", bad, critical=False)
    health.register("peer", slow, timeout=0.01)
    health.fact(version="1.0")

    live = health.live()

    assert health.names() == ("cache", "db", "peer") and list(live) == ["status", "uptime", "version"]
    assert live["status"] == "ok" and live["version"] == "1.0" and 0 <= live["uptime"] < 5

    ready, report = await health.ready()

    assert not ready and list(report) == ["status", "checks", "version"] and report["version"] == "1.0"
    assert report["status"] == "degraded" and report["checks"] == { "db": True, "cache": False, "peer": False }
    assert health.forget("peer") and not health.forget("peer")

    ready, report = await health.ready()

    assert ready and report == { "status": "ok", "checks": { "db": True, "cache": False }, "version": "1.0" }
    assert health.describe() == {
        "probes" : { "cache": { "critical": False, "timeout": 2.0 }, "db": { "critical": True, "timeout": 3.0 } },
        "facts"  : ["version"],
        "failed" : { "cache": "Fault" },
    }

    await asyncio.sleep(0.12)

    assert health.live()["uptime"] >= 0.1 and health.live()["uptime"] == round(health.live()["uptime"], 1)

    health.clear()

    assert health.names() == () and await health.ready() == (True, { "status": "ok", "checks": {} })
    assert health.describe() == { "probes": {}, "facts": [], "failed": {} } and list(health.live()) == ["status", "uptime"]

async def test_a_broken_probe_fails_alone () -> None:

    health = Health()
    checks: dict[str, Callable[[], Awaitable[bool] | bool]] = {
        "value": value, "key": key, "stopped": stopped, "nothing": nothing, "odd": odd, "word": word, "plain": plain,
        "flat": flat, "thrown": thrown, "later": later, "faint": faint, "good": good,
    }

    for name, check in checks.items(): health.register(name, check, critical=False)

    ready, report = await health.ready()

    assert ready and report["status"] == "ok" and list(report["checks"]) == list(checks)
    assert [name for name, fine in report["checks"].items() if fine] == ["word", "plain", "later", "good"]
    assert health.describe()["failed"] == {
        "faint": "unready", "flat": "unready", "key": "KeyError", "nothing": "unready", "odd": "ValueError",
        "stopped": "CancelledError", "thrown": "OSError", "value": "ValueError",
    }

    health.register("value", value)

    ready, report = await health.ready()

    assert not ready and report["status"] == "degraded" and not report["checks"]["value"] and report["checks"]["good"]

def test_register_refuses_what_it_cannot_hold () -> None:

    health = Health()
    names  = (("", ""), (5, "int"), (None, "NoneType"), (["db"], "list"), ("two words", "two words"), ("-db", "-db"))
    led    = (("_db", "_db"), (".db", ".db"), (":db", ":db"), (Word("db"), "Word"), (b"db", "bytes"))

    for name, word in (*names, *led, ("db\n", "db\n"), ("d" * 65, "d" * 64), ("d/b", "d/b"), ("dب", "dب")):

        fault = refused(partial(health.register, cast("Any", name), good))

        assert fault.reason == "health.name" and fault.errors == { "probe": [word] }

    stray = good()

    for check in (None, 5, "ping", stray):

        fault = refused(partial(health.register, "db", cast("Any", check)))

        assert fault.reason == "health.check" and fault.errors == { "probe": ["db"] }

    assert inspect.getcoroutinestate(stray) == inspect.CORO_CLOSED

    for critical in (1, 0, None, "yes"):

        fault = refused(partial(health.register, "db", good, cast("Any", critical)))

        assert fault.reason == "health.critical" and fault.errors == { "probe": ["db"] }

    for timeout in (float("nan"), 0, 0.0, -1, float("inf"), "2", None, True, 60.001, 61, 10 ** 400):

        fault = refused(partial(health.register, "db", good, timeout=cast("Any", timeout)))

        assert fault.reason == "health.timeout" and fault.errors == { "probe": ["db"] }

    assert health.names() == () and health.describe()["probes"] == {}
    assert health.register("db", good, timeout=60).timeout == 60.0
    assert health.register("d" * 64, good, timeout=0.001).timeout == 0.001

    for name in ("9", "eu.west:1", "a_b", "A-b"): assert health.register(name, good).name == name

    for name in (5, None, ["db"], b"db", Word("db")): assert not health.forget(cast("Any", name))

    assert health.names() == ("9", "A-b", "a_b", "db", "d" * 64, "eu.west:1")

    health.clear()

    for index in range(256): health.register(f"p{index}", good)

    fault = refused(partial(health.register, "extra", good))

    assert fault.reason == "health.full" and fault.errors == { "probe": ["extra"] } and len(health.names()) == 256
    assert health.register("p0", good, critical=False).critical is False
    assert health.forget("p1") and health.register("extra", good).name == "extra" and len(health.names()) == 256

async def test_facts_are_plain_and_never_shadow_the_report () -> None:

    health    = Health()
    upstreams = ["iam", "notify"]
    nested: dict[str, list[Any]] = { "a": [1, 2.5, None, True] }

    health.fact(service="iam", upstreams=upstreams, pair=("a", 1), tags={ "b", "a" }, raw=b"x", nested=nested)
    health.fact(service="notify")

    upstreams.append("late")
    nested["a"].append("late")

    assert health.live() == {
        "status": "ok", "uptime": health.live()["uptime"], "service": "notify", "upstreams": ["iam", "notify"],
        "pair": ["a", 1], "tags": ["a", "b"], "raw": "x", "nested": { "a": [1, 2.5, None, True] },
    }
    assert health.describe()["facts"] == ["nested", "pair", "raw", "service", "tags", "upstreams"]

    for name in ("status", "uptime", "checks", "", "two words", "-a", "a" * 65, "a\n"):

        fault = refused(partial(health.fact, fine=1, **{ name: "x" }))

        assert fault.reason == "health.fact" and fault.errors == { "fact": [name[:64]] } and "fine" not in health.live()

    for value in (object(), Odd(), { "a": object() }, 2 ** 80, "x" * 4095, [[[0] * 700] * 3]):

        fault = refused(partial(health.fact, fine=1, odd=value))

        assert fault.reason == "health.fact" and fault.errors == { "fact": ["odd"] } and "fine" not in health.live()

    health.fact(wide="x" * 4094, zero=0, off=False, blank="", nothing=None)

    live = health.live()

    assert live["wide"] == "x" * 4094 and live["zero"] == 0 and live["off"] is False and live["blank"] == ""
    assert live["nothing"] is None and (await health.ready())[1]["service"] == "notify"

    health.clear()
    health.fact(**{ f"f{index}": index for index in range(64) })

    fault = refused(partial(health.fact, f0="changed", extra=1))

    assert fault.reason == "health.facts" and fault.errors is None and health.live()["f0"] == 0

    health.fact(f0="changed")

    assert health.live()["f0"] == "changed" and len(health.describe()["facts"]) == 64

async def test_one_sweep_serves_every_concurrent_caller () -> None:

    health  = Health()
    gate    = asyncio.Event()
    entered = asyncio.Event()
    calls   = 0

    async def counted () -> bool:

        nonlocal calls

        calls += 1

        entered.set()

        await gate.wait()

        return True

    health.register("db", counted)

    waiters = [asyncio.create_task(health.ready()) for _ in range(50)]

    await asyncio.sleep(0)

    waiters[0].cancel()

    await asyncio.sleep(0)

    gate.set()

    results = await asyncio.gather(*waiters, return_exceptions=True)
    second  = cast("tuple[bool, dict[str, Any]]", results[1])
    third   = cast("tuple[bool, dict[str, Any]]", results[2])

    assert calls == 1 and isinstance(results[0], asyncio.CancelledError)
    assert all(result == (True, { "status": "ok", "checks": { "db": True } }) for result in results[1:])
    assert second[1] is not third[1] and second[1]["checks"] is not third[1]["checks"]
    assert (await health.ready())[0] and calls == 2

    gate.clear()

    first = asyncio.create_task(health.ready())

    await asyncio.sleep(0)

    health.register("cache", good, critical=False)

    after = asyncio.create_task(health.ready())

    await asyncio.sleep(0)

    gate.set()

    assert (await first)[1]["checks"] == { "db": True } and (await after)[1]["checks"] == { "db": True, "cache": True }
    assert calls == 4

    gate.clear()

    first = asyncio.create_task(health.ready())

    await asyncio.sleep(0)

    assert health.forget("cache")

    after = asyncio.create_task(health.ready())

    await asyncio.sleep(0)

    gate.set()

    assert (await first)[1]["checks"] == { "db": True, "cache": True } and (await after)[1]["checks"] == { "db": True }
    assert calls == 6

    gate.clear()

    first = asyncio.create_task(health.ready())

    await asyncio.sleep(0)

    health.clear()

    assert await health.ready() == (True, { "status": "ok", "checks": {} })

    health.register("db", counted)
    gate.set()

    assert (await first)[1]["checks"] == { "db": True } and calls == 7

    gate.clear()
    entered.clear()

    waiter = asyncio.create_task(health.ready())

    await entered.wait()

    assert calls == 8 and await thread.close() >= 1
    assert await waiter == (False, { "status": "degraded", "checks": {} })

    gate.set()

    assert health.describe()["failed"] == {} and (await health.ready())[0] and calls == 9

def test_a_sweep_stranded_on_another_loop_is_never_awaited () -> None:

    health = Health()
    first  = asyncio.new_event_loop()
    second = asyncio.new_event_loop()
    calls  = 0

    async def held () -> bool:

        nonlocal calls

        calls += 1

        if calls == 1: await asyncio.sleep(3600)

        return True

    async def started () -> asyncio.Future[tuple[bool, dict[str, Any]]]:

        waiter = asyncio.ensure_future(health.ready())

        for _ in range(8): await asyncio.sleep(0)

        return waiter

    async def stopped ( waiter: asyncio.Future[tuple[bool, dict[str, Any]]] ) -> tuple[bool, dict[str, Any]]:

        await thread.close()

        return await waiter

    health.register("db", held)

    waiter = first.run_until_complete(started())

    assert calls == 1 and not waiter.done()
    assert second.run_until_complete(health.ready()) == (True, { "status": "ok", "checks": { "db": True } }) and calls == 2

    second.close()

    assert first.run_until_complete(stopped(waiter)) == (False, { "status": "degraded", "checks": {} })

    first.close()

    assert health.describe()["failed"] == {}

async def test_a_failure_is_logged_when_it_changes () -> None:

    health = Health()
    gate   = asyncio.Event()
    mood   = ["down"]

    async def moody () -> bool:

        if mood[0] == "raise": raise ConnectionError("gone")

        return mood[0] == "up"

    async def held () -> bool:

        await gate.wait()

        return False

    health.register("db", moody)
    health.register("cache", good)
    log.setup("debug", "json")

    with log.capture() as events:

        for state in ("down", "down", "raise", "raise", "up", "up", "down"):

            mood[0] = state

            assert (await health.ready())[0] is (state == "up")

    assert [(event["level"], event["event"], event["probe"], event.get("error")) for event in events] == [
        ("warning", "health.failed", "db", "unready"), ("warning", "health.failed", "db", "ConnectionError"),
        ("info", "health.recovered", "db", None), ("warning", "health.failed", "db", "unready"),
    ]
    assert health.describe()["failed"] == { "db": "unready" }

    health.register("db", moody)

    assert health.describe()["failed"] == {}

    await health.ready()

    assert health.describe()["failed"] == { "db": "unready" } and health.forget("db") and health.describe()["failed"] == {}

    health.register("db", held)

    waiter = asyncio.create_task(health.ready())

    await asyncio.sleep(0)

    health.register("db", good)

    with log.capture() as events:

        gate.set()

        assert not (await waiter)[0]

    assert events == [] and health.describe()["failed"] == {} and (await health.ready())[0]
