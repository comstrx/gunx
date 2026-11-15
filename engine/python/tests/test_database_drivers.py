from collections.abc import Mapping
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import urlsplit
from engine.database import Cluster, Documents, Model, Mongo, MysqlDriver, ClickhouseDriver, Provision, POSTGRES
from engine.error import Code, Fault
import asyncio, asyncmy, asyncpg, clickhouse_connect, os, pymongo, pytest, ssl, uuid

@pytest.mark.parametrize("host", ["127.0.0.1", "database.example"])
async def test_mysql_transport_defaults_and_pool_deadlines ( host: str, monkeypatch: pytest.MonkeyPatch ) -> None:

    connection = MagicMock()
    cursor = MagicMock()
    cursor.execute = AsyncMock(return_value=1)
    cursor.fetchall = AsyncMock(return_value=[{ "value": 7 }])
    cursor.description = (("value", 3),)
    connection.cursor.return_value.__aenter__.return_value = cursor
    pool = SimpleNamespace(acquire=AsyncMock(return_value=connection), release=AsyncMock(), close=MagicMock(), wait_closed=AsyncMock())
    create = AsyncMock(return_value=pool)

    monkeypatch.setattr(asyncmy, "create_pool", create)

    driver = MysqlDriver(f"mysql://user:password@{host}/test", wait=0.1)

    await driver.connect()

    secure = create.call_args.kwargs["ssl"]

    if host == "127.0.0.1": assert secure is None
    else: assert isinstance(secure, ssl.SSLContext) and secure.check_hostname and secure.verify_mode == ssl.CERT_REQUIRED

    held = await driver.acquire()

    assert await driver.fetch(held, "SELECT 7 AS value", ()) == [{ "value": 7 }]

    async def stalled ( *args: Any, **kwargs: Any ) -> None: await asyncio.Event().wait()

    cursor.execute.side_effect = stalled

    with pytest.raises(TimeoutError): await driver.execute(held, "SELECT SLEEP(10)", (), timeout=0.01)

    connection.close.assert_called_once()

    assert driver.translate(TimeoutError()).code is Code.TIMEOUT

    pool.acquire.side_effect = stalled

    with pytest.raises(TimeoutError): await driver.acquire(wait=0.01)

    await driver.release(held)
    await driver.close()

    pool.release.assert_awaited_once_with(held)
    pool.wait_closed.assert_awaited_once()


async def test_clickhouse_mapping_timeout_and_owned_client_cleanup ( monkeypatch: pytest.MonkeyPatch ) -> None:

    result = SimpleNamespace(column_names=["id", "name"], result_rows=[(7, "seven")])
    client = SimpleNamespace(query=AsyncMock(return_value=result), command=AsyncMock(return_value=SimpleNamespace(written_rows=2)), close=AsyncMock(), ping=AsyncMock(return_value=True))
    create = AsyncMock(return_value=client)

    monkeypatch.setattr(clickhouse_connect, "get_async_client", create)

    driver = ClickhouseDriver("http://localhost:8123", wait=0.1)

    await driver.connect()

    assert await driver.fetch(client, "SELECT 7, 'seven'", ()) == [{ "id": 7, "name": "seven" }]
    assert await driver.execute(client, "INSERT", ()) == 2

    async def stalled ( *args: Any, **kwargs: Any ) -> None: await asyncio.Event().wait()

    client.query.side_effect = stalled

    with pytest.raises(TimeoutError): await driver.fetch(client, "SELECT sleep(10)", (), timeout=0.01)

    assert driver.translate(TimeoutError()).code is Code.TIMEOUT

    await driver.close()

    client.close.assert_awaited_once()


@pytest.mark.parametrize("failure", [asyncio.CancelledError, TimeoutError, pymongo.errors.ConfigurationError])
async def test_mongo_closes_partial_client_on_cancel_or_startup_failure (
    failure: type[BaseException], monkeypatch: pytest.MonkeyPatch,
) -> None:

    client = SimpleNamespace(admin=SimpleNamespace(command=AsyncMock(side_effect=failure)), close=AsyncMock())

    monkeypatch.setattr(pymongo, "AsyncMongoClient", lambda *_args, **_kwargs: client)

    mongo = Mongo()

    with pytest.raises(asyncio.CancelledError if failure is asyncio.CancelledError else Fault):

        await mongo.connect("mongodb://localhost/test")

    client.close.assert_awaited_once()

    assert not mongo.ready()


class Document(Model):

    id: str
    email: str
    name: str


async def test_documents_upsert_resolves_concurrent_creators_without_overwriting_identity (
    monkeypatch: pytest.MonkeyPatch,
) -> None:

    mongo = Mongo()
    gate = asyncio.Event()
    readers = 0
    stored: dict[str, Any] = {}

    async def missing ( where: Mapping[str, Any] ) -> None:

        nonlocal readers

        readers += 1

        if readers == 2: gate.set()

        await gate.wait()

    async def atomic (
        where: Mapping[str, Any], changes: Mapping[str, Mapping[str, Any]], **options: Any,
    ) -> dict[str, Any]:

        assert options["upsert"] and options["return_document"]

        if not stored: stored.update(changes["$setOnInsert"])

        stored.update(changes.get("$set", {}))

        return dict(stored)

    collection = SimpleNamespace(find_one=AsyncMock(side_effect=missing), find_one_and_update=AsyncMock(side_effect=atomic))

    monkeypatch.setattr(mongo, "collection", lambda _: collection)

    docs = Documents(mongo, Document)
    first, second = await asyncio.gather(
        docs.upsert(["email"], ["name"], email="same@example.com", name="first"),
        docs.upsert(["email"], ["name"], email="same@example.com", name="second"),
    )

    assert first.id == second.id == stored["_id"]
    assert stored["email"] == "same@example.com"

    with pytest.raises(Fault) as primary: await docs.update(first.id, id="replacement")

    assert primary.value.reason == "database.primary"

    with pytest.raises(Fault): await docs.upsert([], [], name="invalid")


@pytest.mark.skipif(not os.environ.get("ENGINE_PROVISION_URL"), reason="Requires a disposable PostgreSQL administration target")
async def test_reprovisioning_removes_old_role_escalation_privileges () -> None:

    address = urlsplit(os.environ["ENGINE_PROVISION_URL"])
    name = "engine_provision_" + uuid.uuid4().hex
    role = name + "_role"
    plan = Provision(address.hostname or "", address.port or 5432, address.username or "", address.password or "", role, "isolated-test\\\\password'quoted", name, ())
    admin = await asyncpg.connect(os.environ["ENGINE_PROVISION_URL"])
    cluster = Cluster()

    try:

        assert await cluster.provision(plan) == { "role": True, "database": True }

        await admin.execute("ALTER ROLE " + POSTGRES.ident(role) + " CREATEDB CREATEROLE")

        assert await cluster.provision(plan) == { "role": False, "database": False }

        flags = await admin.fetchrow("SELECT rolcreatedb, rolcreaterole, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=$1", role)

        assert flags is not None and not any(flags.values())

    finally:

        await admin.execute("DROP DATABASE IF EXISTS " + POSTGRES.ident(name) + " WITH (FORCE)")
        await admin.execute("DROP ROLE IF EXISTS " + POSTGRES.ident(role))
        await admin.close()

async def test_document_cursor_preserves_primary_filter_and_bounds_fetch (
    monkeypatch: pytest.MonkeyPatch,
) -> None:

    mongo = Mongo()
    seen: dict[str, Any] = {}
    result = SimpleNamespace()

    def find ( where: Mapping[str, Any] ) -> Any:

        seen["where"] = where

        return result

    def sort ( key: str, direction: int ) -> Any:

        seen["sort"] = key, direction

        return result

    def limit ( count: int ) -> Any:

        seen["limit"] = count

        return result

    result.sort    = sort
    result.limit   = limit
    result.to_list = AsyncMock(return_value=[{ "_id": "b", "email": "b@example.test", "name": "B" }])

    monkeypatch.setattr(mongo, "collection", lambda _: SimpleNamespace(find=find))

    rows = await Documents(mongo, Document).cursor("a", 3, id="b")

    assert [row.id for row in rows] == ["b"]
    assert seen == { "where": { "$and": [{ "_id": "b" }, { "_id": { "$gt": "a" } }] }, "sort": ("_id", 1), "limit": 3 }
