from typing import ClassVar
from .arch import Listener


class Subscriber:

    listens: ClassVar[dict[str, str]] = {}

    def handlers ( self ) -> list[tuple[str, Listener]]:

        return [(pattern, getattr(self, name)) for pattern, name in self.listens.items()]
