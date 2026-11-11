from engine.database import CLICKHOUSE, MYSQL, SQLITE, Sql
from engine.test import Bench

bench = Bench()

bench.measure("sql.select", lambda: Sql.select("people", "id").where("age", ">=", 18).order("name").page(2, 20).text())
bench.measure("sql.insert", lambda: Sql.insert("people").values(a=1, b=2).conflict("a", update=["b"]).returning().text())
bench.measure("sql.select.sqlite", lambda: Sql.select("people", "id").where("age", ">=", 18).order("name").page(2, 20).text(SQLITE))
bench.measure("sql.select.mysql", lambda: Sql.select("people", "id").where("age", ">=", 18).order("name").page(2, 20).text(MYSQL))
bench.measure("sql.update.clickhouse", lambda: Sql.update("people").set(a=1).equals(id=5).text(CLICKHOUSE))
