from engine.database import CLICKHOUSE, MYSQL, SQLITE, Column, Database, Model, Sql, Table
import asyncio, os
from typing import ClassVar
from engine.test import Bench

bench = Bench()

bench.measure("sql.select", lambda: Sql.select("people", "id").where("age", ">=", 18).order("name").page(2, 20).text())
bench.measure("sql.insert", lambda: Sql.insert("people").values(a=1, b=2).conflict("a", update=["b"]).returning().text())
bench.measure("sql.select.sqlite", lambda: Sql.select("people", "id").where("age", ">=", 18).order("name").page(2, 20).text(SQLITE))
bench.measure("sql.select.mysql", lambda: Sql.select("people", "id").where("age", ">=", 18).order("name").page(2, 20).text(MYSQL))
bench.measure("sql.update.clickhouse", lambda: Sql.update("people").set(a=1).equals(id=5).text(CLICKHOUSE))

bench.measure("sql.insert.rows", lambda: Sql.insert("people").values(a=1, b=2).values(b=4, a=3).text())

class Entry(Model):

    table: ClassVar[Table] = Table.define("entry", Column.id(), Column.text("name"), Column.jsonb("data"), Column.boolean("active"), timestamps=False)
    id: str
    name: str
    data: dict[str, int]
    active: bool

row = { "id": "00000000-0000-4000-8000-000000000000", "name": "sample", "data": '{"n":1}', "active": 1 }
bench.measure("model.from_row", lambda: Entry.from_row(row))

async def live () -> None:

    url = os.environ.get("ENGINE_DATABASE_URL")

    if not url: return

    db = Database()

    await db.connect(url, min_size=4, max_size=4, application="engine-bench")

    async def concurrent () -> None:

        await asyncio.gather(*(db.value("SELECT $1::int", n) for n in range(16)))

        driver = db.driver()
        held = await asyncio.gather(*(driver.acquire() for _ in range(4)))

        await asyncio.gather(*(driver.release(connection) for connection in held))

    async def isolated () -> None:

        async with db.session() as session: await session.fetch("SELECT $1::int AS value", 1)

    payload = { "rows": [{ "name": "\u00e9\u4e2d" * 30, "n": n } for n in range(100)] }

    try:

        await bench.measure_async("database.live.json", lambda: db.fetch("SELECT $1::json AS value", payload), rounds=200)
        await bench.measure_async("database.live.jsonb", lambda: db.fetch("SELECT $1::jsonb AS value", payload), rounds=200)
        await bench.measure_async("database.live.fetch", lambda: db.fetch("SELECT $1::int AS value", 1), rounds=200)
        await bench.measure_async("database.live.session.reset", isolated, rounds=200)
        await bench.measure_async("database.live.concurrent16.reset_barrier", concurrent, rounds=100)

    finally: await db.close()

Bench.run(live())
