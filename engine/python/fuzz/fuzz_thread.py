from engine.error import Code, Fault
from engine.log import log
from engine.thread import Gate, Outcome, Tasks, thread
from engine.thread.arch import CEILING, MODES, RETRIES, WORKERS
from collections.abc import Awaitable, Callable, Coroutine
from contextvars import ContextVar
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, cast, override
import asyncio, gc, inspect, math, operator, sys, threading

type Act   = tuple[str, int]
type Step  = tuple[str, Any, int]
type Knobs = tuple[int, int | None, bool, bool, float | None]
type Lot   = tuple[str, Any]
type Order = dict[str, Any]

EXAMPLES  = 400
CROSSINGS = 30
TURNS     = 8
FLUSH     = 16.0
VERBS     = (
    "acquire", "acquire", "acquire", "acquire", "take", "release", "release", "cancel", "advance", "advance", "snatch",
)
YARD      = ("quick", "sick", "held", "held", "deaf", "unlock", "close", "close", "drain", "junk")
MARK: ContextVar[str] = ContextVar("mark", default="none")
STRAYS: list[str] = []

class Strange ( Exception ):

    pass

class Clock ( asyncio.SelectorEventLoop ):

    def __init__ ( self ) -> None:

        super().__init__()

        self.now = 0.0

    @override
    def time ( self ) -> float:

        return self.now

class Door:

    def __init__ ( self, limit: int ) -> None:

        self.gate  = Gate(limit)
        self.limit = limit
        self.free  = limit
        self.held  = 0
        self.queue: list[tuple[asyncio.Task[bool], float]] = []
        self.won: list[asyncio.Task[bool]] = []

    async def acquire ( self, wait: Any ) -> None:

        fine = (type(wait) is float or type(wait) is int) and wait >= 0
        room = self.free > 0
        task = asyncio.ensure_future(entered(self.gate, wait))

        if fine and not room and wait > 0: self.queue.append((task, clock.now + wait))

        await settle()

        if not fine: assert reason(task.exception()) == "thread.seconds"
        elif room: self.granted(task)
        elif wait == 0: assert isinstance(task.exception(), TimeoutError)

    def granted ( self, task: asyncio.Task[bool] ) -> None:

        assert task.result()

        self.free -= 1
        self.held += 1

    def take ( self ) -> None:

        room = self.free > 0

        assert self.gate.take() is room

        if room: self.free, self.held = self.free - 1, self.held + 1

    async def release ( self ) -> None:

        if self.held:

            self.held -= 1

            self.passed()

        self.gate.release()

        await settle()

    def passed ( self ) -> None:

        if not self.queue:

            self.free += 1

            return

        task, _ = self.queue.pop(0)

        self.held += 1

        self.won.append(task)

    async def cancel ( self, index: int ) -> None:

        if not self.queue: return

        task, _ = self.queue.pop(index % len(self.queue))

        task.cancel()

        await settle()

        assert task.cancelled()

    async def advance ( self, span: float ) -> None:

        clock.now += span

        await settle()

        late       = [task for task, deadline in self.queue if deadline <= clock.now]
        self.queue = [(task, deadline) for task, deadline in self.queue if deadline > clock.now]

        assert all(isinstance(task.exception(), TimeoutError) for task in late)

    async def snatch ( self ) -> None:

        if not self.held or not self.queue: return

        task, _ = self.queue.pop(0)

        self.gate.release()
        task.cancel()

        self.held -= 1

        self.passed()

        await settle()

        assert task.cancelled()

    def check ( self ) -> None:

        gate = self.gate

        assert gate.free() == self.free
        assert gate.waiting() == len(self.queue)
        assert gate.locked() is (self.free == 0)
        assert gate.describe() == { "limit": self.limit, "free": self.free, "waiting": len(self.queue) }
        assert self.free + self.held == self.limit
        assert gate.limit() == self.limit
        assert all(task.done() and task.result() for task in self.won)
        assert not any(task.done() for task, _ in self.queue)

    async def close ( self ) -> None:

        for task, _ in self.queue: task.cancel()

        self.queue = []

        await settle()

        for _ in range(self.held): self.gate.release()

        self.free, self.held = self.limit, 0

        self.check()

        clock.now += FLUSH

        await settle()

        self.check()

class Trial:

    def __init__ ( self, plans: list[Act], sour: str ) -> None:

        self.plans  = plans
        self.sour   = sour
        self.seen   = [0] * len(plans)
        self.flying = 0
        self.peak   = 0
        self.lock   = threading.Lock()
        self.good: list[tuple[int, Any]] = []
        self.lost: list[int] = []

    def work ( self, item: int ) -> int:

        with self.lock: turn = self.entered(item)

        try: return self.made(item, turn)
        finally:

            with self.lock: self.flying -= 1

    async def slow ( self, item: int ) -> int:

        turn = self.entered(item)

        try:

            await asyncio.sleep(0)

            return self.made(item, turn)

        finally: self.flying -= 1

    def entered ( self, item: int ) -> int:

        self.seen[item] += 1
        self.flying     += 1
        self.peak        = max(self.peak, self.flying)

        return self.seen[item]

    def made ( self, item: int, turn: int ) -> int:

        kind, fails = self.plans[item]

        if turn > fails: return item * 3
        if kind == "fault": raise Fault(Code.CONFLICT, reason="fuzz.taken")

        raise ValueError(item)

    def soured ( self, retries: int ) -> bool:

        if self.sour == "result": return any(fails <= retries for _, fails in self.plans)
        if self.sour == "error": return any(fails > retries for _, fails in self.plans)

        return False

    def on_result ( self, index: int, value: Any ) -> None:

        if self.sour == "result": raise Strange

        self.good.append((index, value))

    async def on_error ( self, index: int, fault: Fault ) -> None:

        if self.sour == "error": raise Strange

        assert isinstance(fault, Fault)

        self.lost.append(index)

    def stopped ( self, outcome: Outcome, retries: int ) -> bool:

        kind, fails = self.plans[outcome.index]
        error       = outcome.error

        if error is not None and error.reason == "thread.stopped":

            assert error.code is Code.CONFLICT
            assert self.seen[outcome.index] == 0
            assert outcome.value is None

            return True

        assert self.seen[outcome.index] == min(fails, retries) + 1
        assert outcome.ms >= 0

        if fails <= retries: assert (error, outcome.value, outcome.ok()) == (None, outcome.index * 3, True)
        elif kind == "fault": assert (reason(error), unknown(error)) == ("fuzz.taken", False)
        else: assert (reason(error), cause(error)) == ("thread.failed", ValueError)

        return False

class Crowd:

    def __init__ ( self, acts: list[Act] ) -> None:

        self.acts   = acts
        self.flying = 0
        self.peak   = 0
        self.bad    = [index for index, (kind, _) in enumerate(acts) if kind in { "raise", "junk" }]
        self.fast   = [index for index, (kind, _) in enumerate(acts) if kind in { "ok", "raise" }]

    async def act ( self, index: int ) -> int:

        kind, yields = self.acts[index]

        self.flying += 1
        self.peak    = max(self.peak, self.flying)

        try:

            for _ in range(yields): await asyncio.sleep(0)

            if kind == "stuck": await asyncio.Event().wait()
            if kind == "raise": raise Strange(index)

            return index * 2

        finally: self.flying -= 1

    def step ( self, index: int ) -> Any:

        return index if self.acts[index][0] == "junk" else self.act(index)

    def works ( self ) -> list[Any]:

        return [self.step(index) for index in range(len(self.acts))]

    def junk ( self ) -> bool:

        return any(kind == "junk" for kind, _ in self.acts)

    def barred ( self, found: object ) -> None:

        assert reason(found) == "thread.work"
        assert self.peak == 0

    def done ( self, found: object, bound: int ) -> None:

        assert found == [index * 2 for index in range(len(self.acts))]
        assert self.peak <= min(bound, len(self.acts))

    def spoiled ( self, found: object, single: bool ) -> None:

        if isinstance(found, Fault):

            assert found.reason == "thread.work"
            assert self.junk()
            assert not single or self.acts[self.bad[0]][0] == "junk"

            return

        assert isinstance(found, Strange)
        assert self.acts[found.args[0]][0] == "raise"
        assert not single or found.args[0] == self.bad[0]

    def won ( self, found: object ) -> None:

        index = found.args[0] if isinstance(found, Strange) else cast("int", found) // 2
        kind  = "raise" if isinstance(found, Strange) else "ok"
        first = min(self.acts[at][1] for at in self.fast)

        assert index in self.fast
        assert self.acts[index][0] == kind
        assert found in { index * 2, found }
        assert self.acts[index][1] <= first + 2
        assert (len(self.fast) > 1 or index == self.fast[0])

    def closed ( self, works: list[Any] ) -> bool:

        states = [inspect.getcoroutinestate(work) for work in works if inspect.iscoroutine(work)]

        return self.flying == 0 and all(state == inspect.CORO_CLOSED for state in states)

class Yard:

    def __init__ ( self ) -> None:

        self.tasks  = Tasks("yard")
        self.door   = asyncio.Event()
        self.sick   = 0
        self.held: list[asyncio.Task[None]] = []
        self.deaf: list[asyncio.Task[None]] = []
        self.struck: list[asyncio.Task[None]] = []
        self.stuck: list[int] = []

    async def quick ( self, value: int ) -> int:

        await asyncio.sleep(0)

        return value

    async def broken ( self ) -> None:

        await asyncio.sleep(0)

        raise Strange

    async def waits ( self, door: asyncio.Event ) -> None:

        await door.wait()

    async def stubborn ( self, door: asyncio.Event ) -> None:

        try: await door.wait()
        except asyncio.CancelledError: await door.wait()

    async def spawn ( self, verb: str, value: int ) -> None:

        if verb == "held": self.held.append(self.tasks.spawn(self.waits(self.door)))
        elif verb == "deaf": self.deaf.append(self.tasks.spawn(self.stubborn(self.door)))
        elif verb == "sick": self.sick += 1

        made = self.tasks.spawn(self.quick(value), "quick") if verb == "quick" else None
        lost = self.tasks.spawn(self.broken()) if verb == "sick" else None

        await settle()

        assert made is None or (made.result() == value and made.get_name() == "quick")
        assert lost is None or isinstance(lost.exception(), Strange)

    async def unlock ( self ) -> None:

        self.door.set()

        await settle()

        assert all(task.done() and not task.cancelled() for task in (*self.held, *self.deaf, *self.struck))

        self.door = asyncio.Event()
        self.held, self.deaf, self.struck = [], [], []

    async def close ( self ) -> None:

        assert await self.tasks.close(0) == self.live()

        await settle()

        assert all(task.cancelled() for task in (*self.held, *self.struck))
        assert not any(task.done() for task in self.deaf)

        if self.deaf: self.stuck.append(len(self.deaf))

        self.held, self.deaf, self.struck = [], [], self.deaf

    async def drain ( self, count: int ) -> None:

        if self.live():

            assert await self.tasks.drain(0) == 0

            return

        made = [self.tasks.spawn(self.quick(value)) for value in range(count)]
        lost = self.tasks.spawn(self.broken())

        self.sick += 1

        assert self.tasks.count() == count + 1
        assert await self.tasks.drain(5.0) == count + 1
        assert self.tasks.count() == 0
        assert [task.result() for task in made] == list(range(count))
        assert isinstance(lost.exception(), Strange)

    def junk ( self ) -> None:

        work = self.quick(1)

        assert refused(partial(self.tasks.spawn, cast("Any", 5))) == "thread.work"
        assert refused(partial(self.tasks.spawn, work, cast("Any", 5))) == "thread.name"
        assert inspect.getcoroutinestate(work) == inspect.CORO_CLOSED

    def live ( self ) -> int:

        return len(self.held) + len(self.deaf) + len(self.struck)

async def settle () -> None:

    for _ in range(TURNS): await asyncio.sleep(0)

async def entered ( gate: Gate, wait: Any ) -> bool:

    await gate.acquire(wait)

    return True

async def echo ( item: int ) -> int: return item

async def cast_lot ( work: Awaitable[Any] ) -> Lot:

    try: return ("made", await work)
    except (ValueError, ZeroDivisionError) as error: return ("failed", type(error).__name__)

def lot ( work: Callable[[], Any] ) -> Lot:

    try: return ("made", work())
    except (ValueError, ZeroDivisionError) as error: return ("failed", type(error).__name__)

def stray ( _: asyncio.AbstractEventLoop, context: dict[str, Any] ) -> None:

    STRAYS.append(context["message"])

def run [T] ( work: Coroutine[Any, Any, T] ) -> T:

    return loop.run_until_complete(work)

def tried ( work: Coroutine[Any, Any, Any] ) -> Any:

    try: return run(work)
    except (Fault, Strange) as error: return error

def refused ( work: Callable[[], object] ) -> str | None:

    try: work()
    except Fault as fault: return fault.reason

    return None

def attempt ( work: Callable[[], Any] ) -> Any:

    try: return work()
    except Fault as fault: return fault

def reason ( found: object ) -> str | None:

    return found.reason if isinstance(found, Fault) else None

def unknown ( found: object ) -> bool | None:

    return found.unknown if isinstance(found, Fault) else None

def cause ( found: object ) -> type | None:

    return type(found.__cause__) if isinstance(found, Fault) else None

def whole ( value: object, low: int, high: int ) -> bool:

    return type(value) is int and low <= value <= high

def span ( value: object ) -> bool:

    return (type(value) is float or type(value) is int) and value > 0

CHECKS: tuple[tuple[str, Callable[[Order], bool]], ...] = (
    ("thread.mode", lambda order: order["mode"] in MODES),
    ("thread.work", lambda order: callable(order["handler"]) and (order["mode"] == "async" or order["handler"] is not echo)),
    ("thread.hook", lambda order: all(hook is None or callable(hook) for hook in (order["on_result"], order["on_error"]))),
    ("thread.seconds", lambda order: order["timeout"] is None or span(order["timeout"])),
    ("thread.retries", lambda order: whole(order["retries"], 0, RETRIES)),
    ("thread.workers", lambda order: order["workers"] is None or whole(order["workers"], 1, CEILING)),
    ("thread.items", lambda order: isinstance(order["items"], list | tuple | range)),
    ("thread.address", lambda order: order["mode"] != "ray" or not order["items"] or order["address"] in { None, "ray://head:1" }),
    ("thread.ray", lambda order: order["mode"] != "ray" or not order["items"]),
)
WAITS: st.SearchStrategy[Any] = st.one_of(
    st.sampled_from([0, 0.5, 1, 1.5, 2, 3.0, 8, math.inf]), st.sampled_from([0.5, 1, 2, 4, math.inf]),
    st.sampled_from([-1, -0.5, -0.0, math.nan, -math.inf, True, None, "1", 1j]),
)
STEPS     = st.lists(st.tuples(st.sampled_from(VERBS), WAITS, st.integers(0, 7)), max_size=24)
BOUNDS: st.SearchStrategy[Any] = st.one_of(st.integers(1, 3), st.integers(1, 3), st.sampled_from([0, -1, True, 1.0, None, "1"]))
PLANS     = st.lists(st.tuples(st.sampled_from(["value", "value", "fault"]), st.sampled_from([0, 0, 0, 1, 2, 9])), max_size=8)
KNOBS     = st.tuples(
    st.integers(0, 3), st.sampled_from([None, 1, 2, 3, 64]), st.booleans(), st.booleans(), st.sampled_from([None, 30, math.inf]),
)
ACTS      = st.lists(st.tuples(st.sampled_from(["ok", "ok", "ok", "ok", "raise", "junk"]), st.integers(0, 3)), max_size=7)
RACERS    = st.lists(st.tuples(st.sampled_from(["ok", "ok", "raise", "stuck", "stuck", "junk"]), st.integers(0, 3)), max_size=6)
LIMITS: st.SearchStrategy[Any] = st.one_of(
    st.integers(0, 9), st.integers(1, 3), st.sampled_from([-1, 1.0, True, None, "2", math.inf, CEILING, CEILING + 1, 10 ** 30]),
)
SIZES: st.SearchStrategy[Any] = st.one_of(
    st.integers(1, 9), st.sampled_from([0, -1, 1.5, True, None, "2", sys.maxsize, sys.maxsize + 1, 10 ** 30]),
)
ORDERS    = st.fixed_dictionaries({
    "items"     : st.one_of(st.sampled_from([[], [1, 2], (3,), range(2), [4], [2, 1], [7, 7]]), st.sampled_from([5, None])),
    "handler"   : st.one_of(st.sampled_from([operator.neg, operator.neg, operator.neg, echo, echo]), st.sampled_from([5, None, "neg"])),
    "mode"      : st.one_of(st.sampled_from(MODES), st.sampled_from(MODES), st.sampled_from(["fiber", "ASYNC", "", 7, None, ("async",)])),
    "workers"   : st.one_of(st.sampled_from([None, 1, 2, CEILING, None, 1]), st.sampled_from([0, CEILING + 1, True, 2.0, "4"])),
    "timeout"   : st.one_of(st.sampled_from([None, 30, 30.5, math.inf, None, None]), st.sampled_from([0, -1, math.nan, "1", True])),
    "retries"   : st.one_of(st.sampled_from([0, 1, RETRIES, 0, 0, 2]), st.sampled_from([-1, RETRIES + 1, 1.5, True, None])),
    "ordered"   : st.booleans(),
    "on_result" : st.one_of(st.sampled_from([None, operator.is_, None, None, None, None]), st.sampled_from([5, "x"])),
    "on_error"  : st.one_of(st.sampled_from([None, operator.is_, None, None, None, None]), st.sampled_from([5, "x"])),
    "address"   : st.sampled_from([None, None, "ray://head:1", "", 5]),
    "fail_fast" : st.booleans(),
})
WORDS     = st.one_of(st.integers(-99, 99).map(str), st.text(alphabet="0123456789 -+_x.é\ud800", max_size=5))

@settings(max_examples=EXAMPLES * 2, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(BOUNDS, STEPS)
def gated ( limit: Any, steps: list[Step] ) -> None:

    async def driven () -> None:

        door = Door(limit)

        for verb, wait, index in steps:

            if verb == "acquire": await door.acquire(wait)
            elif verb == "take": door.take()
            elif verb == "release": await door.release()
            elif verb == "cancel": await door.cancel(index)
            elif verb == "advance": await door.advance((index + 1) / 2)
            else: await door.snatch()

            door.check()

        await door.close()

    if not whole(limit, 1, 3):

        assert refused(partial(Gate, limit)) == "thread.limit"

        return

    clock.now = 0.0

    clock.run_until_complete(driven())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PLANS, st.sampled_from(["async", "slow", "thread"]), KNOBS, st.sampled_from(["", "", "", "result", "error"]))
def ran ( plans: list[Act], lane: str, knobs: Knobs, sour: str ) -> None:

    retries, workers, ordered, fail_fast, wait = knobs
    mode    = "thread" if lane == "thread" else "async"
    trial   = Trial(plans, "" if fail_fast else sour)
    handler = trial.slow if lane == "slow" else trial.work
    count   = len(plans)
    bound   = min(workers or WORKERS, WORKERS) if mode == "thread" else workers or WORKERS
    found   = tried(thread.run(
        range(count), handler, cast("Any", mode), workers, wait, retries, ordered, trial.on_result, trial.on_error,
        fail_fast=fail_fast,
    ))

    if trial.soured(retries):

        assert isinstance(found, Strange)

        return

    stopped = [outcome.index for outcome in found.outcomes if trial.stopped(outcome, retries)]
    failing = [index for index, (_, fails) in enumerate(plans) if fails > retries]
    indexes = [outcome.index for outcome in found.outcomes]
    faulted = [index for index in failing if index not in stopped]

    assert found.mode == mode
    assert found.workers == bound
    assert sorted(indexes) == list(range(count))
    assert (not ordered or indexes == list(range(count)))
    assert trial.flying == 0
    assert trial.peak <= min(bound, count)
    assert (fail_fast and bool(faulted)) or not stopped
    assert not (fail_fast and failing and min(bound, count) == 1) or stopped == list(range(failing[0] + 1, count))
    assert found.ok() is not (faulted or stopped)
    assert len(found.errors()) == len(faulted) + len(stopped)
    assert found.dump() == { "mode": mode, "workers": bound, "ms": found.ms, "done": len(found.results()), "failed": len(found.errors()) }
    assert sorted(trial.good) == [(index, index * 3) for index in range(count) if index not in failing and index not in stopped]
    assert sorted(trial.lost) == faulted
    assert len(found.results()) == count - len(found.errors())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ORDERS)
def judged ( order: Order ) -> None:

    wanted = next((name for name, fits in CHECKS if not fits(order)), None)
    found  = tried(thread.run(**order))

    if wanted is not None:

        assert isinstance(found, Fault)
        assert found.reason == wanted
        assert found.code is Code.INTERNAL

        return

    sign = 1 if order["handler"] is echo else -1

    assert found.ok()
    assert found.results() == [item * sign for item in order["items"]]
    assert found.mode == order["mode"]

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ACTS, LIMITS)
def gathered ( acts: list[Act], limit: Any ) -> None:

    crowd = Crowd(acts)
    works = crowd.works()
    found = tried(thread.gather(*works, limit=limit))
    count = len(acts)

    if type(limit) is not int or limit < 0: assert reason(found) == "thread.limit"
    elif crowd.junk(): crowd.barred(found)
    elif crowd.bad: crowd.spoiled(found, limit == 1)
    else: crowd.done(found, limit or count)

    assert crowd.closed(works)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ACTS, LIMITS, st.sampled_from(["act", "act", "act", "act", "plain", "junk"]), st.sampled_from([0, 0, 0, 0, 5, None]))
def mapped ( acts: list[Act], limit: Any, shape: str, stray: Any ) -> None:

    crowd = Crowd(acts)
    count = len(acts)
    work: Any = { "act": crowd.step, "plain": str, "junk": 5 }[shape]
    found = tried(thread.map(range(count) if stray == 0 else stray, work, limit))

    if not whole(limit, 1, CEILING): assert reason(found) == "thread.limit"
    elif shape == "junk": assert reason(found) == "thread.work"
    elif stray != 0: assert reason(found) == "thread.items"
    elif shape == "plain": assert found == [] if not count else reason(found) == "thread.work"
    elif crowd.bad: crowd.spoiled(found, limit == 1)
    else: crowd.done(found, limit)

    assert crowd.flying == 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(RACERS)
def raced ( acts: list[Act] ) -> None:

    crowd = Crowd(acts if not acts or any(kind != "stuck" for kind, _ in acts) else [*acts, ("ok", 1)])
    works = crowd.works()
    found = tried(thread.race(*works))

    if not acts: assert reason(found) == "thread.race"
    elif crowd.junk(): crowd.barred(found)
    else: crowd.won(found)

    assert crowd.closed(works)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.integers(0, 9), max_size=30), SIZES, st.sampled_from(["list", "list", "tuple", "lazy", "stray"]))
def chunked ( items: list[int], size: Any, shape: str ) -> None:

    source: Any = { "list": items, "tuple": tuple(items), "lazy": iter(items), "stray": 5 }[shape]

    fine = whole(size, 1, sys.maxsize)
    made = attempt(partial(thread.chunks, source, size))

    if shape == "stray" or not fine:

        assert reason(made) == ("thread.items" if fine else "thread.chunk")
        assert made.code is Code.INTERNAL

        return

    assert [item for chunk in made for item in chunk] == items
    assert all(len(chunk) == size for chunk in made[:-1])
    assert all(0 < len(chunk) <= size for chunk in made[-1:])
    assert len(made) == math.ceil(len(items) / size)
    assert all(type(chunk) is list for chunk in made)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.tuples(st.sampled_from(YARD), st.integers(0, 5)), max_size=14))
def tracked ( steps: list[tuple[str, int]] ) -> None:

    async def driven () -> list[int]:

        yard = Yard()

        for verb, value in steps:

            if verb == "unlock": await yard.unlock()
            elif verb == "close": await yard.close()
            elif verb == "drain": await yard.drain(value)
            elif verb == "junk": yard.junk()
            else: await yard.spawn(verb, value)

            assert yard.tasks.count() == yard.live()

        await yard.unlock()

        assert await yard.tasks.close(0) == 0
        assert yard.tasks.count() == 0

        return [yard.sick, *yard.stuck]

    with log.capture() as events: sick, *stuck = run(driven())

    assert [event["count"] for event in events if event["event"] == "task.stuck"] == stuck
    assert sum(1 for event in events if event["event"] == "task.failed") == sick

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(alphabet="0123456789abcdefxyz -+_", max_size=6), st.sampled_from([2, 8, 10, 16, 36]), st.integers(-3, 3))
def offloaded ( word: str, base: int, number: int ) -> None:

    async def driven () -> None:

        token = MARK.set(word)

        try:

            assert await thread.offload(MARK.get) == word
            assert await cast_lot(thread.offload(int, word, base=base)) == lot(partial(int, word, base=base))
            assert await cast_lot(thread.offload(divmod, 7, number)) == lot(partial(divmod, 7, number))

        finally: MARK.reset(token)

    run(driven())

@settings(max_examples=CROSSINGS, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(WORDS, max_size=5), st.sampled_from(["process", "interpreter"]), st.integers(-3, 3))
def crossed ( words: list[str], mode: str, number: int ) -> None:

    made = run(thread.run(words, int, cast("Any", mode), 2))

    assert [outcome.index for outcome in made.outcomes] == list(range(len(words)))

    for outcome, word in zip(made.outcomes, words, strict=True):

        fate, value = lot(partial(int, word))

        if fate == "made": assert (outcome.error, outcome.value) == (None, value)
        else: assert (reason(outcome.error), unknown(outcome.error)) == ("thread.failed", True)

    found = tried(thread.compute(divmod, 7, number, mode=cast("Any", mode)))

    assert found == divmod(7, number) if number else reason(found) == "thread.failed"

if __name__ == "__main__":

    loop  = asyncio.new_event_loop()
    clock = Clock()

    log.setup("debug", "json", Path("/dev/null"))
    loop.set_exception_handler(stray)
    clock.set_exception_handler(stray)

    gated()
    ran()
    judged()
    gathered()
    mapped()
    raced()
    chunked()
    tracked()
    offloaded()
    crossed()

    run(thread.close())
    gc.collect()

    assert STRAYS == []

    loop.close()
    clock.close()
    log.close()

    print(f"fuzz thread  examples={EXAMPLES * 9 + EXAMPLES // 4 + CROSSINGS}  ok")
