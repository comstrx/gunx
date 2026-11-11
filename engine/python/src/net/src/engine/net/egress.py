from collections.abc import Iterable
from dataclasses import dataclass, field

from engine.error import Code, Fault
from engine.parse import Url, parse
from .arch import EMBEDDED, LOW_BITS, PRIVATE, SCHEMES
import asyncio, ipaddress, socket

@dataclass(slots=True)
class Egress:

    allow_private : bool = False
    hosts         : frozenset[str] = frozenset()
    schemes       : tuple[str, ...] = SCHEMES
    ports         : frozenset[int] = field(default_factory=lambda: frozenset({ 80, 443, 8080, 8443 }))

    def check ( self, url: str ) -> Url:

        parts = parse.url(url, self.schemes)

        self.allow(parts.host, parts.port or (443 if parts.scheme == "https" else 80))

        return parts

    def allow ( self, host: str, port: int ) -> None:

        if self.hosts and host not in self.hosts:

            raise Fault(Code.FORBIDDEN, reason="net.host", errors={ "host": [host] })

        if self.ports and port not in self.ports:

            raise Fault(Code.FORBIDDEN, reason="net.port", errors={ "port": [str(port)] })

        if self.numeric(host): self.admit(host, (host,))

    def admit ( self, host: str, addresses: Iterable[str] ) -> None:

        if self.allow_private: return

        for address in addresses:

            if self.private(address): raise Fault(Code.FORBIDDEN, reason=PRIVATE, errors={ "host": [host] })

    async def resolve ( self, host: str ) -> list[str]:

        try: info = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except OSError as error:

            raise Fault(Code.UNAVAILABLE, reason="net.resolve", errors={ "host": [host] }) from error

        addresses = sorted({ str(item[4][0]) for item in info })

        self.admit(host, addresses)

        return addresses

    def numeric ( self, host: str ) -> bool:

        return ":" in host or host.replace(".", "").isdigit()

    def private ( self, address: str ) -> bool:

        try: ip = ipaddress.ip_address(address)
        except ValueError: return True

        if isinstance(ip, ipaddress.IPv6Address) and any(ip in block for block in EMBEDDED):

            ip = ipaddress.IPv4Address(int(ip) & LOW_BITS)

        return not ip.is_global or ip.is_multicast
