from engine.error import Code, Fault
from engine.func import Breaker, Func
from engine.log import log
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Hashable
from datetime import date
from decimal import Decimal
from enum import Enum
from functools import partial, wraps
from hypothesis import HealthCheck, given, settings, strategies as st
from itertools import product
from typing import Any
import asyncio, copy, importlib, math, re, sys

type Op = tuple[Any, ...]
type Step = tuple[str, bool, float | None]

EXAMPLES = 500
DEPTH    = 16
LONG     = 256
DOUBLES  = 32
TTL      = 2.0
PART     = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
SCALARS  = (bool, float, str, int, bytes, Decimal, date, Enum)
MODULES  = ("engine.func", "engine.error", "engine.func.arch", "math", "json", "engine.nope", "nope")
ATTRS    = ("func", "func.key", "Func.key", "Code", "Fault", "pi", "PART", "_frozen_", "func._frozen_", "missing", "func.missing", "dumps", "a" * 250)
ROOTS    = st.sampled_from([(), ("engine",), ("engine.func",), ("math",), ("eng",), ("engine.func", "json"), ("",)])
HASHED   = st.one_of(
    st.none(), st.booleans(), st.integers(-2, 2), st.sampled_from([0.0, -0.0, 1.0, 2.5, math.nan, math.inf]),
    st.sampled_from(["", "a", "1"]), st.sampled_from([b"", b"a", b"1"]),
    st.sampled_from([Decimal(1), Decimal("1.0"), Decimal(2), Decimal("NaN")]),
    st.sampled_from([date(2026, 1, 1), date(2026, 1, 2), Code.NOT_FOUND]),
)
ODD      = st.sampled_from([Decimal("sNaN"), range(2), object(), bytearray(b"a"), complex(1, 2), OrderedDict(a=1)])
WILD: st.SearchStrategy[Any] = st.recursive(
    st.one_of(HASHED, HASHED, HASHED, ODD),
    lambda inner: st.one_of(
        st.lists(inner, max_size=3), st.lists(inner, max_size=3).map(tuple), st.frozensets(HASHED, max_size=3),
        st.sets(HASHED, max_size=3), st.dictionaries(HASHED, inner, max_size=3),
    ),
    max_leaves=8,
)
LAYERS   = st.integers(0, 20)
KWARGS   = st.dictionaries(st.sampled_from(["a", "b"]), WILD, max_size=2)
JUNK     = st.sampled_from(list(".:_ 1-é"))
PATHS    = st.one_of(
    st.builds("{}:{}".format, st.sampled_from(MODULES), st.sampled_from(ATTRS)),
    st.builds(lambda base, spot, mark: base[:spot] + mark + base[spot:], st.builds("{}:{}".format, st.sampled_from(MODULES), st.sampled_from(ATTRS)), st.integers(0, 30), JUNK),
    st.text(alphabet="ab.:_1 ", max_size=12),
)
NAMES    = st.sampled_from(["a", "b", "c", "d", "e", 1, (1, 2)])
STORES   = st.lists(st.one_of(
    st.tuples(st.just("set"), NAMES, st.integers(0, 9), st.sampled_from([None, 0.0, 1.0, 5.0])),
    st.tuples(st.just("get"), NAMES), st.tuples(st.just("has"), NAMES), st.tuples(st.just("forget"), NAMES),
    st.tuples(st.just("clear")), st.tuples(st.just("tick"), st.sampled_from([0.5, 1.0, 4.0, 60.0])),
    st.tuples(st.just("remember"), NAMES, st.integers(0, 9)),
), max_size=30)
SPENDS   = st.lists(st.one_of(
    st.tuples(st.just("tick"), st.sampled_from([0.25, 0.5, 1.0, 3.0, 100.0])),
    st.tuples(st.just("allow"), st.integers(-1, 8)), st.tuples(st.just("wait"), st.integers(-1, 8)),
), max_size=30)
TRIPS    = st.lists(st.one_of(
    st.tuples(st.sampled_from(["ok", "server", "client", "raw", "fail", "succeed", "reset"]), st.just(0.0)),
    st.tuples(st.just("tick"), st.sampled_from([0.5, 1.0, 5.0])),
), max_size=30)
SCRIPT   = st.lists(st.tuples(
    st.sampled_from(["ok", "busy", "busy", "busy", "gone", "raw"]), st.booleans(),
    st.sampled_from([None, None, 0.0, 0.25, 3.0, 50.0, math.nan, -1.0]),
), max_size=8)
PAUSES   = st.sampled_from([0.0, 0.25, 1.0, math.nan, -1.0, math.inf])
CEILINGS = st.sampled_from([0.0, 2.0, 30.0, math.nan, math.inf])
SPANS    = st.sampled_from([math.nan, math.inf, -math.inf, -1.0, 0.0, 5.0])
MANUAL   = ("fail", "succeed", "reset")
WILDS    = (math.nan, math.inf, -math.inf, -1.0, -0.0, 0.0, 0.5, 3.0)
COUNTS   = range(-2, 4)
KIN: dict[type, Callable[[Any], Any]] = { list: tuple, tuple: list, set: frozenset, frozenset: set, int: float, bool: int, str: str.encode }
MARK     = object()
loop     = asyncio.new_event_loop()
tool     = Func()
naps: list[float] = []

class Clock:

    def __init__ ( self ) -> None:

        self.now = 1000.0

    def monotonic ( self ) -> float:

        return self.now

    def perf_counter ( self ) -> float:

        return self.now

class Odd ( Exception ):

    pass

class Shelf:

    def __init__ ( self, size: int ) -> None:

        self.size = size
        self.held : dict[Any, tuple[float, int]] = {}

    def live ( self, name: Any ) -> bool:

        return name in self.held and self.held[name][0] > clock.now

    def set ( self, name: Any, value: int, ttl: float | None = None ) -> None:

        self.held.pop(name, None)

        if len(self.held) >= self.size: del self.held[next(iter(self.held))]

        self.held[name] = (clock.now + (TTL if ttl is None else ttl), value)

    def get ( self, name: Any ) -> Any:

        return self.held[name][1] if self.live(name) else MARK

    def has ( self, name: Any ) -> bool:

        return self.live(name)

    def forget ( self, name: Any ) -> bool:

        return self.held.pop(name, None) is not None

    def clear ( self ) -> int:

        count = len(self.held)

        self.held.clear()

        return count

    def remember ( self, name: Any, value: int ) -> int:

        if self.live(name): return self.held[name][1]

        self.set(name, value)

        return value

class Fuse:

    def __init__ ( self, threshold: int, cooldown: float ) -> None:

        self.threshold = threshold
        self.cooldown  = cooldown
        self.state     = "closed"
        self.failures  = 0
        self.opened    = 0.0

    def thaw ( self ) -> None:

        if self.state == "open" and clock.now - self.opened >= self.cooldown: self.state = "half"

    def close ( self ) -> None:

        self.state, self.failures = "closed", 0

    def fail ( self ) -> None:

        self.failures += 1

        if self.state != "closed" or self.failures >= self.threshold: self.state, self.opened = "open", clock.now

    def wait ( self ) -> float:

        return max(0.0, self.cooldown - (clock.now - self.opened))

clock = Clock()

async def nap ( seconds: float ) -> None:

    assert 0 <= seconds < math.inf

    naps.append(seconds)

    clock.now += seconds

def kin ( value: Any ) -> Any:

    return KIN.get(type(value), copy.copy)(value)

def nest ( count: int, leaf: Any ) -> Any:

    for _ in range(count): leaf = [leaf]

    return leaf

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(work)

def settle ( work: Awaitable[Any] ) -> Any:

    try: return loop.run_until_complete(work)
    except (Fault, ValueError) as error: return error

def tried ( work: Callable[[], Any] ) -> Any:

    try: return work()
    except Fault as fault: return fault

def refused ( found: object, reason: str, code: Code = Code.INTERNAL ) -> bool:

    return isinstance(found, Fault) and found.reason == reason and found.code is code

def shape ( value: Any, depth: int = 0 ) -> Hashable:

    kind = type(value)

    if value is None or isinstance(value, SCALARS): return (kind, value)
    if depth >= DEPTH: raise Odd
    if kind in (list, tuple): return (kind, tuple(shape(item, depth + 1) for item in value))
    if kind in (set, frozenset): return (kind, frozenset(shape(item, depth + 1) for item in value))
    if kind is dict: return (kind, frozenset((shape(name, depth + 1), shape(item, depth + 1)) for name, item in value.items()))

    raise Odd

def modeled ( args: list[Any], kwargs: dict[str, Any] ) -> Hashable:

    try:

        found = (shape(tuple(args)), shape(dict(kwargs)))

        hash(found)

    except (Odd, TypeError): return MARK

    return found

def located ( path: str, roots: tuple[str, ...] ) -> Any:

    module, mark, attribute = path.partition(":")
    names  = (*module.split("."), *attribute.split("."))
    sound  = len(path) <= LONG and mark == ":" and all(PART.fullmatch(name) for name in names)
    inside = not roots or any(module == root or module.startswith(f"{root}.") for root in roots)

    if not sound or not inside: return Code.INTERNAL

    try: found: Any = importlib.import_module(module)
    except ImportError: return Code.NOT_FOUND

    for name in attribute.split("."):

        if not hasattr(found, name): return Code.NOT_FOUND

        found = getattr(found, name)

    return found

def first ( a: int, b: int = 2, *rest: int, flag: int = 0, **extra: int ) -> dict[str, Any]:

    return { "a": a, "b": b, "rest": rest, "flag": flag, "extra": extra }

def second ( a: int, /, b: int, *, c: int = 3 ) -> dict[str, Any]:

    return { "a": a, "b": b, "c": c }

def third () -> dict[str, Any]:

    return {}

def base ( value: int ) -> int:

    return value

def layered ( target: Callable[..., Any] ) -> Callable[..., Any]:

    @wraps(target)
    def inner ( *args: Any, **kwargs: Any ) -> Any: return target(*args, **kwargs)

    return inner

def peeled ( target: Any ) -> int:

    count = 0

    while True:

        inner = target.func if isinstance(target, partial) else getattr(target, "__wrapped__", None)

        if inner is None: return count

        target, count = inner, count + 1

def affine ( scale: int, shift: int, value: int ) -> int:

    return value * scale + shift

async def answer ( item: int | None ) -> int:

    if item is None: raise Fault(Code.CONFLICT, reason="none")

    return item

async def seven () -> int:

    return 7

async def echoed ( found: list[int] ) -> list[int]:

    return found

def built () -> None:

    for span, count in product(WILDS, COUNTS):

        timed  = 0 <= span < math.inf
        sized  = count >= 1
        builds : dict[str, tuple[Callable[[], Any], bool]] = {
            "func.memo"     : (partial(tool.memo, span, count), span >= 0 and sized),
            "func.limiter"  : (partial(tool.limiter, span, count), 0 < span < math.inf and sized),
            "func.breaker"  : (partial(tool.breaker, "x", count, span), timed and sized),
            "func.batch"    : (partial(tool.batch, echoed, count, span), timed and sized),
            "func.debounce" : (partial(tool.debounce, span), timed),
            "func.throttle" : (partial(tool.throttle, span), timed),
        }

        for reason, (make, sound) in builds.items(): assert refused(tried(make), reason) != sound

async def worked ( kind: str ) -> str:

    if kind == "server": raise Fault(Code.UNAVAILABLE, reason="server")
    if kind == "client": raise Fault(Code.NOT_FOUND, reason="client")
    if kind == "raw": raise ValueError(kind)

    return kind

def answered ( kind: str, found: Any ) -> bool:

    if kind == "ok": return bool(found == "ok")
    if kind == "raw": return isinstance(found, ValueError)

    return refused(found, kind, Code.UNAVAILABLE if kind == "server" else Code.NOT_FOUND)

def tripped ( breaker: Breaker, fuse: Fuse, kind: str ) -> None:

    if kind == "fail":

        breaker.fail()
        fuse.fail()

        return

    (breaker.succeed if kind == "succeed" else breaker.reset)()
    fuse.close()

def called ( breaker: Breaker, fuse: Fuse, kind: str ) -> None:

    state = fuse.state
    wait  = fuse.wait()
    found = settle(breaker.call(partial(worked, kind)))

    if state == "open":

        assert refused(found, "breaker.x", Code.UNAVAILABLE)
        assert found.retry_after == wait

        return

    if kind == "server": fuse.fail()
    if kind == "ok": fuse.close()

    assert answered(kind, found)

def spoiled ( found: list[int], mode: str ) -> list[int]:

    if mode == "short": return found[:-1]
    if mode == "fault": raise Fault(Code.CONFLICT, reason="flush")
    if mode == "raw": raise ValueError(mode)

    return [item * 2 for item in found]

def flushed ( found: Any, item: int, mode: str ) -> bool:

    if mode == "echo": return bool(found == item * 2)
    if mode == "short": return refused(found, "func.batch")
    if mode == "fault": return refused(found, "flush", Code.CONFLICT)

    return isinstance(found, ValueError)

ARGS = st.lists(st.one_of(WILD, HASHED, st.builds(nest, LAYERS, HASHED)), max_size=3)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ARGS, KWARGS, ARGS, KWARGS, st.sampled_from(["same", "kin", "free", "free"]))
def keyed ( args: list[Any], kwargs: dict[str, Any], others: list[Any], extras: dict[str, Any], mode: str ) -> None:

    if mode != "free": others, extras = copy.deepcopy(args), dict(reversed(list(copy.deepcopy(kwargs).items())))
    if mode == "kin": others = [kin(item) for item in others]

    one, two   = tried(partial(tool.key, *args, **kwargs)), tried(partial(tool.key, *others, **extras))
    want, more = modeled(args, kwargs), modeled(others, extras)

    assert refused(one, "func.key") == (want is MARK)
    assert refused(two, "func.key") == (more is MARK)

    if want is MARK or more is MARK: return

    assert isinstance(hash(one), int)
    assert (one == two) == (want == more)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.tuples(ARGS, KWARGS), max_size=8))
def cached ( calls: list[tuple[list[Any], dict[str, Any]]] ) -> None:

    ran: list[int] = []
    seen: set[Hashable] = set()

    async def handler ( *args: Any, **kwargs: Any ) -> int:

        ran.append(len(args) + len(kwargs))

        return len(ran)

    kept    = tool.cached(60.0, 64)(handler)
    answers : dict[Hashable, int] = {}

    for args, kwargs in calls:

        want  = modeled(args, kwargs)
        found = settle(kept(*args, **kwargs))

        if want is MARK:

            assert refused(found, "func.key")

            continue

        fresh = not any(want == known for known in seen)

        if fresh: seen.add(want)

        assert isinstance(found, int)

        if fresh: answers[want] = found

        assert next(answer for known, answer in answers.items() if known == want) == found

    assert len(ran) == len(seen)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PATHS, ROOTS)
def resolved ( path: str, roots: tuple[str, ...] ) -> None:

    want  = located(path, roots)
    found = tried(partial(tool.resolve, path, roots))

    if isinstance(want, Code): assert refused(found, "func.resolve", want)
    else: assert found == want

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from([first, second, third]), st.lists(st.integers(0, 9), max_size=4), st.dictionaries(st.sampled_from(["a", "b", "c", "flag", "x"]), st.integers(0, 9), max_size=3))
def bound ( target: Callable[..., dict[str, Any]], args: list[int], kwargs: dict[str, int] ) -> None:

    try: want: dict[str, Any] | None = target(*args, **kwargs)
    except TypeError: want = None

    found = tried(partial(tool.bind, target, *args, **kwargs))

    assert tool.accepts(target, *args, **kwargs) == (want is not None)

    if want is None: assert refused(found, "func.bind", Code.VALIDATION)
    else: assert found == want

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(1, 4), STORES)
def memoised ( size: int, ops: list[Op] ) -> None:

    memo  = tool.memo(TTL, size)
    shelf = Shelf(size)

    for verb, *rest in ops:

        if verb == "tick": clock.now += rest[0]
        elif verb == "get": assert memo.get(rest[0], MARK) == shelf.get(rest[0])
        elif verb == "remember": assert run(memo.remember(rest[0], partial(answer, rest[1]))) == shelf.remember(*rest)
        else: assert getattr(memo, verb)(*rest) == getattr(shelf, verb)(*rest)

        assert len(memo) == len(shelf.held) <= size

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from([0.25, 0.5, 1.0, 2.0, 4.0]), st.integers(1, 6), SPENDS)
def limited ( rate: float, burst: int, ops: list[Op] ) -> None:

    limiter = tool.limiter(rate, burst)
    tokens  = float(burst)
    at      = clock.now

    for op in ops:

        if op[0] == "tick":

            clock.now += op[1]

            continue

        verb = limiter.allow if op[0] == "allow" else limiter.wait
        cost = op[1]

        if not 0 <= cost <= burst:

            assert refused(tried(partial(verb, cost)), "func.limiter")

            continue

        tokens, at = min(float(burst), tokens + (clock.now - at) * rate), clock.now

        if op[0] == "wait": assert limiter.wait(cost) == (0.0 if tokens >= cost else (cost - tokens) / rate)
        else:

            assert limiter.allow(cost) == (tokens >= cost)

            if tokens >= cost: tokens -= cost

        assert limiter.describe() == { "rate": rate, "burst": burst, "tokens": round(tokens, 3) }
        assert 0 <= tokens <= burst

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(1, 3), st.sampled_from([0.0, 1.0, 5.0]), TRIPS)
def broken ( threshold: int, cooldown: float, ops: list[tuple[str, float]] ) -> None:

    breaker = tool.breaker("x", threshold, cooldown)
    fuse    = Fuse(threshold, cooldown)

    for kind, span in ops:

        fuse.thaw()

        if kind == "tick": clock.now += span
        elif kind in MANUAL: tripped(breaker, fuse, kind)
        else: called(breaker, fuse, kind)

        fuse.thaw()

        assert breaker.describe() == { "name": "x", "state": fuse.state, "failures": fuse.failures }
        assert breaker.allows() == (fuse.state != "open")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SCRIPT, st.integers(-1, 9), PAUSES, CEILINGS, st.booleans(), st.booleans())
def retried ( script: list[Step], tries: int, backoff: float, ceiling: float, jitter: bool, idempotent: bool ) -> None:

    calls = [0]

    async def work () -> int:

        calls[0] += 1

        kind, unknown, asked = script[calls[0] - 1] if calls[0] <= len(script) else ("ok", False, None)

        if kind == "ok": return calls[0]
        if kind == "raw": raise ValueError(kind)

        raise Fault(Code.UNAVAILABLE if kind == "busy" else Code.NOT_FOUND, reason=f"step{calls[0]}", unknown=unknown, retry_after=asked)

    naps.clear()

    found = settle(tool.retry(work, tries, backoff, ceiling, jitter, idempotent))

    if tries < 1 or not 0 <= backoff < math.inf or not 0 <= ceiling < math.inf:

        assert refused(found, "func.retry")
        assert calls[0] == 0
        assert not naps

        return

    waits: list[tuple[float, float]] = []
    want : object = None

    for count, (kind, unknown, asked) in enumerate([*script, ("ok", False, None)], 1):

        floor = asked if asked is not None and asked > 0 else 0.0
        again = kind == "busy" and (idempotent or not unknown) and count < tries and floor <= ceiling
        want  = count if kind == "ok" else ValueError if kind == "raw" else f"step{count}"

        if not again: break

        most = min(ceiling, backoff * 2 ** min(count - 1, DOUBLES))

        waits.append((max(most / 2 if jitter else most, floor), max(most, floor)))

    assert calls[0] == len(waits) + 1 == len(naps) + 1
    assert all(low <= took <= high for took, (low, high) in zip(naps, waits, strict=True))
    assert (found.reason if isinstance(found, Fault) else type(found) if isinstance(found, ValueError) else found) == want

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.integers(0, 99), max_size=40), st.integers(1, 8), st.sampled_from(["echo", "short", "fault", "raw"]), st.integers(0, 5))
def batched ( items: list[int], size: int, mode: str, bad: int ) -> None:

    chunks: list[list[int]] = []

    async def flush ( found: list[int] ) -> list[int]:

        chunks.append(list(found))

        return spoiled(found, mode if len(chunks) - 1 == bad else "echo")

    batch = tool.batch(flush, size)

    async def go () -> list[Any]:

        return await asyncio.gather(*(batch.put(item) for item in items), return_exceptions=True)

    results = run(go())
    modes   = [mode if index == bad else "echo" for index, chunk in enumerate(chunks) for _ in chunk]

    assert [item for chunk in chunks for item in chunk] == items
    assert batch.pending() == 0
    assert len(chunks) == -(-len(items) // size)
    assert all(1 <= len(chunk) <= size for chunk in chunks)
    assert all(flushed(found, item, kind) for found, item, kind in zip(results, items, modes, strict=True))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.booleans(), min_size=1, max_size=5), st.integers(-1, 5), st.sampled_from([0.0, 0.0, 0.0, math.nan, -1.0, math.inf]))
def hedged ( script: list[bool], copies: int, delay: float ) -> None:

    calls = [0]

    async def work () -> int:

        index     = calls[0]
        calls[0] += 1

        if index < len(script) and script[index]: return index

        raise Fault(Code.UNAVAILABLE, reason=f"copy{index}")

    found = settle(tool.hedge(work, delay, copies))
    wins  = [index for index in range(max(0, copies)) if index < len(script) and script[index]]
    lost  = copies < 1 or delay != 0.0
    least = 0 if lost else 1 if wins else copies

    assert least <= calls[0] <= (0 if lost else copies)
    assert not [task for task in asyncio.all_tasks(loop) if not task.done()]

    if lost: assert refused(found, "func.hedge")
    elif wins: assert found in wins
    else: assert refused(found, f"copy{copies - 1}", Code.UNAVAILABLE)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.lists(st.booleans(), max_size=20), st.lists(st.just(value=False), min_size=14, max_size=20)))
def unwrapped ( layers: list[bool] ) -> None:

    target: Callable[..., Any] = base

    for kind in layers: target = partial(target) if kind else layered(target)

    found = tried(partial(tool.unwrap, target))
    named = tried(partial(tool.name, target))

    if peeled(target) < DEPTH:

        assert found is base
        assert named == "base"
        assert tool.params(target) == ("value",)

    else:

        assert refused(found, "func.unwrap")
        assert refused(named, "func.unwrap")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.one_of(st.integers(0, 9), st.none()), max_size=6), st.integers(-5, 5), st.lists(st.tuples(st.integers(-3, 3), st.integers(-3, 3)), max_size=5), st.booleans(), SPANS)
def flowed ( script: list[int | None], seed: int, pairs: list[tuple[int, int]], flag: bool, span: float ) -> None:

    works  : list[Callable[[], Awaitable[int]]] = [partial(answer, item) for item in script]
    steps  = [partial(affine, scale, shift) for scale, shift in pairs]
    known  = [item for item in script if item is not None]
    fallen = settle(tool.fallback(*works))
    value  = seed
    taps   : list[int] = []

    for scale, shift in pairs: value = value * scale + shift

    assert [None if isinstance(found, Fault) else found for found in run(tool.settle(works))] == script
    assert refused(fallen, "func.fallback") if not script else fallen == known[0] if known else refused(fallen, "none", Code.CONFLICT)
    assert tool.pipe(seed, *steps) == value == tool.compose(*steps)(seed)
    assert tool.when(flag, seed, partial(affine, 2, 1)) == (seed * 2 + 1 if flag else seed)
    assert tool.unless(flag, seed, partial(affine, 2, 1)) == (seed if flag else seed * 2 + 1)
    assert tool.tap(seed, taps.append) == seed
    assert taps == [seed]

    if script: assert run(tool.attempt(works[0], -1)) == (-1 if script[0] is None else script[0])

    timed = settle(tool.timeout(span, seven))

    assert timed == 7 if span < math.inf else refused(timed, "func.timeout")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.none(), st.integers(0, 12)), st.sampled_from([0.25, 0.5, 1.0, math.nan, -1.0]), st.sampled_from([0.0, 0.25, 1.0, 2.5, 8.0, math.nan, math.inf]), st.booleans())
def polled ( ready: int | None, every: float, timeout: float, plain: bool ) -> None:

    checks = [0]

    def check () -> bool:

        checks[0] += 1

        return ready is not None and checks[0] > ready

    async def later () -> bool:

        return check()

    started = clock.now
    found   = settle(tool.poll(check if plain else later, every, timeout))

    if not 0 <= every < math.inf or not 0 <= timeout < math.inf:

        assert refused(found, "func.poll")
        assert checks[0] == 0

        return

    count, spent, landed = 0, 0.0, False

    while True:

        count += 1

        if ready is not None and count > ready: landed = True
        if landed or spent >= timeout: break

        spent += every

    assert checks[0] == count
    assert clock.now - started == spent
    assert found is None if landed else refused(found, "poll", Code.TIMEOUT)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.one_of(st.none(), st.integers(0, 9)), min_size=1, max_size=6), st.sampled_from([0.0, 0.25, 1.5]))
def held ( script: list[int | None], span: float ) -> None:

    calls = [0]

    async def work () -> int:

        calls[0] += 1

        await asyncio.sleep(span)

        return await answer(script[calls[0] - 1] if calls[0] <= len(script) else 0)

    once  = tool.once(work)
    found = [settle(once()) for _ in script]
    lead  = next((index for index, item in enumerate(script) if item is not None), len(script))

    assert all(refused(item, "none", Code.CONFLICT) for item in found[:lead])
    assert found[lead:] == script[lead:lead + 1] * (len(script) - lead)
    assert calls[0] == min(lead + 1, len(script))

    took = run(tool.measure(partial(asyncio.sleep, span)))

    assert took == (None, round(span * 1000, 3))

for part in ("func", "memo", "limiter", "breaker"): vars(sys.modules[f"engine.func.{part}"])["time"] = clock

vars(asyncio)["sleep"] = nap

assert Fault(Code.UNAVAILABLE).retryable()
assert not Fault(Code.NOT_FOUND).retryable()

log.setup("critical")
built()
keyed()
cached()
resolved()
bound()
memoised()
limited()
broken()
retried()
batched()
hedged()
unwrapped()
flowed()
polled()
held()
loop.close()
print(f"fuzz func  examples={EXAMPLES * 14 + len(WILDS) * len(COUNTS) * 6}  ok")
