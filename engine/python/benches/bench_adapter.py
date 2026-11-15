import os
from contextlib import suppress
from engine.adapter import Adapter, Manager, Receipt
from engine.error import Code, Fault
from engine.log import log
from engine.test import Bench
from pathlib import Path

class Owl(Adapter):

    family       = "mail"
    name         = "owl"
    capabilities = frozenset({ "send", "track", "batch", "schedule", "template", "attach", "inline", "bounce" })

class Pigeon(Adapter):

    family       = "mail"
    name         = "pigeon"
    capabilities = frozenset({ "send" })

class Hawk(Adapter):

    family = "mail"
    name   = "hawk"

bench   = Bench()
owl     = Owl()
mail: Manager[Adapter] = Manager("mail")
receipt = Receipt("m-1", "Delivered", { "provider": "owl" })

log.setup("info", "json", Path(os.devnull))

for held in (Pigeon(), owl, Hawk()): mail.use(held, default=held is owl)

def can () -> None: owl.can("track")

def cannot () -> None: owl.can("fly")

def ensure () -> None: owl.ensure("send")

def need () -> None: owl.need(host="smtp.local", port=587, user="postmaster", secret=b"k")

def chosen () -> None: mail.get()

def named () -> None: mail.get("pigeon")

def has () -> None: mail.has("hawk")

def supporting () -> None: mail.supporting("send")

def matrix () -> None: mail.matrix()

def describe () -> None: mail.describe()

def use () -> None: mail.use(owl)

def accepted () -> None: receipt.accepted()

def pending () -> None: mail.pending()

async def close () -> None:

    held: Manager[Adapter] = Manager("mail")

    for adapter in (Pigeon(), Owl(), Hawk()): held.use(adapter)

    await held.close()

async def drain () -> None:

    held: Manager[Adapter] = Manager("mail")
    held.use(Owl())
    held.use(Owl())

    if await held.drain() != 1 or not held.ready(): raise RuntimeError("retirement failed")

    await held.close()

def parsed () -> None: owl.receipt({ "id": "m-1", "status": "sent", "data": { "rows": [1, 2] } })

async def answered () -> int: return 1

async def upstream () -> None: await owl.upstream(answered())

async def refused () -> None: raise Fault(Code.TOO_MANY_REQUESTS, retry_after=1, unknown=True)

async def failure () -> None:

    with suppress(Fault): await owl.upstream(refused())

bench.measure("adapter.can", can)
bench.measure("adapter.can.missing", cannot)
bench.measure("adapter.ensure", ensure)
bench.measure("adapter.need", need)
bench.measure("adapter.manager.get", chosen)
bench.measure("adapter.manager.get.named", named)
bench.measure("adapter.manager.has", has)
bench.measure("adapter.manager.supporting", supporting)
bench.measure("adapter.manager.matrix", matrix)
bench.measure("adapter.manager.describe", describe)
bench.measure("adapter.manager.use", use)
bench.measure("adapter.receipt.accepted", accepted)
bench.measure("adapter.manager.pending", pending)
bench.measure("adapter.receipt.snapshot", parsed)
Bench.run(bench.measure_async("adapter.manager.lifecycle", close, rounds=5000))
Bench.run(bench.measure_async("adapter.manager.drain", drain, rounds=5000))
Bench.run(bench.measure_async("adapter.upstream", upstream, rounds=5000))
Bench.run(bench.measure_async("adapter.upstream.failure", failure, rounds=5000))

log.close()
