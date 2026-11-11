from typing import ClassVar

from engine.database import Table
from engine.date import DateTime

from ...database.migrations.sessions import sessions
from ..utils.cycle import Model

class Session(Model):

    table    : ClassVar[Table] = sessions
    fillable : ClassVar[tuple[str, ...]] = ("revoked_at",)
    sortable : ClassVar[frozenset[str]] = frozenset({ "created_at", "expires_at" })

    id          : str
    user_id     : str
    tenant_id   : str | None
    jti         : str
    fingerprint : str | None
    expires_at  : DateTime
    revoked_at  : DateTime | None = None

    def alive ( self, now: DateTime ) -> bool:

        return self.revoked_at is None and self.expires_at > now
