from typing import Any

from engine.cache import Cache
from engine.date import date
from engine.error import Code, Fault
from engine.rand import rand
from engine.token import Claims, Issuer, Pair, token
from .actor import Actor
from .arch import digest, named

class Sessions:

    def __init__ ( self, cache: Cache, *, access: Issuer | None = None, refresh: Issuer | None = None ) -> None:

        if (access is None) != (refresh is None): raise Fault(Code.INTERNAL, reason="auth.session.settings")

        if access is not None and refresh is not None:

            first: object = access
            second: object = refresh

            if not isinstance(first, Issuer) or first.purpose != "access":

                raise Fault(Code.INTERNAL, reason="auth.session.settings")

            if not isinstance(second, Issuer) or second.purpose != "refresh":

                raise Fault(Code.INTERNAL, reason="auth.session.settings")

        self._cache   = cache
        self._access  = access
        self._refresh = refresh

    async def issue ( self, actor: Actor, fingerprint: str | None = None ) -> Pair:

        if "sid" in actor.facts: raise Fault(Code.INTERNAL, reason="auth.session.claim")

        family = rand.hex(16)
        facts  = { **actor.facts, "roles": list(actor.roles), "scopes": list(actor.scopes), "tenant": actor.tenant }
        pair   = await self._pair_(actor.id, family, facts, fingerprint)
        claims = await self._read_(pair.refresh, fingerprint)
        row    = { "current": claims.id, "expires": claims.expires, "subject": actor.id, "facts": facts }

        if not await self._cache.add(digest("session", family), row, claims.expires - date.stamp()):

            raise Fault(Code.CONFLICT, reason="auth.session")

        return pair

    async def refresh ( self, refresh: str, fingerprint: str | None = None ) -> Pair:

        claims = await self._read_(refresh, fingerprint)
        family = self._family_(claims)
        key    = digest("session", family)
        row    = await self._cache.get(key)

        if not isinstance(row, dict): raise self._refused_()

        if row["current"] != claims.id or row["subject"] != claims.subject:

            await self._cache.forget(key)

            raise Fault(Code.UNAUTHORIZED, reason="auth.session.replay")

        left = int(row["expires"] - date.stamp())

        if left <= 0: raise self._refused_()

        pair = await self._pair_(claims.subject, family, row["facts"], fingerprint, left)
        next_ = await self._read_(pair.refresh, fingerprint)
        newer = { **row, "current": next_.id }

        if not await self._cache.swap(key, row, newer, left):

            await self._cache.forget(key)

            raise Fault(Code.UNAUTHORIZED, reason="auth.session.replay")

        return pair

    async def verify ( self, claims: Claims ) -> None:

        if claims.get("sid") is None: return

        family = self._family_(claims)
        row    = await self._cache.get(digest("session", family))

        if not isinstance(row, dict) or row["subject"] != claims.subject or row["expires"] <= date.stamp():

            raise self._refused_()

    async def revoke ( self, family: str ) -> None:

        if not named(family): raise Fault(Code.INTERNAL, reason="auth.session")

        await self._cache.forget(digest("session", family))

    async def claims ( self, text: str, fingerprint: str | None = None ) -> Claims:

        if self._access is None: return token.verify(text, "access", fingerprint)

        return await self._access.verify(text, fingerprint=fingerprint)

    async def _read_ ( self, text: str, fingerprint: str | None ) -> Claims:

        if self._refresh is None: return token.verify(text, "refresh", fingerprint)

        return await self._refresh.verify(text, fingerprint=fingerprint)

    async def _pair_ (
        self, subject: str, family: str, facts: dict[str, Any], fingerprint: str | None, remaining: int | None = None,
    ) -> Pair:

        if self._access is not None and self._refresh is not None:

            access = await self._access.issue(subject, fingerprint=fingerprint, **facts, sid=family)
            refresh = await self._refresh.issue(subject, ttl=remaining, fingerprint=fingerprint, sid=family)

            return Pair(access, refresh, self._access.ttl)

        pair   = token.pair(subject, fingerprint, **facts, sid=family)
        issued = token.issue(subject, "refresh", remaining, fingerprint=fingerprint, sid=family)

        return Pair(pair.access, issued, pair.expires)

    @staticmethod
    def _family_ ( claims: Claims ) -> str:

        family = claims.get("sid")

        if not named(family): raise Sessions._refused_()

        return family

    @staticmethod
    def _refused_ () -> Fault:

        return Fault(Code.UNAUTHORIZED, reason="auth.session")
