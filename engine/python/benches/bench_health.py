from engine.health import Health
from engine.log import log
from engine.test import Bench
from pathlib import Path
import asyncio

bench  = Bench()
idle   = Health()
single = Health()
wide   = Health()
sick   = Health()

log.setup("info", "json", Path("/dev/null"))

async def good () -> bool: return True

async def bad () -> bool: return False

def plain () -> bool: return True

single.register("database", good)
single.fact(service="iam", version="1.4.2", upstreams=["notify", "hello"])
sick.register("database", bad)

for index in range(8): wide.register(f"probe{index}", plain if index % 2 else good, critical=index < 4)

def live () -> None: single.live()

def describe () -> None: wide.describe()

def fact () -> None: single.fact(version="1.4.2", upstreams=["notify", "hello"])

def register () -> None:

    idle.register("database", good, timeout=5)
    idle.forget("database")

async def empty () -> None: await idle.ready()

async def one () -> None: await single.ready()

async def eight () -> None: await wide.ready()

async def degraded () -> None: await sick.ready()

async def crowd () -> None: await asyncio.gather(*(single.ready() for _ in range(64)))

bench.measure("health.live", live)
bench.measure("health.describe", describe)
bench.measure("health.fact", fact)
bench.measure("health.register.forget", register)
Bench.run(bench.measure_async("health.ready.empty", empty, rounds=20000))
Bench.run(bench.measure_async("health.ready.one", one, rounds=10000))
Bench.run(bench.measure_async("health.ready.eight", eight, rounds=5000))
Bench.run(bench.measure_async("health.ready.degraded", degraded, rounds=10000))
Bench.run(bench.measure_async("health.ready.crowd64", crowd, rounds=2000))

log.close()
