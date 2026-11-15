from engine.database import CLICKHOUSE, MYSQL, POSTGRES, SQLITE, Column, Database, Memory, Model, Sql
from engine.error import Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress
import asyncio, asyncpg, os, sqlite3

EXAMPLES = 5000
DIALECTS = (POSTGRES, SQLITE, MYSQL, CLICKHOUSE)
MARKERS  = { "postgres": "$1", "sqlite": "?", "mysql": "%s", "clickhouse": "%s" }
names    = st.from_regex(r"[a-z_][a-z0-9_]{0,15}", fullmatch=True)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(names, names, st.text(max_size=20), st.integers(min_value=0, max_value=100), st.integers(min_value=1, max_value=50))
def every_statement_binds_its_values ( table: str, column: str, value: str, page: int, size: int ) -> None:

    sql = Sql.select(table, column).where(column, "=", value).order(column).page(page + 1, size)

    assert sql.params() == [value]

    for dialect in DIALECTS:

        text, params = sql.pair(dialect)

        assert text.count(MARKERS[dialect.name]) == 1
        assert params == [value]
        assert "'" not in text.replace('"', "").replace("`", "")
        assert all(mark not in text for mark in ("\x1f", "\x1e", "\x1d"))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=30))
def identifiers_are_quoted_or_refused ( name: str ) -> None:

    with suppress(Fault): assert Sql.select(name).text().startswith('SELECT * FROM "')
    with suppress(Fault): assert Sql.select(name).text(MYSQL).startswith("SELECT * FROM `")

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=40), st.integers())
def percent_signs_survive_positional_dialects ( fragment: str, value: int ) -> None:

    clean = fragment.replace("?", "").replace("\x1f", "").replace("\x1e", "").replace("\x1d", "")
    sql   = Sql.select("t").raw_where(clean + " = ?", value)

    for dialect in (MYSQL, CLICKHOUSE):

        text, params = sql.pair(dialect)

        assert params == [value]
        assert text.count("%s") == 1 + clean.count("%s")
        assert text.count("%") - 1 == 2 * clean.count("%")


class Entry(Model):

    id: int
    group: int

@settings(max_examples=500, deadline=None, database=None)
@given(st.lists(st.integers(min_value=1, max_value=10000), unique=True, max_size=80), st.integers(1, 12))
def cursors_partition_sorted_keys ( keys: list[int], size: int ) -> None:

    async def check () -> None:

        store = Memory(Entry, [Entry(key, key % 2) for key in keys])
        seen: list[int] = []
        after = None

        while page := await store.cursor(after, size, group=0):

            seen.extend(row.id for row in page)
            after = page[-1].id

        assert seen == sorted(key for key in keys if key % 2 == 0)

    asyncio.run(check())

@settings(max_examples=500, deadline=None, database=None)
@given(st.lists(st.tuples(st.integers(-1000000, 1000000), st.integers(-1000000, 1000000)), min_size=1, max_size=40))
def insert_order_preserves_every_row ( rows: list[tuple[int, int]] ) -> None:

    sql = Sql.insert("sample")

    for index, (left, right) in enumerate(rows):

        sql.values(**({ "a": left, "b": right } if index % 2 else { "b": right, "a": left }))

    text, params = sql.pair(SQLITE)
    connection = sqlite3.connect(":memory:")

    try:

        connection.execute("CREATE TABLE sample (a integer, b integer)")
        connection.execute(text, params)

        assert connection.execute("SELECT a, b FROM sample ORDER BY rowid").fetchall() == rows

    finally: connection.close()

@settings(max_examples=500, deadline=None, database=None)
@given(st.text(alphabet=st.characters(exclude_categories=["Cs"], exclude_characters="\x00"), max_size=100))
def enum_values_remain_literal_data ( value: str ) -> None:

    column = Column.enum("state", [value], default=value)
    connection = sqlite3.connect(":memory:")

    try:

        connection.execute(f"CREATE TABLE sample ({column.ddl(SQLITE)})")
        connection.execute("INSERT INTO sample DEFAULT VALUES")

        assert connection.execute("SELECT state FROM sample").fetchone() == (value,)

    finally: connection.close()

@settings(max_examples=25, deadline=None, database=None)
@given(st.lists(st.integers(1, 8), min_size=1, max_size=6))
def postgres_sequence_state_stays_inside_its_lease ( counts: list[int] ) -> None:

    async def check () -> None:

        local = Database()

        await local.connect(os.environ["ENGINE_DATABASE_URL"], min_size=1, max_size=1, ssl="disable")

        try:

            await local.execute("CREATE SEQUENCE fuzz_lease_sequence CACHE 1")

            expected = 0

            for count in counts:

                async with local.session() as session:

                    for sql in ("SELECT currval('fuzz_lease_sequence')", "SELECT lastval()"):

                        try: await session.raw().fetchval(sql)
                        except asyncpg.ObjectNotInPrerequisiteStateError: pass
                        else: raise AssertionError("Sequence state crossed a lease")

                    for _ in range(count):

                        expected += 1

                        assert await session.value("SELECT nextval('fuzz_lease_sequence')") == expected

        finally:

            try: await local.execute("DROP SEQUENCE IF EXISTS fuzz_lease_sequence")
            finally: await local.close()

    asyncio.run(check())

@settings(max_examples=25, deadline=None, database=None)
@given(st.lists(st.booleans(), min_size=2, max_size=12), st.integers(0, 8))
def postgres_cancelled_fetches_do_not_share_session_state ( cancellations: list[bool], turns: int ) -> None:

    async def check () -> None:

        local = Database()

        await local.connect(os.environ["ENGINE_DATABASE_URL"], min_size=1, max_size=2, application="fuzz-clean", ssl="disable")

        async def worker ( number: int ) -> None:

            for iteration in range(3):

                rows = await local.fetch(
                    "SELECT current_setting('application_name') AS before, set_config('application_name', $1, false)",
                    f"private-{number}-{iteration}",
                )

                assert rows[0]["before"] == "fuzz-clean"
                assert local.describe()["size"] <= 2

        tasks = [asyncio.create_task(worker(number)) for number in range(len(cancellations))]

        try:

            for _ in range(turns): await asyncio.sleep(0)

            for task, cancel in zip(tasks, cancellations, strict=True):

                if cancel: task.cancel()

            results = await asyncio.gather(*tasks, return_exceptions=True)

            assert all(result is None or isinstance(result, asyncio.CancelledError) for result in results)
            assert await local.value("SHOW application_name") == "fuzz-clean"

            async with local.session() as session:

                assert not session.raw().is_in_transaction()

        finally:

            for task in tasks: task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)
            await local.close()

    asyncio.run(check())

if os.environ.get("ENGINE_DATABASE_URL"):

    postgres_sequence_state_stays_inside_its_lease()
    postgres_cancelled_fetches_do_not_share_session_state()



enum_values_remain_literal_data()
insert_order_preserves_every_row()
cursors_partition_sorted_keys()

every_statement_binds_its_values()
identifiers_are_quoted_or_refused()
percent_signs_survive_positional_dialects()

print(f"fuzz database  examples={EXAMPLES * 2 + EXAMPLES // 4 + 1500 + (50 if os.environ.get("ENGINE_DATABASE_URL") else 0)}  ok")
