from engine.context import context, Deferral, Trace
from engine.test import Bench
from engine.error import Code, Fault
from engine.json import json
import tracemalloc

bench = Bench()
actor = { "id": 7, "role": "admin", "active": True }
wire  = { "request_id": "0f3a9c1e5b7d2468", "actor": actor, "tenant": 9, "locale": "ar", "trace": "t-1", "password": "x" }
held  = context.open(request_id="0f3a9c1e5b7d2468", locale="ar", actor=actor, tenant=9)
ran   = [0]

def work () -> None: ran[0] += 1

async def later () -> None: ran[0] += 1

def put () -> None: context.reset(context.put(request_id="0f3a9c1e5b7d2468", locale="en", actor=None))

def opened () -> None: context.close(context.open(request_id="0f3a9c1e5b7d2468", locale="en", actor=None))

def get () -> None: context.get("tenant")

def has () -> None: context.has("tenant")

def need () -> None: context.need("tenant")

def request () -> None: context.request_id()

def locale () -> None: context.locale()

def dump () -> None: context.dump()

def snapshot () -> None: context.snapshot()

def facts () -> None: context.facts()

def headers () -> None: context.headers()

def empty () -> None: Deferral()

def load () -> None: context.load(wire)

def scope () -> None:

    with context.scope(job="j-1"): pass

def defer () -> None:

    context.defer(work)

    pending = context.deferred()

    if pending is not None: pending.clear()

async def flush () -> None:

    deferral = Deferral()

    deferral.add(work)
    deferral.add(later)
    deferral.add(work, always=True)

    await deferral.flush()

async def skipped () -> None:

    deferral = Deferral()

    deferral.add(work)
    deferral.add(work, always=True)

    await deferral.flush(failed=True)

bench.measure("context.put", put)
bench.measure("context.open", opened)
bench.measure("context.get", get)
bench.measure("context.facts", facts)
bench.measure("context.headers", headers)
bench.measure("context.deferral", empty)
bench.measure("context.has", has)
bench.measure("context.need", need)
bench.measure("context.request_id", request)
bench.measure("context.locale", locale)
bench.measure("context.dump", dump)
bench.measure("context.snapshot", snapshot)
bench.measure("context.scope", scope)
bench.measure("context.defer", defer)
Bench.run(bench.measure_async("context.flush", flush, rounds=5000))
Bench.run(bench.measure_async("context.flush.failed", skipped, rounds=5000))
context.close(held)

inner = context.open()

bench.measure("context.load", load)
context.close(inner)

for name, work in (("empty", empty), ("open", opened), ("load", load)):

    tracemalloc.start()

    try:

        work()

        retained, peak = tracemalloc.get_traced_memory()

    finally: tracemalloc.stop()

    print(f"context.{name} retained_bytes={retained} peak_bytes={peak}")

context.clear()

wide = context.open(**{ f"field{index}": index for index in range(64) })

def unchanged () -> None: context.reset(context.put())

def forget () -> None:

    token = context.put(field0=0)
    context.forget("field0")
    context.reset(token)

def exchange () -> None:

    with context.scope(request_id="r1", tenant=7):

        fault = Fault(Code.UNAVAILABLE, reason="upstream.busy", retry_after=0.5, unknown=True)
        packet = json.decode(json.encode({ "context": context.dump(), "error": fault }))
        Fault.load(packet["error"])

bench.measure("context.put.empty", unchanged)
bench.measure("context.forget.missing", lambda: context.forget("missing"))
bench.measure("context.forget.present", forget)
bench.measure("context.error.json.exchange", exchange)
bench.measure("context.facts.json", lambda: json.encode(context.facts()))
bench.measure("context.trace.valid", lambda: Trace.clean("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"))

context.close(wide)
