from typing import ClassVar

from contract import SCOPES
from engine.auth import Actor
from engine.database import Table
from engine.validate import field

from ...database.migrations.memberships import memberships
from ..utils.cycle import Model

class Membership(Model):

    table    : ClassVar[Table] = memberships
    fillable : ClassVar[tuple[str, ...]] = ("roles",)
    sortable : ClassVar[frozenset[str]] = frozenset({ "created_at" })

    id        : str
    tenant_id : str
    user_id   : str
    roles     : list[str] = field(default_factory=list)

    def actor ( self, name: str, session: str ) -> Actor:

        scopes = tuple(sorted({ scope for role in self.roles for scope in SCOPES.get(role, ()) }))

        return Actor(self.user_id, tuple(self.roles), scopes, self.tenant_id, { "name": name, "sid": session })
