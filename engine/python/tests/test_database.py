from engine.database import CLICKHOUSE, MYSQL, POSTGRES, SQLITE, Column, Database, Index, Memory, Migrator, Model, Outbox, PostgresDriver, Repository, Sql, SqliteDriver, Table, Vector, database
from engine.database.lane import Lane
from collections.abc import AsyncIterator, Callable, Mapping
from engine.date import DateTime, date
from engine.error import Code, Fault
from engine.health import health
from engine.rand import rand
from engine.validate import field
from decimal import Decimal
from typing import Any, ClassVar
import asyncio, os, pytest

URL = os.environ.get("ENGINE_DATABASE_URL", "postgresql://engine:engine@127.0.0.1:5432/engine_test")

PEOPLE = Table.define(
    "test_people",
    Column.id(),
    Column.text("email", unique=True),
    Column.text("name"),
    Column.integer("age", nullable=True, check="age >= 0"),
    Column.enum("role", ["admin", "user"], default="user"),
    Column.money("balance"),
    Column.jsonb("facts"),
    Column.boolean("active", default=True),
    Column.numeric("score", nullable=True),
    indexes=[Index(("name",)), Index(("email", "role"), unique=True, where="deleted_at IS NULL")],
    soft=True,
)
NOTES  = Table.define("test_notes", Column.id(), Column.reference("person_id", "test_people", on_delete="CASCADE"), Column.text("body"), timestamps=False)
LEDGER = Migrator.ledger("test_schema")
OUTBOX = Outbox.blueprint("test_outbox")
NOBODY = "00000000-0000-4000-8000-000000000000"

class Person(Model):

    table: ClassVar[Table] = PEOPLE
    sortable: ClassVar[frozenset[str]] = frozenset({ "name", "created_at" })

    id      : str
    email   : str
    name    : str
    age     : int | None = None
    role    : str = "user"
    balance : int = 0
    active  : bool = True
    score   : Decimal | None = None
    facts   : dict[str, Any] = field(default_factory=dict)

@pytest.fixture(scope="session", autouse=True)
async def connected () -> AsyncIterator[None]:

    await database.connect(URL, min_size=1, max_size=4, application="engine-tests", ssl="disable")

    yield None

    await database.close()

@pytest.fixture(scope="session")
async def lite ( tmp_path_factory: pytest.TempPathFactory ) -> AsyncIterator[Database]:

    made = Database()

    await made.connect(f"sqlite://{tmp_path_factory.mktemp('sqlite') / 'engine.db'}", size=2)

    yield made

    await made.close()

@pytest.fixture(params=["postgres", "sqlite"])
async def db ( request: pytest.FixtureRequest, lite: Database ) -> Database:

    return database if request.param == "postgres" else lite

@pytest.fixture
async def schema ( db: Database ) -> Migrator:

    migrator = Migrator(db, [PEOPLE, NOTES, OUTBOX], LEDGER)

    await migrator.drop("test_notes", "test_people", "test_outbox", "test_schema")
    await migrator.apply()

    return migrator

def test_sql_composes_safely () -> None:

    sql = Sql.select("people", "id", "name").where("age", ">=", 18).where("role", "IN", ["a", "b"]).order("name").page(2, 10)

    assert sql.text() == 'SELECT "id", "name" FROM "people" WHERE "age" >= $1 AND "role" IN ($2, $3) ORDER BY "name" ASC LIMIT 10 OFFSET 10'
    assert sql.params() == [18, "a", "b"]
    assert Sql.select("p").where("x", "IN", []).text() == 'SELECT * FROM "p" WHERE FALSE'
    assert Sql.select("p").equals(a=None).text() == 'SELECT * FROM "p" WHERE "a" IS NULL'
    assert Sql.select("p").raw_where("lower(name) = ?", "x").search("body", "hello").group("role").count().text() == 'SELECT COUNT(*) AS count FROM "p" WHERE (lower(name) = $1) AND "body" @@ plainto_tsquery($2, $3) GROUP BY "role"'
    assert Sql.select("p", "p.id").join("notes", "notes.person_id", "p.id", "LEFT").text() == 'SELECT "p"."id" FROM "p" LEFT JOIN "notes" ON "notes"."person_id" = "p"."id"'
    assert Sql.insert("p").values(a=1, b="x").conflict("a", update=["b"]).returning("id").text() == 'INSERT INTO "p" ("a", "b") VALUES ($1, $2) ON CONFLICT ("a") DO UPDATE SET "b" = EXCLUDED."b" RETURNING "id"'
    assert Sql.insert("p").rows(["a"], [{ "a": 1 }, { "a": 2 }]).conflict("a").text() == 'INSERT INTO "p" ("a") VALUES ($1), ($2) ON CONFLICT ("a") DO NOTHING'
    assert Sql.update("p").set(a=1).raw_set("n", "n + ?", 2).equals(id=5).returning().text() == 'UPDATE "p" SET "a" = $1, "n" = n + $2 WHERE "id" = $3 RETURNING *'
    assert Sql.delete("p").equals(id=1).text() == 'DELETE FROM "p" WHERE "id" = $1'
    assert Sql.select("p").lock().text().endswith("FOR UPDATE SKIP LOCKED")

    broken: tuple[Callable[[], object], ...] = (lambda: Sql.update("p").set(a=1).text(), lambda: Sql.delete("p").text(), lambda: Sql.insert("p").text(), lambda: Sql.select("p;drop"), lambda: Sql.select("p").where("a", "~", 1), lambda: Sql.select("p").order("a", "sideways"), lambda: Sql.select("p").limit(-1))

    for attempt in broken:

        with pytest.raises(Fault) as caught: attempt()

        assert caught.value.code is Code.INTERNAL

def test_sql_speaks_every_dialect () -> None:

    assert Sql.select("people", "id").where("name", "ILIKE", "a%").page(2, 10).text(SQLITE) == 'SELECT "id" FROM "people" WHERE "name" LIKE ? LIMIT 10 OFFSET 10'
    assert Sql.select("p").lock().text(SQLITE) == 'SELECT * FROM "p"'
    assert Sql.update("p").set(a=1).equals(id=5).text(MYSQL) == "UPDATE `p` SET `a` = %s WHERE `id` = %s"
    assert Sql.insert("p").values(a=1, b=2).conflict("a", update=["b"]).text(MYSQL) == "INSERT INTO `p` (`a`, `b`) VALUES (%s, %s) AS new ON DUPLICATE KEY UPDATE `b` = new.`b`"
    assert Sql.insert("p").values(a=1).conflict("a").text(MYSQL).endswith("ON DUPLICATE KEY UPDATE `a` = `a`")
    assert Sql.select("p").raw_where("x % 2 = ?", 1).pair(MYSQL) == ("SELECT * FROM `p` WHERE (x %% 2 = %s)", [1])
    assert Sql.select("p").lock().text(MYSQL).endswith("FOR UPDATE SKIP LOCKED")
    assert Sql.update("p").set(a=1).equals(id=5).text(CLICKHOUSE) == "ALTER TABLE `p` UPDATE `a` = %s WHERE `id` = %s"
    assert Sql.delete("p").equals(id=1).text(CLICKHOUSE) == "DELETE FROM `p` WHERE `id` = %s"

    near, params = Sql.select("c", "body").equals(scope="kb").nearest("embedding", [0.1, 0.2]).limit(3).pair(POSTGRES)

    assert near == 'SELECT "body", 1 - ("embedding" <=> $1::vector) AS score FROM "c" WHERE "scope" = $2 ORDER BY ("embedding" <=> $1::vector) ASC LIMIT 3'
    assert params[1] == "kb" and isinstance(params[0], Vector) and len(params) == 2 and params[0].literal() == "[0.1,0.2]"

    fast, params = Sql.select("c", "body").nearest("embedding", Vector([1.0])).pair(CLICKHOUSE)

    assert fast == "SELECT `body`, 1 - cosineDistance(`embedding`, %s) AS score FROM `c` ORDER BY cosineDistance(`embedding`, %s) ASC" and len(params) == 2

    refused: tuple[Callable[[], object], ...] = (lambda: Sql.insert("p").values(a=1).returning().text(MYSQL), lambda: Sql.select("p").search("b", "x").text(SQLITE), lambda: Sql.insert("p").values(a=1).conflict("a").text(CLICKHOUSE), lambda: Sql.select("p").nearest("e", [1.0]).text(SQLITE))

    for attempt in refused:

        with pytest.raises(Fault) as caught: attempt()

        assert caught.value.reason == "sql.capability"

def test_tables_declare_their_ddl () -> None:

    assert PEOPLE.primary() == "id" and "deleted_at" in PEOPLE.names() and PEOPLE.column("email").unique and PEOPLE.has("age")
    assert len(PEOPLE.every_index()) == 2 and NOTES.every_index()[0].columns == ("person_id",)
    assert PEOPLE.create()[0].startswith('CREATE TABLE IF NOT EXISTS "test_people"') and '"role" text NOT NULL DEFAULT \'user\' CHECK (role IN (\'admin\', \'user\'))' in PEOPLE.create()[0]
    assert '"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()' in PEOPLE.create()[0] and '"score" numeric(18, 2)' in PEOPLE.create()[0]
    assert NOTES.create()[0].count('REFERENCES "test_people" ("id") ON DELETE CASCADE') == 1
    assert PEOPLE.indexes[1].ddl("test_people") == 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "test_people_email_role_key" ON "test_people" ("email", "role") WHERE deleted_at IS NULL'
    assert PEOPLE.with_column(Column.text("x")).names()[-1] == "x" and "age" not in PEOPLE.without("age").names()

    lite = PEOPLE.create(SQLITE)[0]

    assert '"id" uuid PRIMARY KEY NOT NULL,' in lite and '"active" boolean NOT NULL DEFAULT 1' in lite and '"facts" jsonb NOT NULL DEFAULT \'{}\'' in lite
    assert '"created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP' in lite and "CHECK (age >= 0)" in lite
    assert PEOPLE.indexes[1].ddl("test_people", SQLITE) == 'CREATE UNIQUE INDEX IF NOT EXISTS "test_people_email_role_key" ON "test_people" ("email", "role") WHERE deleted_at IS NULL'

    maria = PEOPLE.create(MYSQL)[0]

    assert "`id` char(36) PRIMARY KEY NOT NULL DEFAULT (UUID())" in maria and "`email` varchar(255) NOT NULL UNIQUE" in maria
    assert "`active` tinyint(1) NOT NULL DEFAULT 1" in maria and "`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)" in maria and "`facts` json NOT NULL DEFAULT ('{}')" in maria
    assert PEOPLE.indexes[0].ddl("test_people", MYSQL) == "CREATE INDEX IF NOT EXISTS `test_people_name_idx` ON `test_people` (`name`)"

    with pytest.raises(Fault) as partial: PEOPLE.indexes[1].ddl("test_people", MYSQL)

    assert partial.value.reason == "sql.capability"

    click = PEOPLE.create(CLICKHOUSE)[0]

    assert click.endswith("ENGINE = MergeTree ORDER BY (`id`)") and "`age` Nullable(Int32)" in click and "`facts` JSON DEFAULT '{}'" in click
    assert "CHECK" not in click and "UNIQUE" not in click and PEOPLE.indexes[0].ddl("test_people", CLICKHOUSE) is None

    isolated = Table.define("tenant_rows", Column.id(), Column.reference("tenant_id", "tenants"), isolated="tenant_id")

    assert isolated.every_index()[0].columns == ("tenant_id",) and len(isolated.create()) == 5 and "ROW LEVEL SECURITY" in isolated.create()[1]
    assert isolated.describe()["isolated"] == "tenant_id" and len(isolated.create(SQLITE)) == 1 and isolated.policy(SQLITE) == []

    with pytest.raises(Fault): Column("x", "money")
    with pytest.raises(Fault): Table("no_key", (Column.text("a"),))
    with pytest.raises(Fault): Table("dup", (Column.id(), Column.text("a"), Column.text("a")))
    with pytest.raises(Fault): PEOPLE.column("nothing")
    with pytest.raises(Fault): Column.vector("v", 3).ddl(SQLITE)

async def test_the_migrator_plans_and_applies_safely ( db: Database, schema: Migrator ) -> None:

    online = db.dialect().name == "postgres"

    assert (await schema.plan()).empty()

    status = await schema.status()

    assert status["pending"] == 0 and status["applied"] == ["test_notes", "test_outbox", "test_people"]

    grown   = PEOPLE.with_column(Column.text("phone", nullable=True)).with_column(Column.integer("visits", default="0")).without("age")
    changed = Migrator(db, [grown, NOTES, OUTBOX], LEDGER)
    plan    = await changed.plan()
    kinds   = [(operation.kind, operation.safety) for operation in plan.operations]

    assert kinds == [("add", "instant"), ("add", "instant"), ("drop", "contract")]
    assert await changed.apply(plan) == plan.operations[:2]

    live = await changed.live()

    assert "phone" in live["test_people"] and "age" in live["test_people"]
    assert await changed.apply(contract=True) and "age" not in (await changed.live())["test_people"]

    renamed = grown.without("phone").with_column(Column("mobile", "text", nullable=True, renamed="phone"))

    assert [op.kind for op in (await Migrator(db, [renamed, NOTES, OUTBOX], LEDGER).plan()).operations] == ["rename"]

    unsafe = Migrator(db, [grown.with_column(Column.text("required")), NOTES, OUTBOX], LEDGER)

    with pytest.raises(Fault) as refused: await unsafe.apply()

    assert refused.value.reason == "migrate.unsafe" and "test_people.add" in (refused.value.errors or {})

    widened = Migrator(db, [grown.without("visits").with_column(Column.integer("visits", default="0", big=True)), NOTES, OUTBOX], LEDGER)

    assert [(op.kind, op.safety) for op in (await widened.plan()).operations] == [("retype", "instant" if online else "rewrite")]

    narrowed = Migrator(db, [grown.without("visits").with_column(Column("visits", "text", default="'0'")), NOTES, OUTBOX], LEDGER)

    assert [(op.kind, op.safety) for op in (await narrowed.plan()).operations] == [("retype", "rewrite")]

    await db.execute('CREATE TABLE IF NOT EXISTS "test_stray" (id int PRIMARY KEY)')

    assert "test_stray: a live table nobody declared" in (await changed.plan()).drift

    await changed.drop("test_stray")

async def test_repositories_speak_models ( db: Database, schema: Migrator ) -> None:

    people = Repository(db, Person)
    made   = await people.create(email="a@x.io", name="Ann", facts={ "k": 1 }, score=Decimal("12.50"))

    assert made.email == "a@x.io" and made.role == "user" and made.key() == made.id and len(made.id) == 36
    assert made.facts == { "k": 1 } and made.score == Decimal("12.50") and made.active is True
    assert await people.find(made.id) == made and await people.first(email="a@x.io") == made and await people.find(NOBODY) is None
    assert await people.need(made.id) == made and await people.exists(name="Ann") and not await people.exists(name="Bob")
    assert await people.insert_many([{ "email": "b@x.io", "name": "Bob" }, { "email": "c@x.io", "name": "Cat" }]) == 2
    assert [p.name for p in await people.all(order="-name")] == ["Cat", "Bob", "Ann"] and await people.count() == 3

    page, total = await people.page(1, 2, order="name")

    assert [p.name for p in page] == ["Ann", "Bob"] and total == 3

    with pytest.raises(Fault) as unsortable: await people.all(order="-email")

    assert unsortable.value.code is Code.VALIDATION and unsortable.value.reason == "database.order"

    updated = await people.update(made.id, age=30, balance=500)

    assert updated.age == 30 and updated.balance == 500
    assert (await people.upsert(["email"], ["name"], email="a@x.io", name="Anna")).name == "Anna"
    assert await people.delete(made.id) and not await people.delete(made.id)
    assert await people.find(made.id) is not None and await people.count() == 3

    row = await db.one(Sql.select("test_people", "created_at", "active", "facts").equals(id=made.id))

    assert row is not None and isinstance(row["created_at"], DateTime) and row["created_at"].tzinfo is not None

    with pytest.raises(Fault) as duplicate: await people.create(email="b@x.io", name="Dup")

    assert duplicate.value.code is Code.CONFLICT and duplicate.value.reason == "database.unique"

    with pytest.raises(Fault) as check: await people.create(email="d@x.io", name="D", age=-1)

    assert check.value.code is Code.VALIDATION and check.value.reason == "database.check"

    with pytest.raises(Fault) as required: await people.create(email="e@x.io")

    assert required.value.reason == "database.required"

    with pytest.raises(Fault) as missing: await people.need(NOBODY)

    assert missing.value.code is Code.NOT_FOUND and missing.value.reason == "test_people.missing"

    with pytest.raises(Fault): await people.update(NOBODY, name="x")

    with pytest.raises(Fault) as reference: await db.execute(Sql.insert("test_notes").values(id=str(rand.uuid7()), person_id=NOBODY, body="x"))

    assert reference.value.reason == "database.reference"

async def test_transactions_sessions_and_scopes ( db: Database, schema: Migrator ) -> None:

    people = Repository(db, Person)

    with pytest.raises(Fault):

        async with db.transaction() as session:

            await people.create(email="t@x.io", name="T")

            assert session.inside() and db.current() is session and await people.count() == 1

            raise Fault(Code.CONFLICT)

    assert await people.count() == 0 and db.current() is None

    async with db.transaction() as outer:

        await people.create(email="keep@x.io", name="Keep")

        with pytest.raises(Fault):

            async with outer.transaction():

                await people.create(email="lost@x.io", name="Lost")

                raise Fault(Code.CONFLICT)

        assert await people.count() == 1

    assert [p.name for p in await people.all()] == ["Keep"]

    if db.dialect().can("scope"):

        async with db.transaction(tenant="00000000-0000-4000-8000-000000000001") as session:

            assert session.scoped() == { "tenant": "00000000-0000-4000-8000-000000000001" }
            assert await session.value("SELECT current_setting('app.tenant', true)") == "00000000-0000-4000-8000-000000000001"
            assert await db.advisory(42) and await db.value("SELECT pg_try_advisory_xact_lock(42)") is not None

    insert = Sql.insert("test_people").values(id="x", email="x", name="x").text(db.dialect())

    async with db.session() as session:

        rows = [(str(rand.uuid7()), "m1@x.io", "M1"), (str(rand.uuid7()), "m2@x.io", "M2")]

        assert await session.many(insert, rows) == 2
        assert await session.execute(Sql.delete("test_people").where("name", "LIKE", "M%").text(db.dialect()), "M%") == 2

        if db.dialect().can("copy"): assert await session.copy("test_people", ["id", "email", "name"], [(str(rand.uuid7()), "c1@x.io", "C1")]) == 1
        else:

            with pytest.raises(Fault) as refused: await session.copy("test_people", ["id"], [("z",)])

            assert refused.value.reason == "sql.capability"

    db.register("people.names", Sql.select("test_people", "name").order("name").text(db.dialect()))

    assert [row["name"] for row in await db.run("people.names")] == (["C1", "Keep"] if db.dialect().can("copy") else ["Keep"])
    assert db.describe()["statements"] == 1 and db.describe()["ready"] and db.describe()["dialect"] == db.dialect().name

    with pytest.raises(Fault) as bad: await db.fetch("SELECT * FROM nothing_here")

    assert bad.value.code is Code.INTERNAL and bad.value.reason == "database.sql"

    with pytest.raises(Fault): db.statement("nothing")

    assert await db.ping()

    if db.dialect().can("listen"):

        heard: list[str] = []
        listener = await db.listen("engine_tests", heard.append)

        await db.notify("engine_tests", { "hi": 1 })
        await asyncio.sleep(0.05)

        assert heard == ['{"hi":1}']

        await listener.close()

    else:

        with pytest.raises(Fault) as deaf: await db.listen("engine_tests", print)

        assert deaf.value.reason == "sql.capability"

async def test_outbox_delivers_at_least_once ( db: Database, schema: Migrator ) -> None:

    box  = Outbox(db, interval=0.01, table=OUTBOX)
    seen: list[dict[str, object]] = []
    hits = 0

    async def ok ( payload: Mapping[str, Any] ) -> None: seen.append(dict(payload))

    async def flaky ( payload: Mapping[str, Any] ) -> None:

        nonlocal hits

        hits += 1

        if hits == 1: raise Fault(Code.UNAVAILABLE, reason="down")

        seen.append({ "retried": True })

    box.kind("ok", ok)
    box.kind("flaky", flaky)

    async with db.transaction():

        await box.put("ok", { "n": 1 })
        await box.put("flaky", { "n": 2 })

    assert box.kinds() == ("flaky", "ok") and await box.pending() == 2
    assert await box.relay() == 1 and seen == [{ "n": 1 }] and await box.pending() == 1

    await db.execute(Sql.update("test_outbox").set(available_at=date.now()).where("done_at", "IS", None))

    assert await box.relay() == 1 and seen[-1] == { "retried": True } and await box.pending() == 0
    assert box.stats() == { "delivered": 2, "failed": 1, "kinds": 2 } and await box.dead() == []
    assert await box.purge(0) == 2

    with pytest.raises(Fault) as unknown: await box.put("nothing", {})

    assert unknown.value.reason == "outbox.kind"

    with pytest.raises(Fault) as bare: await Outbox(db).pending()

    assert bare.value.reason == "outbox.setup"

    box.start()

    assert box.running()

    await box.put("ok", { "n": 3 })

    for _ in range(50):

        if len(seen) == 3: break

        await asyncio.sleep(0.02)

    assert seen[-1] == { "n": 3 } and box.describe()["table"] == "test_outbox"

    await box.stop()

ANN, BOB, EVE = "0190a000-0000-7000-8000-000000000001", "0190a000-0000-7000-8000-000000000002", "0190a000-0000-7000-8000-000000000003"

async def walk ( store: Repository[Person] | Memory[Person] ) -> list[Any]:

    await store.create(id=ANN, email="ann@x.co", name="Ann", age=30)
    await store.create(id=BOB, email="bob@x.co", name="Bob", age=20)

    found   = await store.find(ANN)
    first   = await store.first(email="bob@x.co")
    rows, n = await store.page(1, 1, "name")
    changed = await store.update(ANN, age=31)
    upsert  = await store.upsert(("email",), ("name",), id=EVE, email="ann@x.co", name="Annie")
    fresh   = await store.create(email="fresh@x.co", name="Fresh")

    with pytest.raises(Fault) as missing: await store.need(EVE)
    with pytest.raises(Fault) as unsortable: await store.all("email")
    with pytest.raises(Fault) as taken: await store.create(id=ANN, email="z@x.co", name="Z")

    return [
        found.name if found else None, first.name if first else None, await store.count(), await store.exists(role="admin"),
        [p.name for p in await store.all("name")], [p.name for p in await store.all("-name")], [p.name for p in rows], n,
        changed.age, upsert.id, upsert.name, store.make(id=EVE, email="e@x.co", name="Eve").email, store.name(), len(fresh.id),
        (missing.value.code, missing.value.reason), unsortable.value.reason, (taken.value.code, taken.value.reason),
    ]

async def test_memory_answers_every_repository_verb_like_the_database ( db: Database, schema: Migrator ) -> None:

    real = await walk(Repository(db, Person))
    held = await walk(Memory(Person))

    assert held == real and real[0] == "Ann" and real[4] == ["Annie", "Bob", "Fresh"] and real[10] == "Annie" and real[9] == ANN and real[13] == 36

    memory = Memory(Person, [Person(id=EVE, email="e@x.co", name="Eve")])

    assert [p.name for p in memory.snapshot()] == ["Eve"] and await memory.delete(EVE) and not await memory.delete(EVE)

    with pytest.raises(Fault) as unknown: await memory.first(nope=1)

    assert unknown.value.reason == "database.column"

    async with memory.run(): assert memory.name() in health.names() and not await memory.ready()

    assert memory.name() not in health.names() and await Memory(Person, [Person(id=EVE, email="e@x.co", name="Eve")]).ready()

    rows = Repository(db, Person)

    async with rows.run(): assert await rows.ready() and rows.name() in health.names()

    assert rows.name() not in health.names()

async def test_the_door_picks_a_driver_from_the_url ( tmp_path: Any ) -> None:

    made = Database()

    assert not made.ready() and not await made.ping()

    with pytest.raises(Fault) as blank: await made.connect()

    assert blank.value.reason == "database.url"

    with pytest.raises(Fault) as odd: await made.connect("oracle://x")

    assert odd.value.reason == "database.scheme"

    assert PostgresDriver.mode("postgresql://engine@127.0.0.1/x", None) == "disable"
    assert PostgresDriver.mode("postgresql://engine@db.internal/x", None) == "verify-full"
    assert PostgresDriver.mode("postgresql://engine@db.internal/x", "require") == "require"

    with pytest.raises(Fault) as mode: PostgresDriver.mode("postgresql://engine@db.internal/x", "plain")

    assert mode.value.reason == "database.ssl"

    driver = await made.connect(f"sqlite://{tmp_path / 'door.db'}", size=1)

    assert isinstance(driver, SqliteDriver) and made.dialect() is SQLITE and made.describe()["size"] == 1 and await made.ping()

    await made.close()

    assert not made.ready() and Database().describe() == { "ready": False }

async def test_the_lane_hands_connections_over_and_bounds_the_wait () -> None:

    opened: list[int] = []

    class Link:

        def __init__ ( self, number: int ) -> None:

            self.number = number
            self.open   = True

        def is_closed ( self ) -> bool:

            return not self.open

        def is_in_transaction ( self ) -> bool:

            return False

        def terminate ( self ) -> None:

            self.open = False

    async def opener () -> Link:

        opened.append(len(opened))

        return Link(opened[-1])

    async def closer ( link: Link ) -> None:

        link.open = False

    lane = Lane(opener, closer, 1, 1)

    await lane.open()

    first = await lane.acquire(0.1)

    assert lane.size() == 1 and lane.idle() == 0

    second = asyncio.ensure_future(lane.acquire(0.5))

    await asyncio.sleep(0)

    assert lane.waiting() == 1

    await lane.release(first)

    assert await second is first and lane.waiting() == 0

    with pytest.raises(Fault) as busy: await lane.acquire(0.05)

    assert busy.value.reason == "database.busy"

    third = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)
    await lane.close()

    with pytest.raises(Fault) as closed: await third

    assert closed.value.reason == "database.closed" and lane.closed() and first.open

    await lane.release(first)

    assert not first.open and lane.size() == 0

class Wire:

    def __init__ ( self ) -> None:

        self.open     = True
        self.inside   = False
        self.rollback: BaseException | None = None
        self.gate: asyncio.Event | None = None

    def is_closed ( self ) -> bool:

        return not self.open

    def is_in_transaction ( self ) -> bool:

        return self.inside

    def terminate ( self ) -> None:

        self.open = False

    async def execute ( self, sql: str ) -> None:

        assert sql == "ROLLBACK"

        if self.gate is not None: await self.gate.wait()
        if self.rollback is not None: raise self.rollback

        self.inside = False

class Works:

    def __init__ ( self ) -> None:

        self.made: list[Wire] = []
        self.fail  = 0
        self.gate: asyncio.Event | None = None
        self.slow: asyncio.Event | None = None

    async def opener ( self ) -> Wire:

        if self.gate is not None: await self.gate.wait()

        if self.fail:

            self.fail -= 1

            raise OSError("refused")

        self.made.append(Wire())

        return self.made[-1]

    async def closer ( self, wire: Wire ) -> None:

        if self.slow is not None: await self.slow.wait()

        wire.open = False

    def live ( self ) -> int:

        return sum(wire.open for wire in self.made)

async def test_a_cancelled_waiter_passes_its_connection_on () -> None:

    works = Works()
    lane  = Lane(works.opener, works.closer, 1, 1)

    await lane.open()

    held   = await lane.acquire(0.1)
    first  = asyncio.ensure_future(lane.acquire(1.0))
    second = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)
    await lane.release(held)

    assert first.done() is False and first.cancel()

    with pytest.raises(asyncio.CancelledError): await first

    assert await second is held and lane.idle() == 0 and lane.waiting() == 0 and lane.size() == 1

    await lane.release(held)

    third = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)

    assert third.done() is False or third.result() is held

    fourth = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)

    assert lane.waiting() == 1 and fourth.cancel()

    with pytest.raises(asyncio.CancelledError): await fourth

    assert lane.waiting() == 0 and await third is held

    await lane.release(held)

    assert lane.idle() == 1 and lane.size() == 1 and len(works.made) == 1

    await lane.close()

    assert works.live() == 0 and lane.size() == 0

async def test_a_dead_connection_frees_its_slot_for_a_waiter () -> None:

    works = Works()
    lane  = Lane(works.opener, works.closer, 1, 1)

    await lane.open()

    held   = await lane.acquire(0.1)
    waiter = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)

    held.open = False

    await lane.release(held)

    fresh = await waiter

    assert fresh is not held and fresh.open and lane.size() == 1 and len(works.made) == 2

    fresh.inside, fresh.rollback = True, OSError("gone")

    waiter = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)
    await lane.release(fresh)

    third = await waiter

    assert third is not fresh and not fresh.open and lane.size() == 1 and works.live() == 1

    third.inside, third.gate = True, asyncio.Event()

    waiter  = asyncio.ensure_future(lane.acquire(1.0))
    release = asyncio.ensure_future(lane.release(third))

    await asyncio.sleep(0)

    assert release.cancel()

    with pytest.raises(asyncio.CancelledError): await release

    fourth = await waiter

    assert not third.open and fourth.open and lane.size() == 1 and works.live() == 1

    fourth.inside = True

    await lane.release(fourth)

    assert not fourth.inside and lane.idle() == 1 and await lane.acquire(0.1) is fourth

    await lane.release(fourth)
    await lane.close()

    assert works.live() == 0 and lane.size() == 0 and lane.idle() == 0

async def test_a_failed_or_cancelled_opening_never_leaks_a_slot () -> None:

    works = Works()
    lane  = Lane(works.opener, works.closer, 1, 2)

    await lane.open()

    first = await lane.acquire(0.1)

    works.fail = 1

    with pytest.raises(OSError, match="refused"): await lane.acquire(0.1)

    assert lane.size() == 1

    works.gate = asyncio.Event()

    opening = asyncio.ensure_future(lane.acquire(1.0))
    waiter  = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)

    assert lane.size() == 2 and lane.waiting() == 1 and opening.cancel()

    with pytest.raises(asyncio.CancelledError): await opening

    assert lane.size() == 2 and lane.waiting() == 0

    works.fail = 1

    works.gate.set()

    with pytest.raises(OSError, match="refused"): await waiter

    assert lane.size() == 1

    works.gate = None

    second = await lane.acquire(0.1)
    queued = [asyncio.ensure_future(lane.acquire(1.0)) for _ in range(3)]

    await asyncio.sleep(0)

    assert lane.size() == 2 and lane.waiting() == 3

    first.open = second.open = False
    works.fail = 1

    await lane.release(first)
    await lane.release(second)

    done = await asyncio.gather(*queued, return_exceptions=True)
    kept = [item for item in done if isinstance(item, Wire)]

    assert sum(isinstance(item, OSError) for item in done) == 1 and len(kept) == 2 and lane.size() == 2

    for wire in kept: await lane.release(wire)

    assert lane.idle() == 2

    broken = Lane(works.opener, works.closer, 2, 2)

    works.fail = 1

    with pytest.raises(OSError, match="refused"): await broken.open()

    assert broken.size() == 0

    await lane.close()

    assert works.live() == 0

async def test_the_lane_never_exceeds_its_bound_under_a_storm () -> None:

    works = Works()
    lane  = Lane(works.opener, works.closer, 2, 4, recycle=0.01)
    peak  = 0
    busy  = 0
    done  = 0

    await lane.open()

    async def job ( number: int ) -> None:

        nonlocal busy, done, peak

        wire = await lane.acquire(5.0)

        busy, peak = busy + 1, max(peak, busy + 1, works.live())

        try:

            await asyncio.sleep(0.001 * (number % 3))

            if number % 7 == 0: wire.open = False
            if number % 5 == 0: wire.inside = True

        finally:

            busy -= 1

            await lane.release(wire)

        done += 1

    tasks = [asyncio.ensure_future(job(number)) for number in range(400)]

    await asyncio.sleep(0.002)

    cut = [task for task in tasks[::9] if not task.done()]

    for task in cut: task.cancel()

    ended = await asyncio.gather(*tasks, return_exceptions=True)

    assert all(item is None or isinstance(item, asyncio.CancelledError) for item in ended)
    assert done + sum(isinstance(item, asyncio.CancelledError) for item in ended) == 400 and done >= 300
    assert peak <= 4 and busy == 0 and lane.waiting() == 0 and lane.size() == lane.idle() <= 4

    await lane.close()

    assert works.live() == 0 and lane.size() == 0

async def test_a_short_wait_behind_a_long_one_still_ends_on_time () -> None:

    works = Works()
    lane  = Lane(works.opener, works.closer, 1, 1)

    await lane.open()

    held  = await lane.acquire(0.1)
    long  = asyncio.ensure_future(lane.acquire(5.0))
    since = asyncio.get_running_loop().time()

    await asyncio.sleep(0)

    with pytest.raises(Fault) as busy: await lane.acquire(0.05)

    assert busy.value.reason == "database.busy" and busy.value.retry_after == 0.05
    assert asyncio.get_running_loop().time() - since < 1.0 and lane.waiting() == 1 and not long.done()

    await lane.release(held)

    assert await long is held

    works.slow = asyncio.Event()

    held.open = False

    waiter  = asyncio.ensure_future(lane.acquire(1.0))
    release = asyncio.ensure_future(lane.release(held))

    await asyncio.sleep(0.01)

    assert lane.size() == 1 and not waiter.done() and len(works.made) == 1

    works.slow.set()

    await release

    fresh = await waiter

    assert fresh is not held and lane.size() == 1

    works.slow = None

    await lane.release(fresh)
    await lane.close()

async def test_the_quick_door_takes_and_gives_without_a_wait () -> None:

    works = Works()
    lane  = Lane(works.opener, works.closer, 1, 2, recycle=0.05)

    assert lane.take() is None

    await lane.open()

    held = lane.take()

    assert held is works.made[0] and lane.idle() == 0 and lane.size() == 1 and lane.take() is None

    held.inside = True

    assert lane.give(held) is False and lane.idle() == 0

    await lane.release(held)

    assert held.inside is False and lane.idle() == 1 and lane.take() is held

    other  = await lane.acquire(0.1)
    waiter = asyncio.ensure_future(lane.acquire(1.0))

    await asyncio.sleep(0)

    assert other is not held and lane.size() == 2 and lane.waiting() == 1
    assert lane.give(held) is True and lane.idle() == 0 and await waiter is held

    other.open = False

    assert lane.give(other) is False and lane.size() == 2

    await lane.release(other)

    assert lane.size() == 1 and lane.give(held) is True and lane.idle() == 1

    await asyncio.sleep(0.06)

    assert lane.take() is None and lane.idle() == 1

    fresh = await lane.acquire(0.1)

    assert fresh is not held and not held.open and lane.size() == 1

    await lane.close()

    assert lane.take() is None and lane.give(fresh) is False

    await lane.release(fresh)

    assert works.live() == 0 and lane.size() == 0

async def test_the_door_reads_and_writes_through_the_quick_door ( db: Database, schema: Migrator ) -> None:

    idle = db.describe().get("idle")

    assert await db.value("SELECT 41 + 1") == 42 and db.describe().get("idle") == idle
    assert await db.execute("SELECT 1") in (0, 1) and db.describe().get("idle") == idle

    with pytest.raises(Fault) as refused: await db.fetch("SELECT * FROM engine_missing_table")

    assert refused.value.reason == "database.sql" and db.describe().get("idle") == idle

    async with db.session() as session:

        assert await session.value("SELECT 7") == 7
        assert idle is None or db.describe()["idle"] == idle - 1

    assert db.describe().get("idle") == idle

    with pytest.raises(RuntimeError):

        async with db.transaction() as session:

            await session.execute("SELECT 1")

            raise RuntimeError("stop")

    assert db.describe().get("idle") == idle and await db.value("SELECT 2") == 2

def test_sql_refuses_a_hostile_identifier_and_operator () -> None:

    with pytest.raises(Fault) as ident: Sql.select("users; drop table users")

    assert ident.value.code is Code.INTERNAL and ident.value.reason == "sql.identifier"

    with pytest.raises(Fault) as oper: Sql.select("u").where("a", "= 1 OR 1", 1)

    assert oper.value.reason == "sql.operator"
