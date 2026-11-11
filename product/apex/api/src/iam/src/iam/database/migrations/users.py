from engine.database import Column, Index, Table

users = Table.define(
    "users",
    Column.id(),
    Column.text("email"),
    Column.text("name"),
    Column.enum("status", ["active", "suspended", "deleted"], default="active"),
    indexes=[Index(("email",), unique=True, where="status <> 'deleted'")],
)
