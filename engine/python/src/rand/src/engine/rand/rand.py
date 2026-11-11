from bisect import bisect
from collections.abc import Sequence
from itertools import accumulate
from uuid import UUID as Uuid, uuid4

from engine.error import Code, Fault
from .arch import (
    ALPHABET, BYTE, CLASSES, CROCKFORD, DIGITS, HIGH, LOW, MAX_BYTES, MAX_CODE, MAX_LENGTH, MILLI, MIN_CODE,
    MIN_PASSWORD, PASSWORD, SYSTEM, TAIL, UNAMBIGUOUS, VERSION, WORD,
)
import base64, builtins, math, os, random, secrets, time

class Rand:

    def __init__ ( self ) -> None:

        self._seeded: random.Random | None = None
        self._ordered = 0
        self._sorted  = 0

    def seed ( self, value: int | str | None ) -> None:

        if value is not None and type(value) not in (int, str): raise Fault(Code.INTERNAL, reason="rand.seed")

        seed = value.encode("utf-8", "surrogatepass") if isinstance(value, str) else value

        self._seeded = random.Random(seed) if seed is not None else None

    def bytes ( self, size: int = 32 ) -> builtins.bytes:

        if not 0 < size <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="rand.size")

        return self._seeded.randbytes(size) if self._seeded else os.urandom(size)

    def hex ( self, size: int = 32 ) -> str:

        return self.bytes(size).hex()

    def quick ( self, size: int = 8 ) -> str:

        if not 0 < size <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="rand.size")

        bits = self._seeded.getrandbits(size * 8) if self._seeded else random.getrandbits(size * 8)

        return bits.to_bytes(size).hex()

    def token ( self, size: int = 32 ) -> str:

        return base64.urlsafe_b64encode(self.bytes(size)).rstrip(b"=").decode()

    def string ( self, length: int = 16, alphabet: str = ALPHABET ) -> str:

        if not 0 < length <= MAX_LENGTH or not alphabet: raise Fault(Code.INTERNAL, reason="rand.length")

        return "".join(self._picks_(alphabet, length))

    def code ( self, digits: int = 6 ) -> str:

        if type(digits) is not int or not MIN_CODE <= digits <= MAX_CODE:

            raise Fault(Code.INTERNAL, reason="rand.digits")

        return "".join(self._picks_(DIGITS, digits))

    def reference ( self, length: int = 8 ) -> str:

        return self.string(length, UNAMBIGUOUS)

    def password ( self, length: int = 20 ) -> str:

        if not MIN_PASSWORD <= length <= MAX_LENGTH: raise Fault(Code.INTERNAL, reason="rand.length")

        while True:

            found = self._picks_(PASSWORD, length)

            if all(not kind.isdisjoint(found) for kind in CLASSES): return "".join(found)

    def integer ( self, low: int, high: int ) -> int:

        if low > high: raise Fault(Code.INTERNAL, reason="rand.range")

        return self._seeded.randint(low, high) if self._seeded else low + secrets.randbelow(high - low + 1)

    def number ( self ) -> float:

        return (self._seeded or SYSTEM).random()

    def chance ( self, probability: float ) -> bool:

        return self.number() < probability

    def choice [T] ( self, items: Sequence[T] ) -> T:

        if not items: raise Fault(Code.INTERNAL, reason="rand.empty")

        return (self._seeded or SYSTEM).choice(items)

    def weighted [T] ( self, items: Sequence[T], weights: Sequence[float] ) -> T:

        if not items or len(items) != len(weights) or any(not weight >= 0 for weight in weights):

            raise Fault(Code.INTERNAL, reason="rand.weight")

        sums  = list(accumulate(weights))
        total = sums[-1]

        if not 0 < total < math.inf: raise Fault(Code.INTERNAL, reason="rand.weight")

        index = bisect(sums, self.number() * total, 0, len(sums) - 1)

        while not weights[index] > 0: index -= 1

        return items[index]

    def sample [T] ( self, items: Sequence[T], count: int ) -> list[T]:

        if not 0 <= count <= len(items): raise Fault(Code.INTERNAL, reason="rand.sample")

        return (self._seeded or SYSTEM).sample(list(items), count)

    def shuffle [T] ( self, items: Sequence[T] ) -> list[T]:

        copied = list(items)
        size   = len(copied)

        if self._seeded is not None: self._seeded.shuffle(copied)
        elif size > 1:

            words = memoryview(os.urandom(size * 8)).cast("Q")

            for index in range(size - 1, 0, -1):

                span, word = index + 1, words[index]

                if word >= WORD - WORD % span: word = secrets.randbelow(span)

                other = word % span

                copied[index], copied[other] = copied[other], copied[index]

        return copied

    def uuid ( self ) -> Uuid:

        if self._seeded: return Uuid(bytes=self._seeded.randbytes(16), version=4)

        return uuid4()

    def uuid7 ( self ) -> Uuid:

        draw   = int.from_bytes(self._seeded.randbytes(10) if self._seeded else os.urandom(10))
        millis = time.time_ns() // MILLI
        count  = self._ordered

        if millis > count >> 42: count = millis << 42 | draw >> 39
        else: count += 1

        self._ordered = count

        return Uuid(int=count >> 42 << 80 | VERSION | (count >> 30 & HIGH) << 64 | (count & LOW) << 32 | draw & TAIL)

    def ulid ( self ) -> str:

        draw   = int.from_bytes(self._seeded.randbytes(10) if self._seeded else os.urandom(10))
        millis = time.time_ns() // MILLI

        if millis > self._sorted >> 80: self._sorted = millis << 80 | draw >> 1
        else: self._sorted += 1 + (draw & TAIL)

        return base64.b32encode(self._sorted.to_bytes(20))[6:].translate(CROCKFORD).decode()

    def pid ( self ) -> int:

        return os.getpid()

    def constant_equal ( self, left: str | builtins.bytes, right: str | builtins.bytes ) -> bool:

        a = left.encode("utf-8", "surrogatepass") if isinstance(left, str) else left
        b = right.encode("utf-8", "surrogatepass") if isinstance(right, str) else right

        return secrets.compare_digest(a, b)

    def _picks_ ( self, letters: str, count: int ) -> list[str]:

        size = len(letters)

        if self._seeded is not None: return self._seeded.choices(letters, k=count)
        if size > BYTE: return [letters[secrets.randbelow(size)] for _ in range(count)]

        limit = BYTE - BYTE % size
        found: list[str] = []

        while len(found) < count:

            found += [letters[byte % size] for byte in os.urandom((count - len(found)) * 2) if byte < limit]

        return found[:count]
