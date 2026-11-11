from collections.abc import Iterable, Mapping

from engine.crypto import crypto
from engine.error import Code, Fault
from engine.http import Guard, Request
from engine.json import json
from .actor import Actor
from .arch import grant, HEADER, HEADERS, LARGEST, LOWER, MINIMUM, named

class Relay:

    def __init__ ( self ) -> None:

        self._secret = ""

    def setup ( self, secret: str ) -> None:

        if type(secret) is not str or not MINIMUM <= len(secret) <= LARGEST:

            raise Fault(Code.INTERNAL, "The relay secret is too short", "relay.secret")

        self._secret = secret

    def ready ( self ) -> bool:

        return self._secret != ""

    def names ( self ) -> frozenset[str]:

        return frozenset(LOWER.values())

    def sign ( self, actor: Actor | None, request_id: str ) -> dict[str, str]:

        if not self.ready(): raise Fault(Code.INTERNAL, reason="relay.setup")
        if actor is not None and not isinstance(actor, Actor): raise Fault(Code.INTERNAL, reason="relay.actor")
        if not named(request_id): raise Fault(Code.INTERNAL, reason="relay.request")

        identity = actor.id if actor else None
        roles    = actor.roles if actor else ()
        scopes   = actor.scopes if actor else ()
        tenant   = actor.tenant if actor else None
        payload  = self._payload_(identity, roles, scopes, tenant, request_id)

        return {
            HEADERS["actor"]     : identity or "",
            HEADERS["roles"]     : ",".join(roles),
            HEADERS["scopes"]    : ",".join(scopes),
            HEADERS["tenant"]    : tenant or "",
            HEADERS["signature"] : crypto.sign(payload, self._secret),
            HEADERS["request"]   : request_id,
        }

    def read ( self, headers: Mapping[str, str], request_id: str ) -> Actor | None:

        signature = self._header_(headers, "signature")

        if signature is None: return None
        if not self.ready() or not named(request_id): raise self._forged_()

        identity = self._header_(headers, "actor") or None
        roles    = self._split_(self._header_(headers, "roles"))
        scopes   = self._split_(self._header_(headers, "scopes"))
        tenant   = self._header_(headers, "tenant") or None
        payload  = self._payload_(identity, roles, scopes, tenant, request_id)

        if not crypto.verify(payload, signature, self._secret): raise self._forged_()
        if not identity: return None

        try: return Actor(identity, roles, scopes, tenant)
        except Fault as fault: raise self._forged_() from fault

    def actor ( self, request: Request ) -> Actor | None:

        return self.read(request.headers, request.trace())

    def guard ( self, *scopes: str, roles: Iterable[str] = () ) -> Guard:

        wanted = tuple(roles)

        if not all(grant(scope) for scope in scopes) or not all(grant(role) for role in wanted):

            raise Fault(Code.INTERNAL, reason="auth.guard")

        async def check ( request: Request ) -> None:

            actor = self.actor(request)

            if actor is None: raise Fault(Code.UNAUTHORIZED, reason="auth.missing")
            if wanted and not actor.has_role(*wanted): raise Fault(Code.FORBIDDEN, reason="auth.role")

            for scope in scopes:

                if not actor.can(scope): raise Fault(Code.FORBIDDEN, reason="auth.scope", errors={ "scope": [scope] })

            request.ctx.principal = actor

        return check

    def _header_ ( self, headers: Mapping[str, str], name: str ) -> str | None:

        value = headers.get(HEADERS[name])

        if value is None: value = headers.get(LOWER[name])
        if value is None: return None
        if type(value) is not str or len(value) > HEADER: raise self._forged_()

        return value

    @staticmethod
    def _split_ ( value: str | None ) -> tuple[str, ...]:

        return tuple(part for part in (value or "").split(",") if part)

    @staticmethod
    def _forged_ () -> Fault:

        return Fault(Code.UNAUTHORIZED, reason="relay.signature")

    @staticmethod
    def _payload_ (
        identity: str | None, roles: tuple[str, ...], scopes: tuple[str, ...], tenant: str | None, request_id: str,
    ) -> bytes:

        facts = {
            "actor": identity, "roles": list(roles), "scopes": list(scopes), "tenant": tenant, "request": request_id,
        }

        return json.encode(facts, stable=True)
