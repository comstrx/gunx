from engine.adapter import Adapter, Manager, Receipt
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

log.setup("info", "json", Path("/dev/null"))

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

async def close () -> None: await mail.close()

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
Bench.run(bench.measure_async("adapter.manager.close", close, rounds=5000))

log.close()
