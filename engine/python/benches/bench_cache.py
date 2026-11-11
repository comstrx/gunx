from engine.cache import Cache, Memory, Redis
from engine.log import log
from engine.test import Bench
from functools import partial
from pathlib import Path
from typing import Any
import asyncio, os

REDIS = os.environ.get("ENGINE_REDIS_URL", "redis://127.0.0.1:6379/14")

bench = Bench()
loop  = asyncio.new_event_loop()
local = Cache(Memory())
store = Memory()
wide  = { f"k{at}": { "n": at } for at in range(32) }

log.setup("error", "json", Path("/dev/null"))

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

async def warm ( cache: Cache ) -> None:

    await cache.set("k", { "n": 1 }, 60)
    await cache.set_many(wide, 60)
    await cache.increment("count", 1, 60)

async def loaded () -> dict[str, int]:

    return { "n": 1 }

async def loads ( keys: list[str] ) -> dict[str, int]:

    return dict.fromkeys(keys, 1)

async def get ( cache: Cache ) -> None: await cache.get("k")

async def miss ( cache: Cache ) -> None: await cache.get("missing")

async def put ( cache: Cache ) -> None: await cache.set("k", { "n": 1 }, 60)

async def many ( cache: Cache ) -> None: await cache.many(list(wide))

async def put_many ( cache: Cache ) -> None: await cache.set_many(wide, 60)

async def count ( cache: Cache ) -> None: await cache.increment("count", 1, 60)

async def gate ( cache: Cache ) -> None: await cache.add("k", 1, 60)

async def swap ( cache: Cache ) -> None: await cache.swap("state", "a", "a", 60)

async def remember ( cache: Cache ) -> None: await cache.remember("k", 60, loaded)

async def remember_many ( cache: Cache ) -> None: await cache.remember_many(list(wide), 60, loads)

async def hit ( cache: Cache ) -> None: await cache.hit("ip", 1000, 60)

async def bucket ( cache: Cache ) -> None: await cache.bucket("api", 1000.0, 1000)

async def lock ( cache: Cache ) -> None:

    token = await cache.lock("job", 5)

    if token is not None: await cache.unlock("job", token)

async def tagged ( cache: Cache ) -> None: await cache.tags("users").get("u1")

LINES: tuple[tuple[str, Any, int], ...] = (
    ("get", get, 1), ("get.miss", miss, 1), ("set", put, 1), ("many32", many, 4), ("set_many32", put_many, 4),
    ("increment", count, 1), ("add.taken", gate, 1), ("swap", swap, 1), ("remember.hit", remember, 1),
    ("remember_many32.hit", remember_many, 4), ("hit", hit, 1), ("bucket", bucket, 1), ("lock.unlock", lock, 2),
    ("tags.get", tagged, 2),
)

def lines ( cache: Cache, tag: str, rounds: int ) -> None:

    run(cache.set("state", "a", 60))

    for name, work, share in LINES:

        run(bench.measure_async(f"cache.{tag}.{name}", partial(work, cache), rounds=rounds // share))

run(warm(local))
lines(local, "memory", 5000)
run(local.close())

redis = Redis(REDIS, prefix="engine-bench:")

if run(redis.ping()):

    shared = Cache(redis)

    run(redis.clear())
    run(warm(shared))
    lines(shared, "redis", 2000)
    run(redis.clear())
    run(shared.close())

loop.close()
log.close()
