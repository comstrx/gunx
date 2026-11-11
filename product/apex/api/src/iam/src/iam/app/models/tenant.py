from typing import ClassVar

from engine.database import Table

from ...database.migrations.tenants import tenants
from ..enums import TenantStatus
from ..utils.cycle import Model

class Tenant(Model):

    table    : ClassVar[Table] = tenants
    fillable : ClassVar[tuple[str, ...]] = ("name", "status")
    sortable : ClassVar[frozenset[str]] = frozenset({ "slug", "name", "created_at" })

    id     : str
    slug   : str
    name   : str
    status : TenantStatus = TenantStatus.ACTIVE
