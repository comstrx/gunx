from engine.cli import Cli, Command
from engine.error import Fault
from engine.log import log
from engine.parse import parse
from engine.test import Bench
from pathlib import Path
from typing import Literal
import contextlib

bench = Bench()
plain = ["demo"]
rich  = ["demo", "a", "b", "--tag", "x", "--tag=y", "-w", "5m", "--mode", "full"]
wrong = ["demo", "--wai", "3"]
line  = ["serve", "--port=9000", "-dn4"]
rows  = [[f"order-{index}", "ready" if index % 2 else "طلبات", index * 37, None] for index in range(50)]

log.setup("info", "json", Path("/dev/null"))

def seed ( name: str, *files: str, mode: Literal["fast", "full"] = "fast", tag: list[str] | None = None, wait: float = 1.0 ) -> int:

    return 0

def serve ( port: int = 8000, debug: bool = False, *, workers: int = 1, color: bool = True ) -> int:

    return 0

async def ping () -> int:

    return 0

def mute ( text: str ) -> None: ...

def made () -> Command:

    return Command("seed", seed, "Seed data", "database").argument("wait", "seconds to wait", parse.duration, "w")

seeder = made()
server = Command("serve", serve, "Serve the api").argument("debug", short="d").argument("workers", short="n")
cli    = Cli("engine", "The engine", "1.0").setup(mute, mute).register(seeder, server, Command("ping", ping))

cli.register(*(Command(f"job:run-{index}", ping, f"Run job {index}", f"group{index % 4}") for index in range(61)))

def derive () -> None: made()

def simple () -> None: seeder.parse(plain)

def full () -> None: seeder.parse(rich)

def refused () -> None:

    with contextlib.suppress(Fault): seeder.parse(wrong)

def usage () -> None: seeder.usage()

def page () -> None: seeder.manual("engine")

def book () -> None: cli.manual()

def describe () -> None: cli.describe()

def run () -> None: cli.run(line)

def lost () -> None: cli.run(["job:run-99"])

def looped () -> None: cli.run(["ping"])

def table () -> None: cli.table(["name", "state", "count", "note"], rows)

async def call () -> None: await cli.call(line)

async def awaited () -> None: await cli.call(["ping"])

bench.measure("cli.command.derive", derive)
bench.measure("cli.parse.plain", simple)
bench.measure("cli.parse.rich", full)
bench.measure("cli.parse.refused", refused, rounds=5000)
bench.measure("cli.usage", usage)
bench.measure("cli.manual.command", page)
bench.measure("cli.manual.global64", book, rounds=5000)
bench.measure("cli.describe64", describe, rounds=2000)
bench.measure("cli.run.sync", run)
bench.measure("cli.run.unknown64", lost, rounds=2000)
bench.measure("cli.run.loop", looped, rounds=1000)
bench.measure("cli.table.50x4", table, rounds=2000)
Bench.run(bench.measure_async("cli.call.sync", call))
Bench.run(bench.measure_async("cli.call.async", awaited))

log.close()
