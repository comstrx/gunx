from engine.error import Fault
from engine.rand import Rand
from hypothesis import HealthCheck, given, settings, strategies as st
from collections import Counter
from contextlib import suppress
import time

EXAMPLES  = 2500
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MILLI     = 1_000_000
SIZES     = st.one_of(st.integers(min_value=-4, max_value=80), st.integers(min_value=4000, max_value=4200), st.integers())
WILD      = st.text(st.characters(exclude_categories=()), max_size=24)
SEEDS     = st.one_of(st.none(), st.integers(), WILD)
STEPS     = st.lists(st.integers(min_value=-5_000_000_000, max_value=5_000_000_000), min_size=1, max_size=40)
WEIGHTS   = st.lists(st.one_of(st.floats(), st.floats(min_value=0, max_value=1e6), st.just(0.0)), max_size=12)

def source ( seed: int | str | None ) -> Rand:

    rand = Rand()

    rand.seed(seed)

    return rand

def decode ( ulid: str ) -> int:

    value = 0

    for letter in ulid: value = value << 5 | CROCKFORD.index(letter)

    return value

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SIZES, SEEDS, WILD)
def sizes_are_exact_or_refused ( size: int, seed: int | str | None, alphabet: str ) -> None:

    rand = source(seed)

    with suppress(Fault): assert len(rand.bytes(size)) == size
    with suppress(Fault): assert len(rand.hex(size)) == size * 2
    with suppress(Fault): assert len(rand.quick(size)) == size * 2
    with suppress(Fault): assert len(rand.token(size)) == -(-size * 4 // 3)
    with suppress(Fault): assert len(rand.code(size)) == size
    with suppress(Fault): assert rand.code(size).isdigit()
    with suppress(Fault): assert len(rand.reference(size)) == size
    with suppress(Fault): assert len(rand.password(size)) == size

    with suppress(Fault):

        made = rand.string(size, alphabet)

        assert len(made) == size
        assert set(made) <= set(alphabet)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.integers(), WILD), st.lists(st.integers(), max_size=30), st.integers(min_value=-2, max_value=40))
def seeded_draws_repeat ( seed: int | str, items: list[int], count: int ) -> None:

    first, second = source(seed), source(seed)

    assert first.shuffle(items) == second.shuffle(items)
    assert first.number() == second.number()
    assert first.token(9) == second.token(9)
    assert first.uuid() == second.uuid()
    assert first.string(12) == second.string(12)
    assert first.code(6) == second.code(6)
    assert first.quick(5) == second.quick(5)
    assert first.password(12) == second.password(12)
    assert first.bytes(7) == second.bytes(7)

    with suppress(Fault): assert first.sample(items, count) == second.sample(items, count)
    with suppress(Fault): assert first.choice(items) == second.choice(items)
    with suppress(Fault): assert first.integer(count, 9) == second.integer(count, 9)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, st.lists(st.integers(), max_size=30), st.integers(min_value=-2, max_value=40), WEIGHTS, st.integers(), st.integers())
def picks_stay_inside ( seed: int | str | None, items: list[int], count: int, weights: list[float], low: int, high: int ) -> None:

    rand  = source(seed)
    held  = list(items)
    mixed = rand.shuffle(items)

    assert Counter(mixed) == Counter(items)
    assert items == held
    assert mixed is not items

    with suppress(Fault): assert not Counter(rand.sample(items, count)) - Counter(items)
    with suppress(Fault): assert len(rand.sample(items, count)) == count
    with suppress(Fault): assert rand.choice(items) in items
    with suppress(Fault): assert low <= rand.integer(low, high) <= high

    with suppress(Fault):

        index = rand.weighted(range(len(weights)), weights)

        assert weights[index] > 0

    assert 0.0 <= rand.number() < 1.0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, STEPS)
def ids_follow_the_clock_and_never_go_back ( seed: int | str | None, steps: list[int] ) -> None:

    rand   = source(seed)
    real   = time.time_ns
    clock  = [1_700_000_000_000_000_000]
    sevens = []
    ulids  = []
    peak   = 0

    time.time_ns = lambda: clock[0]

    try:

        for step in steps:

            clock[0] += step
            peak      = max(peak, clock[0] // MILLI)

            sevens.append(rand.uuid7())
            ulids.append(rand.ulid())

            assert sevens[-1].int >> 80 == peak == decode(ulids[-1]) >> 80
            assert sevens[-1].version == 7
            assert sevens[-1].variant == "specified in RFC 4122"
            assert len(ulids[-1]) == 26

    finally: time.time_ns = real

    assert sevens == sorted(set(sevens))
    assert ulids == sorted(set(ulids))
    assert [str(made) for made in sevens] == sorted(str(made) for made in sevens)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.binary(max_size=40), WILD), st.one_of(st.binary(max_size=40), WILD))
def constant_equal_agrees ( left: bytes | str, right: bytes | str ) -> None:

    a = left.encode("utf-8", "surrogatepass") if isinstance(left, str) else left
    b = right.encode("utf-8", "surrogatepass") if isinstance(right, str) else right

    assert Rand().constant_equal(left, right) == (a == b)
    assert Rand().constant_equal(left, left)

sizes_are_exact_or_refused()
seeded_draws_repeat()
picks_stay_inside()
ids_follow_the_clock_and_never_go_back()
constant_equal_agrees()

print(f"fuzz rand  examples={EXAMPLES * 5}  ok")
