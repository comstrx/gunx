from engine.database import POSTGRES, Column, Index, Table

devices = Table.define(
    "devices",
    Column.id(),
    Column("user_id", "uuid"),
    Column("tenant_id", "uuid", nullable=True),
    Column.text("token"),
    Column.enum("platform", ["ios", "android", "web"]),
    indexes=[Index(("user_id", "token"), unique=True)],
    policies=[("devices_self", f"user_id = {POSTGRES.setting('user')}")],
)
