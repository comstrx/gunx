from engine.database import Database
from engine.error import Code, Fault
from engine.string import string

from ..enums import Status
from ..models import User
from ..utils.cycle import Repository

class Users(Repository[User]):

    def __init__ ( self, database: Database ) -> None:

        super().__init__(database, User)

    async def active ( self, email: str ) -> User:

        found = await self.first(email=string.fold(email), status=Status.ACTIVE)

        if found is None: raise Fault(Code.UNAUTHORIZED, reason="session.unknown")

        return found

    async def holder ( self, key: str ) -> User:

        found = await self.first(id=key, status=Status.ACTIVE)

        if found is None: raise Fault(Code.UNAUTHORIZED, reason="session.unknown")

        return found
