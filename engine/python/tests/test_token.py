from datetime import datetime, timedelta, UTC
from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.json import json
from engine.rand import rand
from engine.token import Issuer, Jwt, Paseto, Token, token
from engine.cache import Cache, Memory
from typing import cast
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
import asyncio, pyseto
from engine.token.arch import DIGESTS, LEEWAY, LONGEST, REQUIRED, RESERVED
from typing import Any
import base64, hmac, jwt, pytest

SECRET = rand.token(48)
HEAD   = { "alg": "HS256", "typ": "JWT" }

def pack ( raw: bytes ) -> str:

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

def seal ( signed: str, key: str = SECRET, digest: str = "sha256" ) -> str:

    return pack(hmac.digest(key.encode(), signed.encode(), digest))

def forge ( body: object, head: object = None, key: str = SECRET, digest: str = "sha256" ) -> str:

    signed = pack(json.encode(HEAD if head is None else head)) + "." + pack(json.encode(body))

    return signed + "." + seal(signed, key, digest)

def claims ( **changed: Any ) -> dict[str, Any]:

    now = int(date.stamp())

    return { "sub": "u", "iss": "tests", "iat": now, "exp": now + 60, "jti": "j1", "kind": "access", **changed }

def without ( name: str ) -> dict[str, Any]:

    return { key: value for key, value in claims().items() if key != name }

def reason ( text: str, kind: str = "access", fingerprint: str | None = None ) -> str:

    with pytest.raises(Fault) as caught: token.verify(text, kind, fingerprint)

    assert caught.value.code is Code.UNAUTHORIZED

    return str(caught.value.reason)

def test_pairs_carry_fingerprints_and_kinds () -> None:

    crypto.setup([crypto.key("k1")])
    token.setup(SECRET, issuer="tests", access=60, refresh=120)

    pair   = token.pair("user-1", "ua|ip", role="admin")
    claims = token.verify(pair.access, fingerprint="ua|ip")

    assert claims.subject == "user-1" and claims.kind == "access" and claims.get("role") == "admin" and claims.expires - claims.issued == 60
    assert pair.dump()["type"] == "Bearer" and pair.expires == 60
    assert token.peek(pair.refresh)["kind"] == "refresh" and token.ready()
    assert token.describe() == { "issuer": "tests", "algorithm": "HS256", "access": 60, "refresh": 120 }

    with pytest.raises(Fault) as wrong: token.verify(pair.refresh)

    assert wrong.value.code is Code.UNAUTHORIZED and wrong.value.reason == "token.kind"

    with pytest.raises(Fault) as stolen: token.verify(pair.access, fingerprint="other")

    assert stolen.value.reason == "token.fingerprint"

    with pytest.raises(Fault) as unbound: token.verify(pair.access)

    assert unbound.value.reason == "token.fingerprint"

    renewed = token.refresh(pair.refresh, "ua|ip", role="admin")

    assert token.verify(renewed.access, fingerprint="ua|ip").get("role") == "admin"

    with pytest.raises(Fault) as bad: token.verify("not.a.token")

    assert bad.value.reason == "token.invalid"

    with pytest.raises(Fault): token.peek("x")

def test_expiry_and_opaque_tokens () -> None:

    token.setup(SECRET)

    issued = token.issue("u", "access", ttl=-10)

    with pytest.raises(Fault) as expired: token.verify(issued)

    assert expired.value.reason == "token.expired"

    plain = token.issue("u", "magic", ttl=30)

    assert token.verify(plain, "magic").subject == "u"

    other = Token()

    other.setup("another-secret-that-is-also-long-enough-0001")

    with pytest.raises(Fault): other.verify(plain, "magic")

    opaque = token.opaque()

    assert len(opaque.plain) >= 32 and opaque.prefix == opaque.plain[:8] and token.matches(opaque.plain, opaque.hashed)
    assert not token.matches("other", opaque.hashed) and token.opaque(64).plain != token.opaque(64).plain
    assert token.bearer("Bearer abc") == "abc" and token.bearer("bearer  x ") == "x" and token.bearer("Basic abc") is None
    assert token.bearer("BEARER abc") == "abc" and token.bearer(" Bearer abc ") == "abc" and token.bearer("abc") is None
    assert token.bearer(None) is None and token.bearer("Bearer ") is None and token.bearer("") is None
    assert token.bearer("Bearer") is None and token.bearer("Bearerabc") is None

def test_tokens_interoperate_with_the_reference () -> None:

    crypto.setup([crypto.key("k1")])

    for algorithm, (_, least) in DIGESTS.items():

        secret = rand.token(64)[:least].ljust(least, "k")
        engine = Token()

        engine.setup(secret, issuer="tests", algorithm=algorithm, access=60)

        made  = engine.issue("user-1", role="admin", tags=["a", "b"])
        found = jwt.decode(made, secret, algorithms=[algorithm], issuer="tests", options={ "require": list(REQUIRED) })

        assert jwt.get_unverified_header(made) == { "alg": algorithm, "typ": "JWT" }
        assert found["sub"] == "user-1" and found["kind"] == "access" and found["role"] == "admin" and found["tags"] == ["a", "b"]
        assert found["exp"] - found["iat"] == 60 and len(found["jti"]) == 32

        foreign = jwt.encode(claims(role="guest", nbf=int(date.stamp()) - 5), secret, algorithm=algorithm, headers={ "kid": "k1" })
        read    = engine.verify(foreign)

        assert read.subject == "u" and read.id == "j1" and read.get("role") == "guest" and read.get("nbf") is not None

        pair = engine.pair("user-2", "ua|ip", scope="orders")
        seen = jwt.decode(pair.refresh, secret, algorithms=[algorithm], issuer="tests", options={ "require": list(REQUIRED) })

        assert seen["kind"] == "refresh" and seen["fp"] == crypto.fingerprint("ua|ip") and "scope" not in seen

        for other in DIGESTS:

            if other == algorithm: continue

            with pytest.raises(jwt.InvalidTokenError): jwt.decode(made, secret, algorithms=[other], issuer="tests")

    wide  = rand.token(64)
    small = Token()
    large = Token()

    small.setup(wide, issuer="tests")
    large.setup(wide, issuer="tests", algorithm="HS512")

    with pytest.raises(Fault) as crossed: large.verify(small.issue("u"))

    assert crossed.value.reason == "token.invalid"

    with pytest.raises(Fault) as back: small.verify(large.issue("u"))

    assert back.value.reason == "token.invalid"

def test_forged_headers_and_signatures_are_refused () -> None:

    token.setup(SECRET, issuer="tests")

    good               = forge(claims())
    signed, _, mark    = good.rpartition(".")
    head, _, body      = signed.partition(".")
    other              = forge(claims(jti="j2"))
    naked              = pack(json.encode({ "alg": "none", "typ": "JWT" })) + "." + body
    last               = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".index(mark[-1])
    twin               = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[last ^ 1]
    plus               = next(made for made in (forge(claims(jti=f"j{index}")) for index in range(4096)) if "-" in made.rpartition(".")[2] or "_" in made.rpartition(".")[2])
    plain, _, urlsafe  = plus.rpartition(".")

    assert token.verify(good).subject == "u" and token.verify(plus).subject == "u"

    forged = {
        "none unsigned"      : naked + ".",
        "none signed"        : forge(claims(), { "alg": "none", "typ": "JWT" }),
        "none with old mark" : naked + "." + mark,
        "lying algorithm"    : forge(claims(), { "alg": "HS512", "typ": "JWT" }),
        "wide algorithm"     : forge(claims(), { "alg": "HS512", "typ": "JWT" }, SECRET, "sha512"),
        "lower algorithm"    : forge(claims(), { "alg": "hs256", "typ": "JWT" }),
        "listed algorithm"   : forge(claims(), { "alg": ["HS256"], "typ": "JWT" }),
        "missing algorithm"  : forge(claims(), { "typ": "JWT" }),
        "critical header"    : forge(claims(), { **HEAD, "crit": ["exp"], "exp": 1 }),
        "empty critical"     : forge(claims(), { **HEAD, "crit": [] }),
        "numeric key id"     : forge(claims(), { **HEAD, "kid": 7 }),
        "unencoded payload"  : forge(claims(), { **HEAD, "b64": False }),
        "unknown header"     : forge(claims(), { **HEAD, "x5u": "https://keys.invalid/a" }),
        "embedded key"       : forge(claims(), { **HEAD, "jwk": { "kty": "oct", "k": pack(SECRET.encode()) } }),
        "null type"          : forge(claims(), { "alg": "HS256", "typ": None }),
        "numeric type"       : forge(claims(), { **HEAD, "typ": 7 }),
        "listed header"      : forge(claims(), ["HS256"]),
        "textual header"     : forge(claims(), "HS256"),
        "raw header"         : "!!!." + body + "." + seal("!!!." + body),
        "empty header"       : "." + body + "." + seal("." + body),
        "wrong key"          : forge(claims(), None, rand.token(48)),
        "empty key"          : forge(claims(), None, ""),
        "swapped mark"       : signed + "." + other.rpartition(".")[2],
        "swapped body"       : head + "." + other.split(".")[1] + "." + mark,
        "padded mark"        : good + "=",
        "twin mark"          : signed + "." + mark[:-1] + twin,
        "standard alphabet"  : plain + "." + urlsafe.replace("-", "+").replace("_", "/"),
        "empty mark"         : signed + ".",
        "short mark"         : signed + "." + mark[:-2],
        "long mark"          : good + "A",
        "hex mark"           : signed + "." + hmac.digest(SECRET.encode(), signed.encode(), "sha256").hex(),
        "leading space"      : " " + good,
        "trailing line"      : good + "\n",
        "inner line"         : head + ".\n" + body + "." + mark,
        "nothing"            : "",
        "one part"           : head,
        "two parts"          : signed,
        "four parts"         : good + "." + mark,
        "five parts"         : good + "..",
        "only dots"          : "..",
        "foreign letter"     : signed + "é." + seal(signed + "é"),
        "null byte"          : signed + "\x00." + seal(signed + "\x00"),
        "oversize"           : forge(claims(note="n" * LONGEST)),
    }

    for name, text in forged.items(): assert reason(text) == "token.invalid", name

    edge = forge(claims(note="n" * 7000))

    assert len(edge) > LONGEST and reason(edge) == "token.invalid"

    fits = forge(claims(note="n" * 5000))

    assert len(fits) < LONGEST and token.verify(fits).get("note") == "n" * 5000

    accepted = {
        "key id"     : forge(claims(), { **HEAD, "kid": "k1" }),
        "no type"    : forge(claims(), { "alg": "HS256" }),
        "other type" : forge(claims(), { "alg": "HS256", "typ": "at+jwt" }),
        "reordered"  : forge(claims(), { "typ": "JWT", "alg": "HS256" }),
        "content"    : forge(claims(), { **HEAD, "cty": "JWT", "kid": "" }),
    }

    for name, text in accepted.items(): assert token.verify(text).subject == "u", name

def test_claims_are_required_and_typed () -> None:

    token.setup(SECRET, issuer="tests")

    for name in REQUIRED: assert reason(forge(without(name))) == "token.invalid", name

    now    = int(date.stamp())
    broken = {
        "iat text"      : claims(iat=str(now)),
        "iat null"      : claims(iat=None),
        "iat flag"      : claims(iat=True),
        "iat list"      : claims(iat=[now]),
        "iat ahead"     : claims(iat=now + 3600),
        "exp text"      : claims(exp=str(now + 60)),
        "exp null"      : claims(exp=None),
        "exp flag"      : claims(exp=True),
        "exp object"    : claims(exp={ "at": now + 60 }),
        "exp too far"   : claims(exp=2 ** 62),
        "exp too deep"  : claims(exp=-(2 ** 62)),
        "nbf text"      : claims(nbf=str(now)),
        "nbf flag"      : claims(nbf=False),
        "nbf null"      : claims(nbf=None),
        "nbf ahead"     : claims(nbf=now + 3600),
        "sub number"    : claims(sub=7),
        "sub null"      : claims(sub=None),
        "sub list"      : claims(sub=["u"]),
        "jti number"    : claims(jti=7),
        "jti null"      : claims(jti=None),
        "iss other"     : claims(iss="other"),
        "iss case"      : claims(iss="Tests"),
        "iss list"      : claims(iss=["tests"]),
        "iss null"      : claims(iss=None),
        "aud text"      : claims(aud="app"),
        "aud list"      : claims(aud=["app"]),
        "aud number"    : claims(aud=1),
        "body list"     : [claims()],
        "body text"     : "claims",
        "body number"   : 7,
        "body null"     : None,
    }

    for name, body in broken.items(): assert reason(forge(body)) == "token.invalid", name

    head = pack(json.encode(HEAD))
    raw  = {
        "body letters"  : head + ".!!!",
        "body json"     : head + "." + pack(b"{not json"),
        "body utf8"     : head + "." + pack(b'{"sub":"\xff"}'),
        "body quintet"  : head + "." + pack(json.encode(claims())) + "A",
        "body empty"    : head + ".",
    }

    for name, signed in raw.items(): assert reason(signed + "." + seal(signed)) == "token.invalid", name

    passing = {
        "aud empty"     : claims(aud=""),
        "aud no one"    : claims(aud=[]),
        "float instant" : claims(iat=now - 1.5, exp=now + 60.5),
        "nbf passed"    : claims(nbf=now - 60),
        "nbf zero"      : claims(nbf=0),
        "extra facts"   : claims(role="admin", nested={ "a": [1, 2.5, None, True] }),
        "wide text"     : claims(sub="مستخدم-واحد", name="名前"),
        "empty subject" : claims(sub=""),
    }

    for name, body in passing.items(): assert token.verify(forge(body)).subject == body["sub"], name

    read = token.verify(forge(claims(role="admin", nested={ "a": [1, 2.5, None, True] }, aud="", nbf=now - 60)))

    assert read.facts == { "role": "admin", "nested": { "a": [1, 2.5, None, True] }, "aud": "", "nbf": now - 60 }
    assert read.issued == now and read.expires == now + 60 and read.id == "j1" and RESERVED.isdisjoint(read.facts)
    assert token.verify(forge(claims(iat=now - 1.5, exp=now + 60.5))).issued == now - 2

    for kind in (7, None, ["access"], "Access", ""): assert reason(forge(claims(kind=kind))) == "token.kind", kind

    assert reason(forge(claims()), "refresh") == "token.kind" and token.verify(forge(claims(kind="magic")), "magic").kind == "magic"

    for print_ in (7, True, ["x"], { "a": 1 }, "", "wrong"):

        assert reason(forge(claims(fp=print_))) == "token.fingerprint", print_
        assert reason(forge(claims(fp=print_)), "access", "ua|ip") == "token.fingerprint", print_

    assert token.verify(forge(claims(fp=None)), "access", "ua|ip").subject == "u"

def test_the_clock_decides_at_the_leeway_edge () -> None:

    token.setup(SECRET, issuer="tests", access=60, refresh=120)

    start = datetime(2026, 1, 1, tzinfo=UTC)

    try:

        date.freeze(start)

        now = int(date.stamp())

        assert reason(forge(claims(exp=now - LEEWAY))) == "token.expired"
        assert reason(forge(claims(exp=now - LEEWAY - 86400))) == "token.expired"
        assert reason(forge(claims(exp=now - LEEWAY + 0.5, iat=now - 60)).replace("A", "B", 1)) == "token.invalid"
        assert token.verify(forge(claims(exp=now - LEEWAY + 1))).expires == now - LEEWAY + 1
        assert token.verify(forge(claims(iat=now + LEEWAY))).issued == now + LEEWAY
        assert reason(forge(claims(iat=now + LEEWAY + 1))) == "token.invalid"
        assert token.verify(forge(claims(nbf=now + LEEWAY))).subject == "u"
        assert reason(forge(claims(nbf=now + LEEWAY + 1))) == "token.invalid"
        assert reason(forge(claims(exp=now - 3600), None, rand.token(48))) == "token.invalid"
        assert reason(forge(claims(exp=now - 3600, kind="refresh"))) == "token.expired"

        pair = token.pair("user-1")
        read = token.verify(pair.access)

        assert read.issued == now and read.expires == now + 60 and token.verify(pair.refresh, "refresh").expires == now + 120

        date.freeze(start + timedelta(seconds=60 + LEEWAY - 1))

        assert token.verify(pair.access).subject == "user-1"

        date.freeze(start + timedelta(seconds=60 + LEEWAY))

        assert reason(pair.access) == "token.expired" and token.verify(pair.refresh, "refresh").subject == "user-1"

        renewed = token.refresh(pair.refresh)

        assert token.verify(renewed.access).issued == now + 60 + LEEWAY

        date.freeze(start + timedelta(seconds=120 + LEEWAY))

        with pytest.raises(Fault) as late: token.refresh(pair.refresh)

        assert late.value.reason == "token.expired"

        date.freeze(start - timedelta(seconds=LEEWAY + 1))

        assert reason(pair.access) == "token.invalid"

    finally: date.freeze(None)

def test_setup_refuses_weak_or_foreign_configuration () -> None:

    for algorithm, (_, least) in DIGESTS.items():

        with pytest.raises(Fault) as weak: Token().setup("k" * (least - 1), algorithm=algorithm)

        assert weak.value.code is Code.INTERNAL and weak.value.reason == "token.secret"

        strong = Token()

        strong.setup("k" * least, algorithm=algorithm)

        assert strong.verify(strong.issue("u")).subject == "u" and strong.describe()["algorithm"] == algorithm

    wide = Token()

    wide.setup("é" * 16)

    assert wide.verify(wide.issue("u")).subject == "u"

    with pytest.raises(Fault) as narrow: Token().setup("é" * 15 + "k")

    assert narrow.value.reason == "token.secret"

    for algorithm in ("none", "None", "", "hs256", "RS256", "ES256", "PS256", "EdDSA", "HS1"):

        with pytest.raises(Fault) as foreign: Token().setup(SECRET, algorithm=algorithm)

        assert foreign.value.code is Code.INTERNAL and foreign.value.reason == "token.algorithm", algorithm

    kept = Token()

    kept.setup(SECRET, issuer="kept")

    made = kept.issue("u")

    with pytest.raises(Fault): kept.setup("short")
    with pytest.raises(Fault): kept.setup(SECRET, algorithm="RS256")

    assert kept.verify(made).subject == "u" and kept.describe()["issuer"] == "kept"

    idle = Token()

    assert not idle.ready()

    for call in (lambda: idle.issue("u"), lambda: idle.pair("u"), lambda: idle.verify(made), lambda: idle.refresh(made)):

        with pytest.raises(Fault) as unready: call()

        assert unready.value.code is Code.INTERNAL and unready.value.reason == "token.setup"

    assert idle.peek(made)["sub"] == "u"

def test_reserved_claims_stay_with_the_engine () -> None:

    crypto.setup([crypto.key("k1")])
    token.setup(SECRET, issuer="tests")

    held = token.pair("user-1", "ua|ip")

    for name in sorted(RESERVED):

        forged: dict[str, Any] = { name: "forged" }

        with pytest.raises(Fault) as plain: token.pair("u", **forged)
        with pytest.raises(Fault) as bound: token.pair("u", "ua|ip", **forged)
        with pytest.raises(Fault) as renewed: token.refresh(held.refresh, "ua|ip", **forged)

        for taken in (plain, bound, renewed):

            assert taken.value.code is Code.INTERNAL and taken.value.reason == "token.claim"
            assert taken.value.errors == { "claims": [name] }

        if name == "kind": continue

        with pytest.raises(Fault) as issued: token.issue("u", "access", None, **forged)

        assert issued.value.reason == "token.claim" and issued.value.errors == { "claims": [name] }

    with pytest.raises(Fault) as many: token.issue("u", sub="x", exp=1, role="admin")

    assert many.value.errors == { "claims": ["exp", "sub"] }

    made = token.issue("مستخدم-واحد", role="admin", tenant=None, nested={ "name": "名前", "list": [1, 2] })
    read = token.verify(made)

    assert read.subject == "مستخدم-واحد" and read.facts == { "role": "admin", "tenant": None, "nested": { "name": "名前", "list": [1, 2] } }
    assert read.get("role") == "admin" and read.get("missing", 7) == 7 and len(read.id) == 32

    assert len({ token.peek(token.issue("u"))["jti"] for _ in range(256) }) == 256

def test_refresh_rotates_and_peek_never_trusts () -> None:

    crypto.setup([crypto.key("k1")])
    token.setup(SECRET, issuer="tests", access=60, refresh=120)

    pair = token.pair("user-1", "ua|ip", role="admin")

    with pytest.raises(Fault) as wrong: token.refresh(pair.access, "ua|ip")

    assert wrong.value.reason == "token.kind"

    with pytest.raises(Fault) as unbound: token.refresh(pair.refresh)

    assert unbound.value.reason == "token.fingerprint"

    with pytest.raises(Fault) as stolen: token.refresh(pair.refresh, "ua|other")

    assert stolen.value.reason == "token.fingerprint"

    renewed = token.refresh(pair.refresh, "ua|ip", role="member")

    assert token.peek(renewed.refresh)["jti"] != token.peek(pair.refresh)["jti"] and renewed.expires == 60
    assert token.verify(renewed.access, "access", "ua|ip").get("role") == "member" and "role" not in token.peek(renewed.refresh)
    assert reason(renewed.access, "access", "ua|other") == "token.fingerprint"

    loose = token.refresh(token.pair("user-2").refresh, "ua|ip")

    assert token.verify(loose.access, "access", "ua|ip").subject == "user-2" and reason(loose.access) == "token.fingerprint"

    signed, _, mark = pair.access.rpartition(".")
    tampered        = signed + "." + mark[::-1]

    assert reason(tampered, "access", "ua|ip") == "token.invalid" and token.peek(tampered)["sub"] == "user-1"

    for text in ("", "a", "a.b", "a.b.c", "a..c", "é.é.é", signed + "." + mark + ".x", "a." + pack(b"[1]") + ".c", "x" * (LONGEST + 1)):

        with pytest.raises(Fault) as garbage: token.peek(text)

        assert garbage.value.code is Code.UNAUTHORIZED and garbage.value.reason == "token.invalid", text

def test_key_rotation_retirement_and_audience_are_enforced () -> None:

    keeper = Token()

    keeper.setup(SECRET, issuer="tests", audience="orders")
    keeper.rotate({ "old": SECRET }, "old")

    old = keeper.issue("u")

    keeper.rotate({ "old": SECRET, "new": "n" * 32 }, "new")

    fresh = keeper.issue("u")

    assert keeper.verify(old).subject == keeper.verify(fresh).subject == "u"
    assert jwt.decode(fresh, "n" * 32, algorithms=["HS256"], audience="orders", issuer="tests")["sub"] == "u"

    foreign = jwt.encode(claims(aud="billing"), "n" * 32, algorithm="HS256", headers={ "kid": "new" })
    unknown = jwt.encode(claims(aud="orders"), "n" * 32, algorithm="HS256", headers={ "kid": "../../new" })
    missing = jwt.encode(claims(aud="orders"), "n" * 32, algorithm="HS256")
    mixed   = jwt.encode(claims(aud=["orders", 1]), "n" * 32, algorithm="HS256", headers={ "kid": "new" })

    for refused in (foreign, unknown, missing, mixed):

        with pytest.raises(Fault): keeper.verify(refused)

    keeper.rotate({ "new": "n" * 32 }, "new")

    with pytest.raises(Fault): keeper.verify(old)
    with pytest.raises(Fault): keeper.issue("u", aud="billing")
    with pytest.raises(Fault): keeper.rotate({ "bad": "short" }, "bad")

    assert keeper.verify(fresh).subject == "u"


FORMATS = ("jwt", "paseto", "opaque")

def make_issuer ( format_: str, purpose: str = "access", **options: Any ) -> Issuer:

    key = b"k" * 32 if format_ != "opaque" else None

    return token.options(format=format_, purpose=purpose, secret=key, issuer="tests", **options)

def memory () -> Cache:

    return Cache(Memory())

@pytest.mark.parametrize("format_", FORMATS)
async def test_scoped_formats_share_issue_verify_without_changing_the_default ( format_: str ) -> None:

    token.setup(SECRET, issuer="legacy")
    original = token.issue("old")
    cache    = memory()
    kwargs: dict[str, Any] = { "store": cache } if format_ == "opaque" else {}
    access   = make_issuer(format_, ttl=45, audience="receiver", **kwargs)
    refresh  = make_issuer(format_, purpose="refresh", ttl=120, audience="receiver", **kwargs)
    made     = await access.issue("u", fingerprint="device", roles=["reader"], nested={ "a": [1, True, None] })
    read     = await access.verify(made, fingerprint="device")

    assert read.subject == "u" and read.purpose == read.kind == "access"
    assert read.expires - read.issued == 45 and read.get("roles") == ["reader"]
    assert read.get("nested") == { "a": [1, True, None] } and read.get("aud") == "receiver"
    assert token.verify(original).subject == "old" and token.describe()["issuer"] == "legacy"
    assert access.format == format_ and refresh.purpose == "refresh" and access.ttl == 45
    assert access.can("verify") and not access.can("invented")
    assert access.describe()["purpose"] == "access" and "secret" not in access.describe()
    assert await refresh.issue("u") != made

    with pytest.raises(Fault): await refresh.verify(made, fingerprint="device")
    with pytest.raises(Fault): await access.verify(made, fingerprint="other")
    with pytest.raises(Fault): await access.verify(made)

    if format_ == "jwt": assert access.peek(made)["sub"] == "u"
    else:

        with pytest.raises(Fault) as unsupported: access.peek(made)

        assert unsupported.value.reason == "token.capability"

@pytest.mark.parametrize("format_", FORMATS)
async def test_scoped_expiry_future_claims_and_wrong_audience ( format_: str ) -> None:

    cache  = memory()
    kwargs: dict[str, Any] = { "store": cache } if format_ == "opaque" else {}
    access = make_issuer(format_, audience="receiver", ttl=60, leeway=0, **kwargs)
    other  = make_issuer(format_, audience="another", **kwargs)
    start  = datetime(2026, 1, 1, tzinfo=UTC)

    try:

        date.freeze(start)
        made = await access.issue("u")

        with pytest.raises(Fault): await other.verify(made)

        date.freeze(start + timedelta(seconds=59))
        assert (await access.verify(made)).subject == "u"
        date.freeze(start + timedelta(seconds=60))

        with pytest.raises(Fault) as expired: await access.verify(made)

        assert expired.value.reason == "token.expired"

        date.freeze(start - timedelta(seconds=1))

        with pytest.raises(Fault): await access.verify(made)

    finally: date.freeze(None)

@pytest.mark.parametrize("format_", ["jwt", "paseto"])
async def test_scoped_rotation_is_independent_and_retires_old_keys ( format_: str ) -> None:

    source = make_issuer(format_)
    first  = source.rotate({ "old": b"a" * 32 }, "old")
    old    = await first.issue("u")
    next_  = first.rotate({ "old": b"a" * 32, "new": b"b" * 32 }, "new")
    fresh  = await next_.issue("u")

    assert (await next_.verify(old)).subject == (await next_.verify(fresh)).subject == "u"

    with pytest.raises(Fault): await first.verify(fresh)

    last = next_.rotate({ "new": b"b" * 32 }, "new")

    with pytest.raises(Fault): await last.verify(old)
    with pytest.raises(Fault): next_.rotate({ "bad": b"short" }, "bad")

    assert (await next_.verify(fresh)).subject == "u"

async def test_public_paseto_uses_distinct_signing_and_verifying_keys () -> None:

    key = Ed25519PrivateKey.generate()
    private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public  = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    signer  = token.options(format="paseto", secret=private, protection="public", issuer="tests")
    reader  = token.options(format="paseto", secret=public, protection="public", issuer="tests")
    made    = await signer.issue("u", role="reader")
    seen    = await reader.verify(made)

    assert made.startswith("v4.public.") and seen.get("role") == "reader"
    assert signer.can("issue") and reader.can("verify") and not reader.can("issue")
    assert reader.can("signed") and not reader.can("encrypted")

    with pytest.raises(Fault) as cannot_sign: await reader.issue("u")

    assert cannot_sign.value.reason == "token.capability"
    details = reader.describe()["adapter"]

    assert isinstance(details, dict) and "issue" not in details["capabilities"]

    with pytest.raises(Fault): await make_issuer("paseto").verify(made)

    foreign = pyseto.Key.new(4, "public", public)
    decoded = pyseto.decode(foreign, made)
    wire    = json.decode(cast("bytes", decoded.payload))

    assert wire["kind"] == "access" and isinstance(wire["exp"], str)

async def test_paseto_bidirectional_interop_uses_rfc3339_and_fixed_version () -> None:

    access = make_issuer("paseto")
    key    = pyseto.Key.new(4, "local", b"k" * 32)
    made   = await access.issue("u", nbf=int(date.stamp()) - 1)
    found  = json.decode(cast("bytes", pyseto.decode(key, made).payload))

    assert found["sub"] == "u" and found["iat"].endswith("Z") and found["exp"].endswith("Z")

    raw = { **claims(), "iat": date.iso(date.now() - timedelta(seconds=10)), "exp": date.iso(date.now() + timedelta(seconds=60)) }
    foreign = pyseto.encode(key, json.encode(raw)).decode()

    assert (await access.verify(foreign)).subject == "u"

    for changed in (made.replace("v4.", "v3.", 1), made + "=", made + ".", made + ".YQ", made.replace("local", "public", 1)):

        with pytest.raises(Fault): await access.verify(changed)

    for instant_ in (1, True, None, "2026-01-01", "2026-01-01T00:00:00", "2026-99-99T00:00:00Z"):

        broken = pyseto.encode(key, json.encode({ **raw, "exp": instant_ })).decode()

        with pytest.raises(Fault): await access.verify(broken)

def test_paseto_binds_its_implicit_assertion () -> None:

    key     = Ed25519PrivateKey.generate()
    private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public  = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    body    = { "sub": "u", "role": "reader" }

    for protection, sealing, reading in (("local", b"k" * 32, b"k" * 32), ("public", private, public)):

        made = Paseto(sealing, protection, assertion=b"tenant-1").encode(body)

        assert Paseto(reading, protection, assertion=b"tenant-1").decode(made) == body

        for other in (b"tenant-2", b""):

            with pytest.raises(Fault): Paseto(reading, protection, assertion=other).decode(made)

async def test_opaque_records_are_detached_scoped_and_never_store_plain_tokens () -> None:

    cache  = memory()
    access = make_issuer("opaque", store=cache)
    nested = { "x": [1] }
    made   = await access.issue("u", nested=nested)
    key    = access.key(made)
    stored = await cache.get(key)

    assert type(stored) is bytes and made not in key and made.encode() not in stored
    assert key.endswith(token.hash_opaque(made))
    nested["x"].append(2)

    seen = await access.verify(made)

    assert seen.get("nested") == { "x": [1] }
    seen.facts["nested"]["x"].append(3)
    assert (await access.verify(made)).get("nested") == { "x": [1] }

    other = token.options(format="opaque", purpose="reset", issuer="tests", store=cache)

    with pytest.raises(Fault): await other.verify(made)

    same = make_issuer("opaque", store=cache)

    assert (await same.verify(made)).id == seen.id
    await cache.forget(key)

    with pytest.raises(Fault): await access.verify(made)

    with pytest.raises(Fault): access.rotate({ "x": b"k" * 32 }, "x")

@pytest.mark.parametrize("format_", FORMATS)
async def test_scoped_size_and_input_refusals ( format_: str ) -> None:

    kwargs: dict[str, Any] = { "store": memory() } if format_ == "opaque" else {}
    access = make_issuer(format_, **kwargs)

    subjects: list[object] = [None, 1, True, [], "s" * (LONGEST + 1)]

    for subject in subjects:

        with pytest.raises(Fault): await access.issue(cast("str", subject))

    for lifetime in (True, "60", 1.5, 2 ** 63):

        with pytest.raises(Fault): await access.issue("u", ttl=cast("int", lifetime))

    with pytest.raises(Fault): await access.issue("u", data="x" * LONGEST)
    with pytest.raises(Fault): await access.issue("u", kind="reset")

    inputs: list[object] = [None, 1, [], "", "x" * (LONGEST + 1), "é", "a.b.c"]

    for raw in inputs:

        with pytest.raises(Fault): await access.verify(cast("str", raw))

@pytest.mark.parametrize("settings_", [
    { "format": "unknown" }, { "purpose": "" }, { "purpose": [] }, { "issuer": "" }, { "issuer": True },
    { "ttl": True }, { "ttl": 0 }, { "ttl": -1 }, { "ttl": 2 ** 63 }, { "leeway": -1 }, { "leeway": True },
    { "audience": "" }, { "audience": [] }, { "format": "opaque" }, { "format": "paseto", "secret": b"x" * 31 },
    { "format": "paseto", "secret": b"x" * 33 }, { "format": "paseto", "secret": b"x" * 32, "algorithm": "HS256" },
    { "format": "jwt", "protection": "local" }, { "store": memory() },
])
def test_scoped_configuration_fails_before_work ( settings_: dict[str, Any] ) -> None:

    with pytest.raises(Fault): token.options(**{ "secret": b"k" * 32, **settings_ })

async def test_opaque_collision_is_atomic_and_bounded ( monkeypatch: pytest.MonkeyPatch ) -> None:

    cache  = memory()
    access = make_issuer("opaque", store=cache)
    held   = rand.token(32)
    calls  = 0

    def fixed ( _size: int, *, secure: bool = False ) -> str:

        nonlocal calls
        calls += 1

        assert secure

        return held

    monkeypatch.setattr(rand, "token", fixed)
    made = await access.issue("first")

    with pytest.raises(Fault) as collision: await access.issue("second")

    assert collision.value.reason == "token.collision" and calls == 4
    assert made == held and (await access.verify(held)).subject == "first"

async def test_opaque_cancellation_propagates_without_issuing_a_result () -> None:

    class Waiting:

        def __init__ ( self ) -> None:

            self.started = asyncio.Event()
            self.finished = False

        async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool:

            self.started.set()

            try: await asyncio.Event().wait()
            finally: self.finished = True

            return True

        async def get ( self, key: str, default: Any = None ) -> Any:

            self.started.set()

            try: await asyncio.Event().wait()
            finally: self.finished = True

            return default

    store  = Waiting()
    access = make_issuer("opaque", store=store)

    for work in (access.issue("u"), access.verify(rand.token(32))):

        store.started.clear()
        store.finished = False
        task = asyncio.create_task(work)
        await store.started.wait()
        task.cancel()

        with pytest.raises(asyncio.CancelledError): await task

        assert store.finished

def test_setup_publication_keeps_an_inflight_pair_on_one_snapshot ( monkeypatch: pytest.MonkeyPatch ) -> None:

    client = Token()
    client.setup("a" * 32, issuer="old", access=60, refresh=120)
    original = rand.hex
    changed = False

    def change ( size: int, *, secure: bool = False ) -> str:

        nonlocal changed

        if not changed:

            changed = True
            client.setup("b" * 32, issuer="new", access=90, refresh=180)

        assert secure

        return original(size, secure=secure)

    monkeypatch.setattr(rand, "hex", change)
    pair = client.pair("u")
    checker = Token()
    checker.setup("a" * 32, issuer="old")

    assert pair.expires == 60
    assert checker.verify(pair.access).expires - checker.verify(pair.access).issued == 60
    assert checker.verify(pair.refresh, "refresh").expires - checker.verify(pair.refresh, "refresh").issued == 120
    assert client.describe()["issuer"] == "new"

async def test_opaque_concurrent_issuers_never_overwrite_each_other () -> None:

    cache = memory()
    left  = make_issuer("opaque", store=cache)
    right = make_issuer("opaque", store=cache)

    async def use ( index: int ) -> tuple[str, str]:

        issuer = left if index % 2 else right
        made = await issuer.issue(str(index))
        seen = await issuer.verify(made)

        return made, seen.subject

    found = await asyncio.gather(*(use(i) for i in range(100)))

    assert len({raw for raw, _ in found}) == 100
    assert [subject for _, subject in found] == [str(i) for i in range(100)]

async def test_storage_failures_are_distinct_from_invalid_tokens () -> None:

    class Broken:

        async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool:

            raise OSError("private backend address")

        async def get ( self, key: str, default: Any = None ) -> Any:

            raise OSError("private backend address")

    access = make_issuer("opaque", store=Broken())

    for work in (access.issue("u"), access.verify(rand.token(32))):

        with pytest.raises(Fault) as caught: await work

        assert caught.value.code is Code.UNAVAILABLE
        assert caught.value.reason == "token.store"
        assert "private backend address" not in str(caught.value)

async def test_opaque_record_corruption_expiry_and_backend_fault_are_not_bypassed () -> None:

    cache = memory()
    access = make_issuer("opaque", store=cache, leeway=0)
    made = await access.issue("u")
    key = access.key(made)
    raw = await cache.get(key)

    corruptions: list[object] = [{}, [], b"not-json", b"[]", b"x" * (LONGEST + 1)]

    for corrupt in corruptions:

        await cache.set(key, corrupt)

        with pytest.raises(Fault) as caught: await access.verify(made)

        assert caught.value.code is Code.UNAUTHORIZED

    body = json.decode(raw)
    body["exp"] = int(date.stamp()) - 1
    await cache.set(key, json.encode(body), ttl=60)

    with pytest.raises(Fault) as expired: await access.verify(made)

    assert expired.value.reason == "token.expired"

@pytest.mark.parametrize("format_", FORMATS)
async def test_foreign_formats_and_reserved_configuration_never_fall_back ( format_: str ) -> None:

    cache = memory()
    scopes = {
        name: make_issuer(name, **cast("dict[str, Any]", {"store": cache} if name == "opaque" else {}))
        for name in FORMATS
    }
    selected = scopes[format_]

    for name, scope in scopes.items():

        made = await scope.issue("u")

        if name == format_: assert (await selected.verify(made)).subject == "u"
        else:

            with pytest.raises(Fault): await selected.verify(made)

    for claimed in ("format", "purpose"):

        with pytest.raises(Fault): await selected.issue("u", **cast("dict[str, Any]", {claimed: "refresh"}))

@pytest.mark.parametrize("adapter", [Jwt, Paseto])
def test_key_selection_requires_an_explicit_keyring ( adapter: type[Jwt | Paseto] ) -> None:

    with pytest.raises(Fault): adapter(b"k" * 32, active="missing")

@pytest.mark.parametrize(("algorithm", "size"), [("HS256", 32), ("HS384", 48), ("HS512", 64)])
async def test_prepared_hmac_isolation_across_parallel_callers ( algorithm: str, size: int ) -> None:

    key = rand.token(size)
    issuer = token.options(secret=key, algorithm=algorithm, issuer="workers")

    adapter = Jwt(key, algorithm)

    def work ( index: int ) -> str:

        payload = {"value": index}
        made = adapter.encode(payload)

        for _ in range(100):

            made = adapter.encode(payload)
            assert adapter.decode(made) == payload

        return made

    encoded = await asyncio.gather(*(asyncio.to_thread(work, i) for i in range(4)))

    assert len(set(encoded)) == 4
    made = await issuer.issue("u")
    assert (await issuer.verify(made)).subject == "u"

@pytest.mark.parametrize("format_", ["jwt", "opaque", "paseto"])
async def test_seed_cannot_repeat_token_identity_or_opaque_credential ( format_: str ) -> None:

    owner = make_issuer(format_, store=memory()) if format_ == "opaque" else make_issuer(format_)

    try:

        rand.seed(123)
        first = await owner.issue("u")
        rand.seed(123)
        second = await owner.issue("u")

        assert first != second
        assert (await owner.verify(first)).id != (await owner.verify(second)).id

        rand.seed(123)
        legacy = token.opaque().plain
        rand.seed(123)

        assert legacy != token.opaque().plain

    finally: rand.seed(None)
