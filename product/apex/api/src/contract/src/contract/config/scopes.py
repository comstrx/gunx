from ..app.enums import Audience, Role

ROLES     = tuple(Role)
AUDIENCES = tuple(Audience)
PERSONAL = ("notifications.read", "devices.write")
SCOPES: dict[str, tuple[str, ...]] = {
    Role.SUPER    : ("*",),
    Role.ADMIN    : ("hello.read", "hello.write", "users.read", *PERSONAL),
    Role.VENDOR   : ("hello.read", *PERSONAL),
    Role.DELIVERY : ("hello.read", *PERSONAL),
    Role.CLIENT   : ("hello.read", *PERSONAL),
}
