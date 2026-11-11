from engine.log import log
from engine.test import Bench
from engine.thread import Gate, Tasks, thread
from pathlib import Path
import asyncio, operator

bench = Bench()
wide  = Gate(64)
tight = Gate(1)
tasks = Tasks("bench")
ITEMS = list(range(64))
WORDS = [str(item) for item in ITEMS]

async def twice ( value: int ) -> int: return value * 2

async def idle () -> None: return None

def take () -> None:

    wide.take()
    wide.release()

def chunks () -> None: thread.chunks(ITEMS, 8)

def describe () -> None: thread.describe()

async def acquire () -> None:

    await wide.acquire(1)

    wide.release()

async def passed () -> None:

    await tight.acquire(5)

    tight.release()

async def crowd () -> None:

    await tight.acquire(5)

    waiters = [asyncio.ensure_future(passed()) for _ in range(32)]

    await asyncio.sleep(0)

    tight.release()

    await asyncio.gather(*waiters)

async def breath () -> None: await thread.sleep(0)

async def spawn () -> None: await tasks.spawn(idle())

async def race () -> None: await thread.race(idle(), thread.sleep(1))

async def hop () -> None: await thread.offload(operator.add, 1, 2)

async def gather () -> None: await thread.gather(*(twice(item) for item in ITEMS))

async def narrow () -> None: await thread.gather(*(twice(item) for item in ITEMS), limit=8)

async def mapped () -> None: await thread.map(ITEMS, twice)

async def inline () -> None: await thread.run(ITEMS, twice)

async def threads () -> None: await thread.run(WORDS, int, "thread")

async def twins () -> None: await thread.run(WORDS, int, "interpreter")

async def processes () -> None: await thread.run(WORDS, int, "process")

async def twin () -> None: await thread.compute(operator.mul, 6, 7, mode="interpreter")

async def compute () -> None: await thread.compute(operator.mul, 6, 7)

async def main () -> None:

    await bench.measure_async("thread.gate.acquire", acquire, rounds=20000)
    await bench.measure_async("thread.gate.crowd32", crowd, rounds=2000)
    await bench.measure_async("thread.sleep.zero", breath, rounds=20000)
    await bench.measure_async("thread.spawn", spawn, rounds=20000)
    await bench.measure_async("thread.race", race, rounds=5000)
    await bench.measure_async("thread.offload", hop, rounds=5000)
    await bench.measure_async("thread.gather.64", gather, rounds=2000)
    await bench.measure_async("thread.gather.64.limit8", narrow, rounds=2000)
    await bench.measure_async("thread.map.64", mapped, rounds=2000)
    await bench.measure_async("thread.run.async.64", inline, rounds=2000)
    await bench.measure_async("thread.run.thread.64", threads, rounds=200)
    await bench.measure_async("thread.run.interpreter.64", twins, rounds=100)
    await bench.measure_async("thread.run.process.64", processes, rounds=50)
    await bench.measure_async("thread.compute.interpreter", twin, rounds=500)
    await bench.measure_async("thread.compute.process", compute, rounds=300)

    await thread.close()

if __name__ == "__main__":

    log.setup("info", "json", Path("/dev/null"))

    bench.measure("thread.gate.take", take)
    bench.measure("thread.chunks.64", chunks)
    bench.measure("thread.describe", describe)
    Bench.run(main())

    log.close()
