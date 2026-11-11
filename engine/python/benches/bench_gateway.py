from engine.crypto import crypto
from engine.error import Fault
from engine.gateway import Charge, Gateway, Mock, Webhook
from engine.json import json
from engine.log import log
from engine.number import Money
from engine.test import Bench
from pathlib import Path
import asyncio, contextlib

bench = Bench()
loop  = asyncio.new_event_loop()
pay   = Gateway()
mock  = Mock("bench-secret-0123456789")
money = Money(1999, "EGP")
body  = json.encode({ "event": "charge.captured", "charge": "ch_1", "status": "captured", "reference": "order-1" })
heads = { "x-signature": mock.sign(body) }

log.setup("error", "json", Path("/dev/null"))
crypto.setup([crypto.key("k1")])
pay.use(mock)

def charging () -> None: Charge("ch_1", "mock", money, "captured", "order-1", "card", "https://x/return", { "a": 1 })

def hooking () -> None: Webhook("mock", "charge.captured", "ch_1", "captured", "order-1", {})

def verifying () -> None: pay.webhook(body, heads)

def forged () -> None:

    with contextlib.suppress(Fault): pay.webhook(body, { "x-signature": "00" * 32 })

async def paying () -> None: await pay.charge(money, "order-1", customer={ "email": "a@x.io" }, returns="https://x/return")

async def refunding () -> None:

    charge = await pay.charge(money, "order-1")

    await pay.refund(charge.id, Money(500, "EGP"))

bench.measure("gateway.charge.build", charging)
bench.measure("gateway.webhook.build", hooking)
bench.measure("gateway.webhook.verify", verifying)
bench.measure("gateway.webhook.forged", forged)
loop.run_until_complete(bench.measure_async("gateway.mock.charge", paying, rounds=2000))
loop.run_until_complete(bench.measure_async("gateway.mock.charge+refund", refunding, rounds=1000))
loop.close()
log.close()
