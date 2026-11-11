from uuid import UUID as Uuid

from .rand import Rand

rand = Rand()

__all__ = ["Rand", "Uuid", "rand"]
