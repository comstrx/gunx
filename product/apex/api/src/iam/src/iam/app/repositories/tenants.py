from engine.database import Database
from engine.error import Code, Fault

from ..enums import TenantStatus
from ..models import Tenant
from ..utils.cycle import Repository

class Tenants(Repository[Tenant]):

    def __init__ ( self, database: Database ) -> None:

        super().__init__(database, Tenant)

    async def active ( self, slug: str ) -> Tenant:

        found = await self.first(slug=slug.strip().lower(), status=TenantStatus.ACTIVE)

        if found is None: raise Fault(Code.FORBIDDEN, reason="session.tenant", errors={ "tenant": [slug[:64]] })

        return found
