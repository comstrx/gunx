from collections import Counter
from collections.abc import Callable
from itertools import pairwise
from functools import partial
from concurrent.futures import ThreadPoolExecutor
from typing import Any, cast

from engine.error import Code, Fault
from engine.rand import Rand, Uuid, rand
import base64, math, multiprocessing, os, pytest, select, signal, string, sys, time, tracemalloc

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
URLSAFE   = set(string.ascii_letters + string.digits + "-_")
SYMBOLS   = set("!@#$%^&*-_=+?")
WIDE      = "".join(chr(point) for point in range(0x400, 0x400 + 300))
HOSTILE: tuple[tuple[str, Callable[[], object]], ...] = (
    ("rand.size", lambda: rand.bytes(0)),
    ("rand.size", lambda: rand.bytes(-1)),
    ("rand.size", lambda: rand.bytes(4097)),
    ("rand.size", lambda: rand.hex(0)),
    ("rand.size", lambda: rand.hex(10 ** 9)),
    ("rand.size", lambda: rand.quick(0)),
    ("rand.size", lambda: rand.quick(4097)),
    ("rand.size", lambda: rand.token(0)),
    ("rand.size", lambda: rand.token(-8)),
    ("rand.size", lambda: rand.token(10 ** 12)),
    ("rand.length", lambda: rand.string(0)),
    ("rand.length", lambda: rand.string(-3)),
    ("rand.length", lambda: rand.string(4097)),
    ("rand.length", lambda: rand.string(8, "")),
    ("rand.length", lambda: rand.reference(0)),
    ("rand.length", lambda: rand.reference(10 ** 9)),
    ("rand.length", lambda: rand.password(7)),
    ("rand.length", lambda: rand.password(4097)),
    ("rand.digits", lambda: rand.code(3)),
    ("rand.digits", lambda: rand.code(13)),
    ("rand.digits", lambda: rand.code(-1)),
    ("rand.digits", lambda: rand.code(cast("Any", "6"))),
    ("rand.digits", lambda: rand.code(cast("Any", 6.0))),
    ("rand.range", lambda: rand.integer(3, 1)),
    ("rand.empty", lambda: rand.choice([])),
    ("rand.empty", lambda: rand.choice("")),
    ("rand.weight", lambda: rand.weighted([], [])),
    ("rand.weight", lambda: rand.weighted([1], [])),
    ("rand.weight", lambda: rand.weighted([1, 2], [1.0])),
    ("rand.weight", lambda: rand.weighted([1], [-1.0])),
    ("rand.weight", lambda: rand.weighted([1], [float("nan")])),
    ("rand.weight", lambda: rand.weighted([1], [float("inf")])),
    ("rand.weight", lambda: rand.weighted([1, 2], [0.0, 0.0])),
    ("rand.weight", lambda: rand.weighted([1, 2], [1e308, 1e308])),
    ("rand.sample", lambda: rand.sample([1], 2)),
    ("rand.sample", lambda: rand.sample([1], -1)),
)

def decode ( ulid: str ) -> int:

    value = 0

    for letter in ulid: value = value << 5 | CROCKFORD.index(letter)

    return value

def test_hostile_input_is_refused_as_faults () -> None:

    seeded = Rand()

    seeded.seed(1)

    for reason, call in HOSTILE:

        with pytest.raises(Fault) as caught: call()

        assert caught.value.code is Code.INTERNAL and caught.value.reason == reason

    for call in (lambda: seeded.token(0), lambda: seeded.token(-1), lambda: seeded.sample([1], -1), lambda: seeded.string(4097), lambda: seeded.weighted([1], [0.0])):

        with pytest.raises(Fault): call()

def test_tokens_strings_and_codes_keep_their_shape () -> None:

    seeded = Rand()

    seeded.seed("shape")

    for size in (1, 2, 3, 16, 32, 33, 4096):

        made = rand.token(size)

        assert len(made) == math.ceil(size * 4 / 3) == len(seeded.token(size)) and set(made) <= URLSAFE
        assert len(base64.urlsafe_b64decode(made + "=" * (-len(made) % 4))) == size
        assert len(rand.bytes(size)) == size and len(rand.hex(size)) == size * 2 == len(rand.quick(size))

    assert len({ rand.token(16) for _ in range(20000) }) == 20000 and len({ rand.hex(8) for _ in range(20000) }) == 20000
    assert len(rand.string(4096)) == 4096 and set(rand.string(4096)) <= set(string.ascii_lowercase + string.digits)
    assert set(rand.string(2000, "ab")) == { "a", "b" } and rand.string(9, "z") == "z" * 9
    assert len(rand.string(500, WIDE)) == 500 and set(rand.string(500, WIDE)) <= set(WIDE) and len(set(rand.string(4000, WIDE))) > 250
    assert len(rand.reference()) == 8 and set(rand.reference(400)) <= set("23456789ABCDEFGHJKLMNPQRSTUVWXYZ")

    for digits in range(4, 13):

        made = rand.code(digits)

        assert len(made) == digits and made.isascii() and made.isdigit()

    assert any(rand.code(4).startswith("0") for _ in range(2000))

    for length in (8, 9, 20, 64, 4096):

        made = rand.password(length)

        assert len(made) == length and len(seeded.password(length)) == length
        assert set(made) & set(string.ascii_lowercase) and set(made) & set(string.ascii_uppercase)
        assert set(made) & set(string.digits) and set(made) & SYMBOLS

    assert all(set(rand.password(8)) & SYMBOLS and set(rand.password(8)) & set(string.digits) for _ in range(500))

def test_draws_are_uniform () -> None:

    counted = Counter("".join(rand.string(4000, "abc") for _ in range(15)))
    digits  = Counter("".join(rand.code(12) for _ in range(5000)))
    decks   = Counter(tuple(rand.shuffle([1, 2, 3])) for _ in range(60000))
    sides   = Counter(rand.integer(-1, 1) for _ in range(30000))
    picks   = Counter(rand.choice("abcd") for _ in range(40000))
    heavy   = Counter(rand.weighted("abc", [3.0, 1.0, 0.0]) for _ in range(40000))

    assert len(counted) == 3 and all(abs(count - 20000) < 700 for count in counted.values())
    assert len(digits) == 10 and all(abs(count - 6000) < 450 for count in digits.values())
    assert len(decks) == 6 and all(abs(count - 10000) < 550 for count in decks.values())
    assert len(sides) == 3 and all(abs(count - 10000) < 500 for count in sides.values())
    assert len(picks) == 4 and all(abs(count - 10000) < 550 for count in picks.values())
    assert "c" not in heavy and abs(heavy["a"] - 30000) < 550 and rand.weighted(["only"], [0.5]) == "only"
    assert { rand.weighted("xy", [5e-324, 0.0]) for _ in range(200) } == { "x" } == { rand.weighted("yx", [0.0, 5e-324]) for _ in range(200) }
    assert { rand.weighted("abc", [0, 2, 0]) for _ in range(200) } == { "b" } and rand.weighted((1, 2), (1e308, 1e307)) in (1, 2)
    assert 0.47 < sum(rand.number() for _ in range(20000)) / 20000 < 0.53 and all(0.0 <= rand.number() < 1.0 for _ in range(2000))
    assert rand.chance(1.0) and not rand.chance(0.0) and not rand.chance(float("nan"))

def test_picks_samples_and_shuffles () -> None:

    deck = list(range(200))
    held = tuple(deck)

    assert rand.integer(5, 5) == 5 and -(10 ** 30) <= rand.integer(-(10 ** 30), 10 ** 30) <= 10 ** 30
    assert { rand.integer(1, 3) for _ in range(400) } == { 1, 2, 3 }
    assert rand.choice([5]) == 5 and rand.choice("x") == "x" and rand.choice((1, 2)) in (1, 2)
    assert rand.sample(deck, 0) == [] and sorted(rand.sample(deck, 200)) == deck and len(set(rand.sample(deck, 50))) == 50
    assert rand.shuffle([]) == [] and rand.shuffle([7]) == [7] and sorted(rand.shuffle("cab")) == ["a", "b", "c"]

    mixed = rand.shuffle(deck)

    assert sorted(mixed) == deck and mixed != deck and tuple(deck) == held and mixed is not deck
    assert sorted(rand.shuffle(held)) == deck and len({ tuple(rand.shuffle(deck)) for _ in range(50) }) == 50
    assert sorted(rand.shuffle(range(5000))) == list(range(5000))

def test_ids_are_ordered_and_well_formed ( monkeypatch: pytest.MonkeyPatch ) -> None:

    seeded = Rand()

    seeded.seed(9)

    for source in (rand, seeded):

        sevens = [source.uuid7() for _ in range(50000)]
        ulids  = [source.ulid() for _ in range(50000)]
        now    = time.time_ns() // 1_000_000

        assert all(first < second for first, second in pairwise(sevens))
        assert all(first < second for first, second in pairwise(ulids))
        assert all(made.version == 7 and made.variant == "specified in RFC 4122" for made in sevens[::97])
        assert all(len(made) == 26 and set(made) <= set(CROCKFORD) and made[0] <= "7" for made in ulids[::97])
        assert all(abs((made.int >> 80) - now) < 5000 for made in sevens[::997])
        assert all(abs((decode(made) >> 80) - now) < 5000 for made in ulids[::997])
        assert sorted(str(made) for made in sevens) == [str(made) for made in sevens]
        assert source.uuid().version == 4 and isinstance(source.uuid(), Uuid) and source.uuid() != source.uuid()

    still = time.time_ns()

    monkeypatch.setattr(time, "time_ns", lambda: still)

    for source in (rand, seeded):

        sevens = [source.uuid7() for _ in range(20000)]
        ulids  = [source.ulid() for _ in range(20000)]
        steps  = [decode(second) - decode(first) for first, second in pairwise(ulids)]

        assert all(first < second for first, second in pairwise(sevens))
        assert min(steps) >= 1 and len(set(steps)) > 19000 and max(steps) <= 1 << 32
        assert len({ made.int & 0xFFFFFFFF for made in sevens }) > 19000
        assert { made.int >> 80 for made in sevens } == { still // 1_000_000 } == { decode(made) >> 80 for made in ulids }

    monkeypatch.setattr(time, "time_ns", lambda: still - 3_600_000_000_000)

    for source in (rand, seeded):

        last, tail = source.uuid7(), source.ulid()

        for _ in range(2000):

            made, text = source.uuid7(), source.ulid()

            assert made > last and text > tail and len(text) == 26

            last, tail = made, text

        assert last.int >> 80 == still // 1_000_000 == decode(tail) >> 80

    assert rand.pid() > 0

def test_constant_equal_takes_any_text () -> None:

    assert rand.constant_equal("a", "a") and not rand.constant_equal("a", "b") and not rand.constant_equal("a", "aa")
    assert rand.constant_equal(b"\x00\xff", b"\x00\xff") and rand.constant_equal("é", "é".encode()) and rand.constant_equal("", b"")
    assert rand.constant_equal("\ud800", "\ud800") and not rand.constant_equal("\ud800", "\udfff") and not rand.constant_equal("\ud800", "a")
    assert not rand.constant_equal("secret", b"Secret")

def test_seeded_streams_repeat () -> None:

    one, two = Rand(), Rand()
    deck     = list(range(40))
    draws: tuple[Callable[[Rand], object], ...] = (
        lambda source: source.bytes(24), lambda source: source.hex(9), lambda source: source.quick(8),
        lambda source: source.token(21), lambda source: source.string(30), lambda source: source.string(30, WIDE),
        lambda source: source.code(8), lambda source: source.reference(12), lambda source: source.password(24),
        lambda source: source.integer(-50, 10 ** 12), lambda source: source.number(), lambda source: source.chance(0.5),
        lambda source: source.choice(deck), lambda source: source.weighted(deck, [float(item) for item in deck]),
        lambda source: source.sample(deck, 11), lambda source: source.shuffle(deck), lambda source: source.uuid(),
    )

    one.seed("fixture")
    two.seed("fixture")

    for _ in range(20):

        for draw in draws: assert draw(one) == draw(two)

    one.seed(7)
    two.seed(8)

    assert [draw(one) for draw in draws] != [draw(two) for draw in draws]

    one.seed(7)

    first = one.token(16)

    one.seed(7)

    assert one.token(16) == first

    one.seed(None)

    assert one.token(16) != first and one.string(12) != one.string(12)

    for seed in ("", "\x00", "\ud800", "a\udfffb", "بذرة", -5, 0, 2 ** 4000):

        one.seed(seed)
        two.seed(seed)

        assert [draw(one) for draw in draws] == [draw(two) for draw in draws]

    one.seed("\ud800")
    two.seed("\udfff")

    assert one.bytes(16) != two.bytes(16)

    one.seed("fixture")
    two.seed(7)

    assert one.bytes(16).hex() == "56489bf488625f42f21aa8f2df37113b" and two.bytes(16).hex() == "38b4e652e44da7f2370d9e260e271365"

    one.seed(7)

    for stray in (1.5, True, b"seed", bytearray(b"seed"), [1], (1,), { "a": 1 }, object()):

        with pytest.raises(Fault) as caught: one.seed(cast("Any", stray))

        assert caught.value.code is Code.INTERNAL and caught.value.reason == "rand.seed"

    assert one.token(16) == first

def test_quick_hex_is_cheap_unique_and_seedable () -> None:

    first = rand.quick(8)

    assert len(first) == 16 and int(first, 16) >= 0 and rand.quick(8) != first
    assert len({ rand.quick(8) for _ in range(20000) }) == 20000

    rand.seed(7)

    a = rand.quick(4)

    rand.seed(7)

    assert rand.quick(4) == a and len(a) == 8

    rand.seed(None)


@pytest.mark.parametrize("bad", [True, False, 1.5, "8", None, [], {}])
def test_invalid_types_are_domain_faults ( bad: Any ) -> None:

    owner = Rand()
    calls = (
        ("rand.size", lambda: owner.bytes(bad)), ("rand.size", lambda: owner.quick(bad)),
        ("rand.length", lambda: owner.string(bad)), ("rand.length", lambda: owner.password(bad)),
        ("rand.range", lambda: owner.integer(bad, 10)), ("rand.range", lambda: owner.integer(0, bad)),
        ("rand.range", lambda: owner.integer(0, 10, bad)), ("rand.sample", lambda: owner.sample([1], bad)),
        ("rand.sample", lambda: owner.choices([1], bad)), ("rand.bits", lambda: owner.bits(bad)),
        ("rand.range", lambda: owner.below(bad)),
    )

    for reason, call in calls:

        with pytest.raises(Fault) as caught: call()

        assert caught.value.reason == reason and caught.value.code is Code.INTERNAL

    for call in (lambda: owner.weighted([1], [bad]), lambda: owner.choices([1], weights=[bad])):

        if type(bad) is float: continue

        with pytest.raises(Fault) as caught: call()

        assert caught.value.reason == "rand.weight"

def test_constructor_is_an_isolated_seeded_stream () -> None:

    first, second, untouched = Rand("fixture"), Rand("fixture"), Rand("fixture")

    assert first.bytes() == second.bytes() == untouched.bytes()

    first.seed(9)

    assert second.bytes() == untouched.bytes()

    bad: Any = True

    with pytest.raises(Fault): Rand(seed=bad)

def test_bits_below_and_stepped_integers () -> None:

    for owner in (Rand(), Rand(8)):

        assert owner.bits(0) == 0 and owner.below(1) == 0
        assert 0 <= owner.bits(32768) < 1 << 32768
        assert 0 <= owner.below(1 << 4000) < 1 << 4000
        assert {owner.integer(-4, 5, 3) for _ in range(300)} == {-4, -1, 2, 5}
        assert owner.integer(7, 7, 50) == 7
        assert owner.integer(7, 8, 50) == 7

        calls: tuple[Callable[[], object], ...] = (
            partial(owner.bits, -1), partial(owner.bits, 32769),
            partial(owner.below, 0), partial(owner.integer, 1, 9, 0),
            partial(owner.integer, 1, 9, -1),
        )

        for call in calls:

            with pytest.raises(Fault): call()

def test_uniform_extreme_ranges_and_chance ( monkeypatch: pytest.MonkeyPatch ) -> None:

    owner = Rand()
    largest = float.fromhex("0x1.fffffffffffffp+1023")

    for draw in (0.0, 0.25, 0.5, math.nextafter(1.0, 0.0)):

        monkeypatch.setattr(Rand, "number", lambda _self, picked=draw: picked)

        for low, high in ((-largest, largest), (-8.0, -3.0), (1.0, math.nextafter(1.0, 2.0)), (0.0, 5e-324)):

            assert low <= owner.uniform(low, high) < high

    assert owner.uniform(4, 4) == 4

    for low, high in ((True, 2), (0, math.inf), (math.nan, 3), (9, 1), (0, 10 ** 10000)):

        with pytest.raises(Fault) as caught: owner.uniform(low, high)

        assert caught.value.reason == "rand.range"

    assert not owner.chance(-1) and not owner.chance(math.nan)
    assert owner.chance(2) and owner.chance(math.inf)

    with pytest.raises(Fault): owner.chance(cast("Any", "bad"))

def test_batch_choices_and_zero_weights () -> None:

    for owner in (Rand(), Rand(2)):

        assert owner.choices([], 0) == []
        assert owner.choices("x", 3) == ["x"] * 3
        assert owner.choices("abc", 100, weights=[0, 5e-324, 0]) == ["b"] * 100
        assert owner.choices("abc", 100, weights=[0, 1, 0]) == ["b"] * 100
        assert set(owner.choices(range(4), 4096)) == set(range(4))

        calls: tuple[Callable[[], object], ...] = (
            partial(owner.choices, [], 1), partial(owner.choices, "a", 4097),
            partial(owner.choices, "ab", 0, weights=[1]),
            partial(owner.choices, "ab", weights=[0, 0]),
        )

        for call in calls:

            with pytest.raises(Fault): call()

    first, second = Rand(91), Rand(91)

    assert first.choices("abc", 100, weights=[1, 2, 3]) == second.choices("abc", 100, weights=[1, 2, 3])

def test_sample_counts_without_materializing_population () -> None:

    owner = Rand(1)

    tracemalloc.start()

    try:

        sampled = owner.sample(range(100_000), 5)
        expanded = owner.sample(["a", "b"], 5, counts=[10 ** 9, 10 ** 9])
        peak = tracemalloc.get_traced_memory()[1]

    finally: tracemalloc.stop()

    assert len(sampled) == len(set(sampled)) == 5 and all(0 <= value < 100_000 for value in sampled)
    assert len(expanded) == 5 and set(expanded) <= {"a", "b"}
    assert peak < 100_000
    assert sorted(owner.sample("ab", 5, counts=[3, 2])) == ["a", "a", "a", "b", "b"]
    assert owner.sample([], 0, counts=[]) == []
    assert owner.sample("ab", 0, counts=[0, 0]) == []

    for counts in ([1], [1, -1], [True, 3], [0, 0], [1.5, 1.5]):

        with pytest.raises(Fault) as caught: owner.sample("ab", 2, counts=cast("Any", counts))

        assert caught.value.reason == "rand.sample"

def test_native_text_rejects_biased_bytes ( monkeypatch: pytest.MonkeyPatch ) -> None:

    calls: list[int] = []

    def entropy ( size: int ) -> bytes:

        calls.append(size)

        return b"\xff" * size if len(calls) == 1 else b"\x00" * size

    monkeypatch.setattr(os, "urandom", entropy)

    assert Rand().code(12) == "0" * 12 and len(calls) == 2
    assert Rand().string(4, "أب") == "أ" * 4

def test_shuffle_bounds_entropy_buffer ( monkeypatch: pytest.MonkeyPatch ) -> None:

    original = os.urandom
    sizes: list[int] = []

    def entropy ( size: int ) -> bytes:

        sizes.append(size)

        return original(size)

    monkeypatch.setattr(os, "urandom", entropy)

    mixed = Rand().shuffle(range(20_000))

    assert sorted(mixed) == list(range(20_000))
    assert sizes and max(sizes) <= 4096

def test_ordered_ids_across_threads ( monkeypatch: pytest.MonkeyPatch ) -> None:

    owner = Rand()
    now = time.time_ns()

    monkeypatch.setattr(time, "time_ns", lambda: now)

    def batch ( index: int ) -> tuple[list[Uuid], list[str]]:

        return [owner.uuid7() for _ in range(500)], [owner.ulid() for _ in range(500)]

    with ThreadPoolExecutor(max_workers=4) as pool: batches = list(pool.map(batch, range(4)))

    for sevens, ulids in batches:

        assert all(left < right for left, right in pairwise(sevens))
        assert all(left < right for left, right in pairwise(ulids))

    assert len({value for sevens, _ in batches for value in sevens}) == 2000
    assert len({value for _, ulids in batches for value in ulids}) == 2000

def test_clock_and_counter_exhaustion_are_typed ( monkeypatch: pytest.MonkeyPatch ) -> None:

    owner = Rand()
    now = 1_700_000_000_000

    monkeypatch.setattr(time, "time_ns", lambda: now * 1_000_000)
    monkeypatch.setattr(owner, "_ordered", now << 42 | (1 << 42) - 1)

    assert owner.uuid7().int >> 80 == now + 1

    monkeypatch.setattr(owner, "_sorted", now << 80 | (1 << 80) - 1)

    with pytest.raises(Fault) as caught: owner.ulid()

    assert caught.value.reason == "rand.overflow"

    for value in (-1, 1 << 48):

        monkeypatch.setattr(time, "time_ns", lambda stamp=value: stamp * 1_000_000)

        with pytest.raises(Fault): owner.uuid7()
        with pytest.raises(Fault): owner.ulid()

def fork_probe () -> None:

    owner = Rand()

    owner.uuid7()
    owner.ulid()

    read, write = os.pipe()
    child = os.fork()

    if child == 0:

        os.close(read)

        try:

            packet = f"{owner.uuid7()} {owner.ulid()} {owner.quick()}"
            os.write(write, packet.encode())

        finally: os._exit(0)

    os.close(write)

    try:

        ready, _, _ = select.select([read], [], [], 5)

        assert ready, "child could not generate identifiers after fork"

        fields = os.read(read, 256).decode().split()
        assert len(fields) == 3 and Uuid(fields[0]).version == 7
        assert fields[0] != str(owner.uuid7()) and fields[1] != owner.ulid() and fields[2] != owner.quick()

    finally:

        os.close(read)
        found, _ = os.waitpid(child, os.WNOHANG)

        if found == 0:

            os.kill(child, signal.SIGKILL)
            os.waitpid(child, 0)


@pytest.mark.skipif(not hasattr(os, "fork"), reason="fork is unavailable")
def test_fork_keeps_both_processes_usable () -> None:

    worker = multiprocessing.get_context("spawn").Process(target=fork_probe)
    worker.start()

    try:

        worker.join(timeout=10)

        assert worker.exitcode == 0

    finally:

        if worker.is_alive():

            worker.terminate()
            worker.join()

        worker.close()

def test_ids_at_epoch_zero_use_random_prefixes ( monkeypatch: pytest.MonkeyPatch ) -> None:

    monkeypatch.setattr(time, "time_ns", lambda: 0)

    first, second = Rand(1), Rand(2)

    one, two = first.uuid7(), second.uuid7()

    assert one.int >> 80 == two.int >> 80 == 0
    assert one.int >> 32 != two.int >> 32
    assert decode(first.ulid()) >> 80 == decode(second.ulid()) >> 80 == 0


def test_oversized_populations_are_domain_faults () -> None:

    owner = Rand()
    huge = range(10 ** 100)
    calls = (
        ("rand.sample", lambda: owner.sample(huge, 1)),
        ("rand.sample", lambda: owner.sample(huge, 1, counts=[1])),
        ("rand.sample", lambda: owner.shuffle(huge)),
        ("rand.weight", lambda: owner.weighted(huge, [1])),
        ("rand.weight", lambda: owner.choices(huge, 1, weights=[1])),
        ("rand.sample", lambda: owner.sample("ab", 1, counts=[10 ** 100, 1])),
        ("rand.empty", lambda: owner.choice(huge)),
        ("rand.empty", lambda: owner.choices(huge, 1)),
    )

    for reason, call in calls:

        with pytest.raises(Fault) as caught: call()

        assert caught.value.reason == reason

def test_wide_alphabet_rejects_out_of_range_words ( monkeypatch: pytest.MonkeyPatch ) -> None:

    alphabet = "".join(chr(point) for point in range(1024, 1324))
    calls: list[int] = []

    def entropy ( size: int ) -> bytes:

        calls.append(size)

        return b"\xff" * size if len(calls) == 1 else b"\x00" * size

    monkeypatch.setattr(os, "urandom", entropy)

    assert Rand().string(12, alphabet) == alphabet[0] * 12
    assert len(calls) == 2 and all(size % 2 == 0 for size in calls)

def test_secure_choices_batch_entropy_without_modulo_bias ( monkeypatch: pytest.MonkeyPatch ) -> None:

    seen: list[int] = []

    def entropy ( size: int ) -> bytes:

        seen.append(size)

        return bytes(range(256)) * (size // 256) + bytes(range(size % 256))

    monkeypatch.setattr(os, "urandom", entropy)
    draw = Rand()
    found = draw.choices(("a", "b", "c"), 255)

    assert Counter(found) == { "a": 85, "b": 85, "c": 85 }
    assert len(seen) == 1
    assert draw.choices([], 0) == [] and draw.choices([None], 10) == [None] * 10
    assert len(seen) == 1


def test_secure_choices_and_custom_alphabet_share_rejection_sampling ( monkeypatch: pytest.MonkeyPatch ) -> None:

    monkeypatch.setattr(os, "urandom", lambda size: b"\xff" * (size - 2) + b"\x00\x01")
    draw = Rand()

    assert draw.choices(("a", "b", "c"), 4) == ["a", "b", "a", "b"]
    assert draw.string(4, "αβγ") == "αβαβ"


def test_seeded_choices_keep_the_existing_integer_sampling_stream () -> None:

    draw = Rand(17)
    reference = Rand(17)

    assert draw.choices(list(range(30)), 100) == [reference.choice(list(range(30))) for _ in range(100)]

def test_secure_bulk_choices_reject_the_sixteen_bit_tail ( monkeypatch: pytest.MonkeyPatch ) -> None:

    seen: list[int] = []

    def entropy ( size: int ) -> bytes:

        seen.append(size)
        return (65535).to_bytes(2, sys.byteorder) * (size // 2 - 2) + (0).to_bytes(2, sys.byteorder) + (256).to_bytes(2, sys.byteorder)

    monkeypatch.setattr(os, "urandom", entropy)

    assert Rand().choices(tuple(range(257)), 4) == [0, 256, 0, 256]
    assert len(seen) == 2 and all(size % 2 == 0 for size in seen)

@pytest.mark.parametrize(("left", "right"), [
    ("", ""), ("a\x00b", "a\x00b"), ("a" * 64, "a" * 63 + "b"),
    ("a" * 64, b"a" * 64), (b"ascii", "ascii"), ("a", "é"),
    ("é", "a"), ("\ud800", "\ud800"), ("é", "é".encode()),
])
def test_constant_equal_keeps_ascii_unicode_and_mixed_semantics ( left: str | bytes, right: str | bytes ) -> None:

    a = left.encode("utf-8", "surrogatepass") if isinstance(left, str) else left
    b = right.encode("utf-8", "surrogatepass") if isinstance(right, str) else right

    assert rand.constant_equal(left, right) == (a == b)
    assert rand.constant_equal(right, left) == (a == b)

def test_secure_draws_bypass_seed_without_advancing_seeded_sequence ( monkeypatch: pytest.MonkeyPatch ) -> None:

    calls: list[int] = []

    def entropy ( size: int ) -> bytes:

        calls.append(size)
        return b"z" * size

    monkeypatch.setattr(os, "urandom", entropy)
    source, reference = Rand(7), Rand(7)

    assert source.bytes(32, secure=True) == b"z" * 32
    assert source.hex(16, secure=True) == (b"z" * 16).hex()
    assert source.token(32, secure=True) == base64.urlsafe_b64encode(b"z" * 32).rstrip(b"=").decode()
    assert calls == [32, 16, 32]
    assert source.bytes(32) == reference.bytes(32)

    invalid: tuple[object, ...] = (None, 0, 1, "yes", [])

    for bad in invalid:

        with pytest.raises(Fault) as stopped: source.bytes(8, secure=cast("Any", bad))

        assert stopped.value.reason == "rand.secure"
