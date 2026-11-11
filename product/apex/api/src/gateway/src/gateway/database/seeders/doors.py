from contract import Audience

from ...app.models import Door

def door (
    method: str, path: str, service: str, target: str, audience: Audience, *, scope: str | None = None,
    policy: str = "read",
) -> Door:

    key = f"{service}.{method.lower()}.{target}"

    return Door(
        id=key, method=method, path=path, service=service, target=target, audience=audience, scope=scope,
        policy=policy,
    )

def rows () -> list[Door]:

    return [
        door("POST", "/api/sessions/code", "iam", "/sessions/code", Audience.PUBLIC, policy="start"),
        door("POST", "/api/sessions", "iam", "/sessions", Audience.PUBLIC, policy="start"),
        door("POST", "/api/sessions/refresh", "iam", "/sessions/refresh", Audience.PUBLIC, policy="refresh"),
        door("DELETE", "/api/sessions", "iam", "/sessions", Audience.ADMIN),
        door("GET", "/api/me", "iam", "/me", Audience.ADMIN),
        door("GET", "/api/hello", "hello", "/hello", Audience.PUBLIC),
        door("GET", "/api/hello/me", "hello", "/hello/me", Audience.ADMIN, scope="hello.read"),
        door("GET", "/api/hello/<name>", "hello", "/hello/<name>", Audience.PUBLIC),
        door("POST", "/api/devices", "notify", "/devices", Audience.ADMIN, scope="devices.write", policy="start"),
        door("GET", "/api/notifications", "notify", "/notifications", Audience.ADMIN, scope="notifications.read"),
        door(
            "POST", "/api/notifications/<notice>/read", "notify", "/notifications/<notice>/read", Audience.ADMIN,
            scope="notifications.read",
        ),
    ]
