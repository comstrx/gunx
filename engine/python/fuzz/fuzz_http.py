from engine.error import Code, Fault
from engine.http import App, Envelope, Form, Group, Limits, Request, Response, Route, Router, Throttle
from engine.http.outgoing import Outgoing
from engine.http.arch import KNOWN, NAME
from engine.log import log
from engine.test import stage
from engine.validate import Shape
from collections.abc import Awaitable, Coroutine, Mapping
from hypothesis import HealthCheck, given, settings, strategies as st
from multidict import CIMultiDict
from pathlib import Path
from typing import Any, ClassVar, cast
from urllib.parse import parse_qsl, urlsplit, unquote
import aiohttp, asyncio, json, re

EXAMPLES = 300
CODES    = frozenset(code.value for code in Code)
IDENTITY = re.compile(r"[A-Za-z0-9-]{1,64}")
TOKEN    = re.compile(r"[a-zA-Z0-9!#$%&'*+.^_`|~-]+")
SAFE     = re.compile(r"[A-Za-z0-9._-]+")
OK       = "http://ok.test"
METHODS  = st.sampled_from(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"])
PATHS    = st.sampled_from(["/hello", "/items/7", "/items/x", "/items/-1", "/notes", "/tight", "/raw", "/missing", "/", "/health", "/ready", "/items/", "//hello"])
WORDS    = st.text(st.characters(exclude_categories=("Cs", "Cc")), max_size=12)
HEADS    = st.dictionaries(
    st.sampled_from(["X-Request-Id", "Origin", "Accept-Language", "Content-Type", "Accept", "Authorization", "X-Forwarded-For", "If-None-Match", "Access-Control-Request-Method"]),
    st.one_of(st.sampled_from(["", "x", "req-1", OK, "https://evil.test", "ar", "application/json", "text/plain", "Bearer abc", "1.2.3.4, 10.0.0.1", '"abc"', "GET", "a" * 70]), WORDS),
    max_size=5,
)
BODIES   = st.one_of(st.none(), st.binary(max_size=64), st.builds(lambda value: b'{"body": ' + repr(value).encode() + b"}", st.one_of(st.text(max_size=8), st.integers(), st.none())))
QUERIES  = st.dictionaries(st.sampled_from(["q", "page", "limit", "flag", "name"]), st.one_of(st.sampled_from(["1", "0", "-1", "x", "yes", ""]), WORDS), max_size=3)

class Note ( Shape ):

    body : str

class Named ( Form ):

    rules : ClassVar[Mapping[str, str]] = { "name": "required|max:5" }

    name : str

class Served:

    def __init__ ( self ) -> None:

        self.url = ""
        self.app = App("Fuzz", limits=Limits(body_bytes=4096, header_bytes=4096), origins=[OK], docs=False)
        self.session: aiohttp.ClientSession | None = None
        self._context: Any = None

    async def start ( self ) -> None:

        async def hello ( request: Request ) -> Any:

            return { "hello": request.query("q", "world"), "locale": request.locale(), "actor": request.actor() }

        async def item ( request: Request, key: int ) -> Any:

            page, limit = request.paging()

            return { "key": key, "page": page, "limit": limit, "flag": request.boolean("flag") }

        async def notes ( note: Note ) -> Any:

            return Response.created({ "body": note.body })

        async def named ( name: str ) -> Any:

            return { "name": name }

        async def raw () -> Any:

            return Response.text("plain")

        self.app.throttles(tight="3/1m")
        self.app.mount(
            Route.get("/hello", hello, "hello"), Route.get("/items/<key:int>", item, "item"), Route.post("/notes", notes, "notes"),
            Route.get("/tight", raw, "tight").throttled("tight"), Route.get("/raw", raw, "raw"),
            Route.get("/named", Named.to(named), "named"),
        )

        self._context = self.app.listen()
        self.url      = await self._context.__aenter__()
        self.session  = aiohttp.ClientSession()

    async def stop ( self ) -> None:

        if self.session is not None: await self.session.close()
        if self._context is not None: await self._context.__aexit__(None, None, None)

loop   = asyncio.new_event_loop()
served = Served()

log.setup("error", "json", Path("/dev/null"))
stage.wire()
loop.run_until_complete(served.start())

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

async def nothing () -> None:

    return None

def denied ( job: Any ) -> Fault | None:

    try: job()
    except Fault as fault: return fault

    return None

def envelope ( body: Any, request_id: str ) -> None:

    assert isinstance(body, dict)
    assert set(body) == { "data", "message", "errors", "code", "reason", "meta" }
    assert body["code"] in CODES
    assert type(body["message"]) is str
    assert body["message"]
    assert body["reason"] is None or type(body["reason"]) is str
    assert body["errors"] is None or isinstance(body["errors"], dict)
    assert body["errors"] is None or all(isinstance(value, list) for value in body["errors"].values())
    assert body["meta"]["request_id"] == request_id

async def asked ( method: str, path: str, heads: dict[str, str], query: dict[str, str], body: bytes | None, twice: bool ) -> None:

    session = served.session

    assert session is not None

    headers = CIMultiDict(heads)

    if twice:

        headers.add("Authorization", "Bearer once")
        headers.add("Authorization", "Bearer again")

    sent = dict(heads)

    try:

        async with session.request(method, served.url + path, headers=headers, params=query, data=body, allow_redirects=False) as reply:

            raw = await reply.read()

    except (aiohttp.ClientError, UnicodeError): return

    identity = reply.headers.get("X-Request-Id", "")
    given    = sent.get("X-Request-Id", "")

    media = reply.headers.get("Content-Type", "")

    assert reply.status < 500, (reply.status, raw[:200])
    assert reply.status not in (400, 431) or raw == b"" or b'"code"' in raw or media.startswith("text/")

    if identity:

        assert IDENTITY.fullmatch(identity), identity
        if IDENTITY.fullmatch(given) and given.isascii(): assert identity == given
        else: assert len(identity) == 16

    if media.startswith("application/json") and raw: envelope(json.loads(raw), identity)

    if identity and reply.status != 304:

        assert reply.headers.get("X-Content-Type-Options") == "nosniff"
        assert reply.headers.get("X-Frame-Options") == "DENY"

    origin = sent.get("Origin")

    if origin == OK and identity: assert reply.headers.get("Access-Control-Allow-Origin") == OK
    elif origin != OK: assert "Access-Control-Allow-Origin" not in reply.headers

    if twice and identity:

        assert reply.status == 400
        assert method == "HEAD" or b"http.header" in raw

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(METHODS, PATHS, WORDS, HEADS, QUERIES, BODIES, st.booleans())
def requests ( method: str, path: str, tail: str, heads: dict[str, str], query: dict[str, str], body: bytes | None, twice: bool ) -> None:

    if any(not value.isprintable() or not value.isascii() for value in heads.values()): return

    run(asked(method, path + tail, heads, query, body, twice))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.one_of(st.sampled_from(sorted(KNOWN)), st.sampled_from(["get", "TRACE", "", "CONNECT"]), st.integers()), max_size=3), st.one_of(WORDS, st.sampled_from(["/", "/a", "/a/<k:int>", "a", "/a b", "/x" * 70])), st.one_of(st.none(), WORDS, st.integers()))
def routes ( methods: list[Any], path: Any, name: Any ) -> None:

    made  = denied(lambda: Route.match(methods, path, nothing, name))
    verbs = [method.upper() for method in methods if type(method) is str]
    legal = type(path) is str and path.startswith("/") and path.isprintable() and " " not in path
    legal = legal and (name is None or (type(name) is str and 0 < len(name) <= NAME and name.isprintable()))
    legal = legal and bool(verbs) and len(set(verbs)) == len(methods) and all(verb in KNOWN for verb in verbs)

    assert (made is None) == legal, (methods, path, name, made)
    assert made is None or (made.reason or "").startswith("route.")

    if not legal: return

    group = Group.of("/v1", Route.match(methods, path, nothing, name))

    for route in group.walk():

        assert route.path.startswith("/v1")
        assert "//" not in route.path
        assert route.methods == tuple(dict.fromkeys(verbs))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(WORDS, st.builds("{}/{}:{}".format, st.integers(-2, 1000), st.sampled_from(["1m", "2h", "0s", "x", "", "30"]), st.sampled_from(["ip", "actor", "tenant", ""]))))
def policies ( text: str ) -> None:

    made = denied(lambda: Throttle.parse(text))

    if made is not None:

        assert made.reason == "throttle.policy"
        assert made.errors is not None
        assert len(made.errors["policy"][0]) <= 64

        return

    policy = Throttle.parse(text)

    assert policy.limit >= 1
    assert policy.window > 0
    assert policy.by in ("ip", "actor")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(st.sampled_from(["key", "slug", "page", "q"]), st.one_of(WORDS, st.integers(), st.none()), max_size=4))
def urls ( params: dict[str, Any] ) -> None:

    router = Router()

    router.register(Route.get("/users/<key>/posts/<slug>", nothing, "posts"))

    made = denied(lambda: router.url("posts", **params))

    if made is not None:

        assert made.reason == "route.param"
        assert "key" not in params or "slug" not in params

        return

    url   = router.url("posts", **params)
    parts = urlsplit(url)
    path  = parts.path.split("/")
    rest  = { key: str(value) for key, value in params.items() if key not in ("key", "slug") and value is not None }

    assert (path[:2], path[3], len(path)) == (["", "users"], "posts", 5)
    assert (unquote(path[2]), unquote(path[4])) == (str(params["key"]), str(params["slug"]))
    assert dict(parse_qsl(parts.query, keep_blank_values=True)) == rest

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(WORDS, st.builds("{}{}".format, st.sampled_from(["/", "//", "/\\", "https://", "http://", "javascript:", ""]), WORDS)), st.text(max_size=12), st.dictionaries(st.sampled_from(["X-A", "Location", "ETag", "Content-Disposition"]), st.text(max_size=12), max_size=3))
def answers ( target: str, name: str, headers: dict[str, str] ) -> None:

    moved = denied(lambda: Response.redirect(target))

    if moved is None:

        assert Response.redirect(target).headers["Location"] == target
        assert target.isascii()
        assert target.isprintable()
        assert not target.startswith(("//", "/\\"))

    else: assert moved.reason == "http.redirect"

    download = Response.download(b"x", name)
    filename = download.headers["Content-Disposition"].split('filename="')[1].rstrip('"')

    assert SAFE.fullmatch(filename)

    outgoing = cast("Outgoing", Response.raw(b"{}", headers=headers))

    for key, value in outgoing.processed_headers:

        assert b"\r" not in key + value
        assert b"\n" not in key + value
        assert TOKEN.fullmatch(key.decode("ascii", "replace")), key

    failure = Envelope.failure(Fault(Code.CONFLICT, reason="x", errors={ "a": [name] }))

    assert set(failure) == { "data", "message", "errors", "code", "reason", "meta" }
    assert failure["code"] == "conflict"

requests()
routes()
policies()
urls()
answers()

run(served.stop())
loop.close()
log.close()

print(f"fuzz http  examples={EXAMPLES * 5}  ok")
