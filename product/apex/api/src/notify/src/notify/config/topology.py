from contract import Boundary, Topology

topology = Topology.declare([
    Boundary(
        "gateway", "notify", "POST", "/devices", "actor", "devices.write", "DeviceRequest", "Device",
        idempotency="token",
    ),
    Boundary("gateway", "notify", "GET", "/notifications", "actor", "notifications.read", "IndexRequest", "Notice[]"),
    Boundary(
        "gateway", "notify", "POST", "/notifications/<notice>/read", "actor", "notifications.read", "ReadRequest",
        "Notice", idempotency="notice",
    ),
])
