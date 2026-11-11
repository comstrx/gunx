from engine.cache import Cache, Memory, Redis, cache
from engine.cache.replies import Replies
from engine.cache.wire import Wire
from engine.error import Code, Fault
from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any, cast
import asyncio, hashlib, hiredis, math, os, pytest

REDIS = os.environ.get("ENGINE_REDIS_URL", "redis://127.0.0.1:6379/14")

@pytest.fixture(params=["memory", "redis"])
async def store ( request: pytest.FixtureRequest ) -> Memory | Redis:

    if request.param == "memory": return Memory()

    made = Redis(REDIS, prefix="engine-test:")

    assert await made.ping()

    await made.clear()

    return made

async def test_stores_share_one_contract ( store: Memory | Redis ) -> None:

    await store.set("a", { "n": 1 })
    await store.set("b", "text", ttl=5)

    assert await store.get("a") == { "n": 1 } and await store.get("b") == "text" and await store.get("zz") is None
    assert await store.many(["a", "b", "zz"]) == { "a": { "n": 1 }, "b": "text" }
    assert await store.add("a", 2) is False and await store.add("c", 2, ttl=5) is True
    assert await store.increment("count", 2, ttl=5) == 2 and await store.increment("count") == 3
    assert (await store.ttl("b") or 0) <= 5 and await store.ttl("a") is None and await store.ttl("zz") is None
    assert await store.expire("a", 0.05)
    assert not await store.expire("zz", 1)

    await asyncio.sleep(0.08)

    assert await store.get("a") is None
    assert await store.delete("b") and not await store.delete("b")

    await store.set_many({ "m1": 1, "m2": 2 }, ttl=5)

    assert await store.many(["m1", "m2"]) == { "m1": 1, "m2": 2 } and await store.keys("m") == ["m1", "m2"]
    assert await store.keys("m", limit=1) == ["m1"] and await store.keys("zz") == []

    await store.set_many({})
    await store.set("blob", b"\x00\x01{not json", ttl=5)

    assert await store.get("blob") == b"\x00\x01{not json" and (await store.many(["blob"]))["blob"][:2] == b"\x00\x01"

    assert await store.clear() >= 1 and await store.get("c") is None and await store.ping()

    await store.close()

async def test_stores_take_drop_swap_and_count_in_one_step ( store: Memory | Redis ) -> None:

    await store.set("once", { "n": 1 }, ttl=5)

    assert await store.take("once") == { "n": 1 } and await store.take("once") is None and await store.get("once") is None

    await store.set("held", "mine", ttl=5)

    assert not await store.drop("held", "theirs") and await store.get("held") == "mine" and not await store.drop("zz", "mine")
    assert await store.drop("held", "mine") and not await store.drop("held", "mine") and await store.get("held") is None

    await store.set("state", "draft", ttl=5)

    assert not await store.swap("state", "paid", "sent") and not await store.swap("zz", "draft", "sent")
    assert await store.swap("state", "draft", "paid") and await store.get("state") == "paid" and 0 < (await store.ttl("state") or 0) <= 5
    assert await store.swap("state", "paid", "paid", ttl=60) and (await store.ttl("state") or 0) > 50

    await store.set("bare", 1)

    assert await store.increment("bare", 1, ttl=5) == 2 and 0 < (await store.ttl("bare") or 0) <= 5
    assert await store.increment("timed", 3, ttl=5) == 3 and await store.increment("timed", 1, ttl=60) == 4
    assert 0 < (await store.ttl("timed") or 0) <= 5 and await store.increment("plain") == 1 and await store.ttl("plain") is None

    counted = await asyncio.gather(*(store.increment("crowd", 1, ttl=5) for _ in range(100)))

    assert sorted(counted) == list(range(1, 101)) and 0 < (await store.ttl("crowd") or 0) <= 5

    await store.set_many({ "ticket": "t1", "prize": "p1" }, ttl=5)

    taken   = await asyncio.gather(*(store.take("prize") for _ in range(50)))
    dropped = await asyncio.gather(*(store.drop("ticket", "t1") for _ in range(50)))

    assert taken.count("p1") == 1 and taken.count(None) == 49 and dropped.count(True) == 1

    spent = await asyncio.gather(*(store.bucket("door", 0.001, 10) for _ in range(200)))

    assert [allowed for allowed, _ in spent].count(True) == 10 and min(left for _, left in spent) < 1
    assert (await store.bucket("wide", 0.001, 10, cost=4))[1] >= 6 and not (await store.bucket("wide", 0.001, 10, cost=8))[0]

    await store.clear()
    await store.close()

async def test_a_late_owner_never_frees_or_renews_its_successor ( store: Memory | Redis ) -> None:

    first, second = Cache(store), Cache(store)

    late = await first.lock("resource", ttl=0.05)

    assert late is not None and await first.renew("resource", late, ttl=0.05)

    await asyncio.sleep(0.08)

    heir = await second.lock("resource", ttl=10)

    assert heir is not None and heir != late
    assert not await first.unlock("resource", late) and not await first.renew("resource", late)
    assert await store.get("lock:resource") == heir and await second.renew("resource", heir, ttl=60)
    assert (await store.ttl("lock:resource") or 0) > 50 and await second.unlock("resource", heir)
    assert await store.get("lock:resource") is None and not await second.unlock("resource", heir)

    owners = 0
    peak   = 0

    async def work () -> None:

        nonlocal owners, peak

        async with first.locked("crowded", ttl=5, wait=5):

            owners += 1
            peak    = max(peak, owners)

            await asyncio.sleep(0)

            owners -= 1

    await asyncio.gather(*(work() for _ in range(40)))

    assert peak == 1 and owners == 0 and await store.get("lock:crowded") is None

    await store.clear()
    await store.close()

async def test_redis_scripts_load_themselves_once () -> None:

    redis  = Redis(REDIS, prefix="engine-test:script:")
    script = f"return ARGV[1] .. '{os.urandom(8).hex()}'"

    digest = hashlib.sha1(script.encode(), usedforsecurity=False).hexdigest()

    with pytest.raises(Fault) as unknown: await redis.client().send("EVALSHA", digest, 1, "k", "a")

    assert unknown.value.reason == "cache.script" and (await redis.run(script, "k", "a")).decode().startswith("a")
    assert await redis.client().send("EVALSHA", digest, 1, "k", "b") == await redis.run(script, "k", "b")

    with pytest.raises(Fault) as broken: await redis.run("return nothing(", "k")

    assert broken.value.code is Code.INTERNAL and broken.value.reason == "cache.redis"

    await redis.close()

async def test_cache_remembers_tags_locks_and_hits () -> None:

    local = Cache(Memory())
    loads = 0

    async def load () -> dict[str, int]:

        nonlocal loads

        loads += 1

        await asyncio.sleep(0.01)

        return { "n": loads }

    results = await asyncio.gather(*(local.remember("k", 10, load) for _ in range(5)))

    assert all(result == { "n": 1 } for result in results) and loads == 1
    assert await local.get("k") == { "n": 1 } and await local.get("zz", "d") == "d" and await local.has("k")
    assert await local.forever("f", load) == { "n": 2 } and local.stats() == { "hits": 1, "misses": 7, "loading": 0 }
    assert await local.many(["k", "f"]) == { "k": { "n": 1 }, "f": { "n": 2 } }
    assert await local.take("f") == { "n": 2 } and await local.take("f", 0) == 0
    assert await local.increment("c", 5) == 5 and await local.decrement("c", 2) == 3
    assert await local.forget("k", "c", "nothing") == 2

    tagged = local.tags("users", "tenant:1")

    assert tagged.names() == ("tenant:1", "users")
    assert await tagged.remember("u1", 10, load) == { "n": 3 } and await tagged.get("u1") == { "n": 3 }

    await tagged.set("u2", 2)

    assert await tagged.flush() == 2 and await tagged.get("u1", "gone") == "gone" and not await tagged.forget("u2")

    with pytest.raises(Fault) as bad: local.tags()

    assert bad.value.code is Code.INTERNAL and bad.value.reason == "cache.tags"

    token = await local.lock("job", ttl=5)

    assert token is not None and await local.lock("job", wait=0.02) is None
    assert not await local.unlock("job", "wrong") and await local.unlock("job", token) and await local.lock("job") is not None

    hits = [await local.hit("ip:1", 2, 60) for _ in range(3)]

    assert [hit.allowed for hit in hits] == [True, True, False] and hits[2].remaining == 0 and hits[2].retry_after() > 0
    assert await local.flush() >= 1 and await local.ping() and local.describe()["store"] == "memory"
    assert isinstance(local.local(), Memory) and local.store().name == "memory"

    await local.close()

async def test_the_shared_cache_can_switch_stores () -> None:

    redis = Redis(REDIS, prefix="engine-test:shared:")

    cache.use(redis)

    await cache.set("x", 1)

    assert cache.store() is redis and await cache.get("x") == 1
    assert await cache.flush() == 1

    cache.use(Memory())

    await redis.close()

async def test_redis_failures_become_faults () -> None:

    broken = Redis("redis://127.0.0.1:1/0", wait=0.2)

    assert not await broken.ping()

    with pytest.raises(Fault) as caught: await broken.get("x")

    assert caught.value.code is Code.UNAVAILABLE and caught.value.reason == "cache.redis" and caught.value.unknown

    await broken.close()

async def test_batches_stale_reads_locks_and_buckets () -> None:

    local = Cache(Memory())
    loads: list[list[str]] = []

    async def load_many ( keys: list[str] ) -> dict[str, int]:

        loads.append(keys)

        return { key: len(key) for key in keys }

    await local.set_many({ "a": 1 }, ttl=5)

    assert await local.remember_many(["a", "bb", "a", "ccc"], 5, load_many) == { "a": 1, "bb": 2, "ccc": 3 } and loads == [["bb", "ccc"]]
    assert await local.remember_many(["bb"], 5, load_many) == { "bb": 2 } and loads == [["bb", "ccc"]] and await local.keys() == ["a", "bb", "ccc"]
    assert await local.touch("a", 60) and await local.touch("zz", 60) is False and (await local.ttl("a") or 0) > 50 and await local.ttl("zz") is None

    calls = 0

    async def load () -> int:

        nonlocal calls

        calls += 1

        return calls

    assert await local.stale("s", 0.05, 1.0, load) == 1 and await local.stale("s", 0.05, 1.0, load) == 1 and calls == 1

    await asyncio.sleep(0.07)

    assert await local.stale("s", 0.05, 1.0, load) == 1

    await asyncio.sleep(0.02)

    assert calls == 2 and await local.stale("s", 0.05, 1.0, load) == 2

    async with local.locked("job") as token:

        assert token and await local.lock("job", wait=0.01) is None

        with pytest.raises(Fault) as busy:

            async with local.locked("job", wait=0.01): pass

        assert busy.value.code is Code.CONFLICT and busy.value.reason == "cache.locked"

    assert await local.lock("job") is not None

    hits = [await local.bucket("api:1", rate=100, burst=2) for _ in range(3)]

    assert [hit.allowed for hit in hits] == [True, True, False] and hits[2].retry_after() > 0 and hits[1].remaining == 0

    await asyncio.sleep(0.02)

    assert (await local.bucket("api:1", rate=100, burst=2)).allowed

    for rate, burst, cost in ((0, 2, 1), (1, 0, 1), (1, 2, 0)):

        with pytest.raises(Fault) as unset: await local.bucket("api:2", rate, burst, cost)

        assert unset.value.code is Code.INTERNAL and unset.value.reason == "cache.bucket"

    async def broken () -> int:

        raise Fault(Code.UNAVAILABLE, reason="origin.down")

    for name in ("f1", "f2", "f3"):

        with pytest.raises(Fault): await local.remember(name, 5, broken)

    assert local.stats()["loading"] == 0 and await local.swap("a", 1, 2) and await local.drop("a", 2) and not await local.has("a")

    await local.close()

async def test_the_wire_watchdog_fails_a_stalled_connection () -> None:

    wire     = Wire(REDIS, wait=0.05)
    protocol = Replies(wire)

    class Stalled:

        closing = False

        def write ( self, data: bytes ) -> None:

            assert data.startswith(b"*")

        def is_closing ( self ) -> bool:

            return self.closing

        def abort ( self ) -> None:

            self.closing = True

            protocol.connection_lost(None)

    protocol.connection_made(Stalled())

    future = protocol.submit(b"*1\r\n$4\r\nPING\r\n")
    timer  = protocol.timer

    assert timer is not None and len(protocol.pending) == 1

    with pytest.raises(TimeoutError): await future

    assert protocol.transport is None and protocol.timer is None and not protocol.pending

LONG   = "k" * 1025
FLAG: Any = True

def refused ( work: Callable[[], object], reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL and caught.value.reason == reason

    return caught.value

async def failed ( work: Awaitable[object], reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: await work

    assert caught.value.code is Code.INTERNAL and caught.value.reason == reason

    return caught.value

async def nothing () -> Any:

    return None

async def test_the_boundary_refuses_what_would_corrupt_or_crash_a_store ( store: Memory | Redis ) -> None:

    local = Cache(store)

    for ttl in (0, -1, math.inf, math.nan, FLAG, "5", 11 * 366 * 86400.0, 1e-9 - 1e-9):

        bad = cast("Any", ttl)

        await failed(local.set("k", 1, bad), "cache.ttl")
        await failed(local.add("k", 1, bad), "cache.ttl")
        await failed(local.set_many({ "k": 1 }, bad), "cache.ttl")
        await failed(local.swap("k", 1, 2, bad), "cache.ttl")
        await failed(local.increment("k", 1, bad), "cache.ttl")
        await failed(local.touch("k", bad), "cache.ttl")
        await failed(local.remember("k", bad, nothing), "cache.ttl")
        await failed(local.remember_many(["k"], bad, cast("Any", nothing)), "cache.ttl")
        await failed(local.lock("k", bad), "cache.ttl")
        await failed(local.renew("k", "t", bad), "cache.ttl")

    assert await store.get("k") is None and await store.ttl("k") is None

    for key in ("", LONG, cast("Any", 7), cast("Any", None), cast("Any", b"k")):

        await failed(local.set(key, 1), "cache.key")
        await failed(local.add(key, 1), "cache.key")
        await failed(local.set_many({ key: 1 }), "cache.key")
        await failed(local.swap(key, 1, 2), "cache.key")
        await failed(local.increment(key), "cache.key")
        await failed(local.touch(key, 5), "cache.key")
        await failed(local.remember(key, 5, nothing), "cache.key")
        await failed(local.lock(key), "cache.key")
        await failed(local.hit(key, 1, 60), "cache.key")
        await failed(local.bucket(key, 1, 1), "cache.key")

        assert await local.get(key) is None and await local.take(key) is None and not await local.has(key)
        assert await local.forget(key) == 0 and not await local.drop(key, 1) and await local.ttl(key) is None
        assert await local.many([key]) == {}

    await failed(local.set("k", None), "cache.value")
    await failed(local.add("k", None), "cache.value")
    await failed(local.set_many({ "k": None }), "cache.value")
    await failed(local.swap("k", 1, None), "cache.value")

    assert await store.keys() == [] and await store.clear() == 0

    await store.close()

async def test_the_boundary_refuses_counts_limits_and_waits_it_cannot_honor ( store: Memory | Redis ) -> None:

    local = Cache(store)

    for step in (cast("Any", 1.5), FLAG, cast("Any", "1")):

        await failed(local.increment("k", step), "cache.step")
        await failed(local.decrement("k", step), "cache.step")

    for limit in (0, -1, cast("Any", 1.0), FLAG): await failed(local.keys("", limit), "cache.limit")
    for prefix in (cast("Any", 1), cast("Any", None)):

        await failed(local.keys(prefix), "cache.prefix")
        await failed(local.flush(prefix), "cache.prefix")

    for rate, burst, cost in ((0, 2, 1), (1, 0, 1), (1, 2, 0), (math.nan, 2, 1), (math.inf, 2, 1), (FLAG, 2, 1), (1, 1.0, 1), (1, 2, FLAG), ("1", 2, 1)):

        await failed(local.bucket("b", cast("Any", rate), cast("Any", burst), cast("Any", cost)), "cache.bucket")

    for limit, window in ((-1, 60), (1.0, 60), (FLAG, 60), (1, 0), (1, -1), (1, math.nan), (1, math.inf), (1, "60"), (1, FLAG)):

        await failed(local.hit("h", cast("Any", limit), cast("Any", window)), "cache.hit")

    assert (await local.hit("h", 0, 60)).allowed is False and (await local.hit("h", 0, 60)).remaining == 0

    for wait in (-1, math.inf, math.nan, FLAG, "1"): await failed(local.lock("l", 5, cast("Any", wait)), "cache.wait")
    for step_ in (0, -0.1, math.nan, FLAG, "x"): await failed(local.lock("l", 5, 0, cast("Any", step_)), "cache.step")
    for grace in (0, -1, math.nan): await failed(local.stale("s", 5, grace, nothing), "cache.grace")

    await failed(local.stale("s", 0, 5, nothing), "cache.ttl")
    await failed(local.stale("", 5, 5, nothing), "cache.key")

    for names in ((), ("",), (cast("Any", 1),), ("a", "")): refused(partial(local.tags, *names), "cache.tags")

    assert await store.clear() >= 0

    await store.close()

def test_stores_and_wires_refuse_settings_they_cannot_run_on () -> None:

    local = Cache(Memory())

    refused(partial(local.use, cast("Any", object())), "cache.store")
    refused(partial(Memory, 0), "cache.size")
    refused(partial(Memory, cast("Any", "9")), "cache.size")
    refused(partial(Redis, REDIS, cast("Any", 1)), "cache.prefix")
    refused(partial(Redis, REDIS, pool=0), "cache.pool")
    refused(partial(Redis, REDIS, pool=cast("Any", 2.0)), "cache.pool")

    for url in ("http://x", "redis://", "redis://h:abc", "redis://h/zz", "redis://h/-1", cast("Any", 5), cast("Any", None), "redis:///0"):

        refused(partial(Wire, url), "cache.url")

    for wait in (0, -1, math.nan, math.inf, FLAG, "2"): refused(partial(Wire, REDIS, cast("Any", wait)), "cache.wait")

async def test_a_counter_or_bucket_refuses_a_key_of_another_type ( store: Memory | Redis ) -> None:

    local = Cache(store)

    await local.set("word", "text", 5)
    await local.set("pair", { "a": 1 }, 5)
    await local.set("count", 3, 5)
    await local.set("bucket:word", "text", 5)

    await failed(local.increment("word"), "cache.type")
    await failed(local.increment("pair"), "cache.type")
    await failed(local.bucket("word", 1, 2), "cache.type")

    assert await local.get("word") == "text" and await local.increment("count", 2) == 5
    assert (await local.bucket("fresh", 1, 2)).allowed and (await local.bucket("fresh", 1, 2)).allowed and not (await local.bucket("fresh", 1, 2)).allowed

    await store.clear()
    await store.close()

async def test_prefixes_with_glob_characters_stay_literal () -> None:

    redis = Redis(REDIS, prefix="engine-test:glob:")

    await redis.clear()
    await redis.set_many({ "a*b": 1, "a1b": 2, "a[x]": 3, "a?": 4, "ax": 5, "b\\c": 6, "b\\cd": 7, "bxc": 8 }, ttl=30)

    assert await redis.keys("a*") == ["a*b"] and await redis.keys("a[") == ["a[x]"] and await redis.keys("a?") == ["a?"]
    assert await redis.keys("a") == ["a*b", "a1b", "a?", "a[x]", "ax"] and await redis.keys("b\\") == ["b\\c", "b\\cd"]
    assert await redis.clear("a*") == 1 and await redis.get("a1b") == 2 and await redis.clear("b\\c") == 2 and await redis.get("bxc") == 8
    assert await redis.clear() == 5 and await redis.keys() == []

    await redis.close()

async def test_a_stale_entry_of_another_shape_is_reloaded_and_a_failing_refresh_frees_its_marker () -> None:

    store = Memory()
    local = Cache(store)
    calls = 0
    down  = False

    async def load () -> int:

        nonlocal calls

        calls += 1

        if down: raise Fault(Code.UNAVAILABLE, reason="origin.down")

        return calls

    await store.set("s", "junk", 5)
    await store.set("t", { "__stale__": "soon", "value": 9 }, 5)
    await store.set("u", { "__stale__": math.nan, "value": 9 }, 5)
    await store.set("v", { "__stale__": 1.0 }, 5)

    assert await local.stale("s", 0.05, 1.0, load) == 1 and await local.stale("t", 0.05, 1.0, load) == 2
    assert await local.stale("u", 0.05, 1.0, load) == 3 and await local.stale("v", 0.05, 1.0, load) == 4 and calls == 4

    await asyncio.sleep(0.07)

    down = True

    assert await local.stale("s", 0.05, 1.0, load) == 1 and await store.get("refresh:s") == 1

    await asyncio.sleep(0.02)

    assert calls == 5 and await store.get("refresh:s") is None and await local.stale("s", 0.05, 1.0, load) == 1

    await asyncio.sleep(0.02)

    down = False

    assert calls == 6 and await store.get("refresh:s") is None and await local.stale("s", 0.05, 1.0, load) == 1

    await asyncio.sleep(0.02)

    assert calls == 7 and await local.stale("s", 0.05, 1.0, load) == 7

    await local.close()

async def test_remember_never_stores_a_missing_value () -> None:

    store = Memory()
    local = Cache(store)
    asked: list[list[str]] = []

    async def loads ( keys: list[str] ) -> dict[str, Any]:

        asked.append(keys)

        return { key: (None if key == "b" else len(key)) for key in keys } | { "extra": 1 }

    assert await local.remember("k", 5, nothing) is None and await store.get("k") is None and len(store) == 0
    assert await local.remember_many(["a", "b", "ccc"], 5, loads) == { "a": 1, "ccc": 3 } and asked == [["a", "b", "ccc"]]
    assert await store.get("extra") is None and await store.get("b") is None and await store.get("ccc") == 3
    assert await local.remember_many(["b"], 5, loads) == {} and asked[-1] == ["b"] and local.stats()["misses"] == 5

    await local.close()

async def test_the_protocol_fails_its_pending_replies_on_garbage () -> None:

    wire     = Wire(REDIS, wait=5)
    protocol = Replies(wire)
    closed: list[bool] = []

    class Faked:

        def write ( self, data: bytes ) -> None:

            assert data

        def is_closing ( self ) -> bool:

            return bool(closed)

        def abort ( self ) -> None:

            closed.append(True)

            protocol.connection_lost(None)

    protocol.connection_made(Faked())

    first  = protocol.submit(b"*1\r\n$4\r\nPING\r\n")
    second = protocol.submit(b"*1\r\n$4\r\nPING\r\n")

    protocol.data_received(b"+PONG\r\n")

    assert await first == b"PONG"

    protocol.data_received(b"garbage\r\n")

    with pytest.raises(hiredis.ProtocolError): await second

    assert closed == [True] and protocol.transport is None and not protocol.pending

    protocol.connection_made(Faked())

    orphan = protocol.submit(b"*1\r\n$4\r\nPING\r\n")

    protocol.data_received(b"+ONE\r\n+TWO\r\n")

    assert await orphan == b"ONE" and closed == [True, True]

async def test_redis_names_a_type_error_and_hides_the_rest () -> None:

    redis = Redis(REDIS, prefix="engine-test:typed:")

    await redis.clear()
    await redis.client().send("HSET", redis.key("hash"), "f", "v")

    await failed(redis.get("hash"), "cache.type")
    await failed(redis.increment("hash"), "cache.type")

    await redis.set("word", "text")

    await failed(redis.increment("word"), "cache.type")

    broken = await failed(redis.client().send("NOSUCHCOMMAND"), "cache.redis")

    assert broken.unknown and "NOSUCHCOMMAND" not in str(broken)
    assert await redis.clear() == 2

    await redis.close()
