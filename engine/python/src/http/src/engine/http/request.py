from collections.abc import Callable, Mapping
from typing import Any, override

from sanic import Request as Incoming
from engine.error import Code, Fault
from engine.json import json
from engine.parse import parse
from engine.token import Claims, Issuer, token
from engine.translate import translate
from engine.validate import Shape, validator
from .arch import Credential, LANGUAGE, SKIP, networks

class Request(Incoming):

    __slots__ = ()

    proxies: tuple[str, ...] = ()

    @override
    def load_json ( self, loads: Callable[[bytes], Any] | None = None ) -> Any:

        return super().load_json(loads or json.loads)

    def trace ( self ) -> str:

        return getattr(self.ctx, "request_id", "")

    def header ( self, name: str, default: str | None = None ) -> str | None:

        return self.headers.get(name, default)

    def unique ( self, *names: str ) -> None:

        for name in names:

            if len(self.headers.getall(name, ())) > 1:

                raise Fault(Code.BAD_REQUEST, reason="http.header", errors={ name: ["is repeated"] })

    def bearer ( self ) -> str | None:

        return token.bearer(self.header("authorization"))

    def claims ( self, kind: str = "access" ) -> Claims:

        found = self.bearer()

        if not found: raise Fault(Code.UNAUTHORIZED, reason="auth.missing")

        held = getattr(self.ctx, "credential", None)

        if isinstance(held, Credential) and held.token == found and held.fingerprint == self.fingerprint():

            if held.claims.purpose != kind: raise Fault(Code.UNAUTHORIZED, reason="token.kind")

            return held.claims

        if getattr(self.ctx, "token_issuer", None) is not None:

            raise Fault(Code.UNAUTHORIZED, reason="auth.principal")

        return token.verify(found, kind, self.fingerprint())

    async def authenticate ( self, issuer: Issuer ) -> Claims:

        found = self.bearer()

        if not found: raise Fault(Code.UNAUTHORIZED, reason="auth.missing")

        fingerprint = self.fingerprint()
        held = getattr(self.ctx, "credential", None)

        if (
            isinstance(held, Credential) and held.issuer is issuer
            and held.token == found and held.fingerprint == fingerprint
        ): return held.claims

        claims = await issuer.verify(found, fingerprint=fingerprint)
        self.ctx.credential = Credential(issuer, found, fingerprint, claims)

        return claims

    def actor ( self ) -> Any:

        return getattr(self.ctx, "actor", None)

    def locale ( self ) -> str:

        return translate.negotiate(self.headers.get(LANGUAGE))

    def client ( self ) -> str:

        peer      = self.ip_addr()
        forwarded = self.header("x-forwarded-for")

        if forwarded and self.trusted(peer):

            self.unique("x-forwarded-for")

            hops = forwarded.split(",")
            hop  = peer

            for value in reversed(hops):

                try: hop = str(parse.ip(value.strip()))
                except Fault: raise Fault(Code.BAD_REQUEST, reason="http.forwarded") from None

                if not self.trusted(hop): return hop

            return hop

        return peer

    def ip_addr ( self ) -> str:

        return str(self.conn_info.client_ip if self.conn_info else "0.0.0.0")

    def trusted ( self, address: str ) -> bool:

        try: ip = parse.ip(address)
        except Fault: return False

        return any(ip in block for block in networks(self.proxies))

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

        payload = self.payload() if self.body and self.json_body() else None

        if name in self.match_info: return parse.unquote(str(self.match_info[name]))
        if payload is not None and name in payload: return payload[name]

        return self.query(name, default)

    def has ( self, *names: str ) -> bool:

        return all(self.input(name, SKIP) is not SKIP for name in names)

    def filled ( self, *names: str ) -> bool:

        return all(self.input(name) not in (None, "", [], {}) for name in names)

    def only ( self, *names: str ) -> dict[str, Any]:

        return { name: found for name in names if (found := self.input(name, SKIP)) is not SKIP }

    def boolean ( self, name: str, default: bool = False ) -> bool:

        found = self.input(name)

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

        if not self.trusted(self.ip_addr()): return False

        self.unique("x-forwarded-proto")

        return (self.header("x-forwarded-proto") or "").strip().lower() == "https"

    def fresh ( self, etag: str ) -> bool:

        given = [part.strip().removeprefix("W/") for part in (self.header("if-none-match") or "").split(",")]

        return etag.removeprefix("W/") in given or "*" in given
