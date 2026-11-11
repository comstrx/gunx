from engine.auth import Actor, auth
from engine.broker import broker
from engine.event import Event
from engine.http import App
from engine.notify import Log, notify
from engine.test import Client, stage
from iam.database.seeders.tenants import ZAIN
from iam.database.seeders.users import SUPER, VENDOR
from notify import make
import asyncio, pytest

@pytest.fixture(scope="session")
def app () -> App:

    stage.wire()

    return make()

def signed ( client: Client, actor: str, scopes: tuple[str, ...], request_id: str, tenant: str | None = None ) -> Client:

    headers = auth.relay.sign(Actor(actor, ("client",), scopes, tenant), request_id)

    for name, value in headers.items(): client = client.header(name, value)

    return client

async def settle ( client: Client, total: int ) -> list[dict[str, object]]:

    for _ in range(60):

        reply = await client.get("/notifications")

        if reply.body["meta"]["total"] == total: return list(reply.data())

        await asyncio.sleep(0.05)

    raise AssertionError(f"never saw {total} notices")

async def test_devices_register_and_identity_facts_become_private_notices ( app: App ) -> None:

    pusher = Log()

    notify.use(pusher, default=True)

    async with stage.client(app) as client:

        mine   = signed(client, SUPER, ("devices.write", "notifications.read"), "req-1", ZAIN)
        theirs = signed(client, VENDOR, ("devices.write", "notifications.read"), "req-2", ZAIN)
        blind  = signed(client, SUPER, ("hello.read",), "req-3")

        client.expect(await client.post("/devices", { "token": "device-token-1", "platform": "ios" }), 401, "unauthorized", "auth.missing")
        client.expect(await blind.post("/devices", { "token": "device-token-1", "platform": "ios" }), 403, "forbidden", "auth.scope")
        client.expect(await mine.post("/devices", { "token": "short", "platform": "ios" }), 422, "validation", "device.input")

        device = client.expect(await mine.post("/devices", { "token": "device-token-1", "platform": "ios" }), 201, "created").data()
        again  = client.expect(await mine.post("/devices", { "token": "device-token-1", "platform": "android" }), 201, "created").data()

        assert device["platform"] == "ios" and again["id"] == device["id"] and again["platform"] == "android"
        assert client.expect(await mine.get("/notifications"), 200, "ok").body["meta"]["total"] == 0

        fact = Event(name="iam.session.started", data={ "user": SUPER, "tenant": ZAIN, "email": "super@apex.test", "who": "Super" }, source="iam")

        await broker.publish(fact.name, fact.dump(), { "source": "iam" })

        notices = await settle(mine, 1)

        assert notices[0]["title"] == "Welcome back" and notices[0]["body"] == "Good to see you, Super." and notices[0]["unread"] is True
        assert notices[0]["data"] == { "kind": "welcome" } and notices[0]["created_at"]

        await broker.publish(fact.name, fact.dump(), { "source": "iam" })
        await asyncio.sleep(0.2)

        assert (await mine.get("/notifications")).body["meta"]["total"] == 1
        assert str(notices[0]["id"]) not in [str(item["id"]) for item in (await theirs.get("/notifications")).data()]

        for _ in range(60):

            if pusher.outbox: break

            await asyncio.sleep(0.05)

        assert len(pusher.outbox) == 1 and pusher.outbox[0].tokens == ("device-token-1",) and pusher.outbox[0].title == "Welcome back"

        key  = str(notices[0]["id"])
        read = client.expect(await mine.post(f"/notifications/{key}/read"), 200, "ok").data()

        assert read["unread"] is False and read["read_at"]
        assert client.expect(await mine.post(f"/notifications/{key}/read"), 200, "ok").data()["read_at"] == read["read_at"]
        client.expect(await theirs.post(f"/notifications/{key}/read"), 404, "not_found", "notice.missing")
        client.expect(await mine.post("/notifications/not-a-uuid/read"), 422, "validation", "notice.missing")
        client.expect(await mine.get("/notifications", page=0), 422, "validation", "notice.paging")

        paged = client.expect(await mine.get("/notifications", limit=1), 200, "ok")

        assert paged.body["meta"]["total"] == 1 and len(paged.data()) == 1
        assert (await client.get("/health")).data()["status"] == "ok" and (await client.get("/ready")).status == 200
