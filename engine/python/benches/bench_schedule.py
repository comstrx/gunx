from datetime import UTC, datetime
from engine.cache import Cache, Memory
from engine.log import log
from engine.schedule import Cron, Schedule
from engine.test import Bench
from pathlib import Path
import asyncio

bench    = Bench()
loop     = asyncio.new_event_loop()
schedule = Schedule()
start    = datetime(2027, 12, 31, 23, 59, tzinfo=UTC)
every    = Cron.parse("*/5 * * * *")
rare     = Cron.parse("0 0 29 2 *")
runs: list[int] = []

log.setup("error", "json", Path("/dev/null"))
schedule.setup(Cache(Memory()), tick=60.0)

async def work () -> None:

    runs.append(1)

for at in range(50): schedule.add(f"job-{at}", "* * * * *", work, timeout=5.0)

def parsing () -> None: Cron.parse("0 9,17 * * mon-fri")

def matching () -> None: every.matches(start)

def soon () -> None: every.next(start)

def leap () -> None: rare.next(start)

def due () -> None: schedule.due(start)

async def ticking () -> None:

    for spot in schedule.due(datetime(2027, 1, 1, tzinfo=UTC)): spot.next = start

    await schedule.tick(datetime(2027, 1, 1, tzinfo=UTC))

async def triggering () -> None: await schedule.trigger("job-1")

bench.measure("schedule.cron.parse", parsing)
bench.measure("schedule.cron.matches", matching)
bench.measure("schedule.cron.next.5min", soon)
bench.measure("schedule.cron.next.leap", leap, rounds=2000)
bench.measure("schedule.due.50", due)
loop.run_until_complete(bench.measure_async("schedule.tick.50", ticking, rounds=300))
loop.run_until_complete(bench.measure_async("schedule.trigger", triggering, rounds=2000))
loop.close()
log.close()
