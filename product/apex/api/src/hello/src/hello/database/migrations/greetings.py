from engine.database import Column, Index, Table

greetings = Table(
    "greetings",
    (
        Column("id", "uuid", primary=True, default="gen_random_uuid()"),
        Column("locale", "text"),
        Column("tone", "text", default="'plain'"),
        Column("text", "text"),
        Column("created_at", "timestamp", default="now()"),
    ),
    (Index(("locale", "tone"), unique=True),),
)
