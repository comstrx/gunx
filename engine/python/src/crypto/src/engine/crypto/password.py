from argon2 import PasswordHasher, Type, extract_parameters
from argon2.exceptions import HashingError, InvalidHashError, VerificationError
from engine.error import Code, Fault
from engine.string import string
from .arch import (
    HASHED, LANE_MEMORY, LANES, LANES_CEILING, MAX_LENGTH, MEMORY_CEILING, MEMORY_COST, MIN_LENGTH, TIME_CEILING,
    TIME_COST,
)

class Password:

    def __init__ ( self, time_cost: int = TIME_COST, memory_cost: int = MEMORY_COST, parallelism: int = LANES ) -> None:

        self._hasher = self._make_(time_cost, memory_cost, parallelism)

    def setup ( self, time_cost: int = TIME_COST, memory_cost: int = MEMORY_COST, parallelism: int = LANES ) -> None:

        self._hasher = self._make_(time_cost, memory_cost, parallelism)

    def hash ( self, plain: str ) -> str:

        worded = self._worded_(plain)

        if len(worded) < MIN_LENGTH: raise self._refuse_("short", f"must be at least {MIN_LENGTH} characters")
        if len(worded) > MAX_LENGTH: raise self._refuse_("long", f"must be at most {MAX_LENGTH} characters")

        try: return self._hasher.hash(worded.encode())
        except UnicodeEncodeError as error: raise self._refuse_("encoding", "is not valid text") from error
        except HashingError as error: raise Fault(Code.INTERNAL, reason="password.cost") from error

    def verify ( self, hashed: str, plain: str ) -> bool:

        if not plain or len(plain) > MAX_LENGTH or not self._sane_(hashed): return False

        try: return self._hasher.verify(hashed, self._worded_(plain).encode())
        except (VerificationError, InvalidHashError, UnicodeEncodeError): return False

    def stale ( self, hashed: str ) -> bool:

        if not self._sane_(hashed): return True

        try: return self._hasher.check_needs_rehash(hashed)
        except InvalidHashError: return True

    def _make_ ( self, time_cost: int, memory_cost: int, parallelism: int ) -> PasswordHasher:

        if not self._bounded_(time_cost, memory_cost, parallelism): raise Fault(Code.INTERNAL, reason="password.cost")

        return PasswordHasher(time_cost=time_cost, memory_cost=memory_cost, parallelism=parallelism, type=Type.ID)

    def _bounded_ ( self, time_cost: object, memory_cost: object, parallelism: object ) -> bool:

        if type(time_cost) is not int or type(memory_cost) is not int or type(parallelism) is not int: return False
        if not 1 <= time_cost <= TIME_CEILING or not 1 <= parallelism <= LANES_CEILING: return False

        return LANE_MEMORY * parallelism <= memory_cost <= MEMORY_CEILING

    def _sane_ ( self, hashed: str ) -> bool:

        if not hashed or len(hashed) > HASHED: return False

        try: found = extract_parameters(hashed)
        except InvalidHashError: return False

        return self._bounded_(found.time_cost, found.memory_cost, found.parallelism)

    def _worded_ ( self, plain: str ) -> str:

        return string.normalize(plain, "NFKC") if len(plain) <= MAX_LENGTH else plain

    def _refuse_ ( self, reason: str, message: str ) -> Fault:

        return Fault(Code.VALIDATION, reason=f"password.{reason}", errors={ "password": [message] })
