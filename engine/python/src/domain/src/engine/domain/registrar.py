from typing import Any, ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import Record

class Registrar(Adapter):

    family       : ClassVar[str] = "domain"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "records", "tls" })

    async def records ( self, host: str ) -> list[Record]:

        raise Fault(Code.INTERNAL, reason="domain.abstract")

    async def put ( self, record: Record ) -> Record:

        raise Fault(Code.INTERNAL, reason="domain.abstract")

    async def remove ( self, record: Record ) -> bool:

        raise Fault(Code.INTERNAL, reason="domain.abstract")

    async def tls ( self, host: str ) -> dict[str, Any]:

        raise Fault(Code.INTERNAL, reason="domain.abstract")
