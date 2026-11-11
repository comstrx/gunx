from dataclasses import dataclass

from engine.error import Code, Fault
from .arch import BAD, PATTERN

@dataclass(frozen=True, slots=True)
class Range:

    start : int
    end   : int
    size  : int

    def length ( self ) -> int:

        return self.end - self.start + 1

    def header ( self ) -> str:

        return f"bytes {self.start}-{self.end}/{self.size}"

    def whole ( self ) -> bool:

        return self.start == 0 and self.end == self.size - 1

    @classmethod
    def parse ( cls, header: str | None, size: int ) -> Range | None:

        if header is None or not header.strip(): return None

        found = PATTERN.match(header.strip())

        if not found or size <= 0: raise cls._unsatisfiable_(size)

        first, last = found.groups()

        if first == "" and last == "": raise cls._unsatisfiable_(size)

        if first == "":

            count = int(last)

            if count == 0: raise cls._unsatisfiable_(size)

            return cls(max(0, size - count), size - 1, size)

        start = int(first)
        end   = int(last) if last else size - 1

        if start >= size or end < start: raise cls._unsatisfiable_(size)

        return cls(start, min(end, size - 1), size)

    @staticmethod
    def _unsatisfiable_ ( size: int ) -> Fault:

        headers = { "Content-Range": f"bytes */{size}" }

        return Fault(Code.BAD_REQUEST, "Range not satisfiable", "stream.range", status=BAD, headers=headers)
