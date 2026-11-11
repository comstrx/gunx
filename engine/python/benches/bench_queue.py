from engine.broker import Broker, Memory
from engine.context import context
from engine.log import log
from engine.queue import Job, Queue
from engine.test import Bench
from pathlib import Path
import asyncio

bench = Bench()
loop  = asyncio.new_event_loop()
bus   = Broker()
jobs  = Queue()
inline = Queue()
done: list[int] = []

log.setup("error", "json", Path("/dev/null"))
bus.setup(Memory())
jobs.setup(bus, queues=("default",))
inline.setup(Broker(), inline=True)

@jobs.task("add", tries=2, backoff=0.0)
async def add ( n: int ) -> None: done.append(n)

@inline.task("add")
async def add_inline ( n: int ) -> None: done.append(n)

async def ready () -> None: await jobs.declare()

def making () -> None: Job.make("add", { "n": 1 }, tries=2, backoff=0.0)

def loading () -> None: Job.load(RAW)

def dumping () -> None: JOB.dump()

async def pushing_inline () -> None: await inline.push("add", { "n": 1 })

async def pushing () -> None: await jobs.push("add", { "n": 1 })

async def round_trip () -> None:

    await jobs.push("add", { "n": 1 })
    await jobs.work(wait=0.05)

async def batch () -> None:

    await jobs.bulk("add", [{ "n": at } for at in range(16)])
    await jobs.work(limit=16, wait=0.05)

JOB = Job.make("add", { "n": 1, "text": "hello", "items": [1, 2, 3] })
RAW = JOB.dump()

loop.run_until_complete(ready())

with context.scope(request_id="bench", tenant="t1"):

    bench.measure("queue.job.make", making)
    bench.measure("queue.job.load", loading)
    bench.measure("queue.job.dump", dumping)
    loop.run_until_complete(bench.measure_async("queue.push.inline", pushing_inline))
    loop.run_until_complete(bench.measure_async("queue.push.memory", pushing))
    loop.run_until_complete(jobs.work(limit=16, wait=0.05))
    loop.run_until_complete(bench.measure_async("queue.push+work", round_trip))
    loop.run_until_complete(bench.measure_async("queue.bulk16+work", batch, rounds=300))

loop.run_until_complete(jobs.close())
loop.close()
log.close()
