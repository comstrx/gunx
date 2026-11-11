from engine.domain import Domains, Record
from engine.domain.memory import Memory
from engine.test import Bench
import asyncio

bench   = Bench()
loop    = asyncio.new_event_loop()
domains = Domains()
hosts   = [f"shop-{at}.example-store.io" for at in range(50)]

domains.use(Memory())

def normalizing () -> None: domains.normalize(" Shop.Example-Store.IO. ")

def idna () -> None: domains.normalize("متجر.مصر")

def recording () -> None: Record("shop.example-store.io", "cname", "edge.engine.io")

def challenging () -> None: domains.challenge("shop.example-store.io")

def apexing () -> None: domains.apex("a.b.shop.example-store.io")

def subdomaining () -> None: domains.subdomains(hosts, "example-store.io")

async def pointing () -> None: await domains.point("shop.example-store.io", "edge.engine.io")

async def listing () -> None: await domains.records("shop.example-store.io")

bench.measure("domain.normalize", normalizing)
bench.measure("domain.normalize.idna", idna)
bench.measure("domain.record", recording)
bench.measure("domain.challenge", challenging)
bench.measure("domain.apex", apexing)
bench.measure("domain.subdomains.50", subdomaining, rounds=5000)
loop.run_until_complete(bench.measure_async("domain.memory.point", pointing, rounds=2000))
loop.run_until_complete(bench.measure_async("domain.memory.records", listing, rounds=2000))
loop.close()
