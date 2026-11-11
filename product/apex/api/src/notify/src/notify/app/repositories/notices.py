from engine.database import Database
from engine.date import date
from engine.error import Code, Fault

from ..models import Notice
from ..utils.cycle import Repository

class Notices(Repository[Notice]):

    def __init__ ( self, database: Database ) -> None:

        super().__init__(database, Notice)

    async def of ( self, user: str, page: int, limit: int ) -> tuple[list[Notice], int]:

        async with self.database.transaction(user=user):

            return await self.page(page, limit, "-created_at", user_id=user)

    async def own ( self, user: str, key: str ) -> Notice:

        async with self.database.transaction(user=user): found = await self.first(id=key, user_id=user)

        if found is None: raise Fault(Code.NOT_FOUND, reason="notice.missing")

        return found

    async def read ( self, user: str, key: str ) -> Notice:

        async with self.database.transaction(user=user):

            found = await self.own(user, key)

            return found if found.read_at is not None else await self.update(key, read_at=date.now())

    async def write ( self, user: str, tenant: str | None, title: str, body: str, **data: object ) -> Notice:

        async with self.database.transaction(user=user):

            return await self.create(user_id=user, tenant_id=tenant, title=title, body=body, data=dict(data))
