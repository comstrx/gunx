from engine.broker import Broker, Memory
from engine.error import Code, Fault
from engine.event import Event, Events
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any
import asyncio, fnmatch

EXAMPLES = 1000
LEAVES   = st.one_of(st.none(), st.booleans(), st.integers(-(1 << 62), 1 << 62), st.floats(allow_nan=False, allow_infinity=False), st.text(max_size=8))
NAMES    = st.one_of(st.text(max_size=16), st.sampled_from(["orders.placed", "orders.*", "a.b.c", "", "noname", "a b", "x" * 129]), st.none(), st.integers())
RAWS     = st.fixed_dictionaries({}, optional={
    "name": NAMES, "data": st.one_of(st.none(), st.dictionaries(st.text(max_size=4), LEAVES, max_size=3), st.lists(LEAVES, max_size=2)),
    "id": NAMES, "at": NAMES, "actor": NAMES, "tenant": NAMES, "source": NAMES, "version": st.one_of(st.integers(-2, 5), st.text(max_size=2), st.none()),
    "extra": LEAVES,
})

loop   = asyncio.new_event_loop()
bus    = Broker()
events = Events()
seen: list[str] = []

bus.setup(Memory())
events.setup("fuzz", bus)

async def on_any ( event: Event ) -> None: seen.append(event.name)

events.listen("orders.*", on_any)
events.listen("*.placed", on_any)

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

def run ( work: Any ) -> Any:

    try: return loop.run_until_complete(work)
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(RAWS)
def loaded ( raw: dict[str, Any] ) -> None:

    made = tried(lambda: Event.load(raw))

    if isinstance(made, Fault):

        assert made.code in (Code.VALIDATION, Code.BAD_REQUEST)

        return

    assert isinstance(made, Event)
    assert Event.load(made.dump()) == made
    assert "extra" not in made.dump()

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, st.dictionaries(st.sampled_from(["id", "total", "note"]), LEAVES, max_size=3))
def dispatched ( name: Any, data: dict[str, Any] ) -> None:

    before = len(seen)
    made   = run(events.dispatch(name, **data))

    if isinstance(made, Fault):

        assert (made.code, made.reason) == (Code.INTERNAL, "event.name")
        assert type(name) is not str or "." not in name or not name.isprintable() or " " in name or not 0 < len(name) <= 128
        assert len(seen) == before

        return

    assert made.name == name and made.data == data and made.source == "fuzz"
    assert len(seen) - before == sum(fnmatch.fnmatchcase(name, pattern) for pattern in ("orders.*", "*.placed"))

loaded()
dispatched()

loop.close()

print(f"fuzz event  examples={EXAMPLES * 2}  ok")
