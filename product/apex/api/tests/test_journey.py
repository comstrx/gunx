from engine.error import Fault
from engine.test import stage
from gateway.config.app import AppSettings as GatewaySettings
from hello.config.app import AppSettings as HelloSettings
from iam.config.app import AppSettings as IamSettings
from iam.database.seeders.users import VENDOR
from notify.config.app import AppSettings as NotifySettings
import asyncio, gateway, hello, iam, notify, pytest

async def test_a_client_signs_in_and_hears_hello_through_the_edge () -> None:

    stage.wire()

    identity, greet, inbox = iam.make(), hello.make(), notify.make()

    async with inbox.listen() as notify_url, identity.listen() as iam_url, greet.listen() as hello_url:

        edge = gateway.make({ "iam": iam_url, "hello": hello_url, "notify": notify_url })

        async with stage.client(edge) as client:

            anonymous = client.expect(await client.header("Accept-Language", "ar").get("/api/hello"), 200, "ok")

            assert anonymous.data()["message"] == "أهلاً بالعالم"

            client.expect(await client.post("/api/sessions/code", { "email": "vendor@apex.test" }), 202, "accepted")

            session = client.expect(await client.post("/api/sessions", { "email": "vendor@apex.test", "code": "000000" }), 201, "created").data()
            signed  = client.bearer(session["access"])
            greeted = signed.expect(await signed.get("/api/hello/me"), 200, "ok").data()

            assert greeted["message"] == f"hello {VENDOR}" and sorted(greeted["actor"]["scopes"]) == ["devices.write", "hello.read", "notifications.read"]

            device = signed.expect(await signed.post("/api/devices", { "token": "vendor-phone-token", "platform": "android" }), 201, "created").data()

            assert device["platform"] == "android"

            for _ in range(60):

                notices = await signed.get("/api/notifications")

                if notices.body["meta"]["total"] == 1: break

                await asyncio.sleep(0.05)

            else: raise AssertionError("the welcome notice never arrived through the edge")

            welcome = notices.data()[0]

            assert welcome["title"] == "Welcome back" and "Vendor" in welcome["body"] and welcome["unread"] is True

            read = signed.expect(await signed.post(f"/api/notifications/{welcome['id']}/read"), 200, "ok").data()

            assert read["unread"] is False

            refreshed = client.expect(await client.post("/api/sessions/refresh", { "refresh": session["refresh"] }), 200, "ok").data()
            renewed   = client.bearer(refreshed["access"])

            assert (await renewed.get("/api/me")).data()["name"] == "Vendor" and (await renewed.get("/api/me")).data()["tenant"]
            assert (await renewed.delete("/api/sessions")).status == 204
            client.expect(await client.bearer("stale").get("/api/me"), 401, "unauthorized")
            client.expect(await renewed.get("/api/notifications"), 401, "unauthorized")

def test_production_refuses_every_lab_secret_and_address () -> None:

    refused: set[str] = set()

    for kind in (GatewaySettings, IamSettings, HelloSettings, NotifySettings):

        with pytest.raises(Fault) as bad: kind.load({ "ENGINE_ENV": "production" })

        refused |= set(bad.value.errors or {})

    assert refused == {
        "GATEWAY_TOKEN_SECRET", "GATEWAY_EDGE_SECRET", "GATEWAY_IAM_URL", "GATEWAY_HELLO_URL", "GATEWAY_NOTIFY_URL",
        "IAM_TOKEN_SECRET", "IAM_DATABASE_URL", "HELLO_EDGE_SECRET", "NOTIFY_EDGE_SECRET", "NOTIFY_DATABASE_URL",
    }

