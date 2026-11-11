from ...app.models import Tenant

APEX = "00000000-0000-7000-8000-00000000a001"
ZAIN = "00000000-0000-7000-8000-00000000a002"

def rows () -> list[Tenant]:

    return [Tenant(id=APEX, slug="apex", name="Apex"), Tenant(id=ZAIN, slug="zain", name="Zain Shop")]
