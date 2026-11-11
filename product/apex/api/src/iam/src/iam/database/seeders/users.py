from ...app.models import User

SUPER  = "00000000-0000-7000-8000-000000000001"
ADMIN  = "00000000-0000-7000-8000-000000000002"
VENDOR = "00000000-0000-7000-8000-000000000003"
CLIENT = "00000000-0000-7000-8000-000000000004"

def rows () -> list[User]:

    return [
        User(id=SUPER, email="super@apex.test", name="Super"),
        User(id=ADMIN, email="admin@apex.test", name="Admin"),
        User(id=VENDOR, email="vendor@apex.test", name="Vendor"),
        User(id=CLIENT, email="client@apex.test", name="Client"),
    ]
