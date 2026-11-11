from datetime import datetime, timedelta, UTC
from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.json import json
from engine.rand import rand
from engine.token import Token, token
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
        assert found["exp"] - found["iat"] == 60 and len(found["jti"]) == 16

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
    assert read.get("role") == "admin" and read.get("missing", 7) == 7 and len(read.id) == 16

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
