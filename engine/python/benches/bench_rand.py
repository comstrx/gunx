from engine.rand import Rand, rand
from engine.test import Bench
import tracemalloc

bench   = Bench()
deck    = list(range(52))
weights = [float(card + 1) for card in deck]
wide    = "".join(chr(point) for point in range(1024, 1324))

def quick () -> None: rand.quick(8)

def token () -> None: rand.token(32)

def hex_ () -> None: rand.hex(16)

def code () -> None: rand.code(6)

def string () -> None: rand.string(16)

def reference () -> None: rand.reference(8)

def password () -> None: rand.password(20)

def integer () -> None: rand.integer(1, 1000)

def choice () -> None: rand.choice(deck)

def weighted () -> None: rand.weighted(deck, weights)

def sample () -> None: rand.sample(deck, 5)

def shuffle () -> None: rand.shuffle(deck)

def uuid () -> None: rand.uuid()

def uuid7 () -> None: rand.uuid7()

def ulid () -> None: rand.ulid()

def equal () -> None: rand.constant_equal("a" * 64, "a" * 64)

bench.measure("rand.quick", quick)
bench.measure("rand.token", token)
bench.measure("rand.hex", hex_)
bench.measure("rand.code", code)
bench.measure("rand.string", string)
bench.measure("rand.reference", reference)
bench.measure("rand.password", password)
bench.measure("rand.integer", integer)
bench.measure("rand.choice", choice)
bench.measure("rand.weighted", weighted)
bench.measure("rand.sample", sample)
bench.measure("rand.shuffle", shuffle)
bench.measure("rand.uuid", uuid)
bench.measure("rand.uuid7", uuid7)
bench.measure("rand.ulid", ulid)
bench.measure("rand.constant_equal", equal)


bench.measure("rand.bits", lambda: rand.bits(128))
bench.measure("rand.below", lambda: rand.below(1000))
bench.measure("rand.uniform", lambda: rand.uniform(-100, 100))
bench.measure("rand.integer.step", lambda: rand.integer(0, 1000, 5))
bench.measure("rand.choices.weighted", lambda: rand.choices(deck, 100, weights=weights), rounds=1000)
bench.measure("rand.sample.large", lambda: rand.sample(range(100_000), 5), rounds=1000)
bench.measure("rand.sample.counts", lambda: rand.sample("ab", 5, counts=[10 ** 9, 10 ** 9]), rounds=1000)
bench.measure("rand.string.large", lambda: rand.string(4096), rounds=1000)
bench.measure("rand.string.wide", lambda: rand.string(16, wide))

for name, work in (
    ("string4096", lambda: rand.string(4096)),
    ("sample100k", lambda: rand.sample(range(100_000), 5)),
    ("shuffle20k", lambda: rand.shuffle(range(20_000))),
):

    tracemalloc.start()
    work()
    retained, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"rand.{name} retained_bytes={retained} peak_bytes={peak}")

secure = Rand()
small_population = tuple(range(30))
large_population = tuple(range(1000))

bench.measure("rand.choices.secure100", lambda: secure.choices(small_population, 100), rounds=2000)
bench.measure("rand.choices.secure1000", lambda: secure.choices(large_population, 1000), rounds=500)
bench.measure("rand.string.unicode", lambda: secure.string(20, "αβγδεζηθ"), rounds=5000)

bench.measure("rand.constant_equal.bytes", lambda: rand.constant_equal(b"a" * 64, b"a" * 64))
bench.measure("rand.constant_equal.unicode", lambda: rand.constant_equal("عربي", "عربي"))
bench.measure("rand.constant_equal.mixed", lambda: rand.constant_equal("ascii", b"ascii"))

bench.measure("rand.bytes.secure", lambda: rand.bytes(32, secure=True))
bench.measure("rand.token.secure", lambda: rand.token(32, secure=True))
