from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime
from decimal import Decimal
from functools import partial, wraps
from typing import Any, cast
from uuid import UUID

from engine.error import Code, Fault
from engine.func import Breaker, Func, Info, Limiter, Memo, func
from engine.log import log
import asyncio, gc, math, pytest, weakref

def sample ( first: int, second: str = "b", *rest: int, flag: bool = False, **extra: str ) -> list[int]:
    """Sample callable."""

    return [first, len(second), *rest, int(flag), len(extra)]

class Service:

    def run ( self, value: int ) -> int:

        return value + 1

    async def __call__ ( self, value: int ) -> int:

        return value * 2

def test_metadata_reads_names_signatures_and_hints () -> None:

    bound = partial(sample, 1)

    assert func.name(sample) == "sample" and func.name(bound) == "sample" and func.name(Service().run) == "Service.run"
    assert func.module(sample) == __name__ and func.doc(sample) == "Sample callable."
    assert func.file(sample) == __file__ and func.line(sample) == sample.__code__.co_firstlineno
    assert func.file(len) is None and func.line(len) is None and func.name(len) == "len"
    assert func.params(sample) == ("first", "second", "rest", "flag", "extra") and func.params(bound)[0] == "second"
    assert func.required(sample) == ("first",) and func.required(bound) == ()
    assert func.defaults(sample) == { "second": "b", "flag": False } and func.arity(sample) == 2
    assert func.hints(sample)["first"] is int and func.returns(sample) == list[int] and func.returns(len) is None
    assert func.bind(sample, 1, flag=True) == { "first": 1, "second": "b", "rest": (), "flag": True, "extra": {} }
    assert func.accepts(sample, 1) and not func.accepts(sample) and not func.accepts(Service().run, 1, 2)

    with pytest.raises(Fault) as refused: func.bind(sample)

    assert refused.value.code is Code.VALIDATION and refused.value.reason == "func.bind"

    found = func.info(sample)

    assert type(found) is Info
    assert found.name == "sample" and found.required == ("first",) and found.arity == 2
    assert found.line == sample.__code__.co_firstlineno and not found.is_async and not found.is_generator

    with pytest.raises(Fault) as opaque: func.signature(cast("Any", 5))

    assert opaque.value.reason == "func.signature"

async def test_source_unwrap_and_predicates () -> None:

    async def work () -> int: return 1

    def stream () -> Any: yield 1

    @wraps(sample)
    def wrapped ( *args: Any, **kwargs: Any ) -> Any: return sample(*args, **kwargs)

    assert "def sample" in await func.source(wrapped) and func.unwrap(partial(wrapped, 1)) is sample

    with pytest.raises(Fault) as missing: await func.source(len)

    assert missing.value.code is Code.NOT_FOUND and missing.value.reason == "func.source"

    looped: Any = lambda: None  # noqa: E731
    looped.__wrapped__ = looped

    with pytest.raises(Fault) as endless: func.unwrap(looped)

    assert endless.value.reason == "func.unwrap"
    assert func.is_async(work) and func.is_async(partial(work)) and func.is_async(Service()) and not func.is_async(sample)
    assert func.is_async(func.lift(sample)) and not func.is_async(Service().run)
    assert func.is_generator(stream) and not func.is_generator(work)
    assert func.is_lambda(lambda: 1) and not func.is_lambda(sample)
    assert func.is_partial(partial(sample, 1)) and not func.is_partial(sample)
    assert func.is_method(Service().run) and not func.is_method(sample) and not func.is_method(Service.run)

def test_resolve_loads_public_names_and_refuses_the_rest () -> None:

    assert func.resolve("engine.func:func") is func and func.resolve("engine.func:Func.resolve") is Func.resolve
    assert func.resolve("engine.func:Memo", roots=("engine",)) is Memo

    refused = (
        "engine.func", "engine.func:", ":func", "engine.func:_x", "engine.func:func.__class__", "engine..func:func",
        "engine.func:func._cores", "os:system;x", "engine.func:Func.resolve.__globals__", "__main__:x", "engine.func: func",
    )

    for path in refused:

        with pytest.raises(Fault) as caught: func.resolve(path)

        assert caught.value.code is Code.INTERNAL and caught.value.reason == "func.resolve", path

    for path in ("engine.no_such_module_x:thing", "engine.func:Nothing", "engine.func:Func.nothing"):

        with pytest.raises(Fault) as absent: func.resolve(path)

        assert absent.value.code is Code.NOT_FOUND and absent.value.reason == "func.resolve", path

    for path in ("os:getcwd", "engineer.func:func", "engine_x:y"):

        with pytest.raises(Fault) as outside: func.resolve(path, roots=("engine",))

        assert outside.value.code is Code.INTERNAL, path

async def test_call_lift_and_hook_serve_plain_and_async_callbacks () -> None:

    async def twice ( value: int ) -> int: return value * 2

    assert await func.call(twice, 2) == 4 and await func.call(sample, 1) == [1, 1, 0, 0]
    assert await func.call(lambda: twice(5)) == 10 and func.lift(twice) is twice
    assert await func.lift(sample)(2, "abc") == [2, 3, 0, 0] and func.name(func.lift(sample)) == "sample"

    seen: list[Any] = []

    async def failing ( value: int ) -> int: raise Fault(Code.CONFLICT, reason="taken")

    async def late ( found: Any ) -> None: seen.append(("after", found))

    hooked = func.hook(twice, before=lambda value: seen.append(("before", value)), after=late)

    assert await hooked(3) == 6 and seen == [("before", 3), ("after", 6)] and func.name(hooked) == func.name(twice)

    broken = func.hook(failing, failed=lambda error: seen.append(("failed", error.reason)), after=late)

    with pytest.raises(Fault): await broken(1)

    assert seen[-1] == ("failed", "taken") and len(seen) == 3

def test_key_is_stable_typed_and_refuses_what_it_cannot_freeze () -> None:

    assert func.key(1, "a", None) == func.key(1, "a", None) and hash(func.key([1, { "a": { 2, 3 } }], x=(1,)))
    assert func.key({ "a": 1, "b": 2 }) == func.key({ "b": 2, "a": 1 }) and func.key({ 1, 2 }) == func.key({ 2, 1 })
    assert func.key(a=1, b=2) == func.key(b=2, a=1) and func.key(1) != func.key(a=1)

    flag     = True
    distinct = [
        func.key(1), func.key(flag), func.key(1.0), func.key("1"), func.key(b"1"), func.key((1,)), func.key([1]),
        func.key({ 1 }), func.key(frozenset({ 1 })), func.key(None), func.key(), func.key(Code.CONFLICT),
        func.key(UUID(int=1)), func.key(Decimal(1)), func.key(date(2026, 1, 1)), func.key(datetime(2026, 1, 1, tzinfo=UTC)),
    ]

    assert len(set(distinct)) == len(distinct)

    deep: Any = []

    for _ in range(40): deep = [deep]

    for bad in (object(), sample, bytearray(b"x"), deep):

        with pytest.raises(Fault) as caught: func.key(bad)

        assert caught.value.reason == "func.key"

async def test_cached_and_single_share_one_flight_per_key () -> None:

    calls: list[int] = []

    @func.cached(ttl=60, size=2)
    async def load ( value: int, scale: int = 1 ) -> int:

        calls.append(value)

        await asyncio.sleep(0.01)

        return value * scale

    assert list(await asyncio.gather(load(2), load(2), load(2, scale=3), load(2))) == [2, 2, 6, 2] and calls == [2, 2]
    assert await load(2) == 2 and calls == [2, 2] and func.name(load) == "test_cached_and_single_share_one_flight_per_key.<locals>.load"

    seen: list[str] = []

    async def labelled ( label: str, value: int ) -> int:

        seen.append(label)

        return value

    memo = func.memo(ttl=60, size=8)
    kept = func.cached(memo=memo, key=lambda _, value: value)(labelled)

    assert await kept("first", 7) == 7 and await kept("other", 7) == 7 and seen == ["first"]
    assert memo.get(7) == 7 and memo.has(7)

    memo.set("x", 1, ttl=0)

    assert memo.get("x", "gone") == "gone" and not memo.has("x") and memo.forget(7) and not memo.has(7)

    failures = 0

    async def flaky ( value: int ) -> int:

        nonlocal failures

        failures += 1

        raise Fault(Code.UNAVAILABLE, reason="down")

    strict = func.memo()

    for _ in range(3):

        with pytest.raises(Fault): await strict.remember("k", lambda: flaky(1))

    assert failures == 3 and strict._locks == {}  # noqa: SLF001

    runs = 0

    async def slow ( value: int ) -> int:

        nonlocal runs

        runs += 1

        await asyncio.sleep(0.02)

        return value

    shared = func.single(slow)
    first  = asyncio.ensure_future(shared(1))

    await asyncio.sleep(0)

    others = [asyncio.ensure_future(shared(1)) for _ in range(3)]

    await asyncio.sleep(0)

    first.cancel()

    assert await asyncio.gather(*others, shared(2)) == [1, 1, 1, 2] and runs == 2
    assert await shared(1) == 1 and runs == 3 and func.pending() == 0

    crashed = func.single(flaky)

    with pytest.raises(Fault): await crashed(1)
    with pytest.raises(Fault): await crashed(1)

    assert failures == 5

async def test_hedge_races_a_late_copy_and_cancels_the_loser () -> None:

    started: list[int] = []
    cancelled: list[int] = []

    async def uneven () -> int:

        index = len(started)

        started.append(index)

        try: await asyncio.sleep(0.5 if index == 0 else 0.01)
        except asyncio.CancelledError:

            cancelled.append(index)

            raise

        return index

    assert await func.hedge(uneven, delay=0.02) == 1 and started == [0, 1] and cancelled == [0]

    async def quick () -> str: return "fast"

    started.clear()

    assert await func.hedge(quick, delay=0.5, copies=3) == "fast"

    tries = 0

    async def failing () -> int:

        nonlocal tries

        tries += 1

        raise Fault(Code.UNAVAILABLE, reason=f"down-{tries}")

    with pytest.raises(Fault) as caught: await func.hedge(failing, delay=0.001, copies=3)

    assert tries == 3 and str(caught.value.reason).startswith("down-")

    async def odd () -> int: raise ValueError("odd")

    with pytest.raises(ValueError, match="odd"): await func.hedge(odd, delay=0.001)
    with pytest.raises(Fault) as bad: await func.hedge(quick, delay=-1)

    assert bad.value.reason == "func.hedge" and func.unless(False, 2, lambda n: n * 10) == 20  # noqa: FBT003
    assert func.unless(True, 2, lambda n: n * 10) == 2  # noqa: FBT003

async def test_batch_coalesces_puts_into_bounded_flushes () -> None:

    seen: list[list[int]] = []

    async def double ( items: list[int] ) -> list[int]:

        seen.append(items)

        await asyncio.sleep(0)

        return [item * 2 for item in items]

    batch = func.batch(double, size=4)

    assert await asyncio.gather(*(batch.put(index) for index in range(10))) == [index * 2 for index in range(10)]
    assert seen == [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]] and batch.pending() == 0

    timed = func.batch(double, size=100, delay=0.02)
    first = asyncio.ensure_future(timed.put(1))

    await asyncio.sleep(0)

    assert timed.pending() == 1 and not first.done()

    await timed.flush()

    assert first.result() == 2 and timed.pending() == 0

    async def failing ( items: list[int] ) -> list[int]: raise Fault(Code.UNAVAILABLE, reason="store")

    async def short ( items: list[int] ) -> list[int]: return items[:-1]

    for flush, reason in ((failing, "store"), (short, "func.batch")):

        results = await asyncio.gather(*(func.batch(flush).put(index) for index in range(2)), return_exceptions=True)

        assert all(isinstance(found, Fault) and found.reason == reason for found in results)

    gone   = func.batch(double, size=8)
    left   = asyncio.ensure_future(gone.put(1))
    stayed = asyncio.ensure_future(gone.put(2))

    await asyncio.sleep(0)

    left.cancel()

    seen.clear()

    assert await stayed == 4

    with pytest.raises(Fault) as bad: func.batch(double, size=0)

    assert bad.value.reason == "func.batch"


async def test_retry_waits_only_for_safe_faults () -> None:

    calls = 0

    async def flaky () -> str:

        nonlocal calls

        calls += 1

        if calls < 3: raise Fault(Code.UNAVAILABLE, reason="peer")

        return "ok"

    assert await func.retry(flaky, tries=3, backoff=0.001, jitter=False) == "ok" and calls == 3

    async def unsafe () -> None: raise Fault(Code.UNAVAILABLE, reason="peer", unknown=True)

    with pytest.raises(Fault): await func.retry(unsafe, tries=3, backoff=0.001)

    calls = 0

    async def counted () -> None:

        nonlocal calls

        calls += 1

        raise Fault(Code.UNAVAILABLE, reason="peer", unknown=True)

    with pytest.raises(Fault): await func.retry(counted, tries=3, backoff=0.001, idempotent=True)

    assert calls == 3

    async def permanent () -> None: raise Fault(Code.NOT_FOUND)

    calls = 0

    with pytest.raises(Fault): await func.retry(permanent, tries=5, backoff=0.001)

async def test_timeout_once_memo_settle_and_pipe () -> None:

    async def slow () -> None: await asyncio.sleep(0.2)

    with pytest.raises(Fault) as caught: await func.timeout(0.01, slow, "slow")

    assert caught.value.code is Code.TIMEOUT and caught.value.reason == "slow"

    hits = 0

    async def load () -> int:

        nonlocal hits

        hits += 1

        return hits

    once = func.once(load)

    assert list(await asyncio.gather(once(), once(), once())) == [1, 1, 1]

    memo = func.memo(ttl=60, size=2)

    assert await memo.remember("a", load) == 2 and await memo.remember("a", load) == 2
    assert await memo.remember("b", load) == 3 and await memo.remember("c", load) == 4 and len(memo) == 2
    assert memo.forget("c") and not memo.forget("zzz") and memo.clear() == 1

    async def fails () -> int: raise Fault(Code.CONFLICT)

    settled = await func.settle([load, fails])

    assert settled[0] == 5 and isinstance(settled[1], Fault)
    assert func.pipe(2, lambda n: n + 1, lambda n: n * 10) == 30

async def test_breaker_opens_after_failures_and_half_opens () -> None:

    breaker = Breaker("peer", threshold=2, cooldown=0.05)

    async def broken () -> None: raise Fault(Code.UNAVAILABLE, reason="down")

    async def fine () -> str: return "fine"

    for _ in range(2):

        with pytest.raises(Fault): await breaker.call(broken)

    assert breaker.state() == "open" and not breaker.allows()

    with pytest.raises(Fault) as blocked: await breaker.call(fine)

    assert blocked.value.reason == "breaker.peer" and blocked.value.retry_after is not None

    await asyncio.sleep(0.06)

    assert breaker.state() == "half" and await breaker.call(fine) == "fine" and breaker.state() == "closed"

    with pytest.raises(Fault): await breaker.call(lambda: asyncio.sleep(0, result=(_ for _ in ()).throw(Fault(Code.NOT_FOUND))))

    assert breaker.describe()["failures"] == 0

    breaker.reset()

    assert func.breaker("x").describe()["state"] == "closed"

def test_picks_the_native_core_when_the_module_exists () -> None:

    picker = Func()

    assert picker.pick("sum", "math", lambda: "native", lambda: "pure") == "native"
    assert picker.pick("sum", "nothing_here", lambda: "native", lambda: "pure") == "native"
    assert picker.pick("other", "no_such_module_x", lambda: "native", lambda: "pure") == "pure"
    assert picker.names() == ("other", "sum") and picker.describe() == { "other": "pure", "sum": "native" }
    assert picker.has("math") and not picker.has("no_such_module_x")

def test_modes_force_pure_or_require_native ( monkeypatch: pytest.MonkeyPatch ) -> None:

    picker = Func()

    picker.setup("pure")

    assert picker.mode() == "pure" and picker.pick("x", "math", lambda: 1, lambda: 2) == 2

    picker.setup("native")

    with pytest.raises(Fault) as caught: picker.pick("y", "no_such_module_x", lambda: 1, lambda: 2)

    assert caught.value.reason == "func.native"

    with pytest.raises(Fault) as bad: picker.setup("fastest")

    assert bad.value.reason == "func.mode"
    assert picker.clear() == 0 and picker.names() == ()

    monkeypatch.setenv("ENGINE_NATIVE", "PURE ")

    picker.setup()

    assert picker.mode() == "pure" and picker.pick("z", "math", lambda: 1, lambda: 2) == 2

async def test_combinators_measure_poll_and_fall_back () -> None:

    assert func.compose(lambda n: n + 1, lambda n: n * 2)(3) == 8 and func.tap(5, lambda n: n) == 5
    assert func.when(True, 2, lambda n: n * 10) == 20 and func.when(False, 2, lambda n: n * 10) == 2  # noqa: FBT003

    async def fails () -> int: raise Fault(Code.CONFLICT, reason="taken")

    async def works () -> int: return 7

    assert await func.attempt(fails, 0) == 0 and await func.attempt(works) == 7
    assert await func.fallback(fails, works) == 7

    async def gone () -> int: raise Fault(Code.NOT_FOUND, reason="gone")

    with pytest.raises(Fault) as last: await func.fallback(fails, gone)

    assert last.value.reason == "gone"

    with pytest.raises(Fault) as only: await func.fallback(gone, fails)

    assert only.value.reason == "taken"

    with pytest.raises(Fault): await func.fallback()

    result, ms = await func.measure(works)

    assert result == 7 and ms >= 0

    ticks = 0

    def ready () -> bool:

        nonlocal ticks

        ticks += 1

        return ticks >= 3

    await func.poll(ready, every=0.001, timeout=1)

    assert ticks == 3

    async def never () -> bool: return False

    with pytest.raises(Fault) as timed: await func.poll(never, every=0.001, timeout=0.01, reason="waiting")

    assert timed.value.code is Code.TIMEOUT and timed.value.reason == "waiting"

async def test_limiter_debounce_and_throttle () -> None:

    limiter = Limiter(rate=1000, burst=2)

    assert limiter.allow() and limiter.allow() and not limiter.allow() and limiter.wait() > 0 and limiter.describe()["burst"] == 2

    await limiter.acquire()

    assert func.limiter(10, 1).allow()

    with pytest.raises(Fault): Limiter(0, 1)
    with pytest.raises(Fault): Limiter(1, 0)

    seen: list[int] = []

    @func.debounce(0.02)
    async def save ( n: int ) -> None: seen.append(n)

    for n in range(5): await save(n)

    assert seen == []

    await asyncio.sleep(0.05)

    assert seen == [4] and func.pending() == 0

    @func.throttle(0.05)
    async def ping ( n: int ) -> int: return n

    assert await ping(1) == 1 and await ping(2) is None

    await asyncio.sleep(0.06)

    assert await ping(3) == 3

async def test_flow_verbs_refuse_degenerate_parameters () -> None:

    async def fine () -> int: return 1

    async def ready () -> bool: return True

    async def echo ( items: list[int] ) -> list[int]: return items

    async def down () -> None: raise Fault(Code.UNAVAILABLE, reason="peer")

    def reason ( work: Callable[[], object] ) -> str | None:

        with pytest.raises(Fault) as caught: work()

        return caught.value.reason

    async def refused ( work: Awaitable[object] ) -> str | None:

        with pytest.raises(Fault) as caught: await work

        return caught.value.reason

    nan, inf = math.nan, math.inf

    assert await refused(func.retry(fine, tries=0)) == "func.retry"
    assert await refused(func.retry(fine, backoff=nan)) == "func.retry"
    assert await refused(func.retry(fine, backoff=-1)) == "func.retry"
    assert await refused(func.retry(fine, ceiling=inf)) == "func.retry"
    assert await refused(func.retry(down, tries=1200, backoff=0.0, jitter=False)) == "peer"
    assert await refused(func.timeout(nan, fine)) == "func.timeout"
    assert await refused(func.timeout(inf, fine)) == "func.timeout"
    assert await refused(func.hedge(fine, nan)) == "func.hedge"
    assert await refused(func.hedge(fine, inf)) == "func.hedge"
    assert await refused(func.hedge(fine, 0.0, 0)) == "func.hedge"
    assert await refused(func.poll(ready, every=nan)) == "func.poll"
    assert await refused(func.poll(ready, every=-1)) == "func.poll"
    assert await refused(func.poll(ready, timeout=nan)) == "func.poll"
    assert await refused(func.poll(ready, timeout=inf)) == "func.poll"
    assert await func.timeout(-1, fine) == 1

    await func.poll(ready, every=0, timeout=0)

    assert reason(partial(func.memo, nan)) == "func.memo" and reason(partial(func.memo, -1)) == "func.memo"
    assert reason(partial(func.memo, 60, 0)) == "func.memo" and len(func.memo(inf, 1)) == 0
    assert reason(partial(func.limiter, nan, 1)) == "func.limiter" and reason(partial(func.limiter, inf, 1)) == "func.limiter"
    assert reason(partial(func.limiter, 1, cast("int", inf))) == "func.limiter" and reason(partial(func.limiter, -1, 1)) == "func.limiter"
    assert reason(partial(func.breaker, "peer", 0)) == "func.breaker" and reason(partial(func.breaker, "peer", 1, nan)) == "func.breaker"
    assert reason(partial(func.breaker, "peer", 1, inf)) == "func.breaker" and reason(partial(func.breaker, "peer", 1, -1)) == "func.breaker"
    assert reason(partial(func.batch, echo, 1, nan)) == "func.batch" and reason(partial(func.batch, echo, 1, inf)) == "func.batch"
    assert reason(partial(func.debounce, nan)) == "func.debounce" and reason(partial(func.debounce, -1)) == "func.debounce"
    assert reason(partial(func.throttle, nan)) == "func.throttle" and reason(partial(func.throttle, inf)) == "func.throttle"

    limiter = func.limiter(1000, 2)

    assert reason(partial(limiter.allow, 3)) == "func.limiter" and reason(partial(limiter.allow, -1)) == "func.limiter"
    assert reason(partial(limiter.wait, 3)) == "func.limiter" and await refused(limiter.acquire(3)) == "func.limiter"
    assert limiter.allow(0) and limiter.allow(2) and not limiter.allow(1) and limiter.describe()["tokens"] < 1

    assert reason(partial(func.key, Decimal("sNaN"))) == "func.key"
    assert reason(partial(func.key, a=Decimal("sNaN"))) == "func.key"
    assert reason(partial(func.resolve, cast("str", 5))) == "func.resolve"
    assert reason(partial(func.resolve, f"{'a' * 300}:b")) == "func.resolve"
    assert func.resolve("engine.func:func", ["engine"]) is func

    def crooked ( value: int ) -> None: del value

    crooked.__annotations__ = { "value": "1 +" }

    assert reason(partial(func.hints, crooked)) == "func.hints" and reason(partial(func.info, crooked)) == "func.hints"

async def test_retry_honors_the_asked_wait_and_the_ceiling ( monkeypatch: pytest.MonkeyPatch ) -> None:

    waits: list[float] = []
    calls = 0

    async def nap ( seconds: float ) -> None: waits.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", nap)

    async def asking () -> str:

        nonlocal calls

        calls += 1

        if calls < 4: raise Fault(Code.UNAVAILABLE, reason="peer", retry_after=0.5)

        return "ok"

    assert await func.retry(asking, tries=5, backoff=0.1, ceiling=2.0) == "ok" and waits == [0.5, 0.5, 0.5]

    calls = 0

    waits.clear()

    assert await func.retry(asking, tries=5, backoff=1.0, ceiling=1.5, jitter=False) == "ok" and waits == [1.0, 1.5, 1.5]

    calls = 0

    waits.clear()

    with pytest.raises(Fault) as early: await func.retry(asking, tries=5, backoff=0.1, ceiling=0.4)

    assert early.value.reason == "peer" and calls == 1 and waits == []

    async def down () -> None: raise Fault(Code.UNAVAILABLE, reason="peer")

    waits.clear()

    with pytest.raises(Fault): await func.retry(down, tries=40, backoff=0.5, ceiling=8.0, jitter=False)

    assert waits[:6] == [0.5, 1.0, 2.0, 4.0, 8.0, 8.0] and len(waits) == 39 and max(waits) == 8.0

    waits.clear()

    with pytest.raises(Fault): await func.retry(down, tries=30, backoff=0.5, ceiling=8.0)

    assert all(0.25 <= wait <= 8.0 for wait in waits) and len(set(waits)) > 20

async def test_a_half_open_breaker_admits_one_probe () -> None:

    breaker = func.breaker("peer", threshold=1, cooldown=0.0)
    gate    = asyncio.Event()
    entered = 0

    async def down () -> None: raise Fault(Code.UNAVAILABLE, reason="peer")

    async def probe () -> str:

        nonlocal entered

        entered += 1

        await gate.wait()

        return "ok"

    with pytest.raises(Fault): await breaker.call(down)

    assert breaker.state() == "half"

    first = asyncio.ensure_future(breaker.call(probe))

    await asyncio.sleep(0)

    with pytest.raises(Fault) as shut: await breaker.call(probe)

    assert shut.value.reason == "breaker.peer" and shut.value.code is Code.UNAVAILABLE and entered == 1

    gate.set()

    assert await first == "ok" and breaker.state() == "closed" and await breaker.call(probe) == "ok" and entered == 2

    with pytest.raises(Fault): await breaker.call(down)

    stuck = asyncio.ensure_future(breaker.call(partial(asyncio.sleep, 30)))

    await asyncio.sleep(0)

    stuck.cancel()

    with pytest.raises(asyncio.CancelledError): await stuck

    assert breaker.state() == "half" and await breaker.call(probe) == "ok" and breaker.state() == "closed"

async def test_drain_waits_for_started_work_and_a_lost_failure_is_logged () -> None:

    seen: list[int] = []

    @func.debounce(0.0)
    async def save ( n: int ) -> None:

        await asyncio.sleep(0.01)

        if n < 0: raise Fault(Code.CONFLICT, reason="save")

        seen.append(n)

    await save(1)
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert func.pending() == 1 and await func.drain() == 1 and seen == [1] and func.pending() == 0

    with log.capture() as events:

        await save(-1)
        await asyncio.sleep(0)
        await asyncio.sleep(0)

        assert await func.drain() == 1 and await func.drain() == 0

        await asyncio.sleep(0)

    lost = [event for event in events if event["event"] == "func.task"]

    assert len(lost) == 1 and lost[0]["kind"] == "Fault" and seen == [1]

def test_metadata_is_remembered_without_pinning_the_callable () -> None:

    def local ( value: int, scale: float = 1.0 ) -> float: return value * scale

    assert func.signature(local) is func.signature(local) and func.params(local) == ("value", "scale")

    hints = func.hints(local)

    hints["value"] = str

    assert func.hints(local) == { "value": int, "scale": float, "return": float } and func.returns(local) is float

    gone = weakref.ref(local)

    del local

    gc.collect()

    assert gone() is None
    assert func.signature(partial(sample, 1)) is not func.signature(partial(sample, 1))
    assert func.key(1, "a", b"c", None) == (1, "a", b"c", None)
    truth = (True,)

    assert len({ func.key(1), func.key(*truth), func.key(1.0), func.key("1"), func.key(b"1"), func.key((1,)), func.key([1]) }) == 7
    assert func.key(1, a=2) != func.key(1, 2) and func.key() == () and func.key(a={ "x": 1, "y": 2 }) == func.key(a={ "y": 2, "x": 1 })
