from engine.cache import Cache, Memory
from engine.cache.arch import KEY, LONGEST
from engine.cache.replies import Replies
from engine.cache.wire import Wire
from engine.error import Code, Fault
from engine.log import log
from collections.abc import Awaitable, Coroutine
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, cast
import asyncio, hiredis, math

type Step = tuple[str, Any, Any, Any]

READS = frozenset({ "get", "has", "many", "keys", "ttl" })

EXAMPLES = 500
FLAG: Any = True
REASONS  = frozenset({ "cache.key", "cache.ttl", "cache.value", "cache.step", "cache.type", "cache.limit", "cache.prefix", "cache.hit", "cache.bucket", "cache.wait", "cache.grace", "cache.tags", "cache.locked" })
KEYS     = st.one_of(st.sampled_from(["a", "b", "ab", "a:b", "", "k" * KEY, "k" * (KEY + 1), "é", " "]), st.text(max_size=6), st.integers(), st.none())
VALUES   = st.one_of(st.integers(-(1 << 62), 1 << 62), st.text(max_size=8), st.dictionaries(st.text(max_size=3), st.integers(), max_size=2), st.lists(st.integers(), max_size=2), st.booleans(), st.none(), st.binary(max_size=6))
TTLS     = st.one_of(st.none(), st.just(1000.0), st.just(0), st.just(-1), st.just(math.inf), st.just(math.nan), st.just(LONGEST + 1), st.just(FLAG), st.just("5"), st.floats(min_value=1, max_value=1e6))
VERBS    = st.sampled_from(["set", "get", "add", "delete", "take", "drop", "swap", "increment", "many", "forget", "has", "keys", "ttl"])
STEPS    = st.lists(st.tuples(VERBS, KEYS, VALUES, TTLS), max_size=24)
RESP     = st.lists(st.one_of(st.binary(max_size=12), st.integers(-(1 << 62), 1 << 62), st.none(), st.lists(st.binary(max_size=4), max_size=3), st.sampled_from(["ERR boom", "WRONGTYPE x"])), max_size=8)

loop = asyncio.new_event_loop()

log.setup("error", "json", Path("/dev/null"))

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

async def tried [T] ( work: Awaitable[T] ) -> T | Fault:

    try: return await work
    except Fault as fault: return fault

def sound_key ( key: object ) -> bool:

    return type(key) is str and 0 < len(key) <= KEY

def sound_ttl ( ttl: object ) -> bool:

    if ttl is None: return True

    return isinstance(ttl, int | float) and type(ttl) is not bool and math.isfinite(ttl) and 0 < ttl <= LONGEST

def refused ( made: object ) -> bool:

    return isinstance(made, Fault) and made.code is Code.INTERNAL and made.reason in REASONS

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(STEPS)
def modeled ( steps: list[Step] ) -> None:

    store = Memory()
    cache = Cache(store)
    model: dict[str, Any] = {}

    for verb, key, value, ttl in steps: played(cache, model, verb, key, value, ttl)

    assert sorted(model) == run(cache.keys("", 10_000))
    assert run(cache.many(list(model))) == model

def played ( cache: Cache, model: dict[str, Any], verb: str, key: Any, value: Any, ttl: Any ) -> None:

    made  = run(tried(step(cache, verb, key, value, ttl)))
    legal = sound_key(key) and sound_ttl(ttl) and (value is not None or verb not in ("set", "add", "swap"))
    legal = legal and (type(value) is int or verb != "increment")

    if verb in READS or verb in ("take", "forget", "drop", "delete"): assert not isinstance(made, Fault), (verb, made)
    elif not legal:

        assert refused(made), (verb, key, value, ttl, made)

        return

    if isinstance(made, Fault):

        assert verb == "increment"
        assert made.reason == "cache.type"
        assert type(model.get(key)) is not int

        return

    if verb in READS: read(model, verb, key, made)
    else: written(model, verb, key, value, made)

def read ( model: dict[str, Any], verb: str, key: Any, made: Any ) -> None:

    if verb == "get": assert made == model.get(key)
    elif verb == "has": assert made == (key in model)
    elif verb == "many": assert made == ({ key: model[key] } if key in model else {})
    elif verb == "keys": assert made == sorted(model)[:10]
    else: assert made is None or 0 < made <= LONGEST

def written ( model: dict[str, Any], verb: str, key: Any, value: Any, made: Any ) -> None:

    if verb == "set": model[key] = value
    elif verb == "add":

        assert made == (key not in model)

        if made: model[key] = value

    elif verb == "delete": assert made == (model.pop(key, None) is not None)
    elif verb == "forget": assert made == int(model.pop(key, None) is not None)
    elif verb == "take": assert made == model.pop(key, None)
    elif verb in ("drop", "swap"):

        assert made == (key in model and model[key] == value)

        if made and verb == "drop": del model[key]

    else:

        assert made == model.get(key, 0) + value

        model[key] = made

async def step ( cache: Cache, verb: str, key: Any, value: Any, ttl: Any ) -> Any:

    store = cache.store()
    calls: dict[str, tuple[Any, tuple[Any, ...]]] = {
        "set": (cache.set, (key, value, ttl)), "get": (cache.get, (key,)), "add": (cache.add, (key, value, ttl)),
        "delete": (store.delete, (key,)), "take": (cache.take, (key,)), "drop": (cache.drop, (key, value)),
        "swap": (cache.swap, (key, value, value, ttl)), "increment": (cache.increment, (key, value, ttl)),
        "many": (cache.many, ([key],)), "forget": (cache.forget, (key,)), "has": (cache.has, (key,)),
        "keys": (cache.keys, ("", 10)), "ttl": (cache.ttl, (key,)),
    }
    work, args = calls[verb]

    return await work(*args)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(0, 12), st.integers(1, 40), st.integers(1, 12), st.integers(1, 6))
def limited ( limit: int, asks: int, burst: int, cost: int ) -> None:

    cache = Cache(Memory())
    hits  = [run(cache.hit("ip", limit, 3600)) for _ in range(asks)]
    doors = [run(cache.bucket("api", 0.0001, burst, cost)) for _ in range(asks)]

    assert sum(hit.allowed for hit in hits) == min(limit, asks)
    assert [hit.remaining for hit in hits] == [max(0, limit - at) for at in range(1, asks + 1)]
    assert all(hit.retry_after() >= 0 for hit in hits)
    assert sum(door.allowed for door in doors) == min(asks, burst // cost)
    assert all(door.remaining >= 0 for door in doors)
    assert all(door.reset > 0 for door in doors)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(1, 6), st.integers(0, 3), st.integers(1, 4))
def locked ( holders: int, late: int, renewals: int ) -> None:

    store = Memory()
    cache = Cache(store)
    seen: list[int] = []

    async def hold ( at: int ) -> None:

        async with cache.locked("job", ttl=5, wait=5) as token:

            seen.append(at)

            for _ in range(renewals): assert await cache.renew("job", token, 5)

            await asyncio.sleep(0)

            assert await store.get("lock:job") == token

    async def crowd () -> None:

        await asyncio.gather(*(hold(at) for at in range(holders)))

    run(crowd())

    assert sorted(seen) == list(range(holders))
    assert run(store.get("lock:job")) is None

    token = run(cache.lock("job", 5))

    assert token is not None
    assert all(run(cache.lock("job", 5, wait=0)) is None for _ in range(late))
    assert not run(cache.unlock("job", "other"))
    assert run(cache.unlock("job", token))
    assert not run(cache.unlock("job", token))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(RESP, st.lists(st.integers(1, 40), max_size=6), st.binary(max_size=6))
def replied ( values: list[Any], cuts: list[int], junk: bytes ) -> None:

    run(replaying(values, cuts, junk))

async def replaying ( values: list[Any], cuts: list[int], junk: bytes ) -> None:

    wire     = Wire("redis://127.0.0.1:6379/14", wait=5)
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

    futures = [protocol.submit(b"*1\r\n$4\r\nPING\r\n") for _ in values]
    stream  = b"".join(encoded(value) for value in values)
    pieces: list[bytes] = []

    for cut in cuts:

        if not stream: break

        pieces.append(stream[:cut])
        stream = stream[cut:]

    pieces.append(stream)

    for piece in pieces: protocol.data_received(piece)

    for value, future in zip(values, futures, strict=True):

        made = await tried_future(future)

        if isinstance(value, str): assert (type(made), str(made)) == (hiredis.ReplyError, value)
        else: assert made == value, (value, made)

    assert not protocol.pending
    assert not closed

    extra = protocol.submit(b"*1\r\n$4\r\nPING\r\n")

    if junk and junk[:1] not in b"+-:$*_,#=(%~|>!":

        protocol.data_received(junk)

        assert isinstance(await tried_future(extra), hiredis.ProtocolError | ConnectionError)
        assert closed == [True]

    else:

        protocol.data_received(b"+OK\r\n")

        assert await tried_future(extra) == b"OK"

async def tried_future ( future: asyncio.Future[Any] ) -> Any:

    try: return await future
    except (hiredis.ReplyError, hiredis.ProtocolError, ConnectionError) as error: return error

def encoded ( value: Any ) -> bytes:

    if value is None: return b"$-1\r\n"
    if isinstance(value, bool): return b":1\r\n" if value else b":0\r\n"
    if isinstance(value, int): return f":{value}\r\n".encode()
    if isinstance(value, str): return f"-{value}\r\n".encode()
    if isinstance(value, bytes): return b"$" + str(len(value)).encode() + b"\r\n" + value + b"\r\n"

    return b"*" + str(len(value)).encode() + b"\r\n" + b"".join(encoded(item) for item in value)

modeled()
limited()
locked()
replied()

loop.close()
log.close()

print(f"fuzz cache  examples={EXAMPLES * 4}  ok")
