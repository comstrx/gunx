from engine.context import context, Deferral, Report
from engine.error import Code, Fault
from collections.abc import Awaitable, Callable, Mapping
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any
import asyncio

type Spec = tuple[int, bool, list[Spec]]
type Step = tuple[int, dict[str, Any], list[Step]]
type Path = tuple[int, ...]

EXAMPLES = 1000
SHARED   = ("request_id", "actor", "tenant", "locale", "trace")
LIMIT    = 1024
WIDE     = 256
NAME     = 64
FLAT     = 16
BOOM     = 1
LATE     = 2
FORGET   = 3
MARK     = object()
PROBED   = ("request_id", "locale", "actor", "job", "missing")
LEAF     = st.one_of(st.none(), st.booleans(), st.integers(), st.floats(), st.text(max_size=12), st.sampled_from(["w" * WIDE, "w" * (WIDE + 1)]), st.binary(max_size=4))
NAMES    = st.one_of(st.text(max_size=5), st.sampled_from(["n" * NAME, "n" * (NAME + 1)]), st.integers(0, 9))
WILD: st.SearchStrategy[Any] = st.recursive(LEAF, lambda inner: st.one_of(st.lists(inner, max_size=3), st.tuples(inner), st.dictionaries(NAMES, inner, max_size=20)), max_leaves=24)
KEYS     = st.one_of(st.sampled_from([*SHARED, "password", "job", "Actor"]), st.text(max_size=6))
SCALAR   = st.one_of(st.booleans(), st.integers(), st.floats(), st.text(max_size=4), st.sampled_from(["w" * WIDE, "w" * (WIDE + 1)]))
EDGE     = st.dictionaries(st.text("abcdef", min_size=1, max_size=3), st.integers(0, 9), min_size=FLAT - 1, max_size=FLAT + 1)
NAMED    = st.dictionaries(st.sampled_from(["id", "n" * NAME, "n" * (NAME + 1)]), SCALAR, max_size=3)
FACTS    = st.dictionaries(KEYS, st.one_of(WILD, EDGE, NAMED, SCALAR), max_size=8)
FIELDS   = st.dictionaries(st.sampled_from([*SHARED, "job", "a", "b"]), st.one_of(st.none(), st.integers(), st.text(max_size=6)), max_size=4)
STEPS: st.SearchStrategy[list[Step]] = st.recursive(st.just([]), lambda inner: st.lists(st.tuples(st.integers(0, 3), FIELDS, inner), max_size=3), max_leaves=10)
SPEC: st.SearchStrategy[Spec] = st.recursive(st.tuples(st.integers(0, 3), st.booleans(), st.just([])), lambda inner: st.tuples(st.integers(0, 3), st.booleans(), st.lists(inner, max_size=3)), max_leaves=12)
SPECS    = st.lists(SPEC, max_size=6)
FLATS    = st.lists(st.tuples(st.booleans(), st.booleans()), min_size=1, max_size=10)
loop     = asyncio.new_event_loop()

def tried [T] ( work: Callable[[], T] ) -> T | Fault:

    try: return work()
    except Fault as fault: return fault

def nothing () -> None: return None

def plain ( value: object ) -> bool:

    if isinstance(value, str): return len(value) <= WIDE

    return isinstance(value, int | float)

def sound ( value: object ) -> bool:

    if not isinstance(value, Mapping): return plain(value)

    return len(value) <= FLAT and all(isinstance(name, str) and len(name) <= NAME and plain(item) for name, item in value.items())

def settle ( deferral: Deferral, report: Report | None, failed: bool ) -> int | BaseException:

    try: return loop.run_until_complete(deferral.flush(report, failed))
    except (ExceptionGroup, asyncio.CancelledError) as error: return error

def check ( facts: dict[str, Any], deferral: Deferral | None ) -> None:

    assert context.snapshot() == facts
    assert context.facts() == facts
    assert context.dump() == { key: value for key, value in facts.items() if key in SHARED }
    assert context.deferred() is deferral
    assert context.defer(nothing) is (deferral is not None)
    assert context.request_id() == (str(facts["request_id"]) if facts.get("request_id") else None)
    assert context.locale("xx") == str(facts.get("locale") or "xx")
    assert context.actor() is facts.get("actor")

    for name in PROBED:

        found = tried(partial(context.need, name))

        assert context.has(name) is (name in facts)
        assert context.get(name, MARK) is facts.get(name, MARK)

        if name in facts:

            assert found is facts[name]

            continue

        assert isinstance(found, Fault)
        assert found.code is Code.INTERNAL
        assert found.reason == f"context.{name}"

def put ( fields: dict[str, Any], inner: list[Step], merged: dict[str, Any], outer: Deferral | None ) -> None:

    token = context.put(**fields)

    check(merged, outer)
    walk(inner, merged, outer)
    context.reset(token)

def opened ( fields: dict[str, Any], inner: list[Step], merged: dict[str, Any], outer: Deferral | None ) -> None:

    held  = context.open(**fields)
    fresh = context.deferred()

    assert fresh is not None
    assert fresh is not outer
    assert fresh.pending() == 0

    check(merged, fresh)
    walk(inner, merged, fresh)

    assert context.deferred() is fresh

    context.close(held)

def scoped ( fields: dict[str, Any], inner: list[Step], merged: dict[str, Any], outer: Deferral | None ) -> None:

    with context.scope(**fields) as deferral:

        assert deferral is not outer
        assert deferral.pending() == 0

        check(merged, deferral)
        walk(inner, merged, deferral)

WAYS = (put, opened, scoped)

def walk ( steps: list[Step], base: dict[str, Any], outer: Deferral | None ) -> None:

    for kind, fields, inner in steps:

        if kind == FORGET:

            kept = { key: value for key, value in base.items() if key not in fields }

            assert context.forget(*fields) == len(base) - len(kept)

            base = kept

        else: WAYS[kind](fields, inner, { **base, **fields }, outer)

        check(base, outer)

def build ( spec: Spec, deferral: Deferral, trace: list[Path], path: Path ) -> Callable[[], Awaitable[None] | None]:

    kind, _, children = spec

    def body () -> None:

        trace.append(path)

        for at, child in enumerate(children): deferral.add(build(child, deferral, trace, (*path, at)), always=child[1])

        if kind & BOOM: raise ValueError(path)

    async def later () -> None: body()

    return later if kind & LATE else body

def expect ( specs: list[Spec], failed: bool ) -> tuple[list[Path], int]:

    trace: list[Path] = []
    booms = 0
    level: list[tuple[Path, Spec]] = [((at,), spec) for at, spec in enumerate(specs)]

    while level:

        after: list[tuple[Path, Spec]] = []

        for path, (kind, always, children) in level:

            if failed and not always: continue

            trace.append(path)

            booms += kind & BOOM
            after += [((*path, at), child) for at, child in enumerate(children)]

        level = after

    return trace, booms

def step ( trace: list[int], index: int, boom: bool, stop: bool ) -> None:

    trace.append(index)

    if stop: raise asyncio.CancelledError
    if boom: raise ValueError(index)

def chain ( deferral: Deferral, left: list[int] ) -> None:

    left[0] -= 1

    if left[0] > 0: deferral.add(partial(chain, deferral, left), always=True)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(FACTS)
def wire_facts_load_bounded ( facts: dict[str, Any] ) -> None:

    expected = { key: facts[key] for key in SHARED if key in facts and sound(facts[key]) }

    context.load(facts)

    held = context.snapshot()

    assert held == expected
    assert list(held) == list(expected)
    assert context.dump() == held

    for key, value in held.items():

        assert (value is facts[key]) is (not isinstance(value, dict))

    context.load(held)

    assert context.snapshot() == held

    context.clear()

    assert context.snapshot() == {}
    assert context.deferred() is None

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(STEPS)
def nested_facts_restore_exactly ( steps: list[Step] ) -> None:

    context.clear()

    assert context.defer(nothing) is False

    walk(steps, {}, None)
    context.clear()

    assert context.snapshot() == {}
    assert context.deferred() is None

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SPECS, st.booleans(), st.booleans())
def deferred_work_runs_like_the_model ( specs: list[Spec], failed: bool, told: bool ) -> None:

    deferral = Deferral()
    trace: list[Path] = []
    errors: list[Exception] = []

    for at, spec in enumerate(specs): deferral.add(build(spec, deferral, trace, (at,)), always=spec[1])

    order, booms = expect(specs, failed)
    result       = settle(deferral, errors.append if told else None, failed)

    assert trace == order
    assert deferral.pending() == 0

    if isinstance(result, ExceptionGroup): errors = list(result.exceptions)
    else: assert result == len(order)

    assert isinstance(result, ExceptionGroup) is (booms > 0 and not told)
    assert len(errors) == booms
    assert all(isinstance(error, ValueError) for error in errors)
    assert settle(deferral, None, failed) == 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(FLATS, st.integers(0, 99), st.booleans())
def a_cancelled_flush_keeps_the_rest ( items: list[tuple[bool, bool]], at: int, failed: bool ) -> None:

    stop     = at % len(items)
    deferral = Deferral()
    trace: list[int] = []
    errors: list[Exception] = []
    runs     = [index for index, (_, always) in enumerate(items) if always or not failed]

    for index, (boom, always) in enumerate(items): deferral.add(partial(step, trace, index, boom, index == stop), always=always)

    first = settle(deferral, errors.append, failed)

    if stop in runs:

        assert isinstance(first, asyncio.CancelledError)
        assert deferral.pending() == len(items) - stop - 1
        assert trace == [index for index in runs if index <= stop]
        assert settle(deferral, errors.append, failed) == len([index for index in runs if index > stop])

    else: assert first == len(runs)

    assert trace == runs
    assert deferral.pending() == 0
    assert len(errors) == sum(1 for index in runs if items[index][0] and index != stop)

@settings(max_examples=EXAMPLES // 10, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(LIMIT - 24, LIMIT + 24), st.integers(LIMIT - 8, LIMIT + 8))
def the_bounds_hold ( length: int, width: int ) -> None:

    deferral = Deferral()
    errors: list[Exception] = []
    left     = [length]

    deferral.add(partial(chain, deferral, left), always=True)

    assert settle(deferral, errors.append, failed=False) == min(length, LIMIT)
    assert deferral.pending() == 0
    assert len(errors) == int(length > LIMIT)

    for error in errors:

        assert isinstance(error, Fault)
        assert error.reason == "context.loop"

    refused = [found for found in (tried(partial(deferral.add, nothing)) for _ in range(width)) if isinstance(found, Fault)]

    assert deferral.pending() == min(width, LIMIT)
    assert len(refused) == max(0, width - LIMIT)
    assert all(found.reason == "context.full" for found in refused)
    assert deferral.clear() == min(width, LIMIT)

wire_facts_load_bounded()
nested_facts_restore_exactly()
deferred_work_runs_like_the_model()
a_cancelled_flush_keeps_the_rest()
the_bounds_hold()
loop.close()

print(f"fuzz context  examples={EXAMPLES * 4 + EXAMPLES // 10}  ok")
