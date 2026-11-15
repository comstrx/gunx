from bisect import bisect
from collections.abc import Sequence
from uuid import UUID as Uuid, uuid4

from engine.error import Code, Fault
from .arch import (
    ALPHABET, BYTE, CLASSES, CROCKFORD, DIGITS, ENCODERS, HIGH, ID_LOCK, LOW, MAX_BITS, MAX_BYTES, MAX_CODE,
    MAX_LENGTH, MAX_TIME, MILLI, MIN_CODE, MIN_PASSWORD, NUMERIC, PASSWORD, PICK_SMALL, PICK_WIDE, SYSTEM,
    TAIL, UNAMBIGUOUS, VERSION, WORD, WORDS,
)
import base64, builtins, math, os, random, secrets, time

if hasattr(os, "register_at_fork"):

    os.register_at_fork(before=ID_LOCK.acquire, after_in_parent=ID_LOCK.release, after_in_child=ID_LOCK.release)

class Rand:

    def __init__ ( self, seed: int | str | None = None ) -> None:

        self._seeded: random.Random | None = None
        self._ordered = -1
        self._sorted  = -1
        self._process = os.getpid()

        if seed is not None: self.seed(seed)

    def seed ( self, value: int | str | None ) -> None:

        if value is not None and type(value) not in (int, str): raise Fault(Code.INTERNAL, reason="rand.seed")

        seed = value.encode("utf-8", "surrogatepass") if isinstance(value, str) else value

        self._seeded = random.Random(seed) if seed is not None else None

    def bytes ( self, size: int = 32, *, secure: bool = False ) -> builtins.bytes:

        if type(size) is not int or not 0 < size <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="rand.size")

        if type(secure) is not bool: raise Fault(Code.INTERNAL, reason="rand.secure")

        return self._seeded.randbytes(size) if self._seeded and not secure else os.urandom(size)

    def hex ( self, size: int = 32, *, secure: bool = False ) -> str:

        return self.bytes(size, secure=secure).hex()

    def quick ( self, size: int = 8 ) -> str:

        if type(size) is not int or not 0 < size <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="rand.size")

        bits = self._seeded.getrandbits(size * 8) if self._seeded else random.getrandbits(size * 8)

        return bits.to_bytes(size).hex()

    def token ( self, size: int = 32, *, secure: bool = False ) -> str:

        return base64.urlsafe_b64encode(self.bytes(size, secure=secure)).rstrip(b"=").decode()

    def string ( self, length: int = 16, alphabet: str = ALPHABET ) -> str:

        if not isinstance(alphabet, str): raise Fault(Code.INTERNAL, reason="rand.length")
        if type(length) is not int or not 0 < length <= MAX_LENGTH or not alphabet:

            raise Fault(Code.INTERNAL, reason="rand.length")

        return self._picks_(alphabet, length)

    def code ( self, digits: int = 6 ) -> str:

        if type(digits) is not int or not MIN_CODE <= digits <= MAX_CODE:

            raise Fault(Code.INTERNAL, reason="rand.digits")

        return self._picks_(DIGITS, digits)

    def reference ( self, length: int = 8 ) -> str:

        return self.string(length, UNAMBIGUOUS)

    def password ( self, length: int = 20 ) -> str:

        if type(length) is not int or not MIN_PASSWORD <= length <= MAX_LENGTH:

            raise Fault(Code.INTERNAL, reason="rand.length")

        while True:

            found = self._picks_(PASSWORD, length)

            if all(not kind.isdisjoint(found) for kind in CLASSES): return found

    def bits ( self, width: int ) -> int:

        if type(width) is not int or not 0 <= width <= MAX_BITS: raise Fault(Code.INTERNAL, reason="rand.bits")

        return (self._seeded or SYSTEM).getrandbits(width)

    def below ( self, stop: int ) -> int:

        if type(stop) is not int or stop <= 0: raise Fault(Code.INTERNAL, reason="rand.range")

        return self._seeded.randrange(stop) if self._seeded else secrets.randbelow(stop)

    def integer ( self, low: int, high: int, step: int = 1 ) -> int:

        if type(low) is not int or type(high) is not int or type(step) is not int or low > high or step <= 0:

            raise Fault(Code.INTERNAL, reason="rand.range")

        span = (high - low) // step + 1
        draw = self._seeded.randrange(span) if self._seeded else secrets.randbelow(span)

        return low + draw * step

    def uniform ( self, low: float, high: float ) -> float:

        if type(low) not in NUMERIC or type(high) not in NUMERIC:

            raise Fault(Code.INTERNAL, reason="rand.range")

        try: start, end = float(low), float(high)
        except OverflowError as error: raise Fault(Code.INTERNAL, reason="rand.range") from error

        if not math.isfinite(start) or not math.isfinite(end) or start > end:

            raise Fault(Code.INTERNAL, reason="rand.range")

        if start == end: return start

        draw = self.number()
        span = end - start
        made = start + span * draw if math.isfinite(span) else start * (1.0 - draw) + end * draw

        return max(start, min(made, math.nextafter(end, start)))

    def number ( self ) -> float:

        return (self._seeded or SYSTEM).random()

    def chance ( self, probability: float ) -> bool:

        if type(probability) not in NUMERIC: raise Fault(Code.INTERNAL, reason="rand.probability")
        if not probability > 0: return False
        if probability >= 1: return True

        return self.number() < probability

    def choice [T] ( self, items: Sequence[T] ) -> T:

        if not isinstance(items, Sequence): raise Fault(Code.INTERNAL, reason="rand.empty")
        if not items: raise Fault(Code.INTERNAL, reason="rand.empty")

        try: return (self._seeded or SYSTEM).choice(items)
        except (IndexError, TypeError, OverflowError) as error:

            raise Fault(Code.INTERNAL, reason="rand.empty") from error

    def weighted [T] ( self, items: Sequence[T], weights: Sequence[float] ) -> T:

        sums = self._weights_(items, weights)
        total = sums[-1]

        return items[bisect(sums, min(self.number() * total, math.nextafter(total, 0.0)))]

    def choices [T] (
        self, items: Sequence[T], count: int = 1, *, weights: Sequence[float] | None = None,
    ) -> list[T]:

        if type(count) is not int or not 0 <= count <= MAX_LENGTH:

            raise Fault(Code.INTERNAL, reason="rand.sample")

        if not isinstance(items, Sequence): raise Fault(Code.INTERNAL, reason="rand.empty")
        if not items and count: raise Fault(Code.INTERNAL, reason="rand.empty")

        source = self._seeded or SYSTEM

        if weights is None:

            try:

                return [source.choice(items) for _ in range(count)] if self._seeded else self._choices_(items, count)
            except (IndexError, TypeError, OverflowError) as error:

                raise Fault(Code.INTERNAL, reason="rand.empty") from error

        sums  = self._weights_(items, weights)
        total = sums[-1]
        ceiling = math.nextafter(total, 0.0)

        return [items[bisect(sums, min(source.random() * total, ceiling))] for _ in range(count)]

    def sample [T] (
        self, items: Sequence[T], count: int, *, counts: Sequence[int] | None = None,
    ) -> list[T]:

        if not isinstance(items, Sequence): raise Fault(Code.INTERNAL, reason="rand.sample")
        if type(count) is not int or count < 0: raise Fault(Code.INTERNAL, reason="rand.sample")

        if counts is None:

            try: return (self._seeded or SYSTEM).sample(items, count)
            except (TypeError, ValueError, OverflowError) as error:

                raise Fault(Code.INTERNAL, reason="rand.sample") from error

        if not isinstance(counts, Sequence): raise Fault(Code.INTERNAL, reason="rand.sample")
        try: size = len(items)
        except OverflowError as error: raise Fault(Code.INTERNAL, reason="rand.sample") from error

        if len(counts) != size: raise Fault(Code.INTERNAL, reason="rand.sample")

        held = list(counts)

        if any(type(amount) is not int or amount < 0 for amount in held) or count > sum(held):

            raise Fault(Code.INTERNAL, reason="rand.sample")

        try: return (self._seeded or SYSTEM).sample(items, count, counts=held)
        except (TypeError, ValueError, OverflowError) as error:

            raise Fault(Code.INTERNAL, reason="rand.sample") from error

    def shuffle [T] ( self, items: Sequence[T] ) -> list[T]:

        if not isinstance(items, Sequence): raise Fault(Code.INTERNAL, reason="rand.sample")

        try: copied = list(items)
        except (TypeError, OverflowError) as error: raise Fault(Code.INTERNAL, reason="rand.sample") from error

        size = len(copied)

        if self._seeded is not None: self._seeded.shuffle(copied)
        elif size > 1:

            for end in range(size - 1, 0, -WORDS):

                words = memoryview(os.urandom(min(end, WORDS) * 8)).cast("Q")

                for offset, word in enumerate(words):

                    index = end - offset
                    span  = index + 1

                    other = secrets.randbelow(span) if word >= WORD - WORD % span else word % span

                    copied[index], copied[other] = copied[other], copied[index]

        return copied

    def uuid ( self ) -> Uuid:

        if self._seeded: return Uuid(bytes=self._seeded.randbytes(16), version=4)

        return uuid4()

    def uuid7 ( self ) -> Uuid:

        draw = int.from_bytes(self._seeded.randbytes(10) if self._seeded else os.urandom(10))

        with ID_LOCK:

            millis = self._clock_()
            count  = self._ordered

            if millis > count >> 42: count = millis << 42 | draw >> 39
            else: count += 1

            if count >> 42 > MAX_TIME: raise Fault(Code.INTERNAL, reason="rand.clock")

            self._ordered = count

        return Uuid(int=count >> 42 << 80 | VERSION | (count >> 30 & HIGH) << 64 | (count & LOW) << 32 | draw & TAIL)

    def ulid ( self ) -> str:

        draw = int.from_bytes(self._seeded.randbytes(10) if self._seeded else os.urandom(10))

        with ID_LOCK:

            millis = self._clock_()

            if millis > self._sorted >> 80: made = millis << 80 | draw >> 1
            else:

                made = self._sorted + 1 + (draw & TAIL)

                if made >> 80 != self._sorted >> 80: raise Fault(Code.INTERNAL, reason="rand.overflow")

            self._sorted = made

        return base64.b32encode(made.to_bytes(20))[6:].translate(CROCKFORD).decode()

    def pid ( self ) -> int:

        return os.getpid()

    def constant_equal ( self, left: str | builtins.bytes, right: str | builtins.bytes ) -> bool:

        if isinstance(left, str):

            if isinstance(right, str):

                if left.isascii() and right.isascii(): return secrets.compare_digest(left, right)

                right = right.encode("utf-8", "surrogatepass")

            elif not isinstance(right, builtins.bytes): raise Fault(Code.INTERNAL, reason="rand.compare")

            left = left.encode("utf-8", "surrogatepass")

        elif not isinstance(left, builtins.bytes): raise Fault(Code.INTERNAL, reason="rand.compare")
        elif isinstance(right, str): right = right.encode("utf-8", "surrogatepass")
        elif not isinstance(right, builtins.bytes): raise Fault(Code.INTERNAL, reason="rand.compare")

        return secrets.compare_digest(left, right)

    def _picks_ ( self, letters: str, count: int ) -> str:

        if self._seeded is not None: return "".join(self._seeded.choices(letters, k=count))

        encoder = ENCODERS.get(letters)

        if encoder is not None:

            table, discard, limit = encoder
            made = os.urandom((count * BYTE + limit - 1) // limit + 2).translate(table, discard)

            while len(made) < count:

                remaining = count - len(made)
                made += os.urandom((remaining * BYTE + limit - 1) // limit + 2).translate(table, discard)

            return made[:count].decode("ascii")

        return "".join(self._choices_(letters, count))

    def _choices_ [T] ( self, items: Sequence[T], count: int ) -> list[T]:

        if not count: return []

        size = len(items)

        if size == 1: return [items[0]] * count
        if size > PICK_WIDE[0]: return [items[secrets.randbelow(size)] for _ in range(count)]

        span, width, form = PICK_SMALL if size <= BYTE else PICK_WIDE
        limit = span - span % size
        found: list[T] = []

        while len(found) < count:

            remaining = count - len(found)
            words = memoryview(os.urandom(((remaining * span + limit - 1) // limit + 2) * width)).cast(form)
            found.extend(items[word % size] for word in words if word < limit)

        del found[count:]

        return found

    def _clock_ ( self ) -> int:

        process = os.getpid()

        if process != self._process: self._ordered, self._sorted, self._process = -1, -1, process

        millis = time.time_ns() // MILLI

        if not 0 <= millis <= MAX_TIME: raise Fault(Code.INTERNAL, reason="rand.clock")

        return millis

    @staticmethod
    def _weights_ ( items: Sequence[object], weights: Sequence[float] ) -> list[float]:

        if not isinstance(items, Sequence): raise Fault(Code.INTERNAL, reason="rand.weight")
        if not isinstance(weights, Sequence): raise Fault(Code.INTERNAL, reason="rand.weight")
        try: size = len(items)
        except OverflowError as error: raise Fault(Code.INTERNAL, reason="rand.weight") from error

        if not size or size != len(weights): raise Fault(Code.INTERNAL, reason="rand.weight")

        sums: list[float] = []
        total = 0.0

        for weight in weights:

            if type(weight) not in NUMERIC or not weight >= 0:

                raise Fault(Code.INTERNAL, reason="rand.weight")

            try: total += weight
            except OverflowError as error: raise Fault(Code.INTERNAL, reason="rand.weight") from error

            sums.append(total)

        if not 0 < total < math.inf: raise Fault(Code.INTERNAL, reason="rand.weight")

        return sums
