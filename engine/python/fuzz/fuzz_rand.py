from collections import Counter
from collections.abc import Callable
from itertools import pairwise
from functools import partial
from typing import Any

from engine.error import Code, Fault
from engine.rand import Rand
from hypothesis import given, settings, strategies as st
import math, pytest, time

EXAMPLES  = 3000
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MILLI     = 1_000_000
SIZES     = st.one_of(st.integers(min_value=-4, max_value=80), st.integers(min_value=4000, max_value=4200), st.integers())
WILD      = st.text(st.characters(exclude_categories=()), max_size=24)
SEEDS     = st.one_of(st.none(), st.integers(), WILD)
STEPS     = st.lists(st.integers(min_value=-5_000_000_000, max_value=5_000_000_000), min_size=1, max_size=40)
WEIGHTS   = st.lists(st.one_of(st.floats(), st.floats(min_value=0, max_value=1e6), st.just(0.0)), max_size=12)

def refused ( call: Callable[[], object], reason: str ) -> None:

    with pytest.raises(Fault) as caught: call()

    assert caught.value.code is Code.INTERNAL
    assert caught.value.reason == reason

def decode ( ulid: str ) -> int:

    value = 0

    for letter in ulid: value = value << 5 | CROCKFORD.index(letter)

    return value

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(SIZES, SEEDS, WILD)
def sizes_are_exact_or_refused ( size: int, seed: int | str | None, alphabet: str ) -> None:

    owner = Rand(seed)
    sized: tuple[Callable[[int], object], ...] = (owner.bytes, owner.hex, owner.quick, owner.token)

    if 0 < size <= 4096:

        assert len(owner.bytes(size)) == size
        assert len(owner.hex(size)) == size * 2 == len(owner.quick(size))
        assert len(owner.token(size)) == -(-size * 4 // 3)
        assert len(owner.reference(size)) == size

    else:

        for call in sized: refused(partial(call, size), "rand.size")

        refused(lambda: owner.reference(size), "rand.length")

    if 0 < size <= 4096 and alphabet:

        made = owner.string(size, alphabet)

        assert len(made) == size and set(made) <= set(alphabet)

    else: refused(lambda: owner.string(size, alphabet), "rand.length")

    if 4 <= size <= 12:

        made = owner.code(size)

        assert len(made) == size and made.isascii() and made.isdigit()

    else: refused(lambda: owner.code(size), "rand.digits")

    if 8 <= size <= 4096:

        made = owner.password(size)

        assert len(made) == size
        assert any(char.islower() for char in made) and any(char.isupper() for char in made)
        assert any(char.isdigit() for char in made) and any(char in "!@#$%^&*-_=+?" for char in made)

    else: refused(lambda: owner.password(size), "rand.length")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.one_of(st.integers(), WILD), st.lists(st.integers(), max_size=30), st.integers(min_value=-2, max_value=40))
def seeded_draws_repeat ( seed: int | str, items: list[int], count: int ) -> None:

    first, second = Rand(seed), Rand(seed)

    assert first.shuffle(items) == second.shuffle(items)
    assert first.number() == second.number()
    assert first.token(9) == second.token(9)
    assert first.uuid() == second.uuid()
    assert first.string(12) == second.string(12)
    assert first.code(6) == second.code(6)
    assert first.quick(5) == second.quick(5)
    assert first.password(12) == second.password(12)
    assert first.bytes(7) == second.bytes(7)
    assert first.bits(77) == second.bits(77)
    assert first.below(9999) == second.below(9999)
    assert first.uniform(-100, 100) == second.uniform(-100, 100)
    assert first.choices("abcd", 20, weights=[0, 1, 2, 3]) == second.choices("abcd", 20, weights=[0, 1, 2, 3])

    if 0 <= count <= len(items): assert first.sample(items, count) == second.sample(items, count)
    else: refused(lambda: first.sample(items, count), "rand.sample")

    if items: assert first.choice(items) == second.choice(items)
    else: refused(lambda: first.choice(items), "rand.empty")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(SEEDS, st.lists(st.integers(), max_size=30), st.integers(min_value=-2, max_value=40))
def picks_stay_inside ( seed: int | str | None, items: list[int], count: int ) -> None:

    owner = Rand(seed)
    held = list(items)
    mixed = owner.shuffle(items)

    assert Counter(mixed) == Counter(items) and items == held and mixed is not items
    assert 0.0 <= owner.number() < 1.0

    if 0 <= count <= len(items):

        sample = owner.sample(items, count)

        assert len(sample) == count and not Counter(sample) - Counter(items)

    else: refused(lambda: owner.sample(items, count), "rand.sample")

    if count < 0: refused(lambda: owner.choices(items, count), "rand.sample")
    elif not items and count: refused(lambda: owner.choices(items, count), "rand.empty")
    else:

        chosen = owner.choices(items, count)

        assert len(chosen) == count and all(item in items for item in chosen)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(SEEDS, WEIGHTS)
def weights_are_validated ( seed: int | str | None, weights: list[float] ) -> None:

    owner = Rand(seed)
    items = range(len(weights))
    total = sum(weights)
    valid = bool(weights) and all(math.isfinite(value) and value >= 0 for value in weights) and 0 < total < math.inf

    if valid:

        assert weights[owner.weighted(items, weights)] > 0
        assert all(weights[index] > 0 for index in owner.choices(items, 10, weights=weights))

    else:

        refused(lambda: owner.weighted(items, weights), "rand.weight")
        refused(lambda: owner.choices(items, 0, weights=weights), "rand.weight")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(SEEDS, STEPS)
def ids_follow_the_clock_and_never_go_back ( seed: int | str | None, steps: list[int] ) -> None:

    owner = Rand(seed)
    real = time.time_ns
    clock = [1_700_000_000_000_000_000]
    sevens: list[int] = []
    ulids: list[str] = []
    peak = 0

    time.time_ns = lambda: clock[0]

    try:

        for step in steps:

            clock[0] += step
            peak = max(peak, clock[0] // MILLI)

            seven, ulid = owner.uuid7(), owner.ulid()
            sevens.append(seven.int)
            ulids.append(ulid)

            assert seven.int >> 80 == peak == decode(ulid) >> 80
            assert seven.version == 7 and seven.variant == "specified in RFC 4122"
            assert len(ulid) == 26 and ulid[0] <= "7"

    finally: time.time_ns = real

    assert all(left < right for left, right in pairwise(sevens))
    assert all(left < right for left, right in pairwise(ulids))

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.one_of(st.binary(max_size=40), WILD, st.text(st.characters(max_codepoint=127), max_size=40)), st.one_of(st.binary(max_size=40), WILD, st.text(st.characters(max_codepoint=127), max_size=40)))
def constant_equal_agrees ( left: bytes | str, right: bytes | str ) -> None:

    a = left.encode("utf-8", "surrogatepass") if isinstance(left, str) else left
    b = right.encode("utf-8", "surrogatepass") if isinstance(right, str) else right

    assert Rand().constant_equal(left, right) == (a == b)
    assert Rand().constant_equal(left, left)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(), st.integers(), st.integers(min_value=-2, max_value=100), SEEDS)
def integers_respect_steps ( low: int, high: int, step: int, seed: int | str | None ) -> None:

    owner = Rand(seed)

    if low <= high and step > 0:

        made = owner.integer(low, high, step)

        assert low <= made <= high and (made - low) % step == 0

    else: refused(lambda: owner.integer(low, high, step), "rand.range")

    if high > 0: assert 0 <= owner.below(high) < high
    else: refused(lambda: owner.below(high), "rand.range")

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.floats(allow_nan=False, allow_infinity=False), st.floats(allow_nan=False, allow_infinity=False), SEEDS)
def uniform_stays_finite ( low: float, high: float, seed: int | str | None ) -> None:

    owner = Rand(seed)

    if low > high: refused(lambda: owner.uniform(low, high), "rand.range")
    elif low == high: assert owner.uniform(low, high) == low
    else:

        made = owner.uniform(low, high)

        assert math.isfinite(made) and low <= made < high

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.lists(st.integers(min_value=0, max_value=12), max_size=12), st.integers(min_value=-2, max_value=30), SEEDS)
def counts_match_a_real_population ( counts: list[int], count: int, seed: int | str | None ) -> None:

    owner = Rand(seed)
    items = list(range(len(counts)))
    held = list(counts)

    if 0 <= count <= sum(counts):

        made = owner.sample(items, count, counts=counts)

        assert len(made) == count
        assert all(amount <= counts[index] for index, amount in Counter(made).items())

    else: refused(lambda: owner.sample(items, count, counts=counts), "rand.sample")

    assert counts == held

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.one_of(st.none(), st.booleans(), st.text(), st.lists(st.integers(), max_size=3), st.floats()), SEEDS)
def invalid_types_never_escape ( value: Any, seed: int | str | None ) -> None:

    owner = Rand(seed)

    refused(lambda: owner.bytes(value), "rand.size")
    refused(lambda: owner.quick(value), "rand.size")
    refused(lambda: owner.string(value), "rand.length")
    refused(lambda: owner.password(value), "rand.length")
    refused(lambda: owner.bits(value), "rand.bits")
    refused(lambda: owner.below(value), "rand.range")
    refused(lambda: owner.sample([1], value), "rand.sample")


@settings(max_examples=1000, deadline=None, database=None)
@given(st.lists(st.integers(), min_size=1, max_size=300), st.integers(0, 100))
def secure_bulk_choices_preserve_population ( population: list[int], count: int ) -> None:

    held = list(population)
    found = Rand().choices(population, count)

    assert len(found) == count and all(item in held for item in found)
    assert population == held

secure_bulk_choices_preserve_population()

sizes_are_exact_or_refused()
seeded_draws_repeat()
picks_stay_inside()
weights_are_validated()
ids_follow_the_clock_and_never_go_back()
constant_equal_agrees()
integers_respect_steps()
uniform_stays_finite()
counts_match_a_real_population()
invalid_types_never_escape()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(), st.integers(min_value=16, max_value=64))
def secure_draws_ignore_the_seed ( seed: int, size: int ) -> None:

    first, second = Rand(seed), Rand(seed)
    assert first.bytes(size, secure=True) != second.bytes(size, secure=True)
    assert first.bytes(size) == second.bytes(size)

secure_draws_ignore_the_seed()

print("fuzz rand  properties=12  max_examples=per-property settings  ok")
