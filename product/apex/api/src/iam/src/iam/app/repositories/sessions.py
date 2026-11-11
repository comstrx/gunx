from engine.database import Database
from engine.date import date
from engine.error import Code, Fault

from ..models import Session
from ..utils.cycle import Repository

class Sessions(Repository[Session]):

    def __init__ ( self, database: Database ) -> None:

        super().__init__(database, Session)

    async def alive ( self, jti: str ) -> Session:

        found = await self.first(jti=jti)

        if found is None or not found.alive(date.now()): raise Fault(Code.UNAUTHORIZED, reason="session.revoked")

        return found

    async def revoke ( self, key: str ) -> bool:

        found = await self.find(key)

        if found is None or found.revoked_at is not None: return False

        await self.update(key, revoked_at=date.now())

        return True
