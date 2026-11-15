from engine.log import log
from engine.test import Bench
from engine.thread import Gate, Outcome, Run, Tasks, thread
from pathlib import Path
import asyncio, operator, os, tracemalloc

bench = Bench()
wide  = Gate(64)
tight = Gate(1)
tasks = Tasks("bench")
ITEMS = list(range(64))
WORDS = [str(item) for item in ITEMS]
RESULT = Run("async", tuple(Outcome(index, index) for index in range(1000)), 1.0, 8)

async def twice ( value: int ) -> int: return value * 2

async def idle () -> None: return None

def take () -> None:

    wide.take()
    wide.release()

def chunks () -> None: thread.chunks(ITEMS, 8)

def describe () -> None: thread.describe()

def remote_options () -> None:

    thread.mode("remote").options(workers=4, host="ray://head:10001", namespace="jobs")

def remote_environment () -> None:

    thread.mode("remote").options(
        workers=4, namespace="jobs",
        runtime_env={ "env_vars": { "MODE": "worker" }, "working_dir": "./worker" },
    )


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

async def mapped_large () -> None: await thread.map(range(10000), twice)

async def fluent () -> None:

    unit = thread.mode("async").options(workers=8)
    pool = thread.mode("thread").options(workers=8)

    async def submit () -> None: await pool.submit(operator.add, 1, 2)

    async def mapped () -> None: await unit.map(ITEMS, twice)

    async def grouped () -> None: await unit.gather(*(unit.submit(twice, item) for item in ITEMS))

    async def inline () -> None: await unit.run(ITEMS, twice)

    try:

        await bench.measure_async("thread.mode.thread.submit", submit, rounds=2000)
        await bench.measure_async("thread.mode.async.map64", mapped, rounds=1000)
        await bench.measure_async("thread.mode.async.gather64", grouped, rounds=1000)
        await bench.measure_async("thread.mode.async.run64", inline, rounds=1000)

    finally:

        await unit.drop()
        await pool.drop()

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

    await bench.measure_async("thread.map.10000", mapped_large, rounds=100)
    tracemalloc.start()

    await mapped_large()

    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    print(f"thread.map.10000 allocation_retained_bytes={current} allocation_peak_bytes={peak}")

    await fluent()
    await thread.close()

if __name__ == "__main__":

    log.setup("info", "json", Path(os.devnull))

    bench.measure("thread.gate.take", take)
    bench.measure("thread.chunks.64", chunks)
    bench.measure("thread.describe", describe)
    bench.measure("thread.mode.remote.options", remote_options)
    bench.measure("thread.mode.remote.environment", remote_environment)
    bench.measure("thread.run.dump1000", RESULT.dump, rounds=1000)
    bench.measure("thread.run.first1000", RESULT.raise_first, rounds=1000)
    Bench.run(main())

    log.close()
