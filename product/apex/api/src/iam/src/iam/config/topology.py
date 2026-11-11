from contract import Boundary, Topology

topology = Topology.declare([
    Boundary(
        "gateway", "iam", "POST", "/sessions/code", "anonymous", "session.code", "CodeRequest", "-",
        idempotency="email",
    ),
    Boundary(
        "gateway", "iam", "POST", "/sessions", "anonymous", "session.start", "SessionRequest", "Session",
        idempotency="email",
    ),
    Boundary(
        "gateway", "iam", "POST", "/sessions/refresh", "refresh", "session.refresh", "RefreshRequest", "Pair",
        idempotency="jti",
    ),
    Boundary("gateway", "iam", "DELETE", "/sessions", "actor", "session.end", "-", "-"),
    Boundary("gateway", "iam", "GET", "/me", "actor", "users.read", "-", "User"),
])
