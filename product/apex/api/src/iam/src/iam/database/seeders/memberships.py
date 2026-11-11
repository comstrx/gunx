from contract import Role

from ...app.models import Membership
from .tenants import APEX, ZAIN
from .users import ADMIN, CLIENT, SUPER, VENDOR

def member ( key: str, tenant: str, user: str, role: Role ) -> Membership:

    made = f"00000000-0000-7000-8000-00000000b00{key}"

    return Membership(id=made, tenant_id=tenant, user_id=user, roles=[role.value])

def rows () -> list[Membership]:

    return [
        member("1", APEX, SUPER, Role.SUPER),
        member("2", APEX, ADMIN, Role.ADMIN),
        member("3", ZAIN, VENDOR, Role.VENDOR),
        member("4", ZAIN, CLIENT, Role.CLIENT),
        member("5", APEX, CLIENT, Role.CLIENT),
    ]
