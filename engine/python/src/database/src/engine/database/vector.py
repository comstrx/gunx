from collections.abc import Sequence


class Vector:

    __slots__ = ("values",)

    def __init__ ( self, values: Sequence[float] ) -> None:

        self.values = tuple(float(value) for value in values)

    def literal ( self ) -> str:

        return "[" + ",".join(f"{value:.7g}" for value in self.values) + "]"

    def __len__ ( self ) -> int:

        return len(self.values)
