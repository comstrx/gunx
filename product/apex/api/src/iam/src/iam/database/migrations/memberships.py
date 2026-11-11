from engine.database import POSTGRES, Column, Index, Table

memberships = Table.define(
    "memberships",
    Column.id(),
    Column.reference("tenant_id", "tenants", on_delete="CASCADE"),
    Column.reference("user_id", "users", on_delete="CASCADE"),
    Column.jsonb("roles"),
    indexes=[Index(("tenant_id", "user_id"), unique=True)],
    isolated="tenant_id",
    policies=[("memberships_self", f"user_id = {POSTGRES.setting('user')}")],
)
