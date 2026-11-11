from dataclasses import dataclass
from typing import Any

from engine.error import Code, Fault
import dns.resolver, re

HOST     = re.compile(r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$")
RESERVED = ("localhost", "example.com", "example.net", "example.org", "test", "invalid")
PREFIX   = "_engine-verify"
SILENT   = (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, dns.resolver.LifetimeTimeout)
LABEL    = r"[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?"
NAME     = re.compile(rf"^(?=.{{1,253}}$){LABEL}(?:\.{LABEL})*$")
KINDS    = frozenset({ "A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA", "ALIAS" })
VALUE    = 4_096
WEEK     = 604_800
MOST     = 1_000
LONGEST  = 1_024

@dataclass(frozen=True, slots=True)
class Record:

    name  : str
    kind  : str
    value : str
    ttl   : int = 300

    def __post_init__ ( self ) -> None:

        if type(self.name) is not str or not NAME.match(self.name): raise self._wrong_("name")
        if type(self.kind) is not str or self.kind.upper() not in KINDS: raise self._wrong_("kind")
        if type(self.value) is not str or not 0 < len(self.value) <= VALUE or not self.value.isprintable():

            raise self._wrong_("value")
        if type(self.ttl) is not int or not 0 <= self.ttl <= WEEK: raise self._wrong_("ttl")

        object.__setattr__(self, "kind", self.kind.upper())

    def dump ( self ) -> dict[str, Any]:

        return { "name": self.name, "kind": self.kind, "value": self.value, "ttl": self.ttl }

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        return Fault(Code.VALIDATION, reason="domain.record", errors={ "record": [what] })
