from typing import Any

from engine.error import Fault
from engine.json import json
from engine.socket import sockets
from engine.test import Client, stage
from gateway.app.services.live import Caller
from gateway.config.app import AppSettings as GatewaySettings
from hello.config.app import AppSettings as HelloSettings
from iam.config.app import AppSettings as IamSettings
from iam.database.seeders.users import VENDOR
from notify.config.app import AppSettings as NotifySettings
import asyncio, gateway, hello, iam, notify, pytest

class Line:

    def __init__ ( self ) -> None:

        self.inbox: asyncio.Queue[str | None] = asyncio.Queue()
        self.outbox: asyncio.Queue[str] = asyncio.Queue()

    async def send ( self, text: str ) -> None:

        await self.outbox.put(text)

    async def recv ( self ) -> str | None:

        return await self.inbox.get()

    async def close ( self, code: int = 1000, reason: str = "" ) -> None:

        await self.inbox.put(None)

    async def said ( self, event: str, **more: object ) -> None:

        await self.inbox.put(json.encode({ "event": event, **more }).decode())

    async def heard ( self, event: str ) -> dict[str, Any]:

        while True:

            frame: dict[str, Any] = json.decode(await asyncio.wait_for(self.outbox.get(), 5))

            if frame["event"] == event: return frame

async def test_a_client_signs_in_and_hears_hello_through_the_edge () -> None:

    stage.wire()

    identity, greet, inbox = iam.make(), hello.make(), notify.make()

    async with inbox.listen() as notify_url, identity.listen() as iam_url, greet.listen() as hello_url:

        edge = gateway.make({ "iam": iam_url, "hello": hello_url, "notify": notify_url })

        async with edge.listen() as edge_url:

            client = Client(edge_url, { "User-Agent": "journey" })

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

            image  = b"\x89PNG\r\n\x1a\n" + bytes(64)
            stored = signed.expect(await signed.call("PUT", "/api/me/avatar", raw=image), 200, "ok").data()

            assert stored == { "url": f"/api/users/{VENDOR}/avatar?v={len(image)}", "size": len(image), "type": "image/png" }
            assert (await signed.get("/api/me")).data()["avatar"] == stored["url"]

            shown = await client.get(f"/api/users/{VENDOR}/avatar")

            assert shown.status == 200 and shown.headers["content-type"] == "image/png"

            signed.expect(await signed.call("PUT", "/api/me/avatar", raw=b"not an image at all"), 415, "unsupported_media", "avatar.kind")
            client.expect(await client.call("PUT", "/api/me/avatar", raw=image), 401, "unauthorized")

            assert (await signed.delete("/api/me/avatar")).status == 204
            assert (await signed.get("/api/me")).data()["avatar"] is None
            assert (await client.get(f"/api/users/{VENDOR}/avatar")).status == 404

            line   = Line()
            served = asyncio.create_task(sockets.serve(line, Caller("journey|127.0.0.1")))

            assert (await line.heard("connected"))["data"]["id"]

            await line.said("join", channel=f"notifications.{VENDOR}", id="early")

            assert (await line.heard("error"))["data"]["reason"] == "socket.forbidden"

            await line.said("auth", data={ "token": session["access"] })
            await line.said("join", channel=f"notifications.{VENDOR}", id="mine")
            await line.said("join", channel="notifications.00000000-0000-7000-8000-00000000ffff", id="other")

            assert (await line.heard("joined"))["id"] == "mine"
            assert (await line.heard("error"))["id"] == "other"

            tested = signed.expect(await signed.post("/api/notifications/test"), 201, "created").data()
            told   = await line.heard("notifications.created")

            assert told["channel"] == f"notifications.{VENDOR}" and told["data"]["id"] == tested["id"]

            signed.expect(await signed.post(f"/api/notifications/{tested['id']}/read"), 200, "ok")

            assert (await line.heard("notifications.updated"))["data"]["unread"] is False

            await line.close()
            await served

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

