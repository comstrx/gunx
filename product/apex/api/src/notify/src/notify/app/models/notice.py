from typing import Any, ClassVar

from engine.database import Table
from engine.date import DateTime
from engine.validate import field

from ...database.migrations.notices import notices
from ..utils.cycle import Model

class Notice(Model):

    table    : ClassVar[Table] = notices
    fillable : ClassVar[tuple[str, ...]] = ("read_at",)
    sortable : ClassVar[frozenset[str]] = frozenset({ "created_at" })

    id         : str
    user_id    : str
    tenant_id  : str | None
    title      : str
    body       : str
    data       : dict[str, Any] = field(default_factory=dict)
    read_at    : DateTime | None = None
    created_at : DateTime | None = None

    def unread ( self ) -> bool:

        return self.read_at is None
