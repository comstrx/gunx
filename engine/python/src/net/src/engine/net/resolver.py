from typing import Any, override

from aiohttp.abc import AbstractResolver, ResolveResult
from aiohttp.resolver import ThreadedResolver
from .arch import PRIVATE
from .egress import Egress
import errno, socket

class Resolver(AbstractResolver):

    def __init__ ( self ) -> None:

        self._egress = Egress()
        self._inner  = ThreadedResolver()

    @override
    async def resolve (
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET,
    ) -> list[ResolveResult]:

        found = await self._inner.resolve(host, port, family)

        self._egress.admit(host, [item["host"] for item in found])

        return found

    @override
    async def close ( self ) -> None:

        await self._inner.close()

    def make ( self, info: tuple[Any, ...] ) -> socket.socket:

        family, kind, proto, _, address = info

        if self._egress.private(str(address[0])): raise PermissionError(errno.EACCES, PRIVATE)

        return socket.socket(family, kind, proto)
