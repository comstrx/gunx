from engine.error import Code, Fault
from .arch import SILENT
import asyncio, dns.exception, dns.resolver

class Dns:

    async def txt ( self, host: str ) -> list[str]:

        if type(host) is not str or not host:

            raise Fault(Code.VALIDATION, reason="domain.host", errors={ "host": [str(host)[:64]] })

        try: raw = await asyncio.get_running_loop().run_in_executor(None, self._lookup_, host)
        except (OSError, dns.exception.DNSException) as error:

            raise Fault(Code.UNAVAILABLE, reason="domain.dns", unknown=True) from error

        return raw

    def _lookup_ ( self, host: str ) -> list[str]:

        try: answers = dns.resolver.resolve(host, "TXT", lifetime=3.0)
        except SILENT: return []

        return [b"".join(record.strings).decode("utf-8", "replace") for record in answers]
