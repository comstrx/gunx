from typing import ClassVar

from engine.database import Table

from ...database.migrations.users import users
from ..enums import Status
from ..utils.cycle import Model

class User(Model):

    table    : ClassVar[Table] = users
    fillable : ClassVar[tuple[str, ...]] = ("name", "status")
    sortable : ClassVar[frozenset[str]] = frozenset({ "email", "name", "created_at" })

    id     : str
    email  : str
    name   : str
    status : Status = Status.ACTIVE
