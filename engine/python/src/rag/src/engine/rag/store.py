from collections.abc import Sequence
from typing import ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import Chunk, Hit

class Store(Adapter):

    family       : ClassVar[str] = "rag"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "search" })

    async def put ( self, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]] ) -> int:

        raise Fault(Code.INTERNAL, reason="rag.abstract")

    async def drop ( self, scope: str, source: str | None = None ) -> int:

        raise Fault(Code.INTERNAL, reason="rag.abstract")

    async def search ( self, scope: str, vector: Sequence[float], limit: int ) -> list[Hit]:

        raise Fault(Code.INTERNAL, reason="rag.abstract")

    async def count ( self, scope: str ) -> int:

        raise Fault(Code.INTERNAL, reason="rag.abstract")
