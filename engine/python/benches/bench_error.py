from engine.error import Bag, Code, Fault
from engine.test import Bench

bench = Bench()
fault = Fault(Code.VALIDATION, "The data is invalid", "order.items", { "items": ["is required"] }, retry_after=1.5)
wire  = fault.dump()

def make () -> None: Fault(Code.NOT_FOUND, reason="order.missing")

def dump () -> None: fault.dump()

def load () -> None: Fault.load(wire)

def wrap () -> None: Fault.wrap(ValueError("bad"), Code.BAD_REQUEST, "order.value")

def of () -> None: Code.of(404)

def bag () -> None: Bag().add("name", "is required").add("email", "is invalid").dump()

bench.measure("error.fault", make)
bench.measure("error.dump", dump)
bench.measure("error.load", load)
bench.measure("error.wrap", wrap)
bench.measure("error.code_of", of)
bench.measure("error.bag", bag)
