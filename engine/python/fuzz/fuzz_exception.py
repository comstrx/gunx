from engine.error import Code, Fault
from engine.exception import Exceptions
from engine.log import log
from collections.abc import Callable, Iterator, Mapping, Sequence
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, cast, override
import math, sys, warnings

type Known = tuple[Code, str, bool]
type Rung = tuple[int, int | None]
type Step = tuple[str, int, bool, bool]
type Beat = tuple[float, int]
type Mark = tuple[str, str]

EXAMPLES = 600
FIELDS   = 64
WORD     = 64
LEVELS   = ("debug", "info", "warning", "error", "critical")
VERBS    = ("map", "ignore", "level", "report", "context", "throttle")
RESERVED = ("level", "event", "exc_info", "stack_info", "exception", "code", "reason", "kind", "status", "self", "method_name")
STAMPED  = ("event", "level", "timestamp", "exception")
BASE     = ("code", "reason", "kind", "status")
SAFE     = ("tenant", "actor", "trace", "region", "shard", "a", "b")
BROKEN   = { "raises": "LookupError", "junk": "str", "none": "NoneType", "late": "coroutine", "crooked": "ZeroDivisionError" }
ROOTS: dict[type[BaseException], Known | None] = {
    Exception: None, ValueError: None, KeyError: None, OSError: None, RuntimeError: None,
    TimeoutError: (Code.TIMEOUT, "timeout", True), ConnectionError: (Code.UNAVAILABLE, "connection", True),
    ConnectionResetError: (Code.UNAVAILABLE, "connection", True),
    NotImplementedError: (Code.NOT_IMPLEMENTED, "unimplemented", False),
}
SHOWN: dict[Code, Mark] = {
    Code.GONE: ("fault", "debug"), Code.CONFLICT: ("fault", "debug"), Code.NOT_FOUND: ("fault", "debug"),
    Code.PAYMENT_REQUIRED: ("fault", "debug"), Code.TOO_MANY_REQUESTS: ("fault", "debug"),
    Code.UNAVAILABLE: ("exception", "warning"), Code.TIMEOUT: ("exception", "warning"),
    Code.BAD_GATEWAY: ("exception", "warning"), Code.INTERNAL: ("exception", "error"),
    Code.NOT_IMPLEMENTED: ("exception", "error"),
}
CODES    = tuple(SHOWN)
MAKERS: tuple[Callable[[], BaseException], ...] = (
    RuntimeError, KeyError, partial(Fault, Code.NOT_FOUND, reason="a"), partial(Fault, Code.NOT_FOUND, reason="b"),
)

class Clock:

    def __init__ ( self ) -> None:

        self.now = 1000.0

    def monotonic ( self ) -> float:

        return self.now

class Crooked ( Mapping[str, int] ):

    @override
    def __getitem__ ( self, name: str ) -> int:

        return len(name)

    @override
    def __iter__ ( self ) -> Iterator[str]:

        raise ZeroDivisionError

    @override
    def __len__ ( self ) -> int:

        return 1

async def late ( *_: object ) -> Fault:

    return Fault(Code.GONE)

def plain ( *_: object ) -> None:

    return None

clock    = Clock()
stalled  = partial(late)
LATE: tuple[object, ...] = (late, stalled)
LADDERS  = st.lists(st.tuples(st.integers(0, 40), st.one_of(st.none(), st.integers(0, len(CODES) - 1))), min_size=1, max_size=10)
NOTES    = st.lists(st.sampled_from(["ok", "raises", "late"]), max_size=3)
STATES   = st.lists(st.sampled_from(["ok", "raises", "junk", "none", "late", "crooked"]), max_size=4)
PACK     = st.dictionaries(st.sampled_from(SAFE), st.integers(0, 9), max_size=3)
SCRIPT   = st.lists(st.tuples(
    st.sampled_from(["ok", "ok", "raises", "junk", "none", "late"]), st.integers(0, len(CODES) - 1), st.booleans(), st.booleans(),
), max_size=10)
BEATS    = st.lists(st.tuples(st.sampled_from([0.0, 0.0, 0.5, 1.0, 4.0, 9.5, 10.0, 60.0]), st.integers(0, 3)), max_size=40)
WINDOWS  = st.sampled_from([0, 0.5, 1, 10, 60.0])
NAMES    = st.one_of(
    st.sampled_from(SAFE), st.sampled_from(RESERVED), st.integers(0, 3), st.none(), st.text(max_size=4),
    st.integers(0, 99).map("k{}".format),
)
PACKS    = st.lists(st.dictionaries(NAMES, st.integers(0, 9), max_size=40), max_size=5)
WILD: st.SearchStrategy[Any] = st.one_of(
    st.none(), st.booleans(), st.integers(-3, 3),
    st.sampled_from([10 ** 5000, 2 ** 1024 - 1, 0.0, 1.5, -1.0, 1e308, math.nan, math.inf, -math.inf]),
    st.sampled_from(["", "info", "error", "loud", "r" * WORD, "r" * (WORD + 1), b"info"]), st.sampled_from(CODES),
    st.sampled_from([int, str, dict, Exception, ValueError, BaseException, KeyboardInterrupt, object(), Fault(Code.GONE)]),
    st.sampled_from([late, stalled, plain]),
)

log.setup("debug", "json", Path("/dev/null"))
vars(sys.modules["engine.exception.exceptions"])["time"] = clock

def tried ( work: Callable[[], object] ) -> Fault | None:

    try: work()
    except Fault as fault: return fault

    return None

def raised ( kind: object ) -> bool:

    return isinstance(kind, type) and issubclass(kind, BaseException)

def works ( work: object ) -> bool:

    return callable(work) and all(work is not slow for slow in LATE)

def named ( reason: object ) -> bool:

    return reason is None or (isinstance(reason, str) and 0 < len(reason) <= WORD)

def paced ( burst: object, window: object ) -> bool:

    if isinstance(burst, bool) or not isinstance(burst, int) or burst < 0: return False
    if isinstance(window, bool) or not isinstance(window, int | float): return False

    try: return window >= 0 and math.isfinite(float(window))
    except OverflowError: return False

def fits ( verb: str, first: object, second: object, third: object ) -> bool:

    if verb == "map": return raised(first) and (isinstance(second, Code) or works(second)) and named(third)
    if verb == "ignore": return raised(first) and raised(second)
    if verb == "level": return isinstance(first, Code) and isinstance(second, str) and second in LEVELS
    if verb == "throttle": return paced(first, second)

    return works(first)

def asked ( tool: Exceptions, verb: str, first: Any, second: Any, third: Any ) -> None:

    if verb == "map": tool.map(first, second, third)
    if verb == "ignore": tool.ignore(first, second)
    if verb == "level": tool.level(first, second)
    if verb == "report": tool.report(first)
    if verb == "context": tool.context(first)
    if verb == "throttle": tool.throttle(first, second)

def held ( tool: Exceptions, verb: str, first: Any, second: Any ) -> bool:

    told = tool.describe()

    if verb == "map": return first.__name__ in told["maps"]
    if verb == "ignore": return { first.__name__, second.__name__ } <= set(told["ignored"])
    if verb == "level": return bool(told["levels"] == { first.value: second })
    if verb == "throttle": return bool(told["throttle"] == { "burst": first, "window": float(second) })

    return bool(told["reporters"] + told["contexts"] == 1)

def crafted ( mode: str, code: Code, error: BaseException ) -> object:

    if mode == "raises": raise LookupError(type(error).__name__)
    if mode == "ok": return Fault(code, reason="crafted")
    if mode == "late": return late()

    return "gone" if mode == "junk" else None

def stated ( mode: str, pack: dict[str, int] ) -> object:

    if mode == "raises": raise LookupError(mode)
    if mode == "ok": return pack
    if mode == "late": return late()
    if mode == "crooked": return Crooked()

    return "gone" if mode == "junk" else None

def noted ( mode: str, told: list[str], fault: Fault, error: BaseException ) -> object:

    told.append(f"{fault.code.value}:{type(error).__name__}")

    if mode == "raises": raise LookupError(mode)

    return late() if mode == "late" else None

def awaited ( crafting: str, stating: list[str], noting: list[str], shown: str, quiet: int, again: int ) -> list[Mark]:

    failed = [("exception.factory", BROKEN[crafting])] if crafting != "ok" else []
    told   = [("exception.context", BROKEN[mode]) for mode in stating if mode != "ok"]
    sunk   = [("exception.reporter", "LookupError") for mode in noting if mode == "raises"]

    return failed + ([] if quiet else [*told, (shown, "Wild"), *sunk]) + failed * again

def marked ( events: Sequence[Mapping[str, Any]], known: Code, pack: dict[str, int] ) -> None:

    name, level = SHOWN[known]
    report      = next(event for event in events if event["event"] == name)

    assert report["level"] == level
    assert ("exception" in report) == (level == "error")
    assert (report["code"], report["reason"]) == (known.value, "crafted" if known is not Code.INTERNAL else report["reason"])
    assert { name: report[name] for name in SAFE if name in report } == pack

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(list(ROOTS)), LADDERS, st.booleans(), st.booleans())
def laddered ( root: type[BaseException], rungs: list[Rung], named: bool, backwards: bool ) -> None:

    tool  = Exceptions()
    kinds : list[type[BaseException]] = []
    known : list[Known | None] = []

    for index, (pick, code) in enumerate(rungs):

        above = pick % (index + 1) - 1
        owned = None if code is None else (CODES[code], "mapped" if named else f"rung{index}", False)

        kinds.append(cast("type[BaseException]", type(f"Rung{index}", (root if above < 0 else kinds[above],), {})))
        known.append(owned or (ROOTS[root] if above < 0 else known[above]))

    for index in reversed(range(len(rungs))) if backwards else range(len(rungs)):

        code = rungs[index][1]

        if code is not None: tool.map(kinds[index], CODES[code], "mapped" if named else None)

    for kind, owner in zip(kinds, known, strict=True):

        error = kind()
        fault = tool.fault(error)

        assert tool.fault(fault) is fault
        assert fault.__cause__ is error
        assert (fault.code, fault.reason, fault.unknown) == (owner or (Code.INTERNAL, kind.__name__.lower(), True))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NOTES, STATES, PACK, SCRIPT)
def handled ( noting: list[str], stating: list[str], pack: dict[str, int], script: list[Step] ) -> None:

    tool  = Exceptions()
    told  : list[str] = []
    codes : dict[str, int] = {}
    sent  = 0

    for mode in noting: tool.report(partial(noted, mode, told))
    for mode in stating: tool.context(cast("Any", partial(stated, mode, pack)))

    with warnings.catch_warnings(record=True) as leaked, log.capture() as events:

        warnings.simplefilter("always")

        for crafting, pick, ignored, twice in script:

            kind   = cast("type[Exception]", type("Wild", (Exception,), {}))
            error  = kind()
            known  = CODES[pick] if crafting == "ok" else Code.INTERNAL
            before = len(events), len(told)

            tool.map(kind, cast("Any", partial(crafted, crafting, CODES[pick])))

            if ignored: tool.ignore(kind)

            fault = tool.handle(error)
            again = tool.handle(error) if twice else fault
            sent += not ignored
            codes[known.value] = codes.get(known.value, 0) + 1 + twice

            assert (fault.code, again.code) == (known, known)
            assert fault.reason == ("crafted" if crafting == "ok" else "wild")
            assert fault.__cause__ is error
            assert told[before[1]:] == ([] if ignored else [f"{known.value}:Wild"] * len(noting))
            assert [(event["event"], event["kind"]) for event in events[before[0]:]] == awaited(
                crafting, stating, noting, SHOWN[known][0], ignored, twice,
            )

            if not ignored: marked(events[before[0]:], known, pack if "ok" in stating else {})

    assert not leaked
    assert tool.stats() == { "seen": sum(codes.values()), "reported": sent, "muted": 0, "codes": codes }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(0, 3), WINDOWS, BEATS)
def throttled ( burst: int, window: float, beats: list[Beat] ) -> None:

    tool   = Exceptions()
    opened : dict[int, list[float]] = {}
    quiet  = 0

    tool.throttle(burst, window)

    with log.capture() as events:

        for wait, pick in beats:

            clock.now += wait
            times      = opened.setdefault(pick, [])

            if times and clock.now - times[0] >= window: times.clear()

            times.append(clock.now)
            quiet += burst > 0 and len(times) > burst

            tool.handle(MAKERS[pick]())

    assert len(events) == len(beats) - quiet
    assert tool.stats() == { "seen": len(beats), "reported": len(beats) - quiet, "muted": quiet, "codes": tool.stats()["codes"] }
    assert sum(tool.stats()["codes"].values()) == len(beats)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(VERBS), WILD, WILD, WILD)
def refused ( verb: str, first: object, second: object, third: object ) -> None:

    tool   = Exceptions()
    before = tool.describe()
    sound  = fits(verb, first, second, third)

    fault  = tried(partial(asked, tool, verb, first, second, third))

    if fault is None:

        assert sound
        assert held(tool, verb, first, second)

    else:

        assert not sound
        assert (fault.code, fault.reason) == (Code.INTERNAL, f"exception.{verb}")
        assert tool.describe() == before

    with warnings.catch_warnings(record=True) as leaked:

        warnings.simplefilter("always")

        assert isinstance(tool.handle(ValueError("after")), Fault)
        assert isinstance(tool.handle(TimeoutError()), Fault)

    assert not leaked
    assert tool.stats()["seen"] == 2

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PACKS)
def fielded ( packs: list[dict[Any, int]] ) -> None:

    tool  = Exceptions()
    model : dict[str, object] = { "code": "internal", "reason": "valueerror", "kind": "ValueError", "status": 500 }

    for pack in packs:

        tool.context(partial(dict, pack))

        for name, value in pack.items():

            if not isinstance(name, str) or name in RESERVED: continue
            if name in model or len(model) < FIELDS: model[name] = value

    with log.capture() as events: tool.handle(ValueError("v"))

    assert len(events) == 1
    assert set(events[0]) - set(STAMPED) == set(model)
    assert all(events[0][name] == model[name] for name in model if name in BASE or name in SAFE or name[1:].isdigit())

laddered()
handled()
throttled()
refused()
fielded()

print(f"fuzz exception  examples={EXAMPLES * 5}  ok")
