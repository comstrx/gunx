from engine.database import Database

from ..models import Membership
from ..utils.cycle import Repository

class Memberships(Repository[Membership]):

    def __init__ ( self, database: Database ) -> None:

        super().__init__(database, Membership)

    async def of ( self, user: str ) -> list[Membership]:

        async with self.database.transaction(user=user): return await self.all("created_at", user_id=user)

    async def within ( self, tenant: str ) -> list[Membership]:

        async with self.database.transaction(tenant=tenant): return await self.all("created_at", tenant_id=tenant)
