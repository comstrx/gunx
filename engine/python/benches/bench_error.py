from collections.abc import Callable
from contextlib import suppress
from types import MappingProxyType
from engine.error import Bag, Code, Fault
from engine.test import Bench
import tracemalloc

bench  = Bench()
fault  = Fault(Code.VALIDATION, "The data is invalid", "record.field", { "field": ["is required"] }, retry_after=1.5)
wire   = fault.dump()
frozen = MappingProxyType(wire)
large  = { f"field{n}": ["is required", "is invalid"] for n in range(100) }
held   = Fault(Code.VALIDATION, errors=large)
bagged = Bag(large)

def make () -> None: Fault(Code.NOT_FOUND, reason="record.missing")

def dump () -> None: fault.dump()

def load () -> None: Fault.load(wire)

def wrap () -> None: Fault.wrap(ValueError("bad"), Code.BAD_REQUEST, "record.value")

def of () -> None: Code.of(404)

def invalid_status () -> None: Code.of(-1)

def parse () -> None: Code.parse(" Too-Many Requests ")

def unknown_code () -> None: Code.parse("not-a-code")

def mapping () -> None: Fault.load(frozen)

def bag () -> None: Bag().add("first", "is required").add("second", "is invalid").dump()

def clone () -> None: fault.copy()

def snapshot () -> None: held.dump()

def aggregate () -> None: bagged.fault()

def refused () -> None:

    with suppress(Fault): Fault.load({ "errors": { "field": 7 } })

def raise_fault () -> None:

    with suppress(Fault): bagged.raise_if_any()

def allocation ( name: str, work: Callable[[], None] ) -> None:

    tracemalloc.start()

    try:

        work()

        retained, peak = tracemalloc.get_traced_memory()

    finally: tracemalloc.stop()

    print(f"{name} allocation_retained_bytes={retained} allocation_peak_bytes={peak}")

for name, work in (
    ("fault", make), ("dump", dump), ("load", load), ("wrap", wrap), ("code_of", of), ("bag", bag),
    ("copy", clone), ("dump100", snapshot), ("bag_fault100", aggregate), ("malformed", refused),
    ("bag_raise100", raise_fault), ("code_invalid", invalid_status), ("code_parse", parse),
    ("code_unknown", unknown_code), ("load_mapping", mapping),
):

    label = f"error.{name}"

    bench.measure(label, work)
    allocation(label, work)

def retry_fault () -> None: Fault(Code.UNAVAILABLE, retry_after=0.5, unknown=True)

def invalid_retry () -> None:

    with suppress(Fault): Fault(Code.UNAVAILABLE, retry_after=-1)

bench.measure("error.retry.make", retry_fault)
bench.measure("error.retry.invalid", invalid_retry)
