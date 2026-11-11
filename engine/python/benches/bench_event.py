from engine.broker import Broker, Memory
from engine.context import context
from engine.event import Event, Events
from engine.log import log
from engine.test import Bench
from pathlib import Path
import asyncio

bench  = Bench()
loop   = asyncio.new_event_loop()
bus    = Broker()
events = Events()
seen: list[str] = []

log.setup("error", "json", Path("/dev/null"))
bus.setup(Memory())
events.setup("orders", bus)

async def on_any ( event: Event ) -> None: seen.append(event.name)

for _ in range(8): events.listen("orders.*", on_any)

events.listen("payments.*", on_any)

async def ready () -> None: await events.declare("orders.*", "payments.*")

def making () -> None: events.make("orders.placed", id=5, total=19.99)

def loading () -> None: Event.load(RAW)

def dumping () -> None: EVENT.dump()

def matching () -> None: events.listeners("orders.placed")

async def dispatching () -> None: await events.dispatch("orders.placed", id=5)

async def round_trip () -> None:

    await events.dispatch(Event(name="payments.settled", data={ "id": 1 }, source="payments"))
    await events.consume(wait=0.05)

EVENT = events.make("orders.placed", id=5, total=19.99)
RAW   = EVENT.dump()

loop.run_until_complete(ready())

with context.scope(request_id="bench", actor={ "id": 7 }, tenant="t1"):

    bench.measure("event.make", making)
    bench.measure("event.load", loading)
    bench.measure("event.dump", dumping)
    bench.measure("event.listeners.9", matching)
    loop.run_until_complete(bench.measure_async("event.dispatch.8listeners", dispatching))
    loop.run_until_complete(bench.measure_async("event.publish+consume", round_trip))

loop.close()
log.close()
