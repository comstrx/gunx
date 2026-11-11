from collections.abc import Awaitable, Iterable, Mapping
from typing import Any

from engine.cache import Cache, cache as shared
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.http import Guard, Request
from engine.log import log
from engine.rand import rand
from engine.token import Pair, token
from .actor import Actor
from .arch import (
    Ability, CODE, digest, grant, LONGEST, named, Otp, OTP_ATTEMPTS, OTP_COOLDOWN, OTP_LONGEST, OTP_TTL, REVOKED_TTL,
    SUBJECT, timed,
)
from .relay import Relay

class Auth:

    def __init__ ( self ) -> None:

        self._cache: Cache = shared
        self._abilities: dict[str, Ability] = {}
        self._roles: dict[str, tuple[str, ...]] = {}
        self._fixed: str | None = None
        self.relay    = Relay()

    def setup (
        self, cache: Cache | None = None, roles: Mapping[str, Iterable[str]] | None = None,
        fixed_code: str | None = None,
    ) -> None:

        held: object = cache
        given: object = roles

        if held is not None and not isinstance(held, Cache): raise self._unset_("cache")
        if given is not None and not isinstance(given, Mapping): raise self._unset_("roles")
        if fixed_code is not None and not (named(fixed_code, CODE) and fixed_code.isascii() and fixed_code.isdigit()):

            raise self._unset_("fixed_code")

        self._cache = cache or shared
        self._roles = { str(name): self._scopes_(name, scopes) for name, scopes in (roles or {}).items() }
        self._fixed = fixed_code

    def define ( self, ability: str, check: Ability ) -> None:

        if not grant(ability) or not callable(check): raise self._unset_("ability")

        self._abilities[ability] = check

    def abilities ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._abilities))

    def scopes_of ( self, roles: Iterable[str] ) -> tuple[str, ...]:

        granted: list[str] = []

        for role in roles:

            if isinstance(role, str): granted.extend(self._roles.get(str(role), ()))

        return tuple(dict.fromkeys(granted))

    def issue ( self, actor: Actor, fingerprint: str | None = None ) -> Pair:

        if not isinstance(actor, Actor): raise self._unset_("actor")

        scopes = actor.scopes or self.scopes_of(actor.roles)
        facts  = { **actor.facts, "roles": list(actor.roles), "scopes": list(scopes), "tenant": actor.tenant }

        return token.pair(actor.id, fingerprint, **facts)

    def actor ( self, request: Request ) -> Actor:

        return Actor.from_claims(request.claims())

    async def allowed ( self, actor: Actor, ability: str, subject: Any = None ) -> bool:

        held: object = actor

        if not isinstance(held, Actor) or type(ability) is not str: return False

        check = self._abilities.get(ability)

        if check is None: return actor.can(ability)

        try:

            result = check(actor, subject)

            return bool(await result) if isinstance(result, Awaitable) else bool(result)

        except Fault: raise
        except Exception as error:

            log.exception("auth.ability", ability=ability)

            raise Fault(Code.INTERNAL, reason="auth.ability", errors={ "ability": [ability] }) from error

    async def authorize ( self, actor: Actor, ability: str, subject: Any = None ) -> None:

        if not await self.allowed(actor, ability, subject):

            raise Fault(Code.FORBIDDEN, reason=f"auth.{ability if grant(ability) else 'ability'}")

    async def revoke ( self, jti: str, ttl: float = REVOKED_TTL ) -> None:

        if not named(jti): raise self._unset_("jti")
        if not timed(ttl, LONGEST): raise self._unset_("ttl")

        await self._cache.set(digest("revoked", jti), 1, ttl)

    async def revoked ( self, jti: str ) -> bool:

        if not named(jti): return True

        return await self._cache.get(digest("revoked", jti)) is not None

    async def alive ( self, request: Request ) -> Actor:

        claims = request.claims()

        if await self.revoked(claims.id): raise Fault(Code.UNAUTHORIZED, reason="auth.revoked")

        return Actor.from_claims(claims)

    def guard ( self, *scopes: str, roles: Iterable[str] = () ) -> Guard:

        wanted = tuple(roles)

        if not all(grant(scope) for scope in scopes) or not all(grant(role) for role in wanted):

            raise Fault(Code.INTERNAL, reason="auth.guard")

        async def check ( request: Request ) -> None:

            actor = await self.alive(request)

            if wanted and not actor.has_role(*wanted): raise Fault(Code.FORBIDDEN, reason="auth.role")

            for scope in scopes:

                if not actor.can(scope): raise Fault(Code.FORBIDDEN, reason="auth.scope", errors={ "scope": [scope] })

            request.ctx.principal = actor

        return check

    async def otp ( self, subject: str, digits: int = 6, ttl: float = OTP_TTL ) -> Otp:

        if not named(subject, SUBJECT): raise self._unset_("subject")
        if not timed(ttl, OTP_LONGEST): raise self._unset_("ttl")

        code = self._fixed or rand.code(digits)

        if not await self._cache.add(digest("otp:cooldown", subject), 1, OTP_COOLDOWN):

            raise Fault(Code.TOO_MANY_REQUESTS, reason="otp.cooldown", retry_after=OTP_COOLDOWN)

        hashed = self._hashed_(subject, code)

        await self._cache.set_many({ digest("otp", subject): hashed, digest("otp:tries", subject): 0 }, ttl)

        return Otp(code, hashed, float(ttl))

    async def verify ( self, subject: str, code: str ) -> bool:

        if not named(subject, SUBJECT): raise self._unset_("subject")
        if not named(code, CODE): raise self._wrong_("invalid")

        name, tries = digest("otp", subject), digest("otp:tries", subject)
        found       = await self._cache.get(name)

        if not isinstance(found, str): raise self._wrong_("expired")

        if await self._cache.increment(tries, 1, OTP_TTL) > OTP_ATTEMPTS:

            await self._cache.forget(name, tries)

            raise Fault(Code.TOO_MANY_REQUESTS, reason="otp.attempts")

        if not rand.constant_equal(self._hashed_(subject, code), found): raise self._wrong_("invalid")
        if not await self._cache.drop(name, found): raise self._wrong_("expired")

        await self._cache.forget(tries, digest("otp:cooldown", subject))

        return True

    def describe ( self ) -> dict[str, Any]:

        roles = { name: list(scopes) for name, scopes in sorted(self._roles.items()) }

        return { "abilities": list(self.abilities()), "roles": roles, "fixed": self._fixed is not None }

    @staticmethod
    def _hashed_ ( subject: str, code: str ) -> str:

        return crypto.sign(f"otp\x00{subject}\x00{code}")

    def _scopes_ ( self, name: object, scopes: object ) -> tuple[str, ...]:

        if not grant(name) or isinstance(scopes, str | bytes) or not isinstance(scopes, Iterable):

            raise self._unset_("roles")

        held = tuple(scopes)

        if not all(grant(scope) for scope in held): raise self._unset_("roles")

        return tuple(dict.fromkeys(str(scope) for scope in held))

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        return Fault(Code.UNAUTHORIZED, reason=f"otp.{what}")

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="auth.settings", errors={ "setting": [what] })
