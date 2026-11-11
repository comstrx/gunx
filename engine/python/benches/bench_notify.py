from engine.log import log
from engine.notify import Log, Notice, Notify
from engine.test import Bench
from pathlib import Path
import asyncio

bench   = Bench()
loop    = asyncio.new_event_loop()
service = Notify()
logger  = Log()
tokens  = tuple(f"token-{at:04d}" for at in range(100))

log.setup("error", "json", Path("/dev/null"))
service.setup(logger)

def building () -> None: Notice(("t1", "t2"), "Hello", "Body", { "k": "v" }, 1, "ping", urgent=True)

def wide () -> None: Notice(tokens, "Hello", "Body")

def composing () -> None: service.compose(["t1", "t2", "t1"], "Hello", "Body", { "k": "v" }, badge=1)

def dumping () -> None: Notice(tokens, "Hello", "Body").dump()

async def pushing () -> None:

    await service.push(NOTICE)

    logger.outbox.clear()

NOTICE = Notice(("t1", "t2"), "Hello", "Body")

bench.measure("notify.notice", building)
bench.measure("notify.notice.100", wide)
bench.measure("notify.compose", composing)
bench.measure("notify.dump.100", dumping)
loop.run_until_complete(bench.measure_async("notify.push.log", pushing))
loop.close()
log.close()
