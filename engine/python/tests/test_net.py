from aiohttp import BodyPartReader, ClientConnectorError, web
from collections.abc import AsyncIterator
from engine.error import Code, Fault
from engine.func import func
from engine.net import Egress, Remote, net
from engine.net.resolver import Resolver
from pathlib import Path
from typing import Any, cast, override, Self
import asyncio, pytest, socket

PUBLIC   = "192.0.0.9"
FLAG: Any = True
SECRETS  = { "Authorization": "Bearer tok", "Cookie": "sid=1", "X-Api-Key": "key", "Proxy-Authorization": "Basic eA==" }
LITERALS = (
    "127.0.0.1", "[::1]", "[::ffff:127.0.0.1]", "2130706433", "127.1", "0177.0.0.1", "0x7f.0.0.1", "169.254.169.254",
    "100.100.100.200", "[64:ff9b::7f00:1]", "[::7f00:1]", "0.0.0.0", "0", "[::]", "10.0.0.1", "192.168.1.1", "172.16.0.1",  # noqa: S104
    "[fc00::1]", "[fe80::1]", "100.64.0.1", "localhost",
)

class Upstream:

    def __init__ ( self ) -> None:

        self.port = 0
        self._runner: web.AppRunner | None = None
        self.calls = 0
        self.spins = 0
        self.heard: list[dict[str, Any]] = []

    async def __aenter__ ( self ) -> Self:

        app = web.Application()

        app.router.add_get("/ok", self.ok)
        app.router.add_post("/echo", self.echo)
        app.router.add_get("/big", self.big)
        app.router.add_get("/hop", self.hop)
        app.router.add_get("/slow", self.slow)
        app.router.add_get("/flaky", self.flaky)
        app.router.add_get("/boom", self.boom)
        app.router.add_get("/leak", self.leak)
        app.router.add_head("/ok", self.ok)
        app.router.add_patch("/echo", self.echo)
        app.router.add_put("/echo", self.echo)
        app.router.add_delete("/ok", self.ok)
        app.router.add_post("/form", self.form)
        app.router.add_post("/upload", self.upload)
        app.router.add_get("/page", self.page)
        app.router.add_post("/graphql", self.graphql)
        app.router.add_route("*", "/away", self.away)
        app.router.add_route("*", "/seen", self.seen)
        app.router.add_get("/spin", self.spin)
        app.router.add_get("/roam", self.roam)

        self._runner = web.AppRunner(app)

        await self._runner.setup()

        site = web.TCPSite(self._runner, "127.0.0.1", 0)

        await site.start()

        self.port = int(self._runner.addresses[0][1])

        return self

    async def __aexit__ ( self, *_: object ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    def url ( self, path: str ) -> str:

        return f"http://127.0.0.1:{self.port}{path}"

    async def ok ( self, request: web.Request ) -> web.Response:

        every = { key: request.query.getall(key) for key in request.query }

        return web.json_response({ "q": dict(request.query), "all": every, "ua": request.headers.get("X-Test") })

    async def echo ( self, request: web.Request ) -> web.Response:

        return web.json_response({ "body": await request.json(), "type": request.headers.get("Content-Type") }, status=201)

    async def big ( self, _: web.Request ) -> web.Response:

        return web.Response(body=b"x" * 5000)

    async def hop ( self, _: web.Request ) -> web.Response:

        raise web.HTTPFound("/ok?hopped=1")

    async def slow ( self, _: web.Request ) -> web.Response:

        await asyncio.sleep(0.5)

        return web.Response(text="late")

    async def flaky ( self, _: web.Request ) -> web.Response:

        self.calls += 1

        if self.calls < 3: return web.Response(status=503)

        return web.Response(text="fine")

    async def form ( self, request: web.Request ) -> web.Response:

        data = await request.post()

        return web.json_response({ "fields": dict(data), "type": request.headers.get("Content-Type") })

    async def upload ( self, request: web.Request ) -> web.Response:

        reader = await request.multipart()
        parts: dict[str, object] = {}

        while isinstance(part := await reader.next(), BodyPartReader):

            if part.filename: parts[part.name or "file"] = { "name": part.filename, "size": len(await part.read()), "type": part.headers.get("Content-Type") }
            else: parts[part.name or "field"] = await part.text()

        return web.json_response(parts)

    async def page ( self, request: web.Request ) -> web.Response:

        number = int(request.query.get("p", "1"))
        after  = f"http://127.0.0.1:{self.port}/page?p={number + 1}" if number < 3 else None

        return web.json_response({ "data": [number * 10, number * 10 + 1], "next": after })

    async def graphql ( self, request: web.Request ) -> web.Response:

        body = await request.json()

        if "bad" in body["query"]: return web.json_response({ "errors": [{ "message": "bad query" }] })

        return web.json_response({ "data": { "echo": body["variables"] } })

    async def boom ( self, _: web.Request ) -> web.Response:

        return web.json_response({ "message": "nope" }, status=422)

    async def leak ( self, _: web.Request ) -> web.Response:

        raise web.HTTPFound("http://10.0.0.1/secret")

    async def away ( self, request: web.Request ) -> web.Response:

        return web.Response(status=int(request.query.get("code", "302")), headers={ "Location": request.query["to"] })

    async def seen ( self, request: web.Request ) -> web.Response:

        body = await request.read()

        self.heard.append({
            "method": request.method, "body": body, "query": dict(request.query),
            "headers": { key.lower(): value for key, value in request.headers.items() },
        })

        return web.json_response({ "method": request.method, "size": len(body) })

    async def spin ( self, _: web.Request ) -> web.Response:

        self.spins += 1

        raise web.HTTPFound("/spin")

    async def roam ( self, request: web.Request ) -> web.Response:

        return web.json_response({ "data": [1], "next": request.query["to"] })

class Wire:

    def __init__ ( self, patch: pytest.MonkeyPatch, port: int, answers: dict[str, list[tuple[str, ...]]] ) -> None:

        loop = asyncio.get_running_loop()

        self.port    = port
        self.answers = answers
        self.asked: list[str] = []
        self.dialed: list[str] = []
        self._names  = loop.getaddrinfo
        self._dial   = loop.sock_connect

        patch.setattr(loop, "getaddrinfo", self.names)
        patch.setattr(loop, "sock_connect", self.dial)

    async def names ( self, host: str, port: Any, **options: Any ) -> list[tuple[Any, ...]]:

        if host not in self.answers: return await self._names(host, port, **options)

        self.asked.append(host)

        queue = self.answers[host]
        found = queue.pop(0) if len(queue) > 1 else queue[0]

        if not found: raise socket.gaierror(socket.EAI_NONAME, "unknown")

        return [self.info(address, int(port or 0)) for address in found]

    def info ( self, address: str, port: int ) -> tuple[Any, ...]:

        if ":" in address: return (socket.AF_INET6, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port, 0, 0))

        return (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port))

    async def dial ( self, sock: socket.socket, address: tuple[Any, ...] ) -> None:

        self.dialed.append(str(address[0]))

        await self._dial(sock, ("127.0.0.1", self.port))

class Lax(Egress):

    @override
    def allow ( self, host: str, port: int ) -> None:

        _ = (host, port)

@pytest.fixture
def private () -> Egress:

    return Egress(allow_private=True, ports=frozenset())

@pytest.fixture
def strict () -> Egress:

    return Egress(ports=frozenset())

@pytest.fixture(autouse=True)
async def closed () -> AsyncIterator[None]:

    yield

    await net.close()

async def test_requests_follow_the_egress_policy ( private: Egress ) -> None:

    async with Upstream() as upstream:

        reply = await net.get(upstream.url("/ok"), query={ "a": 1, "b": None }, headers={ "X-Test": "yes" }, egress=private)

        assert reply.ok() and reply.json() == { "q": { "a": "1" }, "all": { "a": ["1"] }, "ua": "yes" } and reply.ms >= 0 and reply.text()

        repeated = await net.get(upstream.url("/ok"), query={ "tone": ["warm", "plain"], "on": True, "off": False, "x": (1, None) }, egress=private)

        assert repeated.json()["all"] == { "tone": ["warm", "plain"], "on": ["true"], "off": ["false"], "x": ["1"] }

        posted = await net.post(upstream.url("/echo"), data={ "k": "v" }, egress=private)

        assert posted.status == 201 and posted.json() == { "body": { "k": "v" }, "type": "application/json" }

        hopped = await net.get(upstream.url("/hop"), egress=private)

        assert hopped.json()["q"] == { "hopped": "1" } and hopped.url.endswith("/ok?hopped=1")

        assert await net.download(upstream.url("/big"), 10000, egress=private) == b"x" * 5000

        with pytest.raises(Fault) as big: await net.get(upstream.url("/big"), limit=100, egress=private)

        assert big.value.code is Code.TOO_LARGE and big.value.reason == "net.body"

        with pytest.raises(Fault) as slow: await net.get(upstream.url("/slow"), timeout=0.05, egress=private)

        assert slow.value.code is Code.TIMEOUT and slow.value.reason == "net.timeout"

        assert (await net.get(upstream.url("/flaky"), egress=private, tries=1)).status == 503

        upstream.calls = 0

        async def retried () -> int:

            reply = await net.get(upstream.url("/flaky"), egress=private)

            if not reply.ok(): raise net.fault(reply)

            return reply.status

        assert await func.retry(retried, tries=3, backoff=0.001, idempotent=True) == 200

        home = Egress(allow_private=True, hosts=frozenset({ "127.0.0.1" }), ports=frozenset())

        with pytest.raises(Fault) as leak: await net.get(upstream.url("/leak"), egress=home)

        assert leak.value.code is Code.FORBIDDEN and leak.value.reason == "net.host"

        with pytest.raises(Fault) as blocked: await net.get(upstream.url("/ok"))

        assert blocked.value.code is Code.FORBIDDEN and blocked.value.reason == "net.port"

        with pytest.raises(Fault) as loopback: await net.get(upstream.url("/ok"), egress=Egress(ports=frozenset()))

        assert loopback.value.reason == "net.private"

        with pytest.raises(Fault) as host: await net.get("https://example.com/", egress=Egress(hosts=frozenset({ "other" })))

        assert host.value.reason == "net.host"

        with pytest.raises(Fault) as scheme: await net.get("ftp://example.com/")

        assert scheme.value.reason == "parse.url"

        with pytest.raises(Fault) as down: await net.get("http://127.0.0.1:1/", egress=private, timeout=0.5)

        assert down.value.reason in ("net.connect", "net.timeout")

        assert net.stats()["sent"] >= 5 and net.egress().schemes == ("http", "https")

    await net.close()

async def test_remote_maps_statuses_and_breaks ( private: Egress ) -> None:

    class Peer(Remote):

        name  = "peer"
        tries = 1

    async with Upstream() as upstream:

        peer = Peer(net, upstream.url(""), headers={ "X-Test": "peer" }, egress=private)

        assert peer.url("/ok") == upstream.url("/ok") and peer.url("http://x/y") == "http://x/y"
        assert (await peer.get("/ok"))["ua"] == "peer"
        assert (await peer.post("/echo", data={ "a": 1 }))["body"] == { "a": 1 }

        with pytest.raises(Fault) as refused: await peer.get("/boom")

        assert refused.value.code is Code.VALIDATION and refused.value.reason == "peer.validation"

        upstream.calls = 0

        with pytest.raises(Fault) as down: await peer.get("/flaky")

        assert down.value.code is Code.UNAVAILABLE and down.value.reason == "peer.503" and down.value.unknown
        assert peer.breaker().describe()["failures"] == 1 and peer.describe()["name"] == "peer"

    await net.close()

async def test_wire_shapes_forms_uploads_pages_and_graphql ( private: Egress, tmp_path: Path ) -> None:

    async with Upstream() as upstream:

        head = await net.head(upstream.url("/ok"), egress=private)

        assert head.ok() and head.body == b""
        assert (await net.patch(upstream.url("/echo"), data={ "p": 1 }, egress=private)).json()["body"] == { "p": 1 }
        assert (await net.json(upstream.url("/ok"), egress=private))["q"] == {}

        with pytest.raises(Fault) as refused: await net.json(upstream.url("/boom"), egress=private)

        assert refused.value.code is Code.VALIDATION

        formed = (await net.form(upstream.url("/form"), { "a": 1, "b": True }, egress=private)).json()

        assert formed == { "fields": { "a": "1", "b": "true" }, "type": "application/x-www-form-urlencoded" }

        uploaded = (await net.upload(upstream.url("/upload"), { "doc": ("a.txt", b"hello", "text/plain") }, { "k": "v" }, egress=private)).json()

        assert uploaded == { "k": "v", "doc": { "name": "a.txt", "size": 5, "type": "text/plain" } }

        target = tmp_path / "down" / "big.bin"

        assert await net.save(upstream.url("/big"), target, egress=private) == 5000 and target.stat().st_size == 5000

        with pytest.raises(Fault) as big: await net.save(upstream.url("/big"), tmp_path / "small.bin", limit=100, egress=private)

        assert big.value.reason == "net.body" and not (tmp_path / "small.bin").exists()

        assert [item async for item in net.paginate(upstream.url("/page"), egress=private)] == [10, 11, 20, 21, 30, 31]
        assert len([item async for item in net.paginate(upstream.url("/page"), pages=1, egress=private)]) == 2

        assert await net.graphql(upstream.url("/graphql"), "{ echo }", { "x": 1 }, egress=private) == { "echo": { "x": 1 } }

        with pytest.raises(Fault) as graph: await net.graphql(upstream.url("/graphql"), "{ bad }", egress=private)

        assert graph.value.reason == "net.graphql"

        assert await net.reachable("127.0.0.1", upstream.port, egress=private)
        assert not await net.reachable("127.0.0.1", 1, timeout=0.2, egress=private)

        class Peer(Remote):

            name = "peer"

        peer = Peer(net, upstream.url(""), egress=private).bearer("tok").header("X-Test", "h")

        assert (await peer.get("/ok"))["ua"] == "h" and (await peer.put("/echo", data={ "m": 1 }))["body"] == { "m": 1 }
        assert (await peer.patch("/echo", data={ "m": 2 }))["body"] == { "m": 2 } and (await peer.delete("/ok"))["q"] == {}

    await net.close()

def test_a_segment_is_encoded_whole_and_dot_segments_are_refused () -> None:

    assert net.segment("علي") == "%D8%B9%D9%84%D9%8A" and net.segment("../me") == "..%2Fme" and net.segment("a?b#c") == "a%3Fb%23c"

    for wrong in ("", ".", ".."):

        with pytest.raises(Fault) as refused: net.segment(wrong)

        assert refused.value.reason == "net.segment"

def test_remote_basic_credentials () -> None:

    remote = Remote(net, "http://example.test").basic("user", "pass")

    assert remote._headers["Authorization"] == "Basic dXNlcjpwYXNz"  # noqa: SLF001

def test_only_a_global_address_is_public () -> None:

    guard  = Egress()
    inside = (
        "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",  # noqa: S104
        "240.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1", "::1", "::", "fc00::1", "fe80::1", "ff02::1",
        "::ffff:10.0.0.1", "64:ff9b::a00:1", "::a00:1", "2001:db8::1", "not-an-address", "", "0x7f.0.0.1", "127.1",
    )

    for address in inside: assert guard.private(address), address
    for address in ("8.8.8.8", "1.1.1.1", PUBLIC, "2606:4700:4700::1111", "64:ff9b::808:808", "::ffff:8.8.8.8"):

        assert not guard.private(address), address

    with pytest.raises(Fault) as mixed: guard.admit("mixed.test", ("8.8.8.8", "10.0.0.5"))

    assert mixed.value.code is Code.FORBIDDEN and mixed.value.reason == "net.private"
    assert mixed.value.errors == { "host": ["mixed.test"] }

    Egress(allow_private=True).admit("inner.test", ("10.0.0.5",))

    assert guard.numeric("2130706433") and guard.numeric("::1") and guard.numeric("127.1") and not guard.numeric("a.test")

async def test_the_address_checked_is_the_address_dialed ( strict: Egress, monkeypatch: pytest.MonkeyPatch ) -> None:

    async with Upstream() as upstream:

        wire = Wire(monkeypatch, upstream.port, { "rebind.test": [(PUBLIC,), ("127.0.0.1",)] })
        url  = f"http://rebind.test:{upstream.port}/seen"

        assert (await net.get(url, egress=strict)).ok() and (await net.get(url, egress=strict)).ok()
        assert wire.asked == ["rebind.test"] and set(wire.dialed) == { PUBLIC } and len(upstream.heard) == 2

        await net.close()

        dialed = list(wire.dialed)

        with pytest.raises(Fault) as refused: await net.get(url, egress=strict)

        assert refused.value.code is Code.FORBIDDEN and refused.value.reason == "net.private"
        assert refused.value.errors == { "host": ["rebind.test"] }
        assert wire.asked == ["rebind.test"] * 2 and wire.dialed == dialed and len(upstream.heard) == 2

async def test_a_name_with_one_inside_answer_is_refused_whole ( strict: Egress, monkeypatch: pytest.MonkeyPatch ) -> None:

    async with Upstream() as upstream:

        wire = Wire(monkeypatch, upstream.port, {
            "mixed.test": [(PUBLIC, "10.0.0.5")], "meta.test": [("169.254.169.254",)], "nat.test": [("100.64.0.1",)],
            "loop6.test": [("::1",)], "mapped.test": [("::ffff:10.0.0.1",)], "nat64.test": [("64:ff9b::a00:1",)],
            "ula.test": [("fc00::1",)], "zero.test": [("0.0.0.0",)],  # noqa: S104
        })

        for name in list(wire.answers):

            with pytest.raises(Fault) as refused: await net.get(f"http://{name}:{upstream.port}/seen", egress=strict)

            assert refused.value.reason == "net.private" and refused.value.errors == { "host": [name] }, name

            with pytest.raises(Fault) as piped:

                async for _ in net.stream("GET", f"http://{name}:{upstream.port}/seen", egress=strict): pass

            assert piped.value.reason == "net.private", name

        assert wire.dialed == [] and upstream.heard == []

async def test_an_inside_literal_is_refused_in_every_spelling ( strict: Egress, monkeypatch: pytest.MonkeyPatch ) -> None:

    async with Upstream() as upstream:

        wire = Wire(monkeypatch, upstream.port, {})

        for host in LITERALS:

            with pytest.raises(Fault) as refused: await net.get(f"http://{host}:{upstream.port}/seen", egress=strict)

            assert refused.value.code is Code.FORBIDDEN and refused.value.reason == "net.private", host

        with pytest.raises(Fault) as dotted: await net.get("http://127。0。0。1/", egress=strict)

        assert dotted.value.code is Code.FORBIDDEN and dotted.value.reason == "net.private"

        for odd in (
            "http://example.com:99999/", "http://example.com:0/", "http:///x", "file:///etc/passwd", "gopher://a.test/",
            "http://exa mple.com/", "http://ex%41mple.com/", "http://a_b.test/", "http://-a.test/", "http://a..test/",
        ):

            with pytest.raises(Fault) as wrong: await net.get(odd, egress=strict)

            assert wrong.value.code is Code.BAD_REQUEST and wrong.value.reason in ("net.url", "parse.url"), odd

        assert wire.dialed == [] and upstream.heard == []

async def test_the_connector_itself_refuses_an_inside_address ( monkeypatch: pytest.MonkeyPatch ) -> None:

    guard = Resolver()

    with pytest.raises(PermissionError): guard.make((socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 80)))
    with pytest.raises(PermissionError): guard.make((socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("2130706433", 80)))

    guard.make((socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (PUBLIC, 80))).close()

    await guard.close()

    async with Upstream() as upstream:

        wire    = Wire(monkeypatch, upstream.port, {})
        session = await net.session()

        with pytest.raises(ClientConnectorError) as raw: await session.get(upstream.url("/seen"))

        assert isinstance(raw.value.os_error, PermissionError)

        with pytest.raises(Fault) as refused: await net.get(upstream.url("/seen"), egress=Lax(ports=frozenset()))

        assert refused.value.code is Code.FORBIDDEN and refused.value.reason == "net.private"
        assert refused.value.errors == { "host": ["127.0.0.1"] }

        assert wire.dialed == [] and upstream.heard == []

async def test_a_redirect_is_checked_like_a_first_request ( strict: Egress, monkeypatch: pytest.MonkeyPatch ) -> None:

    async with Upstream() as upstream:

        wire   = Wire(monkeypatch, upstream.port, { "front.test": [(PUBLIC,)], "inner.test": [("10.0.0.5",)] })
        front  = f"http://front.test:{upstream.port}/away"
        inside = (
            upstream.url("/seen"), f"http://inner.test:{upstream.port}/seen", "http://169.254.169.254/latest/meta-data/",
            f"http://[::ffff:127.0.0.1]:{upstream.port}/seen", f"http://2130706433:{upstream.port}/seen",
            f"http://localhost:{upstream.port}/seen",
        )

        for target in inside:

            with pytest.raises(Fault) as refused: await net.get(front, query={ "to": target }, egress=strict)

            assert refused.value.code is Code.FORBIDDEN and refused.value.reason == "net.private", target

        for target in ("file:///etc/passwd", "gopher://front.test/", "ftp://front.test/x", "http://front.test:99999/"):

            with pytest.raises(Fault) as wrong: await net.get(front, query={ "to": target }, egress=strict)

            assert wrong.value.code is Code.UNAVAILABLE and wrong.value.reason == "net.redirect", target

        narrow = Egress(hosts=frozenset({ "front.test" }), ports=frozenset({ upstream.port }))

        with pytest.raises(Fault) as host: await net.get(front, query={ "to": f"http://other.test:{upstream.port}/seen" }, egress=narrow)
        with pytest.raises(Fault) as port: await net.get(front, query={ "to": "http://front.test:22/seen" }, egress=narrow)

        assert host.value.reason == "net.host" and port.value.reason == "net.port"
        assert (await net.get(front, query={ "to": "/seen?kept=1" }, egress=narrow)).ok()
        assert [item["query"] for item in upstream.heard] == [{ "kept": "1" }] and set(wire.dialed) == { PUBLIC }

async def test_credentials_never_cross_an_origin_on_redirect ( private: Egress ) -> None:

    async with Upstream() as home, Upstream() as other:

        sent = { **SECRETS, "X-Test": "mine", "Accept-Language": "ar" }

        for code in (301, 302, 303, 307, 308):

            reply = await net.get(home.url("/away"), query={ "to": other.url("/seen"), "code": code }, headers=sent, egress=private)

            assert reply.ok() and reply.url == other.url("/seen")

        assert len(other.heard) == 5

        for item in other.heard:

            assert not { key.lower() for key in (*SECRETS, "X-Test") } & set(item["headers"])
            assert item["headers"]["accept-language"] == "ar" and item["headers"]["accept"] == "application/json"

        await net.get(home.url("/away"), query={ "to": "/seen" }, headers=sent, egress=private)

        kept = home.heard[-1]["headers"]

        assert all(kept[key.lower()] == value for key, value in sent.items())

        back = other.url("/away") + "?to=" + home.url("/seen")

        await net.get(home.url("/away"), query={ "to": back }, headers=sent, egress=private)

        assert len(home.heard) == 2 and "authorization" not in home.heard[-1]["headers"]

async def test_a_redirect_rewrites_the_method_like_a_browser ( private: Egress ) -> None:

    async with Upstream() as upstream:

        body  = b'{"k":"v"}'
        cases = (
            ("POST", 301, "GET", b""), ("POST", 302, "GET", b""), ("POST", 303, "GET", b""), ("POST", 307, "POST", body),
            ("POST", 308, "POST", body), ("PUT", 302, "PUT", body), ("PUT", 303, "GET", b""), ("PATCH", 307, "PATCH", body),
            ("DELETE", 302, "DELETE", body), ("HEAD", 303, "HEAD", b""), ("GET", 303, "GET", b""),
        )

        for method, code, verb, kept in cases:

            data = None if method in ("GET", "HEAD") else { "k": "v" }

            await net.request(method, upstream.url("/away"), query={ "to": "/seen", "code": code }, data=data, egress=private)

            heard = upstream.heard[-1]

            assert (heard["method"], heard["body"]) == (verb, kept), (method, code)
            assert ("content-type" in heard["headers"]) == bool(kept), (method, code)

        assert len(upstream.heard) == len(cases)

        files = { "doc": ("a.txt", b"hello", "text/plain") }

        with pytest.raises(Fault) as stuck: await net.upload(upstream.url("/away"), files, query={ "to": "/upload", "code": 307 }, egress=private)

        assert stuck.value.code is Code.UNAVAILABLE and stuck.value.reason == "net.redirect"
        assert (await net.upload(upstream.url("/away"), files, query={ "to": "/seen", "code": 303 }, egress=private)).json() == { "method": "GET", "size": 0 }

async def test_the_redirect_budget_is_bounded_and_can_be_zero ( private: Egress ) -> None:

    async with Upstream() as upstream:

        with pytest.raises(Fault) as endless: await net.get(upstream.url("/spin"), egress=private)

        assert endless.value.code is Code.UNAVAILABLE and endless.value.reason == "net.redirects" and upstream.spins == 4

        upstream.spins = 0

        with pytest.raises(Fault): await net.get(upstream.url("/spin"), egress=private, redirects=1)

        assert upstream.spins == 2

        held = await net.get(upstream.url("/away"), query={ "to": "/seen" }, egress=private, redirects=0)

        assert held.status == 302 and held.headers["Location"] == "/seen" and upstream.heard == []
        assert (await net.get(upstream.url("/hop"), egress=private, redirects=1)).json()["q"] == { "hopped": "1" }

async def test_reachable_obeys_the_policy ( private: Egress, strict: Egress, monkeypatch: pytest.MonkeyPatch ) -> None:

    async with Upstream() as upstream:

        wire = Wire(monkeypatch, upstream.port, { "inner.test": [("10.0.0.5",)], "gone.test": [()], "out.test": [(PUBLIC,)] })

        assert await net.reachable("127.0.0.1", upstream.port, egress=private)
        assert await net.reachable("out.test", upstream.port, egress=strict) and wire.dialed[-1] == PUBLIC
        assert not await net.reachable("gone.test", upstream.port, egress=strict)

        dialed = list(wire.dialed)

        for host, guard, reason in (
            ("127.0.0.1", net.egress(), "net.port"), ("127.0.0.1", strict, "net.private"), ("inner.test", strict, "net.private"),
            ("2130706433", strict, "net.private"), ("out.test", Egress(hosts=frozenset({ "a.test" })), "net.host"),
        ):

            with pytest.raises(Fault) as refused: await net.reachable(host, upstream.port, egress=guard)

            assert refused.value.code is Code.FORBIDDEN and refused.value.reason == reason, host

        assert wire.dialed == dialed

async def test_remote_credentials_stay_on_their_origin ( private: Egress ) -> None:

    class Peer(Remote):

        name = "peer"

    async with Upstream() as home, Upstream() as other:

        peer = Peer(net, home.url(""), egress=private).bearer("tok").header("X-Api-Key", "key")

        assert peer.owns(home.url("/x")) and not peer.owns(other.url("/x")) and not peer.owns("nonsense")
        assert peer.url("httpx/y") == home.url("/httpx/y") and peer.url("https://x.test/y") == "https://x.test/y"

        await peer.get("/seen")
        await peer.get(home.url("/seen"))
        await peer.get(other.url("/seen"))
        await peer.get("/away", query={ "to": other.url("/seen") })

        assert [piece async for piece in peer.stream("GET", other.url("/seen"))]

        for item in home.heard: assert item["headers"]["authorization"] == "Bearer tok" and item["headers"]["x-api-key"] == "key"
        for item in other.heard: assert "authorization" not in item["headers"] and "x-api-key" not in item["headers"]

        assert len(home.heard) == 2 and len(other.heard) == 3

async def test_a_page_cursor_stays_on_its_origin ( private: Egress ) -> None:

    async with Upstream() as home, Upstream() as other:

        pages = net.paginate(home.url("/roam"), query={ "to": other.url("/seen") }, headers=SECRETS, egress=private)

        assert await anext(pages) == 1

        with pytest.raises(Fault) as roamed: await anext(pages)

        assert roamed.value.code is Code.UNAVAILABLE and roamed.value.reason == "net.page" and other.heard == []
        assert [item async for item in net.paginate(home.url("/roam"), query={ "to": "/page?p=3" }, egress=private)][:1] == [1]

class Closing:

    def __init__ ( self, pieces: list[bytes] ) -> None:

        self.pieces = pieces
        self.closed = 0

    def __aiter__ ( self ) -> Closing:

        return self

    async def __anext__ ( self ) -> bytes:

        if not self.pieces: raise StopAsyncIteration

        return self.pieces.pop(0)

    async def aclose ( self ) -> None:

        self.closed += 1

async def drained [T] ( source: AsyncIterator[T] ) -> list[T]:

    return [item async for item in source]

async def test_lines_and_events_are_bounded_at_any_chunking () -> None:

    raw = b"alpha\nbeta\r\n\ngamma"

    for cut in (1, 2, 3, 5, 7, 100):

        pieces = Closing([raw[at:at + cut] for at in range(0, len(raw), cut)])

        assert await drained(net.lines(pieces)) == [b"alpha", b"beta\r", b"", b"gamma"] and pieces.closed == 1

    assert await drained(net.lines(Closing([b"a\n"]))) == [b"a"] and await drained(net.lines(Closing([]))) == []
    assert await drained(net.lines(Closing([b"", b"\n", b""]))) == [b""] and await drained(net.lines(Closing([b"abc"]), 3)) == [b"abc"]

    for pieces in (Closing([b"abcd\n"]), Closing([b"ab", b"cd"]), Closing([b"x\n", b"abcd"]), Closing([b"abcd"])):

        with pytest.raises(Fault) as long: await drained(net.lines(pieces, 3))

        assert long.value.code is Code.TOO_LARGE and long.value.reason == "net.line" and long.value.unknown and pieces.closed == 1

    framed = b': comment\nevent: tick\ndata: {"n": 1}\ndata: more\n\ndata: lone\n\nevent: end\n\ndata: tail'

    for cut in (1, 4, 9, 1000):

        pieces = Closing([framed[at:at + cut] for at in range(0, len(framed), cut)])

        assert await drained(net.sse(pieces)) == [("tick", '{"n": 1}\nmore'), ("message", "lone"), ("message", "tail")]
        assert pieces.closed == 1

    assert await drained(net.sse(Closing([b"data:no-space\r\n\r\n"]))) == [("message", "no-space")]
    assert await drained(net.sse(Closing([b"data\n\n"]))) == [("message", "")]
    assert await drained(net.sse(Closing([b"\xff\xfe\n\n"]))) == []

    with pytest.raises(Fault) as big: await drained(net.sse(Closing([b"data: " + b"x" * 10 + b"\ndata: " + b"y" * 10 + b"\n\n"]), most=15))

    assert big.value.code is Code.TOO_LARGE and big.value.reason == "net.event"

    with pytest.raises(Fault) as wide: await drained(net.sse(Closing([b"data: " + b"x" * 40 + b"\n\n"]), limit=20))

    assert wide.value.reason == "net.line"

    cut_short = net.lines(Closing([b"a\nb\nc\n"]))

    assert await anext(cut_short) == b"a"

    await cut_short.aclose()

    with pytest.raises(StopAsyncIteration): await anext(cut_short)

async def test_settings_and_request_options_are_validated ( private: Egress ) -> None:

    for name, work in (
        ("limit", lambda: net.setup(limit=0)), ("limit", lambda: net.setup(limit=cast("Any", "8"))), ("limit", lambda: net.setup(limit=cast("Any", 1.5))),
        ("timeout", lambda: net.setup(timeout=0)), ("timeout", lambda: net.setup(timeout=3601)), ("timeout", lambda: net.setup(timeout=float("nan"))),
        ("timeout", lambda: net.setup(timeout=FLAG)), ("egress", lambda: net.setup(cast("Any", "strict"))),
    ):

        with pytest.raises(Fault) as refused: cast("Any", work)()

        assert refused.value.code is Code.INTERNAL and refused.value.reason == "net.settings" and refused.value.errors == { "setting": [name] }

    net.setup(limit=1024, timeout=2.5)

    async with Upstream() as upstream:

        for name, options in (
            ("timeout", { "timeout": 0 }), ("timeout", { "timeout": -1 }), ("timeout", { "timeout": "5" }), ("limit", { "limit": 0 }),
            ("limit", { "limit": 2.0 }), ("tries", { "tries": 0 }), ("tries", { "tries": "2" }), ("redirects", { "redirects": -1 }),
            ("redirects", { "redirects": 1.5 }),
        ):

            with pytest.raises(Fault) as wrong: await net.get(upstream.url("/ok"), egress=private, **cast("Any", options))

            assert wrong.value.reason == "net.settings" and wrong.value.errors == { "setting": [name] }, name

        for method in ("", "G ET", "GET\r\n", 7, None, "x" * 17):

            with pytest.raises(Fault) as verb: await net.request(cast("Any", method), upstream.url("/ok"), egress=private)

            assert verb.value.reason == "net.settings" and verb.value.errors == { "setting": ["method"] }

        with pytest.raises(Fault) as chunk: await drained(net.stream("GET", upstream.url("/ok"), egress=private, chunk=0))

        assert chunk.value.errors == { "setting": ["chunk"] }

        assert (await net.request("get", upstream.url("/ok"), egress=private, tries=1, redirects=0)).ok()
        assert upstream.heard == [] and net.stats()["sent"] >= 1

    net.setup(limit=8 * 1024 * 1024, timeout=10.0)
