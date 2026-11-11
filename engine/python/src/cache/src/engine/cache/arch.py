from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import TypeGuard

from engine.date import date
from engine.error import Code, Fault
import math

type Loader[T] = Callable[[], Awaitable[T]]
type Loaders[T] = Callable[[list[str]], Awaitable[Mapping[str, T]]]

type Command = Sequence[str | bytes | float]

LOCK_TTL = 10.0
STALE    = "__stale__"

INFLIGHT = 512
PORT     = 6379

MAX_ITEMS = 100_000
RAW       = b"\x00"
KEY       = 1_024
LONGEST   = 10 * 366 * 86_400.0
STEP      = 0.05
PAIR      = 2
GLOB      = str.maketrans({ "*": "\\*", "?": "\\?", "[": "\\[", "]": "\\]", "\\": "\\\\" })
TYPED     = ("WRONGTYPE", "ERR value is not an integer", "ERR value is not a valid float", "ERR increment or decrement")

DROP = """
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
"""
SWAP = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[3] == '' then redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
else redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3]) end
return 1
"""
COUNT = """
local value = redis.call('INCRBY', KEYS[1], ARGV[1])
if redis.call('PTTL', KEYS[1]) == -1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return value
"""
BUCKET = """
local rate, burst, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local clock = redis.call('TIME')
local now   = tonumber(clock[1]) + tonumber(clock[2]) / 1000000
local found = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local held  = tonumber(found[1]) or burst
local at    = tonumber(found[2]) or now
local left  = math.min(burst, held + math.max(0, now - at) * rate)
local allowed = 0
if left >= cost then left = left - cost allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', left, 'at', now)
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return { allowed, tostring(left) }
"""

@dataclass(frozen=True, slots=True)
class Hit:

    allowed   : bool
    remaining : int
    reset     : float

    def retry_after ( self ) -> float:

        return max(0.0, self.reset - date.stamp())

def name ( key: object ) -> TypeGuard[str]:

    if type(key) is str and 0 < len(key) <= KEY: return True

    raise Fault(Code.INTERNAL, reason="cache.key")

def life ( ttl: object ) -> float | None:

    if ttl is None: return None
    if isinstance(ttl, int | float) and type(ttl) is not bool and math.isfinite(ttl) and 0 < ttl <= LONGEST:

        return float(ttl)

    raise Fault(Code.INTERNAL, reason="cache.ttl")

def whole ( value: object, what: str, least: int = 1 ) -> int:

    if type(value) is int and value >= least: return value

    raise Fault(Code.INTERNAL, reason=f"cache.{what}")

def real ( value: object, what: str ) -> float:

    if isinstance(value, int | float) and type(value) is not bool and math.isfinite(value) and value > 0:

        return float(value)

    raise Fault(Code.INTERNAL, reason=f"cache.{what}")
