from typing import Any

from engine.auth import Actor, auth
from engine.date import date
from engine.error import Code, Fault
from engine.token import token

from ..events import SessionStarted
from ..repositories import Memberships, Sessions as Rows, Tenants, Users
from ..resources import SessionResource, UserResource
from ..utils.cycle import Service
from .avatars import Avatars

REFRESH_TTL = 30 * 86400

class Sessions(Service[Users]):

    resource = UserResource

    def __init__ (
        self, rows: Users, tenants: Tenants, memberships: Memberships, sessions: Rows, avatars: Avatars,
    ) -> None:

        super().__init__(rows)

        self.tenants     = tenants
        self.memberships = memberships
        self.sessions    = sessions
        self.avatars     = avatars

    async def request_code ( self, email: str ) -> None:

        user = await self.rows.active(email)

        await auth.otp(user.email)

    async def start ( self, email: str, code: str, fingerprint: str, tenant: str | None = None ) -> dict[str, Any]:

        user   = await self.rows.active(email)
        held   = await self.memberships.of(user.id)
        chosen = await self._tenant_(held, tenant)

        if not await auth.verify(user.email, code):

            raise Fault(Code.UNAUTHORIZED, reason="session.code", errors={ "code": ["mismatch"] })

        actor  = self._actor_(user, chosen.roles if chosen else [], chosen.tenant_id if chosen else None)
        pair   = await auth.sessions.issue(actor, fingerprint)
        sid    = self._row_(str(token.peek(pair.access)["sid"]))

        async with self.rows.database.transaction():

            await self.sessions.create(
                id=sid, user_id=user.id, tenant_id=actor.tenant, jti=str(token.peek(pair.refresh)["jti"]),
                fingerprint=token.hash_opaque(fingerprint) if fingerprint else None, expires_at=date.after(REFRESH_TTL),
            )
            await SessionStarted(user=user.id, tenant=actor.tenant, email=user.email, who=user.name).dispatch()

        return SessionResource.started(user, pair, held, actor.tenant)

    async def refresh ( self, refresh: str, fingerprint: str ) -> dict[str, Any]:

        claims  = token.verify(refresh, "refresh", fingerprint)
        session = await self.sessions.alive(claims.id)
        pair    = await auth.sessions.refresh(refresh, fingerprint)

        async with self.rows.database.transaction():

            await self.sessions.update(
                session.id, jti=str(token.peek(pair.refresh)["jti"]), expires_at=date.after(REFRESH_TTL),
            )

        return pair.dump()

    async def end ( self, access: str ) -> None:

        claims = token.peek(access)
        jti    = claims.get("jti")
        sid    = claims.get("sid")

        if isinstance(jti, str): await auth.revoke(jti)

        if isinstance(sid, str):

            await auth.sessions.revoke(sid)
            await self.sessions.revoke(self._row_(sid))

    async def me ( self, actor: Actor ) -> dict[str, Any]:

        user = await self.rows.holder(actor.id)

        found = SessionResource.me(user, await self.memberships.of(user.id), actor.tenant)

        return { **found, "avatar": await self.avatars.url(user.id) }

    def _actor_ ( self, user: Any, roles: list[str], tenant: str | None ) -> Actor:

        granted = tuple(roles)

        return Actor(user.id, granted, auth.scopes_of(granted), tenant, { "name": user.name })

    @staticmethod
    def _row_ ( family: str ) -> str:

        return f"{family[:8]}-{family[8:12]}-{family[12:16]}-{family[16:20]}-{family[20:]}"

    async def _tenant_ ( self, held: list[Any], slug: str | None ) -> Any:

        if slug is None: return held[0] if held else None

        tenant = await self.tenants.active(slug)
        found  = next((item for item in held if item.tenant_id == tenant.id), None)

        if found is None: raise Fault(Code.FORBIDDEN, reason="session.member", errors={ "tenant": [slug[:64]] })

        return found
