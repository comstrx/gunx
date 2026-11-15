from engine.error import Fault
from engine.json import json
from engine.token import Issuer, Token
from engine.cache import Cache, Memory
from collections.abc import Coroutine
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
import asyncio
from engine.token.arch import LEEWAY, REQUIRED, RESERVED
from engine.token.claims import Claims
from contextlib import suppress
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any
import base64, hmac, jwt, time

EXAMPLES = 4000
SECRET   = "fuzz-secret-" + "k" * 40
HEAD     = { "alg": "HS256", "typ": "JWT" }
WHOLE    = 2 ** 63
token    = Token()

token.setup(SECRET, issuer="fuzz", access=600, refresh=3600)

held    = token.issue("user-7", "access")
scalar  = st.none() | st.booleans() | st.integers(-WHOLE, WHOLE - 1) | st.floats(allow_nan=False, allow_infinity=False) | st.text(max_size=12)
value   = st.recursive(scalar, lambda inner: st.lists(inner, max_size=3) | st.dictionaries(st.text(max_size=6), inner, max_size=3), max_leaves=6)
moment  = st.tuples(st.sampled_from([-10 ** 9, -86400, -3600, 3600, 86400, 10 ** 9]), st.sampled_from([0, 0.25]))
passed  = st.tuples(st.sampled_from([-10 ** 9, -86400, -3600, 0]), st.sampled_from([0, 0.25]))
coming  = st.tuples(st.sampled_from([3600, 86400, 10 ** 9]), st.sampled_from([0, 0.25]))
kinds   = st.sampled_from(["access", "refresh", "magic"])
names   = st.text(min_size=1, max_size=8).filter(lambda name: name not in RESERVED and name not in ("nbf", "aud"))
extras  = names.filter(lambda name: name not in ("self", "subject", "kind", "ttl", "fingerprint"))
wild    = st.fixed_dictionaries({}, optional={
    "sub": st.text(max_size=12) | value, "iss": st.just("fuzz") | value, "iat": moment | value, "exp": moment | value,
    "jti": st.text(max_size=12) | value, "kind": kinds | value, "nbf": moment | value, "aud": value, "fp": value,
    "role": value,
})
sound: st.SearchStrategy[dict[str, Any]] = st.fixed_dictionaries(
    { "sub": st.text(max_size=24), "iss": st.just("fuzz"), "iat": passed, "exp": coming, "jti": st.text(max_size=24), "kind": kinds },
    optional={ "nbf": passed, "aud": st.sampled_from([None, "", []]) },
)
heads   = st.fixed_dictionaries({}, optional={
    "alg": st.sampled_from(["HS256", "HS384", "HS512", "none", "hs256", "RS256"]) | value, "typ": st.just("JWT") | value,
    "kid": st.text(max_size=8) | value, "cty": st.text(max_size=8) | value, "crit": value, "b64": value, "zip": value,
    "x5u": value,
})

def pack ( raw: bytes ) -> str:

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

def forge ( body: object, head: object = HEAD ) -> str:

    signed = pack(json.encode(head)) + "." + pack(json.encode(body))

    return signed + "." + pack(hmac.digest(SECRET.encode(), signed.encode(), "sha256"))

def settle ( body: dict[str, Any] ) -> dict[str, Any]:

    now = int(time.time())

    return { name: now + found[0] + found[1] if type(found) is tuple else found for name, found in body.items() }

def reference ( text: str ) -> dict[str, Any] | None:

    try:

        return dict(jwt.decode(
            text, SECRET, algorithms=["HS256"], issuer="fuzz", leeway=LEEWAY, options={ "require": list(REQUIRED) },
        ))

    except (jwt.InvalidTokenError, TypeError, ValueError, OverflowError): return None

def verdict ( text: str, kind: object ) -> Claims | None:

    try: return token.verify(text, kind if type(kind) is str else "access")
    except Fault: return None

def agree ( read: Claims, body: dict[str, Any], expected: dict[str, Any] ) -> None:

    assert read.subject == expected["sub"] == body["sub"]
    assert read.id == expected["jti"]
    assert read.kind == expected["kind"]
    assert read.issued == int(expected["iat"])
    assert read.expires == int(expected["exp"])
    assert read.facts == { name: found for name, found in expected.items() if name not in RESERVED }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=120), st.sampled_from(["access", "refresh", "", "other"]))
def a_foreign_token_is_refused ( text: str, kind: str ) -> None:

    counts["a_foreign_token_is_refused"] = counts.get("a_foreign_token_is_refused", 0) + 1

    for reader in (token.verify, token.refresh):

        try: reader(text, kind) if reader == token.verify else reader(text)
        except Fault: continue

        raise AssertionError(text)

    with suppress(Fault): token.peek(text)

    token.bearer(text)
    token.matches(text, text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(min_value=0, max_value=len(held) - 1), st.characters(codec="ascii"))
def a_tampered_token_is_refused ( index: int, letter: str ) -> None:

    counts["a_tampered_token_is_refused"] = counts.get("a_tampered_token_is_refused", 0) + 1

    forged = held[:index] + letter + held[index + 1:]

    if forged == held: return

    assert verdict(forged, "access") is None, forged

@settings(max_examples=EXAMPLES // 10, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(min_size=1, max_size=40), st.sampled_from(["access", "refresh"]), st.text(max_size=20), st.dictionaries(extras, value, max_size=3))
def an_issued_token_verifies ( subject: str, kind: str, device: str, facts: dict[str, Any] ) -> None:

    counts["an_issued_token_verifies"] = counts.get("an_issued_token_verifies", 0) + 1

    made = token.issue(subject, kind, None, **facts)
    read = token.verify(made, kind)
    seen = reference(made)

    assert read.subject == subject
    assert read.facts == facts
    assert seen is not None
    assert seen["sub"] == subject

    pair = token.pair(subject, device or None, **facts)

    assert token.verify(pair.access, "access", device or None).facts == facts
    assert token.refresh(pair.refresh, device or None).expires == 600

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(wild)
def the_engine_is_never_laxer_than_the_reference ( drawn: dict[str, Any] ) -> None:

    counts["the_engine_is_never_laxer_than_the_reference"] = counts.get("the_engine_is_never_laxer_than_the_reference", 0) + 1

    body = settle(drawn)
    text = forge(body)
    read = verdict(text, body.get("kind"))

    if read is None: return

    seen = reference(text)

    assert seen is not None, body

    agree(read, body, seen)

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(sound, st.dictionaries(names, value, max_size=3), st.none() | st.text(max_size=8))
def a_sound_reference_token_is_accepted ( drawn: dict[str, Any], facts: dict[str, Any], key: str | None ) -> None:

    counts["a_sound_reference_token_is_accepted"] = counts.get("a_sound_reference_token_is_accepted", 0) + 1

    body = { **facts, **settle(drawn) }
    text = jwt.encode(body, SECRET, algorithm="HS256", headers={ "kid": key } if key is not None else None)
    read = verdict(text, body["kind"])

    assert read is not None, body
    assert reference(text) is not None, body

    agree(read, body, body)

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(heads)
def a_strange_header_never_opens_more ( head: dict[str, Any] ) -> None:

    counts["a_strange_header_never_opens_more"] = counts.get("a_strange_header_never_opens_more", 0) + 1

    body = settle({ "sub": "u", "iss": "fuzz", "iat": (-60, 0), "exp": (3600, 0), "jti": "j", "kind": "access" })
    text = forge(body, head)

    if verdict(text, "access") is None: return

    assert reference(text) is not None, head
    assert head.get("alg") == "HS256", head

loop = asyncio.new_event_loop()
store = Cache(Memory())
private = Ed25519PrivateKey.generate().private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
issuers = {
    "jwt": token.options(format="jwt", secret=b"k" * 32, issuer="fuzz", audience="api"),
    "opaque": token.options(format="opaque", store=store, issuer="fuzz", audience="api"),
    "local": token.options(format="paseto", secret=b"k" * 32, issuer="fuzz", audience="api"),
    "public": token.options(format="paseto", protection="public", secret=private, issuer="fuzz", audience="api"),
}
counts: dict[str, int] = {}

def run [T] ( work: Coroutine[Any, Any, T] ) -> T:

    return loop.run_until_complete(work)

async def remove ( issuer: Issuer, text: str ) -> None:

    if issuer.format == "opaque": await store.forget(issuer.key(text))

@settings(max_examples=1000, deadline=None, database=None)
@given(st.sampled_from(tuple(issuers)), st.text(max_size=48), st.dictionaries(extras, value, max_size=3))
def scoped_roundtrips ( name: str, subject: str, facts: dict[str, Any] ) -> None:

    counts["scoped_roundtrips"] = counts.get("scoped_roundtrips", 0) + 1

    async def exercise () -> None:

        issuer = issuers[name]
        made = await issuer.issue(subject, fingerprint="device", **facts)

        try:

            result = await issuer.verify(made, fingerprint="device")
            assert result.subject == subject
            assert result.purpose == "access" and result.get("aud") == "api"
            assert result.facts == { **facts, "aud": "api" }

            for other in issuers.values():

                if other is issuer: continue

                try: await other.verify(made, fingerprint="device")
                except Fault: continue

                raise AssertionError("cross-format token accepted")

        finally: await remove(issuer, made)

    run(exercise())

@settings(max_examples=2000, deadline=None, database=None)
@given(st.sampled_from(tuple(issuers)), st.integers(0, 10000), st.integers(1, 127))
def scoped_mutations ( name: str, position: int, delta: int ) -> None:

    counts["scoped_mutations"] = counts.get("scoped_mutations", 0) + 1

    async def exercise () -> None:

        issuer = issuers[name]
        made = await issuer.issue("u")

        try:

            index = position % len(made)
            changed = made[:index] + chr((ord(made[index]) + delta) % 128) + made[index + 1:]

            try: await issuer.verify(changed)
            except Fault: return

            raise AssertionError("modified token accepted")

        finally: await remove(issuer, made)

    run(exercise())

@settings(max_examples=1000, deadline=None, database=None)
@given(st.sampled_from(tuple(issuers)), st.text(max_size=200))
def scoped_foreign_inputs ( name: str, text: str ) -> None:

    counts["scoped_foreign_inputs"] = counts.get("scoped_foreign_inputs", 0) + 1

    try: run(issuers[name].verify(text))
    except Fault: return

    raise AssertionError("foreign token accepted")

@settings(max_examples=500, deadline=None, database=None)
@given(st.sampled_from(("jwt", "local")), st.binary(min_size=32, max_size=32), st.binary(min_size=32, max_size=32))
def scoped_rotation ( name: str, before: bytes, after: bytes ) -> None:

    counts["scoped_rotation"] = counts.get("scoped_rotation", 0) + 1

    async def exercise () -> None:

        original = issuers[name].rotate({ "old": before }, "old")
        made = await original.issue("u")
        current = original.rotate({ "old": before, "new": after }, "new")
        fresh = await current.issue("v")

        assert (await current.verify(made)).subject == "u"
        assert (await current.verify(fresh)).subject == "v"

        retired = current.rotate({ "new": after }, "new")

        try: await retired.verify(made)
        except Fault: return

        raise AssertionError("retired key accepted")

    run(exercise())

try:

    for check in (
        a_foreign_token_is_refused, a_tampered_token_is_refused, an_issued_token_verifies,
        the_engine_is_never_laxer_than_the_reference, a_sound_reference_token_is_accepted,
        a_strange_header_never_opens_more, scoped_roundtrips, scoped_mutations,
        scoped_foreign_inputs, scoped_rotation,
    ): check()

finally:

    run(store.close())
    loop.close()

print("fuzz token  observed_examples=" + str(sum(counts.values())) + "  properties=" + str(len(counts)) + "  ok")
print(counts)
