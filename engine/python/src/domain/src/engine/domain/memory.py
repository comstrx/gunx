from typing import Any, override

from .arch import Record
from .registrar import Registrar

class Memory(Registrar):

    name = "memory"

    def __init__ ( self ) -> None:

        self._records: dict[str, list[Record]] = {}

    @override
    async def records ( self, host: str ) -> list[Record]:

        return list(self._records.get(host, []))

    @override
    async def put ( self, record: Record ) -> Record:

        self._records.setdefault(record.name, []).append(record)

        return record

    @override
    async def remove ( self, record: Record ) -> bool:

        found = self._records.get(record.name, [])
        kept  = [item for item in found if item != record]

        self._records[record.name] = kept

        return len(kept) != len(found)

    @override
    async def tls ( self, host: str ) -> dict[str, Any]:

        return { "host": host, "status": "ready", "issuer": "memory" }
