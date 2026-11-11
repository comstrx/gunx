from engine.auth import Actor, auth
from engine.http import App
from engine.test import Client, stage
from hello import make
import pytest

@pytest.fixture(scope="session")
def app () -> App:

    stage.wire()

    return make()

def signed ( client: Client, actor: str, scopes: tuple[str, ...], request_id: str ) -> Client:

    headers = auth.relay.sign(Actor(actor, ("client",), scopes), request_id)

    for name, value in headers.items(): client = client.header(name, value)

    return client

async def test_hello_says_the_world_in_both_languages ( app: App ) -> None:

    async with stage.client(app) as client:

        plain = client.expect(await client.get("/hello"), 200, "ok")

        assert plain.data() == { "message": "hello world", "locale": "en", "tone": "plain" }
        assert plain.header("X-Request-Id") and plain.header("X-Content-Type-Options") == "nosniff"

        arabic = await client.header("Accept-Language", "ar-EG,ar;q=0.9").get("/hello", tone="warm")

        assert arabic.data() == { "message": "أهلاً وسهلاً بالعالم", "locale": "ar", "tone": "warm" }
        assert client.expect(await client.get("/hello", tone="loud"), 422, "validation").errors() == { "tone": ["Invalid enum value 'loud'"] }
        assert client.expect(await client.get("/hello", tone="warm", extra="1"), 422, "validation").errors() == { "extra": ["is not allowed"] }
        assert (await client.get("/hello/Ann")).data()["message"] == "hello Ann"
        assert (await client.header("Accept-Language", "ar").get("/hello/علي")).data()["message"] == "أهلاً علي"

        refused = client.expect(await client.get(f"/hello/{'x' * 41}"), 422, "validation", "hello.name")
        worded  = await client.header("Accept-Language", "ar").get(f"/hello/{'x' * 41}")

        assert refused.errors() == { "name": ["must be at most 40"] } and refused.body["message"] == "The name is too long"
        assert worded.body["message"] == "الاسم طويل جداً" and arabic.body["message"] == "تم"
        assert (await client.get("/robots.txt")).body == "User-agent: *\nDisallow: /\n"
        assert (await client.get("/health")).data()["status"] == "ok" and (await client.get("/ready")).status == 200
        assert "/hello" in (await client.get("/openapi.json")).body["paths"]

async def test_hello_me_needs_a_relayed_actor ( app: App ) -> None:

    async with stage.client(app) as client:

        missing = client.expect(await client.header("Accept-Language", "ar").get("/hello/me"), 401, "unauthorized", "auth.missing")

        assert missing.body["message"] == "سجّل الدخول أولاً" and missing.header("WWW-Authenticate") == "Bearer"

        actor = signed(client, "user-7", ("hello.read",), "req-9").expect(await signed(client, "user-7", ("hello.read",), "req-9").get("/hello/me"), 200, "ok")

        assert actor.data()["message"] == "hello user-7" and actor.data()["actor"] == { "id": "user-7", "roles": ["client"], "scopes": ["hello.read"], "tenant": None }

        client.expect(await signed(client, "user-7", ("other",), "req-10").get("/hello/me"), 403, "forbidden", "auth.scope")

        forged = signed(client, "user-7", ("hello.read",), "req-11").header("X-Actor-Id", "user-8")

        client.expect(await forged.get("/hello/me"), 401, "unauthorized", "relay.signature")
