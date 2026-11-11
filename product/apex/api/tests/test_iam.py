from engine.http import App
from engine.test import stage
from iam import make
from iam.database.seeders.tenants import APEX, ZAIN
from iam.database.seeders.users import ADMIN, CLIENT
import pytest

@pytest.fixture(scope="session")
def app () -> App:

    stage.wire()

    return make()

async def test_a_session_starts_with_the_fixed_code_refreshes_and_ends ( app: App ) -> None:

    async with stage.client(app) as client:

        client.expect(await client.post("/sessions/code", { "email": "nobody@apex.test" }), 401, "unauthorized", "session.unknown")
        client.expect(await client.post("/sessions", { "email": "admin@apex.test", "code": "000000" }), 401, "unauthorized", "otp.expired")
        client.expect(await client.post("/sessions/code", { "email": "admin@apex.test" }), 202, "accepted")
        client.expect(await client.post("/sessions/code", { "email": "admin@apex.test" }), 429, "too_many_requests", "otp.cooldown")
        client.expect(await client.post("/sessions", { "email": "admin@apex.test", "code": "123456" }), 401, "unauthorized", "otp.invalid")
        client.expect(await client.post("/sessions", { "email": "admin@apex.test" }), 422, "validation")

        started = client.expect(await client.post("/sessions", { "email": "Admin@Apex.test", "code": "000000" }), 201, "created")
        data    = started.data()

        assert data["user"] == { "id": ADMIN, "email": "admin@apex.test", "name": "Admin", "status": "active" }
        assert data["tenant"] == APEX and data["memberships"] == [{ "tenant_id": APEX, "roles": ["admin"] }]
        assert data["access"] and data["refresh"] and data["type"] == "Bearer"

        me = client.bearer(data["access"]).expect(await client.bearer(data["access"]).get("/me"), 200, "ok")

        assert me.data()["id"] == ADMIN and me.data()["tenant"] == APEX and me.data()["memberships"][0]["roles"] == ["admin"]
        client.expect(await client.get("/me"), 401, "unauthorized", "auth.missing")
        client.expect(await client.bearer("not-a-token").get("/me"), 401, "unauthorized")

        refreshed = client.expect(await client.post("/sessions/refresh", { "refresh": data["refresh"] }), 200, "ok")

        assert refreshed.data()["access"] != data["access"]
        client.expect(await client.post("/sessions/refresh", { "refresh": data["refresh"] }), 401, "unauthorized", "session.revoked")

        ended = await client.bearer(refreshed.data()["access"]).delete("/sessions")

        assert ended.status == 204
        client.expect(await client.post("/sessions/refresh", { "refresh": refreshed.data()["refresh"] }), 401, "unauthorized", "session.revoked")
        assert (await client.get("/health")).data()["status"] == "ok" and (await client.get("/ready")).status == 200

async def test_a_session_picks_its_workspace_and_its_roles_follow_it ( app: App ) -> None:

    async with stage.client(app) as client:

        client.expect(await client.post("/sessions/code", { "email": "client@apex.test" }), 202, "accepted")

        zain = client.expect(await client.post("/sessions", { "email": "client@apex.test", "code": "000000", "tenant": "zain" }), 201, "created").data()

        assert zain["tenant"] == ZAIN and sorted(item["tenant_id"] for item in zain["memberships"]) == sorted([APEX, ZAIN])
        assert (await client.bearer(zain["access"]).get("/me")).data()["tenant"] == ZAIN

        client.expect(await client.post("/sessions/code", { "email": "admin@apex.test" }), 202, "accepted")
        client.expect(await client.post("/sessions", { "email": "admin@apex.test", "code": "000000", "tenant": "zain" }), 403, "forbidden", "session.member")
        client.expect(await client.post("/sessions", { "email": "admin@apex.test", "code": "000000", "tenant": "nope" }), 403, "forbidden", "session.tenant")

        apex = client.expect(await client.post("/sessions", { "email": "admin@apex.test", "code": "000000", "tenant": "apex" }), 201, "created").data()

        assert apex["tenant"] == APEX and apex["user"]["id"] == ADMIN and CLIENT != ADMIN
