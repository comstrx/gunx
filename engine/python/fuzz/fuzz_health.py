from engine.error import Code, Fault
from engine.health import Health, Probe
from engine.log import log
from engine.thread import thread
from collections.abc import Awaitable, Callable, Coroutine
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, cast
import asyncio, inspect, math

type Mark = tuple[str, str, str, str | None]
type Plan = tuple[bool, bool, bool]
type Turn = tuple[list[str], str, int]
type Report = tuple[bool, dict[str, Any]]
type Waiter = tuple[asyncio.Future[Report], tuple[str, ...], bool]

EXAMPLES = 800
WORD     = 64
LIMIT    = 60
HELD     = 64
LOWER    = "abcdefghijklmnopqrstuvwxyz"
DIGITS   = "0123456789"
HEAD     = frozenset(LOWER + LOWER.upper() + DIGITS)
BODY     = HEAD | frozenset("_.:-")
RESERVED = ("status", "uptime", "checks")
POOL     = ("db", "cache", "peer")
MODES    = ("ok", "ok", "late", "word", "false", "none", "raises", "odd", "stopped", "slow", "blunt")
KINDS    = {
    "false": "unready", "none": "unready", "raises": "OSError", "odd": "Strange", "stopped": "CancelledError",
    "blunt": "ValueError",
}
TURNS    = 8

class Strange ( Exception ):

    pass

class Odd:

    def __bool__ ( self ) -> bool: raise ValueError("ambiguous")

class Word ( str ):

    __slots__ = ()

class Crowd:

    def __init__ ( self ) -> None:

        self.health = Health()
        self.gate   = asyncio.Event()
        self.names: list[str] = []
        self.flight: tuple[str, ...] | None = None
        self.calls: dict[str, int] = dict.fromkeys(POOL, 0)
        self.wanted: dict[str, int] = dict.fromkeys(POOL, 0)
        self.waiters: list[Waiter] = []

    async def check ( self, name: str ) -> bool:

        self.calls[name] += 1

        await self.gate.wait()

        return True

    async def call ( self ) -> None:

        flight = self.flight if self.names else ()

        if flight is None:

            flight = self.flight = tuple(self.names)

            for name in flight: self.wanted[name] += 1

        self.waiters.append((asyncio.ensure_future(self.health.ready()), flight, False))

        await settle()

    def cancel ( self ) -> None:

        for index, (waiter, flight, stopped) in enumerate(self.waiters):

            if stopped or not flight: continue

            waiter.cancel()

            self.waiters[index] = (waiter, flight, True)
            return

    def register ( self, name: str ) -> None:

        self.health.register(name, partial(self.check, name))

        if name not in self.names: self.names.append(name)

        self.flight = None

    def forget ( self, name: str ) -> None:

        known = name in self.names

        assert self.health.forget(name) is known

        if not known: return

        self.names.remove(name)

        self.flight = None

    async def stop ( self ) -> None:

        await thread.close()

        results = await asyncio.gather(*(waiter for waiter, _, _ in self.waiters), return_exceptions=True)

        for result, (_, flight, stopped) in zip(results, self.waiters, strict=True):

            if stopped: assert isinstance(result, asyncio.CancelledError)
            elif flight: assert result == (False, { "status": "degraded", "checks": {} })
            else: assert result == (True, { "status": "ok", "checks": {} })

        self.waiters = []
        self.flight  = None

    async def release ( self ) -> None:

        self.gate.set()

        results = await asyncio.gather(*(waiter for waiter, _, _ in self.waiters), return_exceptions=True)

        for result, (_, flight, stopped) in zip(results, self.waiters, strict=True):

            if stopped: assert isinstance(result, asyncio.CancelledError)
            else: assert result == (True, { "status": "ok", "checks": dict.fromkeys(flight, True) })

        self.gate.clear()

        self.waiters = []
        self.flight  = None

async def good () -> bool: return True

def plain () -> bool: return True

async def settle () -> None:

    for _ in range(TURNS): await asyncio.sleep(0)

async def acted ( mode: str ) -> bool:

    if mode == "late": await asyncio.sleep(0)
    if mode == "slow": await asyncio.Event().wait()

    return blunt(mode)

def blunt ( mode: str ) -> bool:

    if mode == "raises": raise OSError("gone")
    if mode == "odd": raise Strange
    if mode == "stopped": raise asyncio.CancelledError
    if mode == "none": return cast("bool", None)
    if mode == "blunt": return cast("bool", Odd())
    if mode == "word": return cast("bool", "up")

    return mode != "false"

STRAY    = object()
LEAVES   = st.one_of(
    st.none(), st.booleans(), st.integers(-2 ** 63, 2 ** 64 - 1), st.floats(allow_nan=False, allow_infinity=False),
    st.text(max_size=8),
)
PLAIN    = st.recursive(LEAVES, lambda inner: st.one_of(
    st.lists(inner, max_size=3), st.dictionaries(st.text(max_size=4), inner, max_size=3),
), max_leaves=8)
SPOILED: st.SearchStrategy[Any] = st.one_of(
    st.sampled_from([2 ** 64, -2 ** 63 - 1, 10 ** 400, 1j, "\ud800", "x" * 5000, int, len, range(2)]),
    st.builds(object), st.builds(Odd), st.builds(bytearray), st.builds(ValueError), st.lists(st.builds(object), min_size=1, max_size=2),
    st.dictionaries(st.text(max_size=2), st.builds(object), min_size=1, max_size=2),
)
TEXTS    = st.one_of(
    st.sampled_from(["", " ", "db", "cache", "peer", "version", "eu.west:1", "a_b", "A-b", "9", *RESERVED]),
    st.sampled_from(["-x", "_x", ".x", ":x", "a b", "db\n", "n" * WORD, "n" * (WORD + 1), "x" * 5000, "é", "d/b"]),
    st.text(alphabet="azAZ09_.:- \n/é", max_size=5),
)
TITLES   = st.one_of(st.text(alphabet=sorted(BODY), min_size=1, max_size=WORD + 2), TEXTS)
JUNK: st.SearchStrategy[Any] = st.one_of(
    st.none(), st.booleans(), st.integers(-2, 2), st.sampled_from([0.0, 1.5, math.nan, math.inf, -math.inf, 10 ** 400]),
    st.binary(max_size=3), st.lists(TEXTS, max_size=2), st.lists(TEXTS, max_size=2).map(tuple), st.builds(Odd), TEXTS.map(Word),
    st.sampled_from([object(), int, good, plain]),
)
WILD: st.SearchStrategy[Any] = st.one_of(TEXTS, JUNK)
NAMES    = st.one_of(st.sampled_from(POOL), TITLES, WILD)
CHECKS: st.SearchStrategy[Any] = st.one_of(st.sampled_from([good, plain, good, plain, int, Odd, STRAY, STRAY]), WILD)
FLAGS: st.SearchStrategy[Any] = st.one_of(st.booleans(), st.booleans(), WILD)
SPANS: st.SearchStrategy[Any] = st.one_of(
    st.integers(-1, LIMIT + 2), st.floats(-1, LIMIT + 2), st.sampled_from([0.001, 2.0, LIMIT, float(LIMIT), LIMIT + 0.001, 5e-324]),
    WILD,
)
PAIRS    = st.lists(st.tuples(TITLES, st.one_of(PLAIN, PLAIN, PLAIN, SPOILED)), max_size=4)
PLANS    = st.lists(st.tuples(st.booleans(), st.booleans(), st.booleans()), min_size=1, max_size=5)
ROUNDS   = st.lists(st.tuples(
    st.lists(st.sampled_from(MODES), min_size=5, max_size=5), st.sampled_from(["", "", "again", "forget"]), st.integers(0, 4),
), min_size=1, max_size=4)
STEPS    = st.lists(st.tuples(
    st.sampled_from(["call", "call", "call", "cancel", "register", "forget", "release", "stop"]), st.sampled_from(POOL),
), max_size=14)
loop     = asyncio.new_event_loop()

log.setup("debug", "json", Path("/dev/null"))

def tried ( work: Callable[[], Any] ) -> Any:

    try: return work()
    except Fault as fault: return fault

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

def refused ( found: object, reason: str, errors: object = None ) -> bool:

    return isinstance(found, Fault) and found.code is Code.INTERNAL and found.reason == reason and found.errors == errors

def worded ( value: object ) -> str:

    return value[:WORD] if type(value) is str else type(value).__name__

def titled ( name: object ) -> bool:

    if type(name) is not str or not 0 < len(name) <= WORD: return False

    return name[0] in HEAD and all(letter in BODY for letter in name)

def timed ( span: object ) -> bool:

    return type(span) in (int, float) and 0 < cast("float", span) <= LIMIT

def spoiled ( value: object ) -> bool:

    if value is None or type(value) in (bool, float): return False
    if type(value) is int: return not -2 ** 63 <= value < 2 ** 64
    if type(value) is str: return len(value) > WORD or "\ud800" in value
    if type(value) is list: return any(spoiled(item) for item in value)
    if type(value) is dict: return any(spoiled(item) for item in value.values())

    return True

def judged ( name: object, check: object, critical: object, span: object ) -> str:

    if not titled(name): return "name"
    if not callable(check): return "check"
    if type(critical) is not bool: return "critical"

    return "" if timed(span) else "timeout"

def kind ( mode: str, plan: Plan ) -> str:

    _, flat, quick = plan

    if mode == "slow": return "TimeoutError" if quick and not flat else ""

    return KINDS.get(mode, "")

def probe ( moods: dict[str, str], name: str, plan: Plan ) -> Callable[[], Awaitable[bool] | bool]:

    _, flat, quick = plan

    def flatly () -> bool:

        return blunt(moods[name])

    async def deeply () -> bool:

        mode = moods[name]

        return await acted("ok" if quick and mode == "late" else mode)

    async def calmly () -> bool:

        mode = moods[name]

        return await acted("ok" if mode == "slow" else mode)

    if flat: return flatly

    return deeply if quick else calmly

def enrolled ( health: Health, moods: dict[str, str], name: str, plan: Plan ) -> None:

    health.register(name, probe(moods, name, plan), critical=plan[0], timeout=0.001 if plan[2] else 30)

def marks ( before: dict[str, str], after: dict[str, str] ) -> list[Mark]:

    told: list[Mark] = []

    for name in sorted(before.keys() | after.keys()):

        was, now = before.get(name, ""), after.get(name, "")

        if was == now: continue

        if now: told.append(("warning", "health.failed", name, now))
        else: told.append(("info", "health.recovered", name, None))

    return told

def altered ( health: Health, moods: dict[str, str], plans: dict[str, Plan], failed: dict[str, str], turn: Turn ) -> None:

    _, verb, index = turn
    names  = sorted(plans)
    name   = names[index % len(names)] if names else ""

    if not verb or not name: return

    failed.pop(name, None)

    if verb == "again":

        enrolled(health, moods, name, plans[name])
        return

    assert health.forget(name)

    del plans[name]

def swung ( health: Health, moods: dict[str, str], plans: dict[str, Plan], failed: dict[str, str], turn: Turn ) -> None:

    for index, name in enumerate(sorted(moods)): moods[name] = turn[0][index]

    before = dict(failed)
    checks = {}

    for name, plan in plans.items():

        found        = kind(moods[name], plan)
        checks[name] = not found

        failed.pop(name, None)

        if found: failed[name] = found

    healthy = all(fine for name, fine in checks.items() if plans[name][0])

    with log.capture() as events:

        ready, report = run(health.ready())

    told = sorted((event["level"], event["event"], event["probe"], event.get("error")) for event in events)

    assert ready is healthy
    assert report == { "status": "ok" if healthy else "degraded", "checks": checks, "tier": "fuzz" }
    assert list(report["checks"]) == list(checks)
    assert told == sorted(marks(before, failed), key=str)
    assert health.describe()["failed"] == dict(sorted(failed.items()))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, CHECKS, FLAGS, SPANS, st.booleans(), WILD)
def declared ( name: Any, check: Any, critical: Any, span: Any, crowded: bool, wild: Any ) -> None:

    health  = Health()
    check   = good() if check is STRAY else check
    verdict = judged(name, check, critical, span)
    held    = ["db"]

    health.register("db", good)

    if crowded:

        held = sorted([*held, *(f"p{index}" for index in range(255))])

        for index in range(255): health.register(f"p{index}", plain)

    if not verdict and crowded and name not in held: verdict = "full"

    found = tried(partial(health.register, name, check, critical, span))

    if inspect.iscoroutine(check): assert inspect.getcoroutinestate(check) == inspect.CORO_CLOSED

    if verdict: assert refused(found, f"health.{verdict}", { "probe": [worded(name)] })
    else:

        assert found == Probe(name, check, critical, float(span))
        assert type(found.timeout) is float

        held = sorted({ *held, name })

    assert health.names() == tuple(held)
    assert list(health.describe()["probes"]) == held
    assert health.forget(wild) is (type(wild) is str and wild in held)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(PAIRS, min_size=1, max_size=3), st.booleans())
def stated ( calls: list[list[tuple[str, Any]]], crowded: bool ) -> None:

    health = Health()
    model: dict[str, Any] = {}

    if crowded:

        model = { f"f{index}": index for index in range(HELD - 2) }

        health.fact(**model)

    for pairs in calls:

        facts = dict(pairs)
        bad   = [name for name, value in facts.items() if not titled(name) or name in RESERVED or spoiled(value)]
        found = tried(partial(health.fact, **facts))

        if bad: assert refused(found, "health.fact", { "fact": [bad[0][:WORD]] })
        elif len({ **model, **facts }) > HELD: assert refused(found, "health.facts")
        else:

            assert found is None

            model.update(facts)

        live = health.live()

        assert list(live) == ["status", "uptime", *model]
        assert { name: live[name] for name in model } == model
        assert health.describe()["facts"] == sorted(model)
        assert run(health.ready()) == (True, { "status": "ok", "checks": {}, **model })

@settings(max_examples=EXAMPLES // 2, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PLANS, ROUNDS)
def swept ( plans: list[Plan], rounds: list[Turn] ) -> None:

    health = Health()
    moods  = { f"p{index}": "ok" for index in range(5) }
    held   = { f"p{index}": plan for index, plan in enumerate(plans) }
    failed: dict[str, str] = {}

    health.fact(tier="fuzz")

    for name, plan in held.items(): enrolled(health, moods, name, plan)

    for turn in rounds:

        swung(health, moods, held, failed, turn)
        altered(health, moods, held, failed, turn)

    assert health.names() == tuple(sorted(held))

@settings(max_examples=EXAMPLES // 2, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(STEPS)
def crowded ( steps: list[tuple[str, str]] ) -> None:

    async def driven () -> None:

        crowd = Crowd()

        for verb, name in steps:

            if verb == "call": await crowd.call()
            elif verb == "cancel": crowd.cancel()
            elif verb == "register": crowd.register(name)
            elif verb == "forget": crowd.forget(name)
            elif verb == "stop": await crowd.stop()
            else: await crowd.release()

            assert crowd.calls == crowd.wanted

        await crowd.release()
        await settle()

        assert crowd.calls == crowd.wanted
        assert crowd.health.describe()["failed"] == {}

    run(driven())

declared()
stated()
swept()
crowded()

run(thread.close())
loop.close()
log.close()

print(f"fuzz health  examples={EXAMPLES * 3}  ok")
