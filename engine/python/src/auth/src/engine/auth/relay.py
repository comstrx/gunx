from collections.abc import Iterable, Mapping

from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.http import Guard, Request
from engine.json import json
from .actor import Actor
from .arch import grant, HEADER, HEADERS, LARGEST, LOWER, MINIMUM, named, RELAY_FIELDS, RELAY_SKEW, RELAY_TTL

class Relay:

    def __init__ ( self ) -> None:

        self._secret   = ""
        self._audience = ""
        self._ttl      = RELAY_TTL
        self._bound    = False

    def setup ( self, secret: str, audience: str = "", ttl: int = RELAY_TTL, bound: bool = False ) -> None:

        if type(secret) is not str or not MINIMUM <= len(secret) <= LARGEST:

            raise Fault(Code.INTERNAL, "The relay secret is too short", "relay.secret")

        if type(ttl) is not int or ttl <= 0: raise Fault(Code.INTERNAL, reason="relay.ttl")
        if audience and not named(audience): raise Fault(Code.INTERNAL, reason="relay.audience")

        self._secret   = secret
        self._audience = audience
        self._ttl      = ttl
        self._bound    = bound

    def ready ( self ) -> bool:

        return self._secret != ""

    def names ( self ) -> frozenset[str]:

        return frozenset(LOWER.values())

    def sign (
        self, actor: Actor | None, request_id: str, *, method: str = "", target: str = "",
    ) -> dict[str, str]:

        if not self.ready(): raise Fault(Code.INTERNAL, reason="relay.setup")
        if actor is not None and not isinstance(actor, Actor): raise Fault(Code.INTERNAL, reason="relay.actor")
        if not named(request_id): raise Fault(Code.INTERNAL, reason="relay.request")

        if bool(method) != bool(target) or (self._bound and not method):

            raise Fault(Code.INTERNAL, reason="relay.binding")

        identity = actor.id if actor else None
        roles    = actor.roles if actor else ()
        scopes   = actor.scopes if actor else ()
        tenant   = actor.tenant if actor else None
        context  = json.dumps([int(date.stamp()), self._audience, method, target])
        payload  = self._payload_(identity, roles, scopes, tenant, request_id, context)

        if len(context) > HEADER: raise Fault(Code.INTERNAL, reason="relay.binding")

        return {
            HEADERS["actor"]     : identity or "",
            HEADERS["roles"]     : ",".join(roles),
            HEADERS["scopes"]    : ",".join(scopes),
            HEADERS["tenant"]    : tenant or "",
            HEADERS["signature"] : crypto.sign(payload, self._secret),
            HEADERS["request"]   : request_id,
            HEADERS["context"]   : context,
        }

    def read (
        self, headers: Mapping[str, str], request_id: str, *, method: str = "", target: str = "",
    ) -> Actor | None:

        signature = self._header_(headers, "signature")

        if signature is None: return None
        if not self.ready() or not named(request_id): raise self._forged_()

        identity = self._header_(headers, "actor") or None
        roles    = self._split_(self._header_(headers, "roles"))
        scopes   = self._split_(self._header_(headers, "scopes"))
        tenant   = self._header_(headers, "tenant") or None
        context  = self._header_(headers, "context")

        if context is None: raise self._forged_()

        payload = self._payload_(identity, roles, scopes, tenant, request_id, context)

        if not crypto.verify(payload, signature, self._secret): raise self._forged_()

        self._context_(context, method, target)

        if not identity: return None

        try: return Actor(identity, roles, scopes, tenant)
        except Fault as fault: raise self._forged_() from fault

    def actor ( self, request: Request ) -> Actor | None:

        request.unique(*self.names())

        target = request.path + ("?" + request.query_string if request.query_string else "")

        return self.read(request.headers, request.trace(), method=request.method, target=target)

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

    def _context_ ( self, raw: str, method: str, target: str ) -> None:

        try: fields = json.loads(raw)
        except Fault as fault: raise self._forged_() from fault

        if not isinstance(fields, list) or len(fields) != RELAY_FIELDS: raise self._forged_()

        issued, audience, verb, path = fields

        if type(issued) is not int or not all(isinstance(item, str) for item in (audience, verb, path)):

            raise self._forged_()

        age = date.stamp() - issued

        if not -RELAY_SKEW <= age < self._ttl or audience != self._audience: raise self._forged_()
        if bool(verb) != bool(path) or (self._bound and not verb): raise self._forged_()
        if verb and (verb != method or path != target): raise self._forged_()

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
        context: str,
    ) -> bytes:

        facts = {
            "actor": identity, "roles": list(roles), "scopes": list(scopes), "tenant": tenant, "request": request_id,
            "context": context,
        }

        return json.encode(facts, stable=True)
