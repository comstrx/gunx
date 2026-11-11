from engine.database import Database

from ..models import Device
from ..utils.cycle import Repository

class Devices(Repository[Device]):

    def __init__ ( self, database: Database ) -> None:

        super().__init__(database, Device)

    async def of ( self, user: str ) -> list[Device]:

        async with self.database.transaction(user=user): return await self.all("created_at", user_id=user)

    async def register ( self, user: str, tenant: str | None, token: str, platform: str ) -> Device:

        values = { "user_id": user, "tenant_id": tenant, "token": token, "platform": platform }

        async with self.database.transaction(user=user):

            return await self.upsert(("user_id", "token"), ("platform", "tenant_id"), **values)
