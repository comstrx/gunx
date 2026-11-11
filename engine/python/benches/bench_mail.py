from engine.log import log
from engine.mail import Log, Mail, Message
from engine.test import Bench
from pathlib import Path
import asyncio

bench  = Bench()
loop   = asyncio.new_event_loop()
box    = Mail()
logger = Log()
body   = "<p>Hello</p>" * 200
file   = bytes(64 * 1024)

log.setup("error", "json", Path("/dev/null"))
box.setup("hello@engine.test", "Engine", logger)

def building () -> None: Message(("a@x.io",), "Subject", "plain", body, "Engine <hello@engine.test>", None, ("c@x.io",), (), { "X-Tag": "v" })

def attached () -> None: Message(("a@x.io",), "Subject", "plain", body, attachments=(("report.pdf", file, "application/pdf"),))

def composing () -> None: box.compose(["a@x.io", "b@x.io"], "Subject", "plain", body, cc=["c@x.io"], headers={ "X-Tag": "v" })

def dumping () -> None: MESSAGE.dump()

def heading () -> None: box.headers(MESSAGE)

async def sending () -> None:

    await box.send(MESSAGE)

    logger.outbox.clear()

MESSAGE = box.compose(["a@x.io"], "Subject", "plain", body, attachments=[("report.pdf", file, "application/pdf")])

bench.measure("mail.message", building)
bench.measure("mail.message.attached64k", attached)
bench.measure("mail.compose", composing)
bench.measure("mail.dump.attached64k", dumping, rounds=5000)
bench.measure("mail.headers", heading)
loop.run_until_complete(bench.measure_async("mail.send.log", sending))
loop.close()
log.close()
