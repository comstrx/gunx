from collections.abc import Mapping, Sequence
from typing import Any

from engine.date import date
from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from .arch import (
    BACKFILL, CONCURRENT, CONTRACT, INSTANT, KINDS, Live, LOCK_MS, OFFLINE, Operation, RETYPES, REWRITE, REWRITES,
    WIDENING,
)
from .column import Column
from .database import Database
from .dialect import Dialect
from .plan import Plan
from .sql import Sql
from .table import Table

class Migrator:

    def __init__ ( self, database: Database, tables: Sequence[Table], ledger: Table | None = None ) -> None:

        self._database = database
        self._tables   = { table.name: table for table in tables }
        self._ledger   = ledger

    @staticmethod
    def ledger ( name: str ) -> Table:

        return Table.define(
            name,
            Column("table_name", "text", primary=True),
            Column.text("digest"),
            Column.timestamp("applied_at", now=True),
            timestamps=False,
        )

    def tables ( self ) -> tuple[str, ...]:

        return tuple(self._tables)

    def dialect ( self ) -> Dialect:

        return self._database.dialect()

    async def live ( self ) -> Live:

        async with self._database.session() as session: return await session.driver().columns(session.raw())

    async def live_indexes ( self ) -> dict[str, set[str]]:

        async with self._database.session() as session: return await session.driver().indexes(session.raw())

    async def plan ( self ) -> Plan:

        dialect = self.dialect()
        live    = await self.live()
        indexes = await self.live_indexes()
        plan    = Plan()
        known   = { self._ledger.name } if self._ledger is not None else set()

        for name, table in self._tables.items():

            if name not in live:

                for statement in table.create(dialect): plan.add(Operation(name, "create", INSTANT, statement))

                self._indexes_(plan, dialect, table, set())

                continue

            self._columns_(plan, dialect, table, live[name])
            self._indexes_(plan, dialect, table, indexes.get(name, set()))

            if table.guarded() and dialect.can("rls"):

                for statement in table.policy(dialect): plan.add(Operation(name, "policy", INSTANT, statement))

        for name in live:

            if name in self._tables or name in known: continue

            plan.drift.append(f"{name}: a live table nobody declared")

        return plan

    def _indexes_ ( self, plan: Plan, dialect: Dialect, table: Table, live: set[str] ) -> None:

        for index in table.every_index():

            if index.name(table.name) in live: continue

            statement = index.ddl(table.name, dialect)

            if statement is None: continue

            safety = CONCURRENT if dialect.can("concurrent") else INSTANT

            plan.add(Operation(table.name, "index", safety, statement))

    def _columns_ ( self, plan: Plan, dialect: Dialect, table: Table, live: Mapping[str, Mapping[str, Any]] ) -> None:

        declared = { column.name: column for column in table.columns }

        for column in table.columns:

            current = live.get(column.name)

            if current is None and column.renamed and column.renamed in live:

                statement = dialect.rename(table.name, column.renamed, column.name)

                plan.add(Operation(table.name, "rename", INSTANT, statement))

                continue

            if current is None:

                plan.add(self._add_(dialect, table, column))

                continue

            if current["kind"] != column.kind:

                if self._widening_(str(current["kind"]), column.kind):

                    change = dialect.retype(table.name, column)
                    safety = INSTANT if change else REWRITE

                    plan.add(Operation(table.name, "retype", safety, change or "", "" if change else OFFLINE))

                else:

                    note = f"{current['kind']} -> {column.kind} {RETYPES}"

                    plan.add(Operation(table.name, "retype", REWRITE, "", note))

            if current["nullable"] and not column.nullable and not column.primary:

                change = dialect.nullability(table.name, column, nullable=False)
                note   = "backfill the column before this runs" if change else OFFLINE

                plan.add(Operation(table.name, "not_null", BACKFILL if change else REWRITE, change or "", note))

            if not current["nullable"] and column.nullable:

                change = dialect.nullability(table.name, column, nullable=True)
                safety = INSTANT if change else REWRITE

                plan.add(Operation(table.name, "nullable", safety, change or "", "" if change else OFFLINE))

        for name in live:

            if name not in declared and not any(column.renamed == name for column in table.columns):

                note = "a drop runs only in a contract deploy"

                plan.add(Operation(table.name, "drop", CONTRACT, dialect.drop(table.name, name), note))

    def _add_ ( self, dialect: Dialect, table: Table, column: Column ) -> Operation:

        if not column.nullable and column.default is None: return Operation(table.name, "add", REWRITE, "", REWRITES)

        statement = dialect.add(table.name, column)

        if column.volatile():

            return Operation(table.name, "add", BACKFILL, statement, "a volatile default rewrites every row")

        return Operation(table.name, "add", INSTANT, statement)

    async def apply (
        self, plan: Plan | None = None, contract: bool = False, lock_ms: int = LOCK_MS,
    ) -> list[Operation]:

        plan    = plan or await self.plan()
        allowed = { INSTANT, CONCURRENT, BACKFILL } | ({ CONTRACT } if contract else set())
        refused = [op for op in plan.operations if op.safety not in allowed and op.safety != CONTRACT]

        if refused:

            notes = { f"{op.table}.{op.kind}": [op.note or op.safety] for op in refused }

            raise Fault(Code.CONFLICT, "The plan has operations that need a hand", "migrate.unsafe", notes)

        await self._prepare_()

        done: list[Operation] = []

        for operation in plan.operations:

            if operation.safety == CONTRACT and not contract: continue

            await self._run_(operation, lock_ms)
            done.append(operation)

        await self._record_()

        log.info("migrate.applied", operations=len(done), skipped=len(plan.operations) - len(done))

        return done

    async def _run_ ( self, operation: Operation, lock_ms: int ) -> None:

        if operation.safety == CONCURRENT:

            await self._database.execute(operation.sql)

            return

        lock = self.dialect().lock(lock_ms)

        async with self._database.transaction() as session:

            if lock: await session.execute(lock)

            await session.execute(operation.sql)

    async def _prepare_ ( self ) -> None:

        if self._ledger is None: return

        for statement in self._ledger.create(self.dialect()): await self._database.execute(statement)

    async def _record_ ( self ) -> None:

        if self._ledger is None: return

        dialect = self.dialect()

        for name, table in self._tables.items():

            digest = json.dumps(table.describe(), stable=True)
            values = { "table_name": name, "digest": digest, "applied_at": date.now() }

            if dialect.can("upsert"):

                sql = Sql.insert(self._ledger.name).values(**values)

                await self._database.execute(sql.conflict("table_name", update=["digest", "applied_at"]))

                continue

            await self._database.execute(Sql.delete(self._ledger.name).equals(table_name=name))
            await self._database.execute(Sql.insert(self._ledger.name).values(**values))

    async def status ( self ) -> dict[str, Any]:

        plan    = await self.plan()
        applied: list[str] = []

        if self._ledger is not None and self._ledger.name in await self.live():

            rows    = await self._database.fetch(Sql.select(self._ledger.name, "table_name").order("table_name"))
            applied = [str(row["table_name"]) for row in rows]

        return { "pending": len(plan.operations), "drift": plan.drift, "applied": applied, "kinds": sorted(KINDS) }

    async def drop ( self, *names: str ) -> int:

        dialect = self.dialect()

        for name in names: await self._database.execute(dialect.remove(name))

        return len(names)

    def _widening_ ( self, old: str, new: str ) -> bool:

        return (old, new) in WIDENING or old == new
