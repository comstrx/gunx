from typing import ClassVar

from engine.database import Table

from ...database.migrations.devices import devices
from ..enums import Platform
from ..utils.cycle import Model

class Device(Model):

    table    : ClassVar[Table] = devices
    fillable : ClassVar[tuple[str, ...]] = ("platform",)
    sortable : ClassVar[frozenset[str]] = frozenset({ "created_at" })

    id        : str
    user_id   : str
    tenant_id : str | None
    token     : str
    platform  : Platform
