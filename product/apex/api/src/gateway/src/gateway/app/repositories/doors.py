from collections.abc import Iterable

from ..models import Door
from ..utils.cycle import Repository

class Doors(Repository[Door]):

    def __init__ ( self, rows: Iterable[Door] = () ) -> None:

        super().__init__(Door, rows)

    def services ( self ) -> tuple[str, ...]:

        return tuple(sorted({ door.service for door in self.snapshot() }))

    def targets ( self, service: str ) -> frozenset[str]:

        return frozenset(door.target for door in self.snapshot() if door.service == service)
