from engine.error import Code, Fault
from engine.func import func
from engine.log import log
from engine.test import Bench
from functools import partial, wraps
from typing import Any

bench   = Bench()
memo    = func.memo(60.0, 1024)
limiter = func.limiter(1_000_000_000.0, 1_000_000)
breaker = func.breaker("bench", 5, 30.0)
nested  = { "page": 2, "filters": { "state": ["open", "paid"], "tenant": 7 }, "sort": ("created", "desc") }
steps   = (str.strip, str.lower, str.title)
ran     = [0]

def sample ( first: int, second: str = "b", *rest: int, flag: bool = False, **extra: str ) -> int:

    return first + len(second) + len(rest) + int(flag) + len(extra)

def plain ( value: int ) -> int: return value + 1

async def work () -> int: return 1

async def lost () -> int: raise Fault(Code.NOT_FOUND, reason="bench")

async def echo ( value: int ) -> int: return value

async def double ( items: list[int] ) -> list[int]: return [item * 2 for item in items]

@wraps(sample)
def wrapped ( *args: Any, **kwargs: Any ) -> int: return sample(*args, **kwargs)

bound  = partial(wrapped, 1)
kept   = func.cached(60.0, 1024)(echo)
shared = func.single(echo)
lifted = func.lift(plain)
hooked = func.hook(echo, before=plain, after=plain)
first  = func.once(work)
batch  = func.batch(double, 64)
chain  = func.compose(*steps)

def key () -> None: func.key(7, "orders")

def key_nested () -> None: func.key(7, "orders", **nested)

def name () -> None: func.name(bound)

def unwrap () -> None: func.unwrap(bound)

def params () -> None: func.params(sample)

def required () -> None: func.required(sample)

def bind () -> None: func.bind(sample, 1, "two", 3, flag=True, note="x")

def accepts () -> None: func.accepts(sample, 1, "two", 3, flag=True)

def info () -> None: func.info(sample)

def resolve () -> None: func.resolve("engine.func:func.key", ("engine",))

def is_async () -> None: func.is_async(echo)

def pipe () -> None: func.pipe("  Hello World  ", *steps)

def compose () -> None: chain("  Hello World  ")

def memo_set () -> None: memo.set("orders", 1)

def memo_get () -> None: memo.get("orders")

def allow () -> None: limiter.allow()

async def call () -> None: await func.call(echo, 1)

async def call_plain () -> None: await func.call(plain, 1)

async def lift () -> None: await lifted(1)

async def hook () -> None: await hooked(1)

async def cached () -> None: await kept(7)

async def single () -> None: await shared(7)

async def once () -> None: await first()

async def remember () -> None: await memo.remember("orders", work)

async def retry () -> None: await func.retry(work)

async def timeout () -> None: await func.timeout(5.0, work)

async def hedge () -> None: await func.hedge(work, 0.05)

async def broken () -> None: await breaker.call(work)

async def put () -> None: await batch.put(3)

async def settle () -> None: await func.settle([work, lost, work])

async def fallback () -> None: await func.fallback(lost, work)

async def attempt () -> None: await func.attempt(lost, 0)

async def measure () -> None: await func.measure(work)

log.setup("error")
bench.measure("func.key", key)
bench.measure("func.key.nested", key_nested)
bench.measure("func.name", name)
bench.measure("func.unwrap", unwrap)
bench.measure("func.params", params, rounds=5000)
bench.measure("func.required", required, rounds=5000)
bench.measure("func.bind", bind, rounds=5000)
bench.measure("func.accepts", accepts, rounds=5000)
bench.measure("func.info", info, rounds=2000)
bench.measure("func.resolve", resolve)
bench.measure("func.is_async", is_async)
bench.measure("func.pipe", pipe)
bench.measure("func.compose", compose)
bench.measure("memo.set", memo_set)
bench.measure("memo.get", memo_get)
bench.measure("limiter.allow", allow)
Bench.run(bench.measure_async("func.call", call))
Bench.run(bench.measure_async("func.call.plain", call_plain))
Bench.run(bench.measure_async("func.lift", lift))
Bench.run(bench.measure_async("func.hook", hook))
Bench.run(bench.measure_async("func.cached", cached))
Bench.run(bench.measure_async("func.single", single, rounds=5000))
Bench.run(bench.measure_async("func.once", once))
Bench.run(bench.measure_async("memo.remember", remember))
Bench.run(bench.measure_async("func.retry", retry))
Bench.run(bench.measure_async("func.timeout", timeout))
Bench.run(bench.measure_async("func.hedge", hedge, rounds=5000))
Bench.run(bench.measure_async("breaker.call", broken))
Bench.run(bench.measure_async("batch.put", put, rounds=5000))
Bench.run(bench.measure_async("func.settle", settle))
Bench.run(bench.measure_async("func.fallback", fallback))
Bench.run(bench.measure_async("func.attempt", attempt))
Bench.run(bench.measure_async("func.measure", measure))
