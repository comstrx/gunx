from engine.error import Code, Fault
from engine.queue import Job
from engine.queue.arch import MAX_BACKOFF, MAX_TIMEOUT, MAX_TRIES
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any

EXAMPLES = 1500
LEAVES   = st.one_of(st.none(), st.booleans(), st.integers(-(1 << 62), 1 << 62), st.floats(allow_nan=False, allow_infinity=False), st.text(max_size=8))
NAMES    = st.one_of(st.text(max_size=12), st.sampled_from(["send", "", "a b", "x" * 129, "a\nb"]), st.none(), st.integers())
RAWS     = st.fixed_dictionaries({}, optional={
    "id": NAMES, "name": NAMES, "payload": st.one_of(st.none(), st.dictionaries(st.text(max_size=4), LEAVES, max_size=3), st.lists(LEAVES, max_size=2), st.text(max_size=4)),
    "queue": NAMES, "tries": st.one_of(st.integers(-2, MAX_TRIES + 2), st.text(max_size=3), st.none(), st.floats()),
    "backoff": st.one_of(st.none(), st.floats(allow_nan=False, allow_infinity=False), st.integers(-2, 20), st.text(max_size=3), st.just(float("nan"))),
    "attempt": st.one_of(st.integers(-2, MAX_TRIES + 2), st.text(max_size=2), st.none()), "unique": NAMES,
    "facts": st.one_of(st.none(), st.dictionaries(st.text(max_size=4), LEAVES, max_size=3), st.lists(LEAVES, max_size=1)),
    "timeout": st.one_of(st.none(), st.floats(allow_nan=False, allow_infinity=False), st.integers(-2, 20), st.text(max_size=3)),
    "available": st.one_of(st.none(), st.sampled_from(["", "2026-11-11T10:00:00Z", "soon", "x" * 70, "2099-01-01T00:00:00Z"]), st.text(max_size=12), st.integers()),
})

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(RAWS)
def loaded ( raw: dict[str, Any] ) -> None:

    made = tried(lambda: Job.load(raw))

    if isinstance(made, Fault):

        assert made.code is Code.INTERNAL
        assert made.reason == "queue.job"
        assert made.errors is not None

        return

    assert isinstance(made, Job)
    assert 1 <= made.tries <= MAX_TRIES and 0 <= made.attempt <= MAX_TRIES
    assert 0 <= made.backoff <= MAX_BACKOFF and 0 <= made.timeout <= MAX_TIMEOUT
    assert Job.load(made.dump()) == made
    assert made.due() == (not made.available or made.available < "2027")

    assert made.exhausted() == (made.attempt + 1 >= made.tries)

    if made.attempt >= MAX_TRIES: return

    again = made.again()
    wait  = min(3600.0, made.backoff * (2 ** made.attempt))

    assert again.attempt == made.attempt + 1 and again.id == made.id
    assert again.due() or wait > 0
    assert not again.due() or wait < 1

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, st.one_of(st.dictionaries(st.text(max_size=4), LEAVES, max_size=3), st.none()), NAMES, st.integers(-1, MAX_TRIES + 1), st.floats(min_value=-1, max_value=MAX_BACKOFF + 1), st.one_of(st.none(), NAMES), st.floats(min_value=-1, max_value=MAX_TIMEOUT + 1), st.floats(min_value=-1, max_value=1e9))
def made_well ( name: Any, payload: Any, queue: Any, tries: int, backoff: float, unique: Any, timeout: float, delay: float ) -> None:

    made = tried(lambda: Job.make(name, payload if payload is not None else {}, queue or "default", tries, backoff, unique, timeout, delay))

    if isinstance(made, Fault):

        assert made.code is Code.INTERNAL
        assert made.reason in ("queue.job", "date.beyond")

        return

    assert made.name == name and made.payload == (payload or {})
    assert made.due() if delay <= 0 else not made.due() if delay >= 1 else True
    assert Job.load(made.dump()) == made

loaded()
made_well()

print(f"fuzz queue  examples={EXAMPLES * 2}  ok")
