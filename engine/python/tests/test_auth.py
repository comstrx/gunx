from collections.abc import AsyncIterator, Callable
from engine.auth import Actor, Auth, Otp, Relay
from engine.auth.arch import CODE, digest, GRANTS, HEADER, HEADERS, IDENT, LARGEST, MINIMUM, OTP_LONGEST, SUBJECT, TAKEN
from engine.cache import Cache, Memory, Redis
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.http import App, Request, Route
from engine.test import Client
from engine.token import Claims, token
from functools import partial
from typing import Any, cast
import asyncio, os, pytest

type Wrong = tuple[str, Callable[[], object]]

REDIS  = os.environ.get("ENGINE_REDIS_URL", "redis://127.0.0.1:6379/14")
SECRET = "relay-secret-for-the-tests-0000000001"
LONG   = "x" * (IDENT + 1)
FLAG: Any = True

def giving ( value: object ) -> Any:

    def check ( actor: Actor, subject: Any ) -> Any:

        return value

    return check

def truthy ( actor: Actor, subject: Any ) -> bool:

    return True

def raising ( error: BaseException ) -> Any:

    def check ( actor: Actor, subject: Any ) -> Any:

        raise error

    return check

def refused ( work: Callable[[], object], code: Code, reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert (caught.value.code, caught.value.reason) == (code, reason)

    return caught.value

async def failed ( work: Any, code: Code, reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: await work

    assert (caught.value.code, caught.value.reason) == (code, reason)

    return caught.value

def claims ( subject: str = "u1", **facts: Any ) -> Claims:

    return Claims(subject, "access", "jti-1", 1, 2, facts)

def ready () -> Auth:

    crypto.setup([crypto.key("k1")])
    token.setup("auth-test-secret-that-is-long-enough-0001")

    made = Auth()

    made.setup(Cache(Memory()), roles={ "admin": ["orders.*", "users.read"], "user": ["orders.read"] })

    return made

def test_an_actor_is_canonical_and_refuses_what_no_token_should_carry () -> None:

    actor = Actor("u1", cast("Any", ["admin", "user", "admin"]), cast("Any", ["orders.*", "a.b", "orders.*"]), "t1", { "name": "Ali" })

    assert (actor.roles, actor.scopes, type(actor.roles)) == (("admin", "user"), ("orders.*", "a.b"), tuple)
    assert actor.has_role("user") and actor.has_role("x", "admin") and not actor.has_role("x") and not actor.has_role()
    assert actor.can("orders.read") and actor.can("a.b") and actor.can("orders.") and not actor.can("orders") and not actor.can("ordersx")
    assert not actor.can(cast("Any", None)) and not actor.can("") and not actor.can("*") and not actor.can("a.c")
    assert Actor("u", scopes=("*",)).can("anything") and Actor("u", scopes=("a.[bc]",)).can("a.c") and not Actor("u", scopes=("a.[bc]",)).can("a.d")
    assert Actor("u", scopes=("a?",)).can("ab") and not Actor("u", scopes=("a?",)).can("abc") and Actor("u", scopes=("a.*",)).can("a.")
    assert actor.dump() == { "id": "u1", "roles": ["admin", "user"], "scopes": ["orders.*", "a.b"], "tenant": "t1" }
    assert Actor("u").dump() == { "id": "u", "roles": [], "scopes": [], "tenant": None } and Actor("u").facts == {}

    wrong: tuple[Wrong, ...] = (
        ("id", lambda: Actor("")), ("id", lambda: Actor(LONG)), ("id", lambda: Actor("a\nb")), ("id", lambda: Actor(cast("Any", 7))),
        ("id", lambda: Actor(cast("Any", None))),
        ("roles", lambda: Actor("u", cast("Any", "admin"))), ("roles", lambda: Actor("u", ("a,b",))), ("roles", lambda: Actor("u", ("a b",))),
        ("roles", lambda: Actor("u", ("",))), ("roles", lambda: Actor("u", cast("Any", (1,)))), ("roles", lambda: Actor("u", tuple(f"r{at}" for at in range(GRANTS + 1)))),
        ("roles", lambda: Actor("u", cast("Any", { "admin" }))), ("roles", lambda: Actor("u", (LONG,))),
        ("scopes", lambda: Actor("u", scopes=cast("Any", "a.*"))), ("scopes", lambda: Actor("u", scopes=("a,b",))), ("scopes", lambda: Actor("u", scopes=("a\x00",))),
        ("tenant", lambda: Actor("u", tenant="")), ("tenant", lambda: Actor("u", tenant=LONG)), ("tenant", lambda: Actor("u", tenant=cast("Any", 1))),
        ("facts", lambda: Actor("u", facts=cast("Any", [("a", 1)]))), ("facts", lambda: Actor("u", facts={ "roles": ["admin"] })),
        ("facts", lambda: Actor("u", facts={ "sub": "x" })), ("facts", lambda: Actor("u", facts={ "": 1 })), ("facts", lambda: Actor("u", facts={ LONG: 1 })),
        ("facts", lambda: Actor("u", facts=cast("Any", { 1: 1 }))),
    )

    for what, make in wrong:

        assert refused(make, Code.INTERNAL, "auth.actor").errors == { "actor": [what] }, what

    assert { "roles", "scopes", "tenant", "sub", "exp", "jti" } <= TAKEN
    assert Actor("u", tuple(f"r{at}" for at in range(GRANTS))).roles[-1] == f"r{GRANTS - 1}"

def test_an_actor_is_read_from_claims_and_a_forged_shape_is_refused () -> None:

    loaded = Actor.from_claims(claims("u1", roles=["admin"], scopes=["a.*"], tenant="t1", name="Ali", sid="s1"))

    assert loaded == Actor("u1", ("admin",), ("a.*",), "t1", { "name": "Ali", "sid": "s1" })
    assert Actor.from_claims(claims("u2")) == Actor("u2") and Actor.from_claims(claims("u3", tenant=None)).tenant is None

    for bad in (
        claims("u", roles="admin"), claims("u", roles=[1]), claims("u", roles={ "a": 1 }), claims("u", scopes="a,b"),
        claims("u", tenant=7), claims("u", tenant=""), claims(""), claims(LONG), claims("u", name=1, sub="x"),
        claims("u", **{ "": 1 }), claims("u", roles=["a,b"]),
    ):

        fault = refused(partial(Actor.from_claims, bad), Code.UNAUTHORIZED, "auth.claims")

        assert fault.errors is None and fault.client()

    refused(partial(Actor.from_claims, cast("Any", { "sub": "u" })), Code.UNAUTHORIZED, "auth.claims")
    refused(partial(Actor.from_claims, cast("Any", None)), Code.UNAUTHORIZED, "auth.claims")

async def test_roles_scopes_abilities_and_issued_pairs () -> None:

    auth  = ready()
    seen: list[tuple[str, Any]] = []

    def owns ( actor: Actor, order: Any ) -> bool:

        seen.append((actor.id, order))

        return actor.has_role("admin") or order["owner"] == actor.id

    async def later ( actor: Actor, _: Any ) -> bool:

        await asyncio.sleep(0)

        return actor.tenant == "t1"

    auth.define("orders.cancel", owns)
    auth.define("tenant.enter", later)
    auth.define("always", giving("yes"))

    actor = Actor("u1", ("user",), auth.scopes_of(["user"]), tenant="t1")
    boss  = Actor("u2", ("admin",), auth.scopes_of(["admin", "user", "ghost", cast("Any", 7)]))

    assert actor.scopes == ("orders.read",) and boss.scopes == ("orders.*", "users.read", "orders.read")
    assert auth.scopes_of([]) == () and auth.scopes_of(["ghost"]) == () and auth.abilities() == ("always", "orders.cancel", "tenant.enter")
    assert await auth.allowed(actor, "orders.cancel", { "owner": "u1" }) and not await auth.allowed(actor, "orders.cancel", { "owner": "u2" })
    assert await auth.allowed(boss, "orders.cancel", { "owner": "u9" }) and await auth.allowed(actor, "tenant.enter") and not await auth.allowed(boss, "tenant.enter")
    assert await auth.allowed(actor, "orders.read") and not await auth.allowed(actor, "orders.write") and await auth.allowed(actor, "always")
    assert not await auth.allowed(cast("Any", None), "orders.read") and not await auth.allowed(actor, cast("Any", None))
    assert seen == [("u1", { "owner": "u1" }), ("u1", { "owner": "u2" }), ("u2", { "owner": "u9" })]

    await auth.authorize(actor, "orders.cancel", { "owner": "u1" })

    denied = await failed(auth.authorize(actor, "orders.cancel", { "owner": "u2" }), Code.FORBIDDEN, "auth.orders.cancel")

    assert denied.client() and denied.errors is None
    await failed(auth.authorize(actor, "orders.write"), Code.FORBIDDEN, "auth.orders.write")
    await failed(auth.authorize(actor, "no spaces"), Code.FORBIDDEN, "auth.ability")
    await failed(auth.authorize(actor, cast("Any", 7)), Code.FORBIDDEN, "auth.ability")

    auth.define("broken", raising(ZeroDivisionError("division by zero")))
    auth.define("faulty", raising(Fault(Code.CONFLICT, reason="orders.locked")))

    broken = await failed(auth.allowed(actor, "broken"), Code.INTERNAL, "auth.ability")

    assert broken.errors == { "ability": ["broken"] } and broken.server()
    await failed(auth.allowed(actor, "faulty"), Code.CONFLICT, "orders.locked")

    pair   = auth.issue(actor, "ua|ip")
    loaded = Actor.from_claims(token.verify(pair.access, fingerprint="ua|ip"))

    assert loaded == actor and token.verify(pair.refresh, "refresh", "ua|ip").subject == "u1"
    assert Actor.from_claims(token.verify(auth.issue(Actor("u3", ("admin",), (), None, { "name": "N" })).access)) == Actor("u3", ("admin",), ("orders.*", "users.read"), None, { "name": "N" })
    assert Actor.from_claims(token.verify(auth.issue(Actor("u4", ("ghost",))).access)).scopes == ()
    refused(partial(auth.issue, cast("Any", { "id": "u" })), Code.INTERNAL, "auth.settings")
    assert auth.describe() == { "abilities": ["always", "broken", "faulty", "orders.cancel", "tenant.enter"], "roles": { "admin": ["orders.*", "users.read"], "user": ["orders.read"] }, "fixed": False }

def test_setup_refuses_settings_no_service_should_run_on () -> None:

    auth = Auth()
    wrong: tuple[Wrong, ...] = (
        ("cache", lambda: auth.setup(cast("Any", Memory()))), ("cache", lambda: auth.setup(cast("Any", "redis://"))),
        ("roles", lambda: auth.setup(roles=cast("Any", ["admin"]))), ("roles", lambda: auth.setup(roles={ "admin": "orders.*" })),
        ("roles", lambda: auth.setup(roles={ "admin": ["a,b"] })), ("roles", lambda: auth.setup(roles={ "a b": ["x"] })),
        ("roles", lambda: auth.setup(roles={ "": ["x"] })), ("roles", lambda: auth.setup(roles=cast("Any", { "admin": 7 }))),
        ("roles", lambda: auth.setup(roles=cast("Any", { "admin": [1] }))), ("roles", lambda: auth.setup(roles=cast("Any", { 1: [] }))),
        ("fixed_code", lambda: auth.setup(fixed_code="")), ("fixed_code", lambda: auth.setup(fixed_code="12a456")),
        ("fixed_code", lambda: auth.setup(fixed_code="1" * (CODE + 1))), ("fixed_code", lambda: auth.setup(fixed_code=cast("Any", 123456))),
        ("fixed_code", lambda: auth.setup(fixed_code="١٢٣٤٥٦")),
        ("ability", lambda: auth.define("", truthy)), ("ability", lambda: auth.define("a b", truthy)),
        ("ability", lambda: auth.define("x", cast("Any", "yes"))), ("ability", lambda: auth.define(cast("Any", None), truthy)),
    )

    for what, make in wrong:

        assert refused(make, Code.INTERNAL, "auth.settings").errors == { "setting": [what] }, what

    auth.setup(roles={ "admin": ("a.*", "b", "a.*") }, fixed_code="123456")

    assert auth.describe() == { "abilities": [], "roles": { "admin": ["a.*", "b"] }, "fixed": True }

    for scopes, roles in ((("a b",), ()), (("",), ()), ((), ("a,b",)), ((cast("Any", 1),), ())):

        refused(partial(auth.guard, *scopes, roles=roles), Code.INTERNAL, "auth.guard")
        refused(partial(auth.relay.guard, *scopes, roles=roles), Code.INTERNAL, "auth.guard")

    assert callable(auth.guard("a.*", roles=["admin"])) and callable(auth.relay.guard())

async def test_otp_codes_expire_lock_and_never_collide () -> None:

    crypto.setup([crypto.key("k1")])

    store = Memory()
    auth  = Auth()

    auth.setup(Cache(store))

    otp = await auth.otp("+2010")

    assert type(otp) is Otp and len(otp.code) == 6 and otp.code.isdigit() and otp.hashed and otp.expires == 300.0
    assert await store.get(digest("otp", "+2010")) == otp.hashed and await store.get(digest("otp:tries", "+2010")) == 0
    assert await store.get("otp:+2010") is None and otp.hashed != crypto.hash("+2010:" + otp.code) and otp.code not in otp.hashed

    soon = await failed(auth.otp("+2010"), Code.TOO_MANY_REQUESTS, "otp.cooldown")

    assert soon.retry_after == 60.0

    await failed(auth.verify("+2010", "000000"), Code.UNAUTHORIZED, "otp.invalid")
    await failed(auth.verify("+2010", otp.code + "0"), Code.UNAUTHORIZED, "otp.invalid")
    await failed(auth.verify("+2010", cast("Any", int(otp.code))), Code.UNAUTHORIZED, "otp.invalid")
    await failed(auth.verify("+2010", ""), Code.UNAUTHORIZED, "otp.invalid")
    await failed(auth.verify("+2010", "1" * (CODE + 1)), Code.UNAUTHORIZED, "otp.invalid")
    await failed(auth.verify("+2011", otp.code), Code.UNAUTHORIZED, "otp.expired")

    assert await auth.verify("+2010", otp.code) is True
    assert await store.get(digest("otp", "+2010")) is None and await store.get(digest("otp:tries", "+2010")) is None
    assert await store.get(digest("otp:cooldown", "+2010")) is None

    await failed(auth.verify("+2010", otp.code), Code.UNAUTHORIZED, "otp.expired")

    again = await auth.otp("+2010", 8, 30)

    assert len(again.code) == 8 and again.expires == 30.0 and again.code != otp.code

    fixed = Auth()

    fixed.setup(Cache(store), fixed_code="111111")

    assert (await fixed.otp("+2011")).code == "111111"

    for _ in range(5): await failed(fixed.verify("+2011", "000000"), Code.UNAUTHORIZED, "otp.invalid")

    locked = await failed(fixed.verify("+2011", "111111"), Code.TOO_MANY_REQUESTS, "otp.attempts")

    assert locked.client() and await store.get(digest("otp", "+2011")) is None
    await failed(fixed.verify("+2011", "111111"), Code.UNAUTHORIZED, "otp.expired")
    await failed(fixed.otp("+2011"), Code.TOO_MANY_REQUESTS, "otp.cooldown")

    victim = await fixed.otp("victim")
    sneaky = await fixed.otp("tries:victim")

    assert victim.hashed != sneaky.hashed and await store.get(digest("otp:tries", "victim")) == 0
    assert await fixed.verify("victim", victim.code) and await fixed.verify("tries:victim", sneaky.code)

    for subject in ("", "x" * (SUBJECT + 1), "a\nb", cast("Any", 7), cast("Any", None)):

        assert (await failed(fixed.otp(subject), Code.INTERNAL, "auth.settings")).errors == { "setting": ["subject"] }
        assert (await failed(fixed.verify(subject, "111111"), Code.INTERNAL, "auth.settings")).errors == { "setting": ["subject"] }

    for ttl in (0, -1, OTP_LONGEST + 1, FLAG, cast("Any", "300"), float("nan"), float("inf")):

        assert (await failed(fixed.otp("ttl", ttl=ttl), Code.INTERNAL, "auth.settings")).errors == { "setting": ["ttl"] }

    for digits in (3, 13, cast("Any", "6")):

        await failed(auth.otp("digits", digits), Code.INTERNAL, "rand.digits")

    assert await store.get(digest("otp:cooldown", "digits")) is None and await store.get(digest("otp:cooldown", "ttl")) is None

@pytest.mark.parametrize("kind", ["memory", "redis"])
async def test_one_code_opens_once_under_a_crowd ( kind: str ) -> None:

    crypto.setup([crypto.key("k1")])

    store = Memory() if kind == "memory" else Redis(REDIS, prefix="engine-test:otp:")
    auth  = Auth()

    await store.clear()

    auth.setup(Cache(store), fixed_code="654321")

    otp = await auth.otp("crowd")

    assert await store.get(digest("otp", "crowd")) == otp.hashed and await store.get(digest("otp:tries", "crowd")) == 0

    right = await asyncio.gather(*(auth.verify("crowd", "654321") for _ in range(10)), return_exceptions=True)
    lost  = [made.reason for made in right if isinstance(made, Fault)]

    assert right.count(True) == 1 and len(lost) == 9 and set(lost) <= { "otp.expired", "otp.attempts" }
    assert await store.get(digest("otp", "crowd")) is None

    await store.clear()
    await auth.otp("crowd")

    wrong   = await asyncio.gather(*(auth.verify("crowd", "000000") for _ in range(10)), return_exceptions=True)
    reasons = [made.reason for made in wrong if isinstance(made, Fault)]

    assert len(reasons) == 10 and reasons.count("otp.invalid") == 5 and reasons.count("otp.attempts") >= 1
    assert set(reasons) <= { "otp.invalid", "otp.attempts", "otp.expired" } and await store.get(digest("otp", "crowd")) is None

    burnt = await failed(auth.verify("crowd", "654321"), Code.UNAUTHORIZED, "otp.expired")

    assert burnt.client()

    await store.clear()
    await store.close()

def test_the_relay_signs_reads_and_refuses_a_forged_identity () -> None:

    relay = Relay()
    actor = Actor("user-7", ("admin", "ops"), ("hello.*", "a.b"), "t1", { "name": "N" })

    assert not relay.ready()
    refused(partial(relay.sign, actor, "req-1"), Code.INTERNAL, "relay.setup")
    assert relay.read({}, "req-1") is None
    refused(partial(relay.read, { "X-Relay-Signature": "00" }, "req-1"), Code.UNAUTHORIZED, "relay.signature")

    for secret in ("x" * (MINIMUM - 1), "x" * (LARGEST + 1), "", cast("Any", b"x" * 40), cast("Any", None)):

        refused(partial(relay.setup, secret), Code.INTERNAL, "relay.secret")

    relay.setup(SECRET)

    headers = relay.sign(actor, "req-1")

    assert relay.ready() and set(headers) == set(HEADERS.values()) and relay.names() == frozenset(name.lower() for name in HEADERS.values())
    assert headers["X-Actor-Id"] == "user-7" and headers["X-Actor-Roles"] == "admin,ops" and headers["X-Actor-Scopes"] == "hello.*,a.b"
    assert headers["X-Tenant"] == "t1" and headers["X-Request-Id"] == "req-1" and len(headers["X-Relay-Signature"]) == 64
    assert relay.read(headers, "req-1") == Actor("user-7", ("admin", "ops"), ("hello.*", "a.b"), "t1")
    assert relay.read({ name.lower(): value for name, value in headers.items() }, "req-1") == Actor("user-7", ("admin", "ops"), ("hello.*", "a.b"), "t1")
    read = relay.read(headers, "req-1")

    assert read is not None and read.facts == {}

    nobody = relay.sign(None, "req-1")

    assert nobody["X-Actor-Id"] == "" and nobody["X-Actor-Roles"] == "" and relay.read(nobody, "req-1") is None
    assert relay.sign(Actor("a"), "r")["X-Tenant"] == "" and relay.read(relay.sign(Actor("a"), "r"), "r") == Actor("a")

    forged: tuple[dict[str, str], ...] = (
        { **headers, "X-Actor-Id": "user-8" }, { **headers, "X-Actor-Roles": "admin" }, { **headers, "X-Actor-Roles": "ops,admin" },
        { **headers, "X-Actor-Scopes": "*" }, { **headers, "X-Tenant": "t2" }, { **headers, "X-Tenant": "" },
        { **headers, "X-Relay-Signature": "00" * 32 }, { **headers, "X-Relay-Signature": "" }, { **headers, "X-Actor-Id": "" },
        { **nobody, "X-Actor-Id": "user-7" }, { "X-Relay-Signature": headers["X-Relay-Signature"] },
        { **headers, "X-Actor-Roles": "x" * (HEADER + 1) }, { **headers, "X-Actor-Id": "a\nb" },
        { **headers, "X-Actor-Id": cast("Any", 7) },
    )

    for given in forged:

        fault = refused(partial(relay.read, given, "req-1"), Code.UNAUTHORIZED, "relay.signature")

        assert fault.client() and fault.errors is None

    refused(partial(relay.read, headers, "req-2"), Code.UNAUTHORIZED, "relay.signature")
    refused(partial(relay.read, headers, ""), Code.UNAUTHORIZED, "relay.signature")
    refused(partial(relay.read, headers, cast("Any", None)), Code.UNAUTHORIZED, "relay.signature")
    refused(partial(relay.sign, actor, ""), Code.INTERNAL, "relay.request")
    refused(partial(relay.sign, actor, LONG), Code.INTERNAL, "relay.request")
    refused(partial(relay.sign, actor, "a\nb"), Code.INTERNAL, "relay.request")
    refused(partial(relay.sign, cast("Any", { "id": "u" }), "r"), Code.INTERNAL, "relay.actor")

    other = Relay()

    other.setup(SECRET[:-1] + "2")

    refused(partial(other.read, headers, "req-1"), Code.UNAUTHORIZED, "relay.signature")

async def test_revoked_tokens_are_refused_until_they_expire () -> None:

    store  = Memory()
    keeper = Auth()

    keeper.setup(Cache(store))

    await keeper.revoke("jti-1", ttl=60)

    assert await keeper.revoked("jti-1") and not await keeper.revoked("jti-2") and await keeper.revoked("")
    assert await keeper.revoked(cast("Any", None)) and await store.get("revoked:jti-1") is None and await store.get(digest("revoked", "jti-1")) == 1

    for jti in ("", LONG, "a\nb", cast("Any", 7)):

        assert (await failed(keeper.revoke(jti), Code.INTERNAL, "auth.settings")).errors == { "setting": ["jti"] }

    for ttl in (0, -5, cast("Any", "60"), float("inf"), 400 * 86400.0):

        assert (await failed(keeper.revoke("jti-3", ttl), Code.INTERNAL, "auth.settings")).errors == { "setting": ["ttl"] }

    assert not await keeper.revoked("jti-3")

@pytest.fixture
async def served () -> AsyncIterator[tuple[Auth, str]]:

    auth = ready()

    auth.relay.setup(SECRET)

    async def me ( request: Request ) -> Any:

        return request.ctx.principal.dump()

    async def open_door () -> Any:

        return { "open": True }

    app = App("Auth App", "1.0.0").routing(
        Route.get("/open", open_door, "open"),
        Route.get("/me", me, "me").guarded(auth.guard()),
        Route.get("/orders", me, "orders").guarded(auth.guard("orders.read")),
        Route.get("/admin", me, "admin").guarded(auth.guard(roles=["admin"])),
        Route.get("/both", me, "both").guarded(auth.guard("orders.read", "users.read", roles=["admin", "root"])),
        Route.get("/relayed", me, "relayed").guarded(auth.relay.guard("hello.world")),
        Route.get("/staff", me, "staff").guarded(auth.relay.guard(roles=["staff"])),
    )

    async with app.listen() as url: yield auth, url

async def test_guards_bind_the_principal_end_to_end ( served: tuple[Auth, str] ) -> None:

    auth, url = served
    client    = Client(url, { "User-Agent": "tests" })
    user  = Actor("u1", ("user",), auth.scopes_of(["user"]), "t1", { "name": "Ali" })
    boss  = Actor("u2", ("admin",), auth.scopes_of(["admin"]))
    pair  = auth.issue(user)
    boss_ = auth.issue(boss, "tests|127.0.0.1")

    assert (await client.get("/open")).data() == { "open": True }

    missing = client.expect(await client.get("/me"), 401, "unauthorized", "auth.missing")

    assert missing.header("www-authenticate") == "Bearer"
    client.expect(await client.bearer("not-a-token").get("/me"), 401, "unauthorized")
    client.expect(await client.bearer(pair.refresh).get("/me"), 401, "unauthorized", "token.kind")

    mine = client.expect(await client.bearer(pair.access).get("/me"), 200, "ok")

    assert mine.data() == { "id": "u1", "roles": ["user"], "scopes": ["orders.read"], "tenant": "t1" }
    assert (await client.bearer(pair.access).get("/orders")).status == 200

    scoped = client.expect(await client.bearer(pair.access).get("/both"), 403, "forbidden", "auth.role")

    assert scoped.errors() is None
    assert client.expect(await client.bearer(pair.access).get("/admin"), 403, "forbidden", "auth.role").data() is None
    assert (await client.bearer(boss_.access).get("/admin")).data()["roles"] == ["admin"]
    assert (await client.bearer(boss_.access).get("/both")).status == 200
    assert client.expect(await client.header("User-Agent", "other").bearer(boss_.access).get("/admin"), 401, "unauthorized").reason() == "token.fingerprint"

    narrow = Actor("u3", (), ("users.read",))
    pair3  = auth.issue(narrow)
    denied = client.expect(await client.bearer(pair3.access).get("/orders"), 403, "forbidden", "auth.scope")

    assert denied.errors() == { "scope": ["orders.read"] }

    await auth.revoke(token.verify(pair.access).id)

    client.expect(await client.bearer(pair.access).get("/me"), 401, "unauthorized", "auth.revoked")
    assert (await client.bearer(boss_.access).get("/admin")).status == 200

    signed = auth.relay.sign(Actor("gw-user", ("staff",), ("hello.world",), "t9"), "req-77")
    sent   = Client(url, { **signed, "User-Agent": "tests" })

    assert (await sent.get("/relayed")).data() == { "id": "gw-user", "roles": ["staff"], "scopes": ["hello.world"], "tenant": "t9" }
    assert (await sent.get("/staff")).status == 200
    assert (await sent.get("/relayed")).meta() == { "request_id": "req-77" }
    client.expect(await Client(url, { **signed, "X-Actor-Id": "someone", "User-Agent": "tests" }).get("/relayed"), 401, "unauthorized", "relay.signature")
    client.expect(await Client(url, { **signed, "X-Request-Id": "req-78", "User-Agent": "tests" }).get("/relayed"), 401, "unauthorized", "relay.signature")
    client.expect(await client.get("/relayed"), 401, "unauthorized", "auth.missing")
    client.expect(await client.bearer(boss_.access).get("/relayed"), 401, "unauthorized", "auth.missing")

    nobody = Client(url, { **auth.relay.sign(None, "req-79"), "User-Agent": "tests" })

    client.expect(await nobody.get("/relayed"), 401, "unauthorized", "auth.missing")

    other = Client(url, { **auth.relay.sign(Actor("x", ("ops",), ("other.*",)), "req-80"), "User-Agent": "tests" })

    client.expect(await other.get("/relayed"), 403, "forbidden", "auth.scope")
    client.expect(await other.get("/staff"), 403, "forbidden", "auth.role")
    assert (await sent.get("/me")).status == 401
