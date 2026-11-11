from urllib.parse import urlsplit
import asyncio

from engine.http import App
from engine.test import Client, stage
from iam.database.seeders.users import CLIENT
import gateway
import hello
import iam
import pytest

@pytest.fixture(scope="session")
def apps () -> tuple[App, App]:

    stage.wire()

    return iam.make(), hello.make()

async def test_the_gateway_opens_only_its_doors_and_signs_the_actor ( apps: tuple[App, App] ) -> None:

    iam_app, hello_app = apps

    async with iam_app.listen() as iam_url, hello_app.listen() as hello_url:

        edge = gateway.make({ "iam": iam_url, "hello": hello_url })

        async with stage.client(edge) as client:

            world = client.expect(await client.get("/api/hello"), 200, "ok")

            assert world.data()["message"] == "hello world" and world.header("X-Request-Id")
            assert (await client.header("Accept-Language", "ar").get("/api/hello/علي")).data()["message"] == "أهلاً علي"
            assert (await client.header("Accept-Language", "ar").get("/api/hello", tone="warm")).data() == { "message": "أهلاً وسهلاً بالعالم", "locale": "ar", "tone": "warm" }
            client.expect(await client.get("/api/hello/me"), 401, "unauthorized", "auth.missing")
            client.expect(await client.get("/hello"), 404, "not_found")
            client.expect(await client.get("/api/nope"), 404, "not_found")

            client.expect(await client.post("/api/sessions/code", { "email": "client@apex.test" }), 202, "accepted")

            started = client.expect(await client.post("/api/sessions", { "email": "client@apex.test", "code": "000000" }), 201, "created")
            access  = started.data()["access"]
            me      = client.bearer(access).expect(await client.bearer(access).get("/api/hello/me"), 200, "ok")

            assert me.data()["message"] == f"hello {CLIENT}" and me.data()["actor"]["roles"] == ["client"]
            assert (await client.bearer(access).get("/api/me")).data()["email"] == "client@apex.test"

            doors = await client.get("/api/doors")

            assert len(doors.data()) == 11 and doors.data()[0]["path"] == "/api/sessions/code"

            gathered = await client.get("/api/openapi.json")

            assert gathered.status == 200 and "/hello" in gathered.body["paths"]

async def as_is ( url: str, path: str ) -> int:

    parts          = urlsplit(url)
    reader, writer = await asyncio.open_connection(parts.hostname, parts.port)

    writer.write(f"GET {path} HTTP/1.1\r\nHost: {parts.netloc}\r\nConnection: close\r\n\r\n".encode())

    await writer.drain()

    status = await reader.readline()

    writer.close()

    await writer.wait_closed()

    return int(status.split()[1])

async def test_a_path_parameter_cannot_walk_out_of_its_door ( apps: tuple[App, App] ) -> None:

    iam_app, hello_app = apps

    async with iam_app.listen() as iam_url, hello_app.listen() as hello_url:

        edge = gateway.make({ "iam": iam_url, "hello": hello_url })

        async with edge.listen() as edge_url:

            for dots in (".", ".."): assert await as_is(edge_url, f"/api/hello/{dots}") == 422

            assert (await Client(edge_url).get("/api/hello/..%2Fme")).data()["message"] == "hello ../me"

async def test_a_dead_upstream_is_unavailable_not_a_crash () -> None:

    stage.wire()

    edge = gateway.make({ "iam": "http://127.0.0.1:9", "hello": "http://127.0.0.1:9" })

    async with stage.client(edge) as client:

        refused = client.expect(await client.get("/api/hello"), 503, "unavailable")

        assert refused.reason() is None and refused.data() is None
        assert (await client.get("/api/openapi.json")).body["paths"] == {}
