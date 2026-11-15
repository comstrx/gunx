from argon2 import PasswordHasher, Type, extract_parameters
from argon2.exceptions import HashingError, InvalidHashError, VerificationError
from engine.error import Code, Fault
from .arch import (
    HASH_MIN, HASHED, KDF_MAX, KDF_VERSION, LANE_MEMORY, LANES, LANES_CEILING, MEMORY_CEILING, MEMORY_COST,
    SALT_MIN, TIME_CEILING, TIME_COST,
)

class Kdf:

    __slots__ = ("_hasher", "lanes", "memory", "time")

    def __init__ ( self, time: int = TIME_COST, memory: int = MEMORY_COST, lanes: int = LANES ) -> None:

        valid = type(time) is int and type(memory) is int and type(lanes) is int

        if not valid or not 1 <= time <= TIME_CEILING or not 1 <= lanes <= LANES_CEILING:
            raise Fault(Code.INTERNAL, reason="crypto.cost")
        if not LANE_MEMORY * lanes <= memory <= MEMORY_CEILING:
            raise Fault(Code.INTERNAL, reason="crypto.cost")

        self.time    = time
        self.memory  = memory
        self.lanes   = lanes
        self._hasher = PasswordHasher(time_cost=time, memory_cost=memory, parallelism=lanes, type=Type.ID)

    def hash ( self, data: bytes ) -> str:

        try: return self._hasher.hash(data)
        except HashingError as error: raise Fault(Code.INTERNAL, reason="crypto.cost") from error

    def check ( self, data: bytes, hashed: str ) -> bool:

        if not self._sane_(hashed): return False

        try: return self._hasher.verify(hashed, data)
        except (VerificationError, InvalidHashError, UnicodeError): return False

    def stale ( self, hashed: str ) -> bool:

        if not self._sane_(hashed): return True

        try: return self._hasher.check_needs_rehash(hashed)
        except InvalidHashError: return True

    def _sane_ ( self, hashed: str ) -> bool:

        if type(hashed) is not str or not hashed or len(hashed) > HASHED: return False

        try: found = extract_parameters(hashed)
        except (InvalidHashError, ValueError): return False

        return (
            found.version == KDF_VERSION and 1 <= found.time_cost <= self.time
            and 1 <= found.parallelism <= self.lanes
            and LANE_MEMORY * found.parallelism <= found.memory_cost <= self.memory
            and SALT_MIN <= found.salt_len <= KDF_MAX and HASH_MIN <= found.hash_len <= KDF_MAX
        )
