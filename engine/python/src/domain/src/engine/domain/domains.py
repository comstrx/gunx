from collections.abc import Sequence
from typing import Any

from engine.adapter import Manager
from engine.error import Code, Fault
from engine.log import log
from engine.rand import rand
from .arch import HOST, LONGEST, PREFIX, RESERVED, Record
from .dns import Dns
from .memory import Memory
from .registrar import Registrar

class Domains:

    def __init__ ( self ) -> None:

        self._manager: Manager[Registrar] = Manager("domain")
        self._dns = Dns()

        self._manager.use(Memory())

    def use ( self, registrar: Registrar, default: bool = True ) -> Registrar:

        return self._manager.use(registrar, default)

    def dns ( self, resolver: Dns ) -> None:

        if not isinstance(resolver, Dns):

            raise Fault(Code.INTERNAL, reason="domain.settings", errors={ "setting": ["dns"] })

        self._dns = resolver

    def normalize ( self, host: str ) -> str:

        if type(host) is not str or len(host) > LONGEST:

            raise Fault(Code.VALIDATION, reason="domain.host", errors={ "host": [str(host)[:64]] })

        try: cleaned = host.strip().strip(".").lower().encode("idna").decode()
        except UnicodeError: cleaned = ""

        reserved = cleaned in RESERVED or cleaned.endswith(tuple(f".{r}" for r in RESERVED))

        if not cleaned or not HOST.match(cleaned) or reserved:

            raise Fault(Code.VALIDATION, reason="domain.host", errors={ "host": [host[:64]] })

        return cleaned

    def challenge ( self, host: str ) -> Record:

        return Record(f"{PREFIX}.{self.normalize(host)}", "TXT", f"engine-verify={rand.hex(16)}")

    async def verify ( self, host: str, expected: str ) -> bool:

        if type(expected) is not str or not expected: return False

        found = await self._dns.txt(f"{PREFIX}.{self.normalize(host)}")

        return any(type(value) is str and rand.constant_equal(value, expected) for value in found)

    async def records ( self, host: str, registrar: str | None = None ) -> list[Record]:

        return await self._manager.get(registrar).records(self.normalize(host))

    async def point ( self, host: str, target: str, registrar: str | None = None ) -> Record:

        record = Record(self.normalize(host), "CNAME", self.normalize(target))

        await self._manager.get(registrar).put(record)

        log.info("domain.pointed", host=record.name, target=target)

        return record

    async def tls ( self, host: str, registrar: str | None = None ) -> dict[str, Any]:

        return await self._manager.get(registrar).tls(self.normalize(host))

    def describe ( self ) -> dict[str, Any]:

        return self._manager.describe()

    async def close ( self ) -> None:

        await self._manager.close()

    def apex ( self, host: str ) -> str:

        parts = self.normalize(host).split(".")

        return ".".join(parts[-2:])

    def subdomains ( self, hosts: Sequence[str], apex: str ) -> list[str]:

        root = self.normalize(apex)

        return [self.normalize(host) for host in hosts if self.normalize(host).endswith(f".{root}")]
