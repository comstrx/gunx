from contract import Boundary, Topology

topology = Topology.declare([
    Boundary(
        "gateway", "iam", "POST", "/sessions", "anonymous", "session.start", "SessionRequest", "Session",
        idempotency="email",
    ),
    Boundary("gateway", "hello", "GET", "/hello", "anonymous", "hello.read", "-", "Greeting"),
    Boundary("gateway", "notify", "GET", "/notifications", "actor", "notifications.read", "-", "Notice[]"),
])
