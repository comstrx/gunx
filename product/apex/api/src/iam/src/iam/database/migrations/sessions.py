from engine.database import Column, Index, Table

sessions = Table.define(
    "sessions",
    Column.id(),
    Column.reference("user_id", "users", on_delete="CASCADE"),
    Column.reference("tenant_id", "tenants", nullable=True, on_delete="CASCADE"),
    Column.text("jti"),
    Column.text("fingerprint", nullable=True),
    Column.timestamp("expires_at"),
    Column.timestamp("revoked_at", nullable=True),
    indexes=[Index(("jti",), unique=True), Index(("user_id",))],
)
