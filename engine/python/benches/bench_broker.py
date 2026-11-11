from engine.broker import Broker, Memory, Message, Rabbit
from engine.log import log
from engine.test import Bench
from pathlib import Path
from typing import Any
import asyncio, os

AMQP  = os.environ.get("ENGINE_AMQP_URL", "amqp://guest:guest@127.0.0.1:5672/")
bench = Bench()
loop  = asyncio.new_event_loop()
seen: list[str] = []

log.setup("error", "json", Path("/dev/null"))

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

def making () -> None: Message.make("orders.placed", { "id": 7, "total": 19.99, "items": [1, 2, 3] })

async def handle ( message: Message ) -> None: seen.append(message.id)

def lines ( bus: Broker, tag: str, rounds: int ) -> None:

    async def publish () -> None: await bus.publish("orders.placed", { "id": 7, "total": 19.99 })

    async def round_trip () -> None:

        await bus.publish("orders.placed", { "id": 7 })
        await bus.consume("bench.orders", handle, 1, 0.5)

    async def batch () -> None:

        for at in range(16): await bus.publish("orders.placed", { "id": at })

        await bus.consume("bench.orders", handle, 16, 0.5)

    run(bus.declare("bench.orders", "orders.*"))
    run(bus.purge("bench.orders"))
    run(bench.measure_async(f"broker.{tag}.publish", publish, rounds=rounds))
    run(bus.purge("bench.orders"))
    run(bench.measure_async(f"broker.{tag}.publish+consume", round_trip, rounds=rounds))
    run(bench.measure_async(f"broker.{tag}.batch16", batch, rounds=max(50, rounds // 10)))
    run(bus.delete("bench.orders"))
    run(bus.close())

bench.measure("broker.message.make", making)

memory = Broker()

memory.setup(Memory())
lines(memory, "memory", 2000)

rabbit = Rabbit(AMQP, exchange="engine.bench", prefetch=16, wait=1.0)

if run(rabbit.ready()):

    bus = Broker()

    bus.setup(rabbit)
    lines(bus, "rabbit", 300)

else: run(rabbit.close())

loop.close()
log.close()
