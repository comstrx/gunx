from typing import Any, override

from engine.error import Code, Fault
from engine.net import Remote
from .arch import MOST, Record
from .registrar import Registrar

class Http(Registrar):

    name = "http"

    def __init__ ( self, remote: Remote ) -> None:

        held: object = remote

        if not isinstance(held, Remote):

            raise Fault(Code.INTERNAL, reason="domain.settings", errors={ "setting": ["remote"] })

        self._remote = remote

    @override
    async def records ( self, host: str ) -> list[Record]:

        body = await self.upstream(self._remote.get("/records", query={ "host": host }))

        if not isinstance(body, list): raise self._malformed_()

        return [self._record_(item) for item in body[:MOST]]

    @override
    async def put ( self, record: Record ) -> Record:

        await self.upstream(self._remote.post("/records", data=record.dump()))

        return record

    @override
    async def remove ( self, record: Record ) -> bool:

        await self.upstream(self._remote.call("DELETE", "/records", data=record.dump()))

        return True

    @override
    async def tls ( self, host: str ) -> dict[str, Any]:

        body = await self.upstream(self._remote.get("/tls", query={ "host": host }))

        return dict(body) if isinstance(body, dict) else { "host": host, "status": "unknown" }

    def _record_ ( self, item: object ) -> Record:

        if not isinstance(item, dict): raise self._malformed_()

        ttl   = item.get("ttl", 300)
        parts = (str(item.get("name", "")), str(item.get("kind", "")), str(item.get("value", "")))

        try: return Record(*parts, ttl if type(ttl) is int else int(str(ttl)))
        except (Fault, ValueError) as error: raise self._malformed_() from error
