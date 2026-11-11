from aiohttp import web
from engine.error import Code, Fault
from pathlib import Path
from engine.net import Egress, Remote, net
from engine.storage import Disk, Policy, Storage, storage
from collections.abc import Callable
from typing import Any, Self, cast
import pytest

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16

async def test_local_disks_store_and_serve ( tmp_path: Path ) -> None:

    public  = storage.local("public", tmp_path / "public", "https://cdn.test", public=True)
    private = storage.local("private", tmp_path / "private")

    storage.setup({ "public": public, "private": private }, "public")

    assert storage.names() == ("private", "public") and storage.disk().name == "public" and storage.disk("private") is private
    assert storage.describe()["default"] == "public"

    stored = await storage.upload("Photo of Me.PNG", PNG, "avatars")

    assert stored.key.startswith("avatars/") and stored.key.endswith("-photo-of-me.png")
    assert stored.url == f"https://cdn.test/{stored.key}" and stored.size == len(PNG) and stored.dump()["disk"] == "public"
    assert await public.get(stored.key) == PNG and await public.exists(stored.key) and await public.size(stored.key) == len(PNG)
    assert b"".join([piece async for piece in public.stream(stored.key)]) == PNG
    assert await public.list("avatars/") == [stored.key] and await public.list("nothing/") == []

    await public.copy(stored.key, "copies/a.png")

    assert await public.list("copies/") == ["copies/a.png"]
    assert await public.delete("copies/a.png") and not await public.delete("copies/a.png")
    assert private.url("x") is None and (await private.put("p/x.txt", b"hi")).url is None

    with pytest.raises(Fault) as missing: await public.get("nothing.png")

    assert missing.value.code is Code.NOT_FOUND and missing.value.reason == "storage.missing"

    with pytest.raises(Fault): await public.size("nothing.png")
    with pytest.raises(Fault): await public.copy("nothing.png", "x")
    with pytest.raises(Fault): await public.sign("x")

    with pytest.raises(Fault) as unknown: storage.disk("s3")

    assert unknown.value.reason == "storage.disk"

    with pytest.raises(Fault): storage.setup({ "a": public }, "b")

    await storage.close()

def test_policy_refuses_what_must_not_be_stored () -> None:

    policy = Policy(max_size=100)

    assert policy.check("a.png", 10, PNG[:8]) == "png" and policy.check("doc.pdf", 10, b"%PDF-1.7") == "pdf"
    assert policy.check("sheet.xlsx", 10, b"PK\x03\x04") == "xlsx" and policy.check("photo.jpeg", 10, b"\xff\xd8\xff\xe0") == "jpeg"
    assert policy.check("plain.txt", 10) == "txt" and policy.sniff(b"GIF89a") == "gif" and policy.sniff(b"zz") is None

    with pytest.raises(Fault) as big: policy.check("a.png", 101, PNG[:8])

    assert big.value.code is Code.TOO_LARGE and big.value.reason == "storage.size"

    with pytest.raises(Fault) as kind: policy.check("run.exe", 10)

    assert kind.value.code is Code.VALIDATION and kind.value.reason == "storage.type"

    with pytest.raises(Fault) as lie: policy.check("photo.png", 10, b"%PDF-1.7")

    assert lie.value.reason == "storage.mismatch"

    with pytest.raises(Fault): policy.check("noext", 10)
    with pytest.raises(Fault): storage.policy().check("x.php", 1)

class DriveFake:

    def __init__ ( self ) -> None:

        self.port  = 0
        self.files: dict[str, dict[str, Any]] = {}
        self.blobs: dict[str, bytes] = {}
        self.seen: list[str] = []
        self._runner: web.AppRunner | None = None

    async def __aenter__ ( self ) -> Self:

        app = web.Application()

        app.router.add_get("/drive/v3/files", self.list)
        app.router.add_post("/upload/drive/v3/files", self.upload)
        app.router.add_patch("/upload/drive/v3/files/{id}", self.upload)
        app.router.add_get("/drive/v3/files/{id}", self.download)
        app.router.add_delete("/drive/v3/files/{id}", self.remove)
        app.router.add_post("/drive/v3/files/{id}/copy", self.copy)

        self._runner = web.AppRunner(app)

        await self._runner.setup()

        site = web.TCPSite(self._runner, "127.0.0.1", 0)

        await site.start()

        self.port = int(self._runner.addresses[0][1])

        return self

    async def __aexit__ ( self, *_: object ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    def check ( self, request: web.Request ) -> None:

        assert request.headers["Authorization"] == "Bearer tok-1"

        self.seen.append(f"{request.method} {request.path}")

    async def list ( self, request: web.Request ) -> web.Response:

        self.check(request)

        query = request.query["q"]
        found = list(self.files.values())

        if "name = " in query:

            name  = query.split("name = '", 1)[1].split("'", 1)[0].replace("\\'", "'")
            found = [item for item in found if item["name"] == name]

        return web.json_response({ "files": found })

    async def upload ( self, request: web.Request ) -> web.Response:

        self.check(request)

        assert request.query["uploadType"] == "multipart" and request.headers["Content-Type"].startswith("multipart/related; boundary=")

        boundary = request.headers["Content-Type"].split("boundary=", 1)[1].encode()
        parts    = (await request.read()).split(b"--" + boundary)
        meta     = parts[1].split(b"\r\n\r\n", 1)[1]
        data     = parts[2].split(b"\r\n\r\n", 1)[1].rstrip(b"\r\n")
        wanted   = __import__("json").loads(meta)
        id_      = request.match_info.get("id") or f"id{len(self.files) + 1}"

        if "id" not in request.match_info: assert wanted["parents"] == ["folder-1"]

        self.files[id_] = { "id": id_, "name": wanted["name"], "size": str(len(data)), "mimeType": "application/octet-stream" }
        self.blobs[id_] = data

        return web.json_response(self.files[id_])

    async def download ( self, request: web.Request ) -> web.Response:

        self.check(request)

        assert request.query["alt"] == "media"

        return web.Response(body=self.blobs[request.match_info["id"]])

    async def remove ( self, request: web.Request ) -> web.Response:

        self.check(request)

        id_ = request.match_info["id"]

        self.files.pop(id_)
        self.blobs.pop(id_)

        return web.Response(status=204)

    async def copy ( self, request: web.Request ) -> web.Response:

        self.check(request)

        body = await request.json()
        id_  = request.match_info["id"]
        new  = f"id{len(self.files) + 1}"

        self.files[new] = { **self.files[id_], "id": new, "name": body["name"] }
        self.blobs[new] = self.blobs[id_]

        return web.json_response(self.files[new])

async def test_google_drive_speaks_the_files_api () -> None:

    async with DriveFake() as fake:

        disk = storage.drive(net, "tok-1", "folder-1", url="https://files.test", public=True)

        disk._remote = Remote(net, f"http://127.0.0.1:{fake.port}", egress=Egress(allow_private=True, ports=frozenset()), name="drive").bearer("tok-1")  # noqa: SLF001

        storage.setup({ "drive": disk }, "drive")

        stored = await storage.upload("Report.PDF", b"%PDF-1.7 body", "reports")

        assert stored.disk == "drive" and stored.key.startswith("reports/") and stored.url == f"https://files.test/{stored.key}"
        assert await disk.get(stored.key) == b"%PDF-1.7 body" and await disk.exists(stored.key) and await disk.size(stored.key) == 13
        assert b"".join([piece async for piece in disk.stream(stored.key)]) == b"%PDF-1.7 body"
        assert await disk.list("reports/") == [stored.key] and await disk.list("zz") == []

        again = await disk.put(stored.key, b"%PDF-1.7 longer body")

        assert again.size == 20 and await disk.get(stored.key) == b"%PDF-1.7 longer body" and len(fake.files) == 1

        await disk.copy(stored.key, "copies/report.pdf")

        assert await disk.get("copies/report.pdf") == b"%PDF-1.7 longer body" and (await disk.sign(stored.key)).startswith("https://drive.google.com/uc?id=")
        assert await disk.delete("copies/report.pdf") and not await disk.delete("copies/report.pdf") and not await disk.exists("copies/report.pdf")

        with pytest.raises(Fault) as missing: await disk.get("nothing.pdf")

        assert missing.value.code is Code.NOT_FOUND and missing.value.reason == "storage.missing" and fake.seen[0] == "GET /drive/v3/files"

        await storage.close()

    await net.close()

async def test_disks_move_append_and_describe_objects ( tmp_path: Path ) -> None:

    disk = storage.local("lap", tmp_path / "lap")

    await disk.put("a/one.json", b'{"ok": true}')

    assert await disk.json("a/one.json") == { "ok": True } and await disk.missing("a/two.json") and not await disk.missing("a/one.json")

    await disk.append("a/log.txt", b"one\n")
    await disk.prepend("a/log.txt", b"zero\n")
    await disk.append("a/log.txt", b"two\n")

    assert await disk.get("a/log.txt") == b"zero\none\ntwo\n"

    about = await disk.info("a/log.txt")

    assert about["key"] == "a/log.txt" and about["size"] == 13 and about["url"] is None

    await disk.move("a/log.txt", "b/log.txt")

    assert await disk.missing("a/log.txt") and await disk.exists("b/log.txt")

    with pytest.raises(Fault): await disk.info("a/log.txt")

FLAG: Any = True

async def test_keys_names_and_policies_are_validated ( tmp_path: Path ) -> None:

    local = Storage()
    disk  = local.local("public", tmp_path / "public", "https://cdn.test", public=True)

    local.setup({ "public": disk }, "public")

    for key in ("", "/abs", "a//b", "a/../b", "..", ".", "a\\b", "x" * 1025, "a\nb", "a\x00b", cast("Any", 7), cast("Any", None)):

        for work in (disk.put(key, b"x"), disk.get(key), disk.exists(key), disk.info(key), disk.copy(key, "ok.txt"), disk.copy("ok.txt", key), disk.sign(key)):

            with pytest.raises(Fault) as refused: await work

            assert refused.value.code is Code.VALIDATION and refused.value.reason == "storage.key", key

        with pytest.raises(Fault) as streamed: [piece async for piece in disk.stream(key)]

        assert streamed.value.reason == "storage.key"

    with pytest.raises(Fault) as data: await disk.put("a.txt", cast("Any", "text"))

    assert data.value.reason == "storage.data"

    with pytest.raises(Fault) as listed: await disk.list(cast("Any", 7))

    assert listed.value.reason == "storage.key"

    unsets: tuple[tuple[str, Callable[[], object]], ...] = (
        ("name", lambda: Disk("", None)), ("name", lambda: Disk("x" * 65, None)), ("url", lambda: Disk("d", None, "ftp://x")), ("url", lambda: Disk("d", None, cast("Any", 7))),
        ("disks", lambda: local.setup(cast("Any", [disk]), "public")), ("disks", lambda: local.setup({ "public": cast("Any", "disk") }, "public")),
        ("policy", lambda: local.setup({ "public": disk }, "public", cast("Any", "strict"))),
    )

    for setting, make in unsets:

        with pytest.raises(Fault) as unset: make()

        assert unset.value.reason == "storage.settings" and unset.value.errors == { "setting": [setting] }, setting

    for make in (lambda: Policy(max_size=0), lambda: Policy(max_size=cast("Any", "1")), lambda: Policy(allowed=cast("Any", ["png"])), lambda: Policy(blocked=cast("Any", frozenset({ 1 })))):

        with pytest.raises(Fault) as bad: make()

        assert bad.value.reason == "storage.policy"

    for reason, name, folder in (
        ("storage.type", "", "uploads"), ("storage.type", cast("Any", None), "uploads"), ("storage.folder", "a.png", ""), ("storage.folder", "a.png", "a b"),
        ("storage.folder", "a.png", "../x"), ("storage.folder", "a.png", "a/" * 9 + "b"), ("storage.folder", "a.png", cast("Any", 7)),
    ):

        with pytest.raises(Fault) as wrong: local.key(name, folder)

        assert wrong.value.reason == reason, (name, folder)

    assert local.key("a.png", "/avatars/2026/").startswith("avatars/2026/") and local.key("..", "x").endswith("-file")

    for reason, work in (("storage.data", local.upload("a.png", cast("Any", "x"))), ("storage.type", local.upload("", b"x")), ("storage.type", local.upload("a.png", b"x", "a b"))):

        with pytest.raises(Fault) as upload: await work

        assert upload.value.reason in (reason, "storage.folder"), reason

    with pytest.raises(Fault) as seconds: await disk.sign("a.txt", 0)

    assert seconds.value.reason == "storage.settings"

    with pytest.raises(Fault) as chunk: [piece async for piece in disk.stream("a.txt", 0)]

    assert chunk.value.errors == { "setting": ["chunk"] }

    await local.close()
