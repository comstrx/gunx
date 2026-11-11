from collections.abc import Mapping
from typing import Any

from sanic import Request as Incoming
from engine.error import Code, Fault
from engine.parse import parse
from engine.token import Claims, token
from engine.translate import translate
from engine.validate import Shape, validator
from .arch import LANGUAGE, PRIVATE

class Request(Incoming):

    __slots__ = ()

    proxies: tuple[str, ...] = PRIVATE

    def trace ( self ) -> str:

        return getattr(self.ctx, "request_id", "")

    def header ( self, name: str, default: str | None = None ) -> str | None:

        return self.headers.get(name.lower(), default)

    def unique ( self, *names: str ) -> None:

        for name in names:

            if len(self.headers.getall(name.lower(), [])) > 1:

                raise Fault(Code.BAD_REQUEST, reason="http.header", errors={ name: ["is repeated"] })

    def bearer ( self ) -> str | None:

        return token.bearer(self.header("authorization"))

    def claims ( self, kind: str = "access" ) -> Claims:

        found = self.bearer()

        if not found: raise Fault(Code.UNAUTHORIZED, reason="auth.missing")

        return token.verify(found, kind, self.fingerprint())

    def actor ( self ) -> Any:

        return getattr(self.ctx, "actor", None)

    def locale ( self ) -> str:

        return translate.negotiate(self.headers.get(LANGUAGE))

    def client ( self ) -> str:

        peer      = self.ip_addr()
        forwarded = self.header("x-forwarded-for")

        if forwarded and self.trusted(peer):

            hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]

            for hop in reversed(hops):

                if not self.trusted(hop): return hop

            return hops[0] if hops else peer

        return peer

    def ip_addr ( self ) -> str:

        return str(self.conn_info.client_ip if self.conn_info else "0.0.0.0")

    def trusted ( self, address: str ) -> bool:

        try: ip = parse.ip(address)
        except Fault: return False

        return any(ip in parse.cidr(block) for block in self.proxies)

    def fingerprint ( self ) -> str:

        return f"{self.header('user-agent', '')}|{self.client()}"

    def shape [T: Shape] ( self, kind: type[T] ) -> T:

        return validator.shape(kind, self.body or b"{}")

    def json_body ( self ) -> bool:

        media = (self.headers.get("content-type") or "").split(";", 1)[0].strip().lower()

        return media == "application/json" or media.endswith("+json")

    def payload ( self ) -> dict[str, Any]:

        if not self.body: return {}

        found = self.json

        if not isinstance(found, dict): raise Fault(Code.BAD_REQUEST, reason="http.body")

        return found

    def queries ( self ) -> dict[str, str]:

        return { name: str(self.args.get(name)) for name in self.args }

    def query ( self, name: str, default: str | None = None ) -> str | None:

        found = self.args.get(name)

        return found if found is not None else default

    def integer ( self, name: str, default: int = 0, low: int | None = None, high: int | None = None ) -> int:

        found = self.args.get(name)

        return default if found in (None, "") else parse.integer(found, low, high)

    def paging ( self, limit: int = 20, ceiling: int = 100 ) -> tuple[int, int]:

        return self.integer("page", 1, 1), self.integer("limit", limit, 1, ceiling)

    def params ( self ) -> Mapping[str, str]:

        return { key: parse.unquote(str(value)) for key, value in self.match_info.items() }

    def wants_json ( self ) -> bool:

        accept = self.header("accept", "") or ""

        return "application/json" in accept or not accept.startswith("text/html")

    def merged ( self ) -> dict[str, Any]:

        body = self.payload() if self.body and self.json_body() else {}

        return { **self.queries(), **body, **self.params() }

    def input ( self, name: str, default: Any = None ) -> Any:

        return self.merged().get(name, default)

    def has ( self, *names: str ) -> bool:

        found = self.merged()

        return all(name in found for name in names)

    def filled ( self, *names: str ) -> bool:

        found = self.merged()

        return all(found.get(name) not in (None, "", [], {}) for name in names)

    def only ( self, *names: str ) -> dict[str, Any]:

        found = self.merged()

        return { name: found[name] for name in names if name in found }

    def boolean ( self, name: str, default: bool = False ) -> bool:

        found = self.merged().get(name)

        return default if found in (None, "") else parse.boolean(found)

    def cookie ( self, name: str, default: str | None = None ) -> str | None:

        found = self.cookies.get(name)

        return str(found) if found is not None else default

    def agent ( self ) -> str:

        return self.header("user-agent", "") or ""

    def referer ( self ) -> str | None:

        return self.header("referer")

    def secure ( self ) -> bool:

        if self.scheme in ("https", "wss"): return True

        forwarded = (self.header("x-forwarded-proto") or "").split(",")[0].strip().lower()

        return forwarded == "https" and self.trusted(self.ip_addr())

    def fresh ( self, etag: str ) -> bool:

        given = [part.strip().removeprefix("W/") for part in (self.header("if-none-match") or "").split(",")]

        return etag.removeprefix("W/") in given or "*" in given
