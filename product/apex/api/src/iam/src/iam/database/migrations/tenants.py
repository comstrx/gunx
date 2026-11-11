from engine.database import Column, Index, Table

tenants = Table.define(
    "tenants",
    Column.id(),
    Column.text("slug"),
    Column.text("name"),
    Column.enum("status", ["active", "suspended"], default="active"),
    indexes=[Index(("slug",), unique=True)],
)
