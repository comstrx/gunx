from collections import Counter
from collections.abc import Callable
from itertools import pairwise
from typing import Any, cast

from engine.error import Code, Fault
from engine.rand import Rand, Uuid, rand
import base64, math, pytest, string, time

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
