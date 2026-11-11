from engine.log import log
from engine.sms import Log, Sms, Text
from engine.test import Bench
from pathlib import Path
import asyncio

bench   = Bench()
loop    = asyncio.new_event_loop()
service = Sms()
logger  = Log()

log.setup("error", "json", Path("/dev/null"))
service.setup(logger, sender="ENGINE")

def building () -> None: Text("+201099000000", "Your code is 123456", "sms", "ENGINE")

def composing () -> None: service.compose("+20 109 900 0000", "Your code is 123456")

def dumping () -> None: Text("+201099000000", "Your code is 123456").dump()

async def texting () -> None:

    await service.text("+201099000000", "Your code is 123456")

    logger.outbox.clear()

async def receipting () -> None: logger.receipt({ "id": "m-1", "status": "queued" })

bench.measure("sms.text", building)
bench.measure("sms.compose", composing)
bench.measure("sms.dump", dumping)
loop.run_until_complete(bench.measure_async("sms.text.log", texting))
loop.run_until_complete(bench.measure_async("sms.receipt", receipting))
loop.close()
log.close()
