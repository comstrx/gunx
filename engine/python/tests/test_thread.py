from collections.abc import Awaitable, Callable, Iterator
from contextvars import ContextVar
from functools import partial
from typing import Any, cast

from engine.error import Code, Fault
from engine.log import log
from engine.thread import Cluster, Gate, Lane, Outcome, Pool, Run, Tasks, Thread, thread
from engine.thread.arch import CEILING, CORES, REMOTES, RETRIES
import asyncio, contextlib, gc, inspect, math, operator, os, pytest, signal, sys, threading, time, types, weakref

MARK: ContextVar[str] = ContextVar("mark", default="none")

def refused ( reason: str, work: Callable[[], object] ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL and caught.value.reason == reason

    return caught.value

async def denied ( reason: str, work: Awaitable[object] ) -> Fault:

    with pytest.raises(Fault) as caught: await work

    assert caught.value.reason == reason

    return caught.value

async def nap ( seconds: float ) -> float:

    await asyncio.sleep(seconds)

    return seconds

async def boom ( word: str ) -> int: raise ValueError(word)

def stall ( seconds: float ) -> None: time.sleep(seconds)

async def gone ( pid: int ) -> bool:

    for _ in range(250):

        try: os.kill(pid, 0)
        except ProcessLookupError: return True

        await asyncio.sleep(0.02)

    return False

async def test_offload_leaves_the_loop_and_carries_the_context () -> None:

    home  = threading.get_ident()
    token = MARK.set("request")

    try:

        assert await thread.offload(threading.get_ident) != home
        assert await thread.offload(MARK.get) == "request"
        assert await thread.offload(pow, 2, 10) == 1024
        assert await thread.offload(int, "ff", base=16) == 255

    finally: MARK.reset(token)

    with pytest.raises(ValueError, match="invalid literal"): await thread.offload(int, "x")

    await denied("thread.work", thread.offload(cast("Any", 5)))
    await denied("thread.work", thread.offload(nap, 0))

async def test_setup_bounds_the_thread_pool () -> None:

    unit = Thread()
    lock = threading.Lock()
    live = peak = 0

    def tracked ( n: int ) -> int:

        nonlocal live, peak

        with lock: live, peak = live + 1, max(peak, live + 1)

        time.sleep(0.01)

        with lock: live -= 1

        return n

    for bad in (0, -1, CEILING + 1, True, 2.0, "4", None): refused("thread.workers", partial(unit.setup, cast("Any", bad)))

    unit.setup(3)

    assert unit.describe() == { "tasks": 0, "stopping": False, "workers": 3, "pools": [] }
    assert (await unit.run(range(4), operator.neg)).workers == 3 and (await unit.run([1], operator.neg, workers=7)).workers == 7

    made = await unit.run(range(12), tracked, "thread", workers=64)

    assert made.workers == 3 and peak == 3 and made.results() == list(range(12))
    assert unit.describe()["pools"] == ["thread"]

    unit.setup(3)

    assert unit.describe()["pools"] == ["thread"]

    unit.setup(5)

    assert unit.describe()["pools"] == [] and await unit.offload(operator.neg, 4) == -4
    assert await unit.close() == 0 and unit.describe()["pools"] == []

async def test_gather_keeps_order_bounds_and_cancels_the_rest () -> None:

    live = peak = 0
    ended: list[str] = []

    async def work ( n: int, seconds: float = 0.005 ) -> int:

        nonlocal live, peak

        live, peak = live + 1, max(peak, live + 1)

        try: await asyncio.sleep(seconds)
        except asyncio.CancelledError:

            ended.append("cancelled")

            raise

        finally: live -= 1

        return n * 2

    assert await thread.gather() == []
    assert await thread.gather(work(1), work(2), work(3)) == [2, 4, 6] and peak == 3

    peak = 0

    assert await thread.gather(*(work(n) for n in range(7)), limit=2) == [n * 2 for n in range(7)] and peak == 2
    assert await thread.gather(work(1, 0.02), work(2, 0)) == [2, 4]

    with pytest.raises(ValueError, match="b"): await thread.gather(work(1, 5), boom("b"), work(2, 5))

    assert ended == ["cancelled", "cancelled"] and live == 0

    with pytest.raises(ValueError, match="first"): await thread.gather(boom("first"), boom("second"))
    with pytest.raises(ValueError, match="first"): await thread.gather(boom("first"), work(1), work(2), limit=1)

    future: asyncio.Future[int] = asyncio.get_running_loop().create_future()

    future.set_result(9)

    assert await thread.gather(future, work(1)) == [9, 2]

    await denied("thread.work", thread.gather(work(1), cast("Any", 5)))
    for bad in (-1, 1.5, True, "2", None): await denied("thread.limit", thread.gather(work(1), limit=cast("Any", bad)))

    assert live == 0 and len(ended) == 2

async def test_gather_cancelled_from_outside_cancels_every_work () -> None:

    ended: list[int] = []

    async def held ( n: int ) -> None:

        try: await asyncio.sleep(30)
        finally: ended.append(n)

    task = asyncio.ensure_future(thread.gather(held(1), held(2), held(3), limit=2))

    await asyncio.sleep(0.01)

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    assert sorted(ended) == [1, 2]

async def test_map_pulls_lazily_and_refuses_bad_work () -> None:

    pulled = done = ahead = 0

    def source () -> Iterator[int]:

        nonlocal pulled, ahead

        for n in range(20):

            pulled += 1
            ahead   = max(ahead, pulled - done)

            yield n

    async def work ( n: int ) -> int:

        nonlocal done

        await asyncio.sleep(0.001)

        done += 1

        return n + 1

    async def picky ( n: int ) -> int:

        if n == 3: raise KeyError(n)

        await asyncio.sleep(0.01)

        return n

    def torn () -> Iterator[int]:

        yield 1

        raise LookupError("torn")

    assert await thread.map(source(), work, limit=3) == list(range(1, 21)) and ahead <= 3
    assert await thread.map([], work) == [] and await thread.map("ab", nap_word) == ["A", "B"]
    assert await thread.map(range(3), work, limit=CEILING) == [1, 2, 3]

    pulled = done = 0

    with pytest.raises(KeyError): await thread.map(source(), picky, limit=2)

    assert pulled <= 6

    with pytest.raises(LookupError, match="torn"): await thread.map(torn(), work, limit=2)

    await denied("thread.items", thread.map(cast("Any", 5), work))
    await denied("thread.work", thread.map([1], cast("Any", 5)))
    await denied("thread.work", thread.map([1], cast("Any", str)))

    for bad in (0, -2, 1.0, True, None, CEILING + 1, 10 ** 30):

        await denied("thread.limit", thread.map([1], work, limit=cast("Any", bad)))

async def nap_word ( word: str ) -> str:

    await asyncio.sleep(0)

    return word.upper()

async def test_tasks_track_report_close_and_drain () -> None:

    tasks = Tasks("crowd")

    async def broken () -> None: raise ValueError("x")

    async def quick ( n: int ) -> int:

        await asyncio.sleep(0.01)

        return n

    async def parent () -> None: kept.append(tasks.spawn(quick(7)))

    async def closer () -> int: return await tasks.close()

    async def stubborn () -> None:

        try: await asyncio.sleep(30)
        except asyncio.CancelledError: await asyncio.sleep(0.1)

    with log.capture() as events:

        failed = tasks.spawn(broken(), "broken")

        await asyncio.wait([failed])
        await asyncio.sleep(0)

    assert [(event["level"], event["event"], event["task"], event["kind"], event["name"]) for event in events] == [
        ("error", "task.failed", "broken", "ValueError", "crowd"),
    ]

    kept = [tasks.spawn(quick(n)) for n in range(3)]

    assert tasks.count() == 3 and await tasks.drain() == 3 and [task.result() for task in kept] == [0, 1, 2]

    family = tasks.spawn(parent())

    assert await tasks.drain() == 2 and tasks.count() == 0 and await tasks.drain() == 0 and family.done()
    assert kept[-1].result() == 7

    sleepy = tasks.spawn(asyncio.sleep(30), "sleepy")

    assert sleepy.get_name() == "sleepy" and await tasks.drain(0.01) == 0 and await tasks.drain(0) == 0
    assert tasks.count() == 1 and await tasks.close() == 1 and sleepy.cancelled() and tasks.count() == 0

    hold  = tasks.spawn(asyncio.sleep(30))
    inner = tasks.spawn(closer())

    assert await inner == 1 and hold.cancelled()

    stuck = tasks.spawn(stubborn(), "stubborn")

    await asyncio.sleep(0)

    with log.capture() as events: assert await tasks.close(0.01) == 1 and not stuck.done()

    assert [(event["level"], event["event"], event["name"], event["count"]) for event in events] == [
        ("warning", "task.stuck", "crowd", 1),
    ]
    assert await tasks.drain(math.inf) == 1 and tasks.count() == 0 and await tasks.close(math.inf) == 0
    assert stuck.done() and not stuck.cancelled()

async def test_tasks_refuse_bad_names_work_and_a_missing_loop () -> None:

    tasks = Tasks()

    assert tasks.name == "tasks"

    for bad in ("", "n" * 121, 5, None, b"x"): refused("thread.name", partial(Tasks, cast("Any", bad)))

    wide = Tasks("n" * 120)
    task = wide.spawn(nap(0), "n" * 120)

    assert wide.name == "n" * 120 and task.get_name() == "n" * 120 and await task == 0

    for name in ("n" * 121, 5, b"x"):

        coroutine = asyncio.sleep(0)

        refused("thread.name", partial(tasks.spawn, coroutine, cast("Any", name)))

        assert inspect.getcoroutinestate(coroutine) == inspect.CORO_CLOSED

    for work in (5, None, nap, asyncio.get_running_loop().create_future()):

        refused("thread.work", partial(tasks.spawn, cast("Any", work)))

    coroutine = asyncio.sleep(0)

    await thread.offload(refused, "thread.loop", partial(tasks.spawn, coroutine))

    assert inspect.getcoroutinestate(coroutine) == inspect.CORO_CLOSED and tasks.count() == 0

    for grace in (-1, math.nan, "1", None, True):

        await denied("thread.seconds", tasks.close(cast("Any", grace)))
        await denied("thread.seconds", tasks.drain(cast("Any", grace)))

async def test_tasks_reach_other_loops_and_forget_closed_ones () -> None:

    tasks = Tasks("far")
    ready = threading.Event()
    seen: list[asyncio.Task[None]] = []

    async def stay () -> None:

        seen.append(tasks.spawn(asyncio.sleep(30), "far"))
        ready.set()

        with contextlib.suppress(asyncio.CancelledError): await seen[0]

    async def plant () -> None: seen.append(tasks.spawn(asyncio.sleep(30)))

    worker = threading.Thread(target=asyncio.run, args=(stay(),))

    worker.start()

    assert await thread.offload(ready.wait, 5) and tasks.count() == 1 and await tasks.close() == 1

    await thread.offload(worker.join, 5)

    assert not worker.is_alive() and seen[0].cancelled() and tasks.count() == 0

    loop = asyncio.new_event_loop()

    await thread.offload(loop.run_until_complete, plant())

    loop.close()

    assert tasks.count() == 1 and await tasks.drain(0.01) == 0 and await tasks.close() == 1 and tasks.count() == 0

async def test_forever_waits_for_stop_and_gives_the_signals_back () -> None:

    unit = Thread()
    loop = asyncio.get_running_loop()

    def lived () -> weakref.ref[asyncio.AbstractEventLoop]:

        side = asyncio.new_event_loop()

        try: side.run_until_complete(unit.forever(()))
        finally: side.close()

        return weakref.ref(side)

    for bad in ([signal.SIGINT], (2,), "SIGINT", None): await denied("thread.signal", unit.forever(cast("Any", bad)))

    waiter = asyncio.ensure_future(unit.forever((signal.SIGUSR1,)))

    await asyncio.sleep(0.01)

    assert not waiter.done() and not unit.stopping() and signal.getsignal(signal.SIGUSR1) is not signal.SIG_DFL

    os.kill(os.getpid(), signal.SIGUSR1)

    await asyncio.wait_for(waiter, 5)

    assert unit.stopping() and unit.describe()["stopping"] is True and not loop.remove_signal_handler(signal.SIGUSR1)

    await asyncio.wait_for(unit.forever(()), 5)

    assert await unit.close() == 0 and not unit.stopping()

    waiters = [asyncio.ensure_future(unit.forever(())) for _ in range(3)]

    await asyncio.sleep(0.01)
    await thread.offload(unit.stop)
    await asyncio.wait_for(asyncio.gather(*waiters), 5)

    assert unit.stopping() and await unit.close() == 0

    cancelled = asyncio.ensure_future(unit.forever((signal.SIGUSR2,)))

    await asyncio.sleep(0.01)

    cancelled.cancel()

    with pytest.raises(asyncio.CancelledError): await cancelled

    assert not loop.remove_signal_handler(signal.SIGUSR2) and not unit.stopping()

    unit.stop()

    mark = await thread.offload(lived)

    gc.collect()

    assert mark() is None and unit.stopping() and await unit.close() == 0

async def test_close_cancels_tasks_and_kills_isolated_workers () -> None:

    unit  = Thread()
    ended: list[str] = []

    async def held () -> None:

        try: await asyncio.sleep(30)
        except asyncio.CancelledError:

            ended.append("cancelled")

            raise

    task = unit.spawn(held(), "held")

    assert unit.tasks().count() == 1 and unit.describe()["tasks"] == 1

    pid  = await unit.compute(os.getpid)
    work = asyncio.ensure_future(unit.compute(time.sleep, 30))

    await asyncio.sleep(0.3)

    assert unit.describe()["pools"] == ["process"] and await unit.close() == 1 and task.cancelled()
    assert ended == ["cancelled"] and unit.describe() == { "tasks": 0, "stopping": False, "workers": 32, "pools": [] }

    fault = await denied("thread.broken", work)

    assert fault.code is Code.UNAVAILABLE and fault.unknown and await gone(pid)
    assert await unit.compute(operator.add, 2, 3) == 5 and await unit.close() == 0

    for bad in (-1, math.nan, "1"): await denied("thread.seconds", unit.close(cast("Any", bad)))

async def test_one_dsl_runs_on_tasks_threads_processes_and_interpreters () -> None:

    async def doubled ( n: int ) -> int:

        await asyncio.sleep(0)

        return n * 2

    made = await thread.run(range(5), doubled)

    assert made.results() == [0, 2, 4, 6, 8] and made.ok() and made.mode == "async" and made.workers == 32
    assert made.raise_first() is made and made.errors() == [] and [outcome.index for outcome in made.outcomes] == list(range(5))
    assert made.dump() == { "mode": "async", "workers": 32, "ms": made.ms, "done": 5, "failed": 0 }
    assert (await thread.run(range(5), operator.neg)).results() == [0, -1, -2, -3, -4]

    for mode in ("thread", "process", "interpreter"):

        made = await thread.run(range(6), math.factorial, cast("Any", mode), workers=64)

        assert made.results() == [1, 1, 2, 6, 24, 120] and made.mode == mode
        assert made.workers == (32 if mode == "thread" else CORES)

        made = await thread.run(["7", "x", "9"], int, cast("Any", mode), workers=2)

        assert made.results() == [7, 9] and not made.ok() and [outcome.ok() for outcome in made.outcomes] == [True, False, True]
        assert made.dump()["failed"] == 1 and made.outcomes[1].value is None

        fault = made.errors()[0]

        assert fault.code is Code.INTERNAL and fault.reason == "thread.failed" and fault.unknown

        with pytest.raises(Fault) as raised: made.raise_first()

        assert raised.value is fault

        fault = (await thread.run([0], Gate, cast("Any", mode))).errors()[0]

        assert fault.code is Code.INTERNAL and fault.reason == "thread.limit" and not fault.unknown

    empty = await thread.run([], math.factorial, "process", workers=3)

    assert empty == Run("process", (), 0.0, 3) and empty.ok() and empty.results() == []
    assert sorted(cast("list[str]", thread.describe()["pools"])) == ["interpreter", "process", "thread"]

async def test_run_orders_hooks_retries_and_stops () -> None:

    seen: list[tuple[int, Any]] = []
    lost: list[tuple[int, str | None]] = []
    left = { "tries": 0 }

    async def on_result ( index: int, value: Any ) -> None: seen.append((index, value))

    def on_error ( index: int, fault: Fault ) -> None: lost.append((index, fault.reason))

    def bad_hook ( index: int, value: Any ) -> None: raise LookupError(index)

    def eventually ( n: int ) -> int:

        left["tries"] += 1

        if left["tries"] < 3: raise OSError("not yet")

        return n

    def first_fails ( n: int ) -> int:

        if n == 0: raise Fault(Code.CONFLICT, reason="test.taken")

        return n

    made = await thread.run([0.05, 0.01, 0.03], nap, ordered=False)

    assert [outcome.index for outcome in made.outcomes] == [1, 2, 0] and made.results() == [0.01, 0.03, 0.05]
    assert all(outcome.ms >= 5 for outcome in made.outcomes) and made.ms >= 40

    made = await thread.run(["1", "x", "3"], int, "thread", on_result=on_result, on_error=on_error)

    assert sorted(seen) == [(0, 1), (2, 3)] and lost == [(1, "thread.failed")] and made.results() == [1, 3]

    with pytest.raises(LookupError): await thread.run([1, 2], operator.neg, on_result=bad_hook)
    with pytest.raises(LookupError): await thread.run(["x"], int, on_error=bad_hook)

    assert (await thread.run([5], eventually, "thread", retries=2)).results() == [5] and left["tries"] == 3

    left["tries"] = 0

    made = await thread.run([5], eventually, retries=1)

    assert not made.ok() and left["tries"] == 2 and made.errors()[0].reason == "thread.failed"
    assert isinstance(made.errors()[0].__cause__, OSError)

    made = await thread.run(range(4), first_fails, workers=1, fail_fast=True)

    assert [(outcome.index, outcome.error.reason if outcome.error else None) for outcome in made.outcomes] == [
        (0, "test.taken"), (1, "thread.stopped"), (2, "thread.stopped"), (3, "thread.stopped"),
    ]
    assert made.errors()[1].code is Code.CONFLICT and made.outcomes[1].ms == 0.0

    made = await thread.run(range(4), first_fails, workers=1)

    assert made.results() == [1, 2, 3] and len(made.errors()) == 1

async def test_run_times_out_and_can_be_cancelled () -> None:

    started = time.perf_counter()
    made    = await thread.run([0.01, 5, 0.02], nap, timeout=0.1)
    fault   = made.errors()[0]

    assert made.results() == [0.01, 0.02] and fault.code is Code.TIMEOUT and fault.reason == "thread.timeout"
    assert fault.unknown and time.perf_counter() - started < 2

    made = await thread.run([0.3], time.sleep, "thread", timeout=0.05, retries=1)

    assert made.errors()[0].reason == "thread.timeout" and 90 <= made.ms < 300
    assert (await thread.run([0.01], nap, timeout=math.inf)).ok()

    async def inner ( seconds: float ) -> float:

        async with asyncio.timeout(0.01): return await nap(seconds)

    made = await thread.run([5], inner, timeout=2)

    assert made.errors()[0].reason == "thread.failed" and isinstance(made.errors()[0].__cause__, TimeoutError)

    task = asyncio.ensure_future(thread.run([30, 30], nap))

    await asyncio.sleep(0.01)

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

async def test_a_timed_process_job_is_killed_and_its_lane_recovers () -> None:

    pid   = await thread.compute(os.getpid)
    fault = await denied("thread.timeout", thread.compute(time.sleep, 30, timeout=0.3))

    assert fault.code is Code.TIMEOUT and fault.unknown and await gone(pid)

    fresh = await thread.compute(os.getpid)

    assert fresh != pid and fresh != os.getpid()

    task = asyncio.ensure_future(thread.compute(time.sleep, 30))

    await asyncio.sleep(0.3)

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    assert await gone(fresh)

    fault = await denied("thread.broken", thread.compute(os._exit, 3))

    assert fault.code is Code.UNAVAILABLE and fault.unknown and await thread.compute(math.factorial, 5) == 120

    fault = await denied("thread.failed", thread.compute(cast("Any", lambda: 1)))

    assert fault.unknown and await thread.compute(operator.mul, 6, 7) == 42

    made = await thread.run([0.05, 30, 0.05], time.sleep, "process", workers=3, timeout=1, retries=1)

    assert [outcome.ok() for outcome in made.outcomes] == [True, False, True] and made.errors()[0].reason == "thread.timeout"

async def test_an_exit_off_the_loop_fails_the_job_and_spares_the_loop () -> None:

    def interrupted () -> None: raise KeyboardInterrupt

    fault = await denied("thread.failed", thread.offload(sys.exit, 3))

    assert fault.code is Code.INTERNAL and fault.unknown and isinstance(fault.__cause__, SystemExit)
    assert fault.__cause__.code == 3

    fault = await denied("thread.failed", thread.offload(interrupted))

    assert isinstance(fault.__cause__, KeyboardInterrupt) and await thread.offload(operator.add, 1, 2) == 3

    for mode in ("thread", "process", "interpreter"):

        made = await thread.run([3, "bye"], sys.exit, cast("Any", mode))

        assert [fault.reason for fault in made.errors()] == ["thread.failed", "thread.failed"] and made.results() == []
        assert all(fault.unknown and fault.code is Code.INTERNAL for fault in made.errors())
        assert await thread.compute(operator.add, 1, 2, mode=cast("Any", mode)) == 3

async def test_work_that_cannot_cross_fails_and_leaves_the_lane_whole () -> None:

    for mode in ("process", "interpreter"):

        for work in (thread.compute(threading.Lock, mode=cast("Any", mode)), thread.compute(len, threading.Lock(), mode=cast("Any", mode))):

            fault = await denied("thread.failed", work)

            assert fault.code is Code.INTERNAL and fault.unknown

        assert await thread.compute(len, "\ud800x", mode=cast("Any", mode)) == 2
        assert await thread.compute(len, b"\x00" * 70000, mode=cast("Any", mode)) == 70000

        fault = await denied("thread.failed", thread.compute(compile, "(" * 3000, "work", "eval", mode=cast("Any", mode)))

        assert fault.unknown and await thread.compute(operator.mul, 6, 7, mode=cast("Any", mode)) == 42

async def test_a_timed_interpreter_job_leaves_its_lane_usable () -> None:

    started = time.perf_counter()
    fault   = await denied("thread.timeout", thread.compute(time.sleep, 2, mode="interpreter", timeout=0.05))

    assert fault.code is Code.TIMEOUT and fault.unknown
    assert await thread.compute(operator.add, 1, 2, mode="interpreter") == 3
    assert (await thread.run(range(4), math.factorial, "interpreter")).results() == [1, 1, 2, 6]
    assert time.perf_counter() - started < 1.5

async def test_run_refuses_malformed_orders () -> None:

    def veiled ( seconds: float ) -> object: return nap(seconds)

    orders: list[tuple[dict[str, Any], str]] = [
        ({ "mode": "fiber" }, "thread.mode"), ({ "mode": 7 }, "thread.mode"), ({ "mode": ["async"] }, "thread.mode"),
        ({ "workers": 0 }, "thread.workers"), ({ "workers": CEILING + 1 }, "thread.workers"),
        ({ "workers": True }, "thread.workers"), ({ "workers": 2.0 }, "thread.workers"),
        ({ "timeout": 0 }, "thread.seconds"), ({ "timeout": -1 }, "thread.seconds"),
        ({ "timeout": math.nan }, "thread.seconds"), ({ "timeout": "1" }, "thread.seconds"),
        ({ "timeout": True }, "thread.seconds"), ({ "retries": -1 }, "thread.retries"),
        ({ "retries": RETRIES + 1 }, "thread.retries"), ({ "retries": 1.5 }, "thread.retries"),
        ({ "on_result": 5 }, "thread.hook"), ({ "on_error": "x" }, "thread.hook"),
    ]

    for options, reason in orders:

        fault = await denied(reason, thread.run([1], operator.neg, **options))

        assert fault.code is Code.INTERNAL

    fault = await denied("thread.mode", thread.run([1], operator.neg, cast("Any", "m" * 500)))

    assert fault.errors == { "mode": ["m" * 120] }

    await denied("thread.work", thread.run([1], cast("Any", 5)))
    await denied("thread.work", thread.run([1], cast("Any", None)))
    await denied("thread.work", thread.compute(cast("Any", None), mode="thread"))
    await denied("thread.items", thread.run(cast("Any", 5), operator.neg))

    made = await thread.run([0, 0], veiled, "thread")

    assert [fault.reason for fault in made.errors()] == ["thread.work", "thread.work"] and made.results() == []
    assert (await thread.run([0, 0], veiled)).results() == [0, 0]

    for mode in ("thread", "process", "interpreter", "ray"):

        await denied("thread.work", thread.run([1], nap, cast("Any", mode)))
        await denied("thread.work", thread.compute(nap, 1, mode=cast("Any", mode)))

    await denied("thread.mode", thread.compute(operator.neg, 1, mode=cast("Any", "fiber")))
    await denied("thread.seconds", thread.compute(operator.neg, 1, timeout=0))

    assert (await thread.run([1], operator.neg, retries=RETRIES, workers=CEILING)).results() == [-1]
    assert await thread.compute(nap, 0, mode="async") == 0 and await thread.compute(operator.add, 2, 3, mode="thread") == 5

async def test_race_gives_the_first_and_cancels_the_rest () -> None:

    ended: list[str] = []

    async def slow ( word: str ) -> str:

        try: await asyncio.sleep(30)
        except asyncio.CancelledError:

            ended.append(word)

            raise

        return word

    async def fast ( word: str, seconds: float = 0 ) -> str:

        await asyncio.sleep(seconds)

        return word

    assert await thread.race(slow("a"), fast("b", 0.01), slow("c")) == "b" and sorted(ended) == ["a", "c"]
    assert await thread.race(fast("only")) == "only" and await thread.race(fast("x"), fast("y")) == "x"

    with pytest.raises(ValueError, match="lost"): await thread.race(slow("d"), boom("lost"))

    assert ended[-1] == "d"

    await denied("thread.race", thread.race())
    await denied("thread.work", thread.race(fast("z"), cast("Any", 5)))

    task = asyncio.ensure_future(thread.race(slow("e"), slow("f")))

    await asyncio.sleep(0.01)

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    assert sorted(ended[-2:]) == ["e", "f"]

async def test_racers_failing_together_leave_no_stray_error () -> None:

    strays: list[str] = []
    loop   = asyncio.get_running_loop()
    kept   = loop.get_exception_handler()

    loop.set_exception_handler(lambda _, context: strays.append(context["message"]))

    try:

        with pytest.raises(ValueError, match="first"): await thread.race(boom("first"), boom("second"), boom("third"))

        gc.collect()

    finally: loop.set_exception_handler(kept)

    assert strays == []

async def test_chunks_and_sleep_keep_their_bounds () -> None:

    assert thread.chunks(range(7), 3) == [[0, 1, 2], [3, 4, 5], [6]] and thread.chunks([], 4) == []
    assert thread.chunks("abcd", 2) == [["a", "b"], ["c", "d"]] and thread.chunks((n for n in range(3)), 5) == [[0, 1, 2]]

    for bad in (0, -1, 1.5, True, "2", None, sys.maxsize + 1, 10 ** 30):

        refused("thread.chunk", partial(thread.chunks, [1], cast("Any", bad)))

    assert thread.chunks([1, 2], sys.maxsize) == [[1, 2]]

    refused("thread.items", partial(thread.chunks, cast("Any", 5), 2))

    started = time.perf_counter()

    await thread.sleep(0.02)
    await thread.sleep(0)
    await thread.sleep(-1)

    assert 0.015 <= time.perf_counter() - started < 0.5

    for wait in (math.nan, "1", None, True, [1]): await denied("thread.seconds", thread.sleep(cast("Any", wait)))

class Ref:

    def __init__ ( self, work: Callable[[], object] ) -> None:

        self.work = work

class Remote:

    def __init__ ( self, calls: list[str], handler: Callable[..., object] ) -> None:

        self.calls   = calls
        self.handler = handler

        calls.append("wrap")

    def remote ( self, item: object ) -> object:

        self.calls.append("remote")

        if item == "wait": return asyncio.get_running_loop().create_future()
        if item == "soon": return asyncio.ensure_future(asyncio.sleep(0, "soon"))

        return Ref(partial(self.handler, item))

class Rig:

    def __init__ ( self, calls: list[str], found: list[object] ) -> None:

        self.calls = calls
        self.found = found
        self.up    = False

    def is_initialized ( self ) -> bool:

        return self.up

    def init ( self, **options: object ) -> None:

        self.calls.append(f"init:{options['address']}")

        self.up = True

    def remote ( self, handler: Callable[..., object] ) -> Remote:

        return Remote(self.calls, handler)

    def get ( self, ref: Ref ) -> object:

        return ref.work()

    def nodes ( self ) -> list[object]:

        return self.found

    def cancel ( self, ref: object ) -> None:

        self.calls.append("cancel")

    def shutdown ( self ) -> None:

        self.calls.append("shutdown")

        self.up = False

def rigged ( calls: list[str], nodes: list[object] ) -> types.ModuleType:

    rig  = Rig(calls, nodes)
    fake = types.ModuleType("ray")

    for name in ("is_initialized", "init", "remote", "get", "nodes", "cancel", "shutdown"): setattr(fake, name, getattr(rig, name))

    return fake

async def test_ray_rides_a_cluster_through_the_same_dsl ( monkeypatch: pytest.MonkeyPatch ) -> None:

    calls: list[str] = []

    def interrupted ( _: object ) -> None: raise KeyboardInterrupt

    monkeypatch.setitem(sys.modules, "ray", rigged(calls, [{ "Alive": True }, { "Alive": False }, 1, { "NodeID": "n" }]))

    made = await thread.run(range(3), math.factorial, "ray", workers=2, address="ray://head:10001")

    assert made.results() == [1, 1, 2] and made.mode == "ray" and made.workers == 2
    assert calls == ["init:ray://head:10001", "wrap", "remote", "remote", "remote"]

    made = await thread.run(["3", "x"], int, "ray")

    assert made.results() == [3] and made.errors()[0].reason == "thread.failed" and calls.count("init:ray://head:10001") == 1
    assert isinstance(made.errors()[0].__cause__, ValueError)

    made = await thread.run([3], sys.exit, "ray")

    assert made.errors()[0].reason == "thread.failed" and isinstance(made.errors()[0].__cause__, SystemExit)

    made = await thread.run([3], interrupted, "ray")

    assert made.errors()[0].reason == "thread.failed" and isinstance(made.errors()[0].__cause__, KeyboardInterrupt)

    cluster = await thread.cluster()

    assert await cluster.nodes() == 3 and await cluster.call(str.upper, "soon") == "soon"
    assert await Cluster.connect("ray://head:10001") is not cluster

    fault = await denied("thread.cluster", Cluster.connect("ray://other:10001"))

    assert fault.code is Code.CONFLICT

    for bad in ("", 5, b"ray://x"): await denied("thread.address", thread.cluster(cast("Any", bad)))

    waiting = asyncio.ensure_future(cluster.call(str.upper, "wait"))

    await asyncio.sleep(0.01)

    waiting.cancel()

    with pytest.raises(asyncio.CancelledError): await waiting

    assert calls[-1] == "cancel" and await cluster.call(cast("Any", [].append), 1) is None

    before = calls.count("wrap")

    for n in range(REMOTES + 2): assert await cluster.call(partial(operator.add, n), 1) == n + 1

    assert calls.count("wrap") == before + REMOTES + 2 and await cluster.call(math.factorial, 4) == 24

    wraps = calls.count("wrap")

    await cluster.close()
    await cluster.close()

    assert calls.count("shutdown") == 1 and (await thread.run([2], math.factorial, "ray")).results() == [2]
    assert calls.count("init:None") == 1 and calls.count("wrap") == wraps + 1 and await Cluster.connect() is not cluster

    await denied("thread.cluster", Cluster.connect("ray://late:1"))
    await cluster.close()

    assert calls.count("shutdown") == 2

    monkeypatch.setitem(sys.modules, "ray", rigged(calls, []))

    fresh = await thread.cluster("ray://next:1")

    assert await fresh.nodes() == 0 and calls[-1] == "init:ray://next:1"

    adders = [partial(operator.add, n) for n in range(REMOTES + 1)]

    for adder in adders[:REMOTES]: assert await fresh.call(adder, 1) == adder(1)

    wraps = calls.count("wrap")

    assert await fresh.call(adders[0], 5) == 5 and calls.count("wrap") == wraps
    assert await fresh.call(adders[REMOTES], 1) == REMOTES + 1 and await fresh.call(adders[0], 2) == 2
    assert calls.count("wrap") == wraps + 2

    await fresh.close()

    monkeypatch.setitem(sys.modules, "ray", None)

    fault = await denied("thread.ray", thread.cluster())

    assert fault.code is Code.INTERNAL and fault.message == "ray is required"

    await denied("thread.ray", thread.run([1], math.factorial, "ray"))

async def test_gate_admits_in_order_and_expires_by_deadline () -> None:

    for bad in (0, -1, True, 1.0, "2", None): refused("thread.limit", partial(Gate, cast("Any", bad)))

    gate = Gate(2)

    assert gate.limit() == 2 and gate.free() == 2 and not gate.locked() and gate.take() and gate.take() and not gate.take()
    assert gate.locked() and gate.describe() == { "limit": 2, "free": 0, "waiting": 0 }

    for bad in (-1, math.nan, "1", None, True): await denied("thread.seconds", gate.acquire(cast("Any", bad)))

    with pytest.raises(TimeoutError, match="gate"): await gate.acquire(0)

    order: list[int] = []

    async def enter ( n: int, wait: float ) -> None:

        await gate.acquire(wait)

        order.append(n)

    waiters = [asyncio.ensure_future(enter(n, 5)) for n in range(3)]

    await asyncio.sleep(0)

    assert gate.waiting() == 3

    gate.release()

    assert not gate.take()

    gate.release()
    gate.release()

    await asyncio.gather(*waiters)

    assert order == [0, 1, 2] and gate.free() == 0 and gate.waiting() == 0

    gate.release()

    assert gate.free() == 1 and gate.take()

    patient = asyncio.ensure_future(enter(7, 0.5))
    hasty   = asyncio.ensure_future(enter(8, 0.03))
    endless = asyncio.ensure_future(enter(9, math.inf))
    started = time.perf_counter()

    with pytest.raises(TimeoutError, match="gate"): await hasty

    assert time.perf_counter() - started < 0.3 and not patient.done() and gate.waiting() == 2

    gate.release()

    await patient

    with pytest.raises(TimeoutError): await asyncio.wait_for(asyncio.shield(endless), 0.05)

    gate.release()

    await endless

    assert order[-2:] == [7, 9] and gate.free() == 0

    gate.release()
    gate.release()
    gate.release()
    gate.release()

    assert gate.free() == 2 and gate.describe() == { "limit": 2, "free": 2, "waiting": 0 }

async def test_gate_survives_cancels_and_a_crowd () -> None:

    gate = Gate(1)

    await gate.acquire(0)

    leaver = asyncio.ensure_future(gate.acquire(5))
    stayer = asyncio.ensure_future(gate.acquire(5))

    await asyncio.sleep(0)

    leaver.cancel()

    with pytest.raises(asyncio.CancelledError): await leaver

    assert gate.waiting() == 1

    gate.release()

    await stayer

    assert gate.free() == 0

    granted = asyncio.ensure_future(gate.acquire(5))

    await asyncio.sleep(0)

    gate.release()
    granted.cancel()

    with pytest.raises(asyncio.CancelledError): await granted

    assert gate.free() == 1 and gate.waiting() == 0 and gate.take()

    crowd   = [asyncio.ensure_future(gate.acquire(0.02 + (n % 5) * 0.01)) for n in range(500)]
    started = time.perf_counter()
    ended   = await asyncio.gather(*crowd, return_exceptions=True)

    assert all(isinstance(end, TimeoutError) for end in ended) and time.perf_counter() - started < 2
    assert gate.waiting() == 0 and gate.free() == 0

    gate.release()

    assert gate.free() == 1

    late = [asyncio.ensure_future(gate.acquire(wait)) for wait in (0.3, 0.3, 0.02, 0.3)]

    await asyncio.sleep(0.1)

    assert [task.done() for task in late] == [True, False, True, False] and late[0].exception() is None
    assert isinstance(late[2].exception(), TimeoutError)

    gate.release()
    gate.release()

    await asyncio.gather(late[1], late[3])

    assert gate.free() == 0 and gate.waiting() == 0

async def test_gate_keeps_its_count_and_its_deadlines ( monkeypatch: pytest.MonkeyPatch ) -> None:

    loop = asyncio.get_running_loop()
    gate = Gate(1)

    await gate.acquire(0)

    late = asyncio.ensure_future(gate.acquire(0.01))

    await asyncio.sleep(0)

    loop.call_at(loop.time() + 0.02, late.cancel)
    stall(0.05)

    with pytest.raises(asyncio.CancelledError): await late

    assert gate.free() == 0 and gate.waiting() == 0

    long  = asyncio.ensure_future(gate.acquire(0.5))
    brief = asyncio.ensure_future(gate.acquire(0.05))
    mid   = asyncio.ensure_future(gate.acquire(0.1))

    done, _ = await asyncio.wait({ brief, mid }, timeout=0.3)

    assert done == { brief, mid } and all(isinstance(task.exception(), TimeoutError) for task in done)
    assert not long.done() and gate.waiting() == 1

    gate.release()

    await long

    assert gate.free() == 0 and gate.waiting() == 0

    clock = loop.time()

    with monkeypatch.context() as patch:

        patch.setattr(loop, "time", lambda: clock)

        edge = asyncio.ensure_future(gate.acquire(0.05))

        await asyncio.sleep(0)

        clock += 0.05

        for _ in range(3): await asyncio.sleep(0)

        assert edge.done() and isinstance(edge.exception(), TimeoutError) and gate.waiting() == 0

        far  = asyncio.ensure_future(gate.acquire(0.5))
        near = asyncio.ensure_future(gate.acquire(0.05))

        await asyncio.sleep(0)

        clock += 0.05

        for _ in range(3): await asyncio.sleep(0)

        assert near.done() and isinstance(near.exception(), TimeoutError) and not far.done() and gate.waiting() == 1

    gate.release()

    await far

    gate.release()

    assert gate.free() == 1 and gate.describe() == { "limit": 1, "free": 1, "waiting": 0 }

async def test_pool_builds_lazily_resizes_and_outlives_a_fork ( monkeypatch: pytest.MonkeyPatch ) -> None:

    pool = Pool("thread", 2)

    assert not pool.live() and pool.describe() == { "mode": "thread", "workers": 2, "live": False }

    token = MARK.set("pooled")

    try: assert await pool.submit(cast("Any", lambda _: MARK.get()), None) == "pooled"
    finally: MARK.reset(token)

    first = pool.executor()

    assert pool.live() and pool.executor() is first

    pool.resize(2)

    assert pool.executor() is first

    pool.resize(4)

    assert not pool.live() and pool.workers == 4 and await pool.submit(operator.neg, 3) == -3

    second = pool.executor()
    hold   = threading.Event()

    assert second is not first and not pool.busy()

    held = asyncio.ensure_future(pool.submit(cast("Any", hold.wait), 5))

    await asyncio.sleep(0.02)

    assert pool.busy()

    hold.set()

    assert await held is True and not pool.busy()

    with monkeypatch.context() as patch:

        patch.setattr(os, "getpid", lambda: -1)

        assert not pool.live()

        pool.close()

        third = pool.executor()

        assert third is not second and pool.live() and pool.executor() is third

    assert not pool.live() and second.submit(operator.neg, 5).result(5) == -5

    fourth = pool.executor()

    assert fourth is not third and pool.live() and await pool.submit(operator.neg, 1) == -1

    for executor in (second, third, fourth): executor.shutdown()

    fault = await denied("thread.broken", pool.submit(operator.neg, 1))

    assert fault.code is Code.UNAVAILABLE and fault.unknown and not pool.live()
    assert await pool.submit(operator.neg, 2) == -2

    pool.close()
    pool.close(kill=True)

    assert not pool.live() and not pool.busy()

async def test_pool_counts_every_flight_and_answers_for_the_dropped ( monkeypatch: pytest.MonkeyPatch ) -> None:

    pool = Pool("thread", 1)
    hold = threading.Event()
    held = asyncio.ensure_future(pool.submit(cast("Any", hold.wait), 3))

    await asyncio.sleep(0.02)

    assert pool.busy() and pool.live()

    queued = asyncio.ensure_future(pool.submit(operator.neg, 3))

    await asyncio.sleep(0.02)

    queued.cancel()

    with pytest.raises(asyncio.CancelledError): await queued

    assert pool.busy() and not held.done()

    queued = asyncio.ensure_future(pool.submit(operator.neg, 3))

    await asyncio.sleep(0.02)

    pool.close(kill=True)

    fault = await denied("thread.broken", queued)

    assert fault.code is Code.UNAVAILABLE and not fault.unknown and isinstance(fault.__cause__, asyncio.CancelledError)
    assert not pool.busy() and not pool.live()

    hold.set()

    assert await held is True and await pool.submit(operator.neg, 4) == -4 and not pool.busy()

    parent = pool.executor()
    latch  = threading.Event()
    flying = asyncio.ensure_future(pool.submit(cast("Any", latch.wait), 3))

    await asyncio.sleep(0.02)

    assert pool.busy()

    with monkeypatch.context() as patch:

        patch.setattr(os, "getpid", lambda: -1)

        assert not pool.busy() and not pool.live()

        child = pool.executor()

        assert child is not parent and pool.live() and not pool.busy()

    latch.set()

    assert await flying is True

    for executor in (parent, child): executor.shutdown()

    side  = Pool("process", 1)
    fault = await denied("thread.failed", side.submit(int, "x"))

    assert fault.code is Code.INTERNAL and fault.unknown and await side.submit(operator.neg, 1) == -1

    side.close(kill=True)

async def test_lane_steers_around_its_stuck_workers_and_serves_a_second_loop () -> None:

    lane   = Lane("thread", 2)
    first  = threading.Event()
    second = threading.Event()
    third  = threading.Event()

    async def stuck ( hold: threading.Event ) -> None:

        task = asyncio.ensure_future(lane.submit(cast("Any", hold.wait), 3))

        await asyncio.sleep(0.02)

        task.cancel()

        with pytest.raises(asyncio.CancelledError): await task

    await stuck(first)

    assert await asyncio.wait_for(lane.submit(operator.neg, 1), 1) == -1 and lane.describe()["live"] == 2

    await stuck(second)

    second.set()

    await asyncio.sleep(0.05)

    assert await asyncio.wait_for(lane.submit(operator.neg, 2), 1) == -2

    await stuck(third)

    queued = asyncio.ensure_future(lane.submit(operator.neg, 3))

    await asyncio.sleep(0.02)

    queued.cancel()

    with pytest.raises(asyncio.CancelledError): await queued

    third.set()

    await asyncio.sleep(0.05)

    assert await asyncio.wait_for(lane.submit(operator.neg, 4), 1) == -4 and lane.describe()["live"] == 2

    first.set()
    lane.close()

    narrow = Lane("thread", 1)
    latch  = threading.Event()
    lone   = asyncio.ensure_future(narrow.submit(cast("Any", latch.wait), 3))

    def aside () -> object: return asyncio.run(asyncio.wait_for(narrow.submit(operator.neg, 5), 1))

    await asyncio.sleep(0.02)

    assert await thread.offload(aside) == -5

    latch.set()

    assert await lone is True

    narrow.close()

async def test_lane_bounds_its_workers_and_sets_stuck_ones_aside () -> None:

    lane   = Lane("thread", 2)
    lock   = threading.Lock()
    hold   = threading.Event()
    live   = peak = 0
    idents: set[int] = set()

    def tracked ( seconds: float ) -> int:

        nonlocal live, peak

        with lock: live, peak = live + 1, max(peak, live + 1)

        time.sleep(seconds)
        idents.add(threading.get_ident())

        with lock: live -= 1

        return threading.get_ident()

    assert not lane.live() and lane.describe() == { "mode": "thread", "workers": 2, "live": 0 }

    first = await lane.submit(tracked, 0)

    assert [await lane.submit(tracked, 0) for _ in range(5)] == [first] * 5 and lane.describe()["live"] == 1

    await asyncio.gather(*(lane.submit(tracked, 0.02) for _ in range(8)))

    assert peak == 2 and len(idents) == 2 and lane.live() and lane.describe()["live"] == 2

    stuck = asyncio.ensure_future(lane.submit(cast("Any", hold.wait), 5))

    await asyncio.sleep(0.05)

    stuck.cancel()

    with pytest.raises(asyncio.CancelledError): await stuck

    started = time.perf_counter()
    free    = { await lane.submit(tracked, 0) for _ in range(5) }

    assert len(free) == 1 and time.perf_counter() - started < 1

    hold.set()

    with pytest.raises(ValueError, match="invalid literal"): await lane.submit(int, "x")

    assert await lane.submit(operator.neg, 1) == -1

    lane.close()

    assert not lane.live() and await lane.submit(operator.neg, 2) == -2

    lane.close(kill=True)

    assert not lane.live()

    narrow = Lane("thread", 1)
    latch  = threading.Event()
    lone   = asyncio.ensure_future(narrow.submit(cast("Any", latch.wait), 5))

    await asyncio.sleep(0.02)

    lone.cancel()

    with pytest.raises(asyncio.CancelledError): await lone

    queued = asyncio.ensure_future(narrow.submit(operator.neg, 3))

    await asyncio.sleep(0.05)

    assert not queued.done() and narrow.describe()["live"] == 1

    latch.set()

    assert await queued == -3 and narrow.describe()["live"] == 1

    narrow.close()

def test_outcome_and_run_report_what_happened () -> None:

    fault = Fault(Code.CONFLICT, reason="test.taken")
    made  = Run("thread", (Outcome(0, "a", ms=1.5), Outcome(1, error=fault), Outcome(2, None)), 3.0, 2)

    assert made.results() == ["a", None] and made.errors() == [fault] and not made.ok() and made.outcomes[2].ok()
    assert made.dump() == { "mode": "thread", "workers": 2, "ms": 3.0, "done": 2, "failed": 1 }

    with pytest.raises(Fault) as raised: made.raise_first()

    assert raised.value is fault and Run("async", (), 0.0, 1).ok()

    late  = Fault(Code.TIMEOUT, reason="test.late")
    twice = Run("thread", (Outcome(0, error=fault), Outcome(1, error=late)), 1.0, 1)

    with pytest.raises(Fault) as raised: twice.raise_first()

    assert raised.value is fault and twice.errors() == [fault, late] and twice.dump()["failed"] == 2
