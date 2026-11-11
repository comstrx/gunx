from engine.database import POSTGRES, Column, Index, Table

notices = Table.define(
    "notices",
    Column.id(),
    Column("user_id", "uuid"),
    Column("tenant_id", "uuid", nullable=True),
    Column.text("title"),
    Column.text("body", length=0),
    Column.jsonb("data"),
    Column.timestamp("read_at", nullable=True),
    indexes=[Index(("user_id", "created_at"))],
    policies=[("notices_self", f"user_id = {POSTGRES.setting('user')}")],
)
