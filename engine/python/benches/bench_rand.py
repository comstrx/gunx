from engine.rand import rand
from engine.test import Bench

bench   = Bench()
deck    = list(range(52))
weights = [float(card + 1) for card in deck]

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
