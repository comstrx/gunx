from collections.abc import Sequence
from typing import ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault
from engine.string import string
from .arch import Document, Query, Result, Schema, WORD
import re

class Engine(Adapter):

    family       : ClassVar[str] = "search"
    capabilities : ClassVar[frozenset[str]] = frozenset({
        "index", "query", "filters", "sort", "facets", "highlight", "suggest", "create",
    })

    async def prepare ( self, index: str, schema: Schema ) -> None:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def index ( self, index: str, documents: Sequence[Document] ) -> int:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def get ( self, index: str, id_: str ) -> Document | None:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def query ( self, index: str, query: Query ) -> Result:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def suggest ( self, index: str, prefix: str, limit: int = 5 ) -> list[str]:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def delete ( self, index: str, ids: Sequence[str] ) -> int:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def clear ( self, index: str ) -> int:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def drop ( self, index: str ) -> bool:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    async def count ( self, index: str ) -> int:

        raise Fault(Code.INTERNAL, reason="search.abstract")

    def _tokens_ ( self, text: object ) -> list[str]:

        return [string.fold(word) for word in WORD.findall(str(text or "").lower())]

    def _highlight_ ( self, text: object, words: Sequence[str] ) -> str:

        plain = str(text or "")

        for word in sorted(set(words), key=len, reverse=True):

            if not word: continue

            plain = re.sub(f"({re.escape(word)})", r"<em>\1</em>", plain, flags=re.IGNORECASE)

        return plain

    def _missing_ ( self, fault: Fault ) -> bool:

        return fault.code is Code.NOT_FOUND
