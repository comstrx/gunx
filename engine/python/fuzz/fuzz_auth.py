from engine.auth import Actor, Auth, Relay
from engine.auth.arch import CODE, GRANTS, HEADERS, IDENT, SUBJECT, TAKEN
from engine.cache import Cache, Memory
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.log import log
from engine.token import Claims, token
from collections.abc import Awaitable, Callable, Coroutine
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, cast
import asyncio, fnmatch

type Made[T] = T | Fault

EXAMPLES = 600
RELAYED  = "relay-secret-for-the-fuzz-00000000000001"
WORDS    = st.one_of(st.text(max_size=12), st.sampled_from(["a.*", "a?", "a.[bc]", "*", "orders.read", "a,b", "a b", "", "x" * (IDENT + 1), "é", "\n"]))
GRANTED  = st.one_of(st.lists(WORDS, max_size=6), st.just(["r"] * (GRANTS + 1)), WORDS, st.none(), st.integers())
IDS      = st.one_of(st.text(max_size=16), st.sampled_from(["", "u1", "x" * (IDENT + 1), "a\nb", "\x00"]), st.integers(), st.none())
TENANTS  = st.one_of(st.none(), st.text(max_size=8), st.integers(), st.just("x" * (IDENT + 1)))
FACTS    = st.one_of(st.none(), st.dictionaries(st.one_of(st.text(max_size=6), st.sampled_from(sorted(TAKEN))), st.one_of(st.integers(), st.text(max_size=4), st.none()), max_size=3), st.lists(st.integers(), max_size=2))
NAMES    = st.from_regex(r"[A-Za-z0-9_.:-]{1,12}", fullmatch=True)
SCOPES   = st.lists(st.from_regex(r"[a-z.*?]{1,8}", fullmatch=True), max_size=5)
REQUESTS = st.one_of(st.from_regex(r"[A-Za-z0-9-]{1,32}", fullmatch=True), st.just(""), st.text(max_size=4))
SUBJECTS = st.one_of(st.text(min_size=1, max_size=24), st.sampled_from(["tries:x", "x", "otp:x", "x" * SUBJECT, "x" * (SUBJECT + 1), "", "a\nb"]))
CODES    = st.one_of(st.from_regex(r"[0-9]{4,8}", fullmatch=True), st.text(max_size=CODE + 2), st.integers(), st.none())

loop = asyncio.new_event_loop()

log.setup("error", "json", Path("/dev/null"))
crypto.setup([crypto.key("k1")])
token.setup("fuzz-secret-that-is-long-enough-000000001")

RELAY = Relay()

RELAY.setup(RELAYED)

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

async def tried [T] ( work: Awaitable[T] ) -> Made[T]:

    try: return await work
    except Fault as fault: return fault

def denied ( job: Callable[[], object] ) -> Fault | None:

    try: job()
    except Fault as fault: return fault

    return None

def made ( job: Callable[[], Any] ) -> Any:

    try: return job()
    except Fault as fault: return fault

def refused ( value: object, code: Code, reason: str ) -> bool:

    return isinstance(value, Fault) and value.code is code and value.reason == reason

def grant ( value: object ) -> bool:

    return type(value) is str and 0 < len(value) <= IDENT and value.isprintable() and "," not in value and " " not in value

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(IDS, GRANTED, GRANTED, TENANTS, FACTS, WORDS)
def actors ( identity: Any, roles: Any, scopes: Any, tenant: Any, facts: Any, asked: str ) -> None:

    actor = made(partial(Actor, identity, roles, scopes, tenant, facts if facts is not None else {}))

    if isinstance(actor, Fault):

        assert refused(actor, Code.INTERNAL, "auth.actor")
        assert actor.errors is not None
        assert actor.errors["actor"][0] in ("id", "roles", "scopes", "tenant", "facts")

        return

    assert (type(actor.roles), type(actor.scopes)) == (tuple, tuple)
    assert len(set(actor.roles)) == len(actor.roles)
    assert len(set(actor.scopes)) == len(actor.scopes)
    assert all(grant(item) for item in (*actor.roles, *actor.scopes))
    assert len(actor.roles) <= GRANTS
    assert actor.can(asked) == any(fnmatch.fnmatchcase(asked, held) for held in actor.scopes)
    assert actor.has_role(asked) == (asked in actor.roles)
    assert actor.dump()["roles"] == list(actor.roles)
    assert not set(actor.facts) & TAKEN

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(IDS, st.dictionaries(st.one_of(st.sampled_from(["roles", "scopes", "tenant", "name", "sid", ""]), st.text(max_size=5)), st.one_of(st.lists(WORDS, max_size=4), WORDS, st.integers(), st.none()), max_size=4))
def claimed ( subject: Any, facts: dict[str, Any] ) -> None:

    claims = Claims(subject, "access", "jti", 1, 2, facts)
    actor  = made(partial(Actor.from_claims, claims))

    if isinstance(actor, Fault):

        assert refused(actor, Code.UNAUTHORIZED, "auth.claims")
        assert actor.errors is None

        return

    assert actor.id == subject
    assert not set(actor.facts) & { "roles", "scopes", "tenant" }
    assert actor.tenant == (facts.get("tenant") or None)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, SCOPES, SCOPES, st.one_of(st.none(), NAMES), REQUESTS, st.sampled_from(sorted(HEADERS.values())), st.text(max_size=12), st.booleans())
def relayed ( identity: str, roles: list[str], scopes: list[str], tenant: str | None, request: str, name: str, value: str, lower: bool ) -> None:

    actor = made(partial(Actor, identity, tuple(roles), tuple(scopes), tenant))

    if isinstance(actor, Fault): return

    headers = made(partial(RELAY.sign, actor, request))

    if isinstance(headers, Fault):

        assert refused(headers, Code.INTERNAL, "relay.request")
        assert not (0 < len(request) <= IDENT and request.isprintable())

        return

    carried = { key.lower() if lower else key: held for key, held in headers.items() }
    read    = RELAY.read(carried, request)

    assert read == Actor(identity, tuple(roles), tuple(scopes), tenant)
    assert read is not None
    assert read.facts == {}
    assert RELAY.read(RELAY.sign(None, request), request) is None

    key      = name.lower() if lower else name
    tampered = made(partial(RELAY.read, { **carried, key: value }, request))
    harmless = carried[key] == value or name == HEADERS["request"]

    if harmless: assert tampered == read
    else: assert refused(tampered, Code.UNAUTHORIZED, "relay.signature"), (name, value, tampered)

    dropped = dict(carried)

    del dropped[key]

    gone = made(partial(RELAY.read, dropped, request))

    if name == HEADERS["signature"]: assert gone is None
    elif name == HEADERS["request"] or carried[key] == "": assert gone == read
    else: assert refused(gone, Code.UNAUTHORIZED, "relay.signature")

    assert refused(made(partial(RELAY.read, carried, request + "x")), Code.UNAUTHORIZED, "relay.signature")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SUBJECTS, SUBJECTS, CODES, st.integers(0, 7))
def codes ( subject: str, other: str, guess: Any, wrongs: int ) -> None:

    store = Memory()
    auth  = Auth()

    auth.setup(Cache(store), fixed_code="246810")

    otp = run(tried(auth.otp(subject)))

    if isinstance(otp, Fault):

        assert refused(otp, Code.INTERNAL, "auth.settings")
        assert otp.errors == { "setting": ["subject"] }

        return

    second = run(tried(auth.otp(other)))

    if other == subject: assert refused(second, Code.TOO_MANY_REQUESTS, "otp.cooldown")
    else: assert isinstance(second, Fault) or second.hashed != otp.hashed

    worn(auth, subject, wrongs)

    valid   = type(guess) is str and 0 < len(guess) <= CODE and guess.isprintable()
    tried_  = run(tried(auth.verify(subject, guess)))
    success = valid and wrongs < 5 and guess == "246810"

    if not valid: assert refused(tried_, Code.UNAUTHORIZED, "otp.invalid")
    elif wrongs > 5: assert refused(tried_, Code.UNAUTHORIZED, "otp.expired")
    elif wrongs == 5: assert refused(tried_, Code.TOO_MANY_REQUESTS, "otp.attempts")
    elif success: assert tried_ is True
    else: assert refused(tried_, Code.UNAUTHORIZED, "otp.invalid")

    if other != subject and not isinstance(second, Fault):

        assert run(tried(auth.verify(other, "246810"))) is True

    last = run(tried(auth.verify(subject, "246810")))
    gone = success or wrongs > 5 or (wrongs == 5 and valid)

    if gone: assert refused(last, Code.UNAUTHORIZED, "otp.expired")
    elif wrongs + (1 if valid else 0) >= 5: assert refused(last, Code.TOO_MANY_REQUESTS, "otp.attempts")
    else: assert last is True

def worn ( auth: Auth, subject: str, wrongs: int ) -> None:

    for at in range(wrongs):

        failed = run(tried(auth.verify(subject, "000000")))

        if at < 5: assert refused(failed, Code.UNAUTHORIZED, "otp.invalid")
        elif at == 5: assert refused(failed, Code.TOO_MANY_REQUESTS, "otp.attempts")
        else: assert refused(failed, Code.UNAUTHORIZED, "otp.expired")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(WORDS, st.one_of(st.lists(WORDS, max_size=4), WORDS, st.integers()), max_size=4), st.lists(WORDS, max_size=4), st.lists(WORDS, max_size=3), st.lists(WORDS, max_size=3))
def configured ( roles: dict[str, Any], asked: list[str], scopes: list[str], wanted: list[str] ) -> None:

    auth  = Auth()
    fault = denied(partial(auth.setup, None, roles))

    if fault is not None:

        assert refused(fault, Code.INTERNAL, "auth.settings")
        assert fault.errors == { "setting": ["roles"] }
        assert any(not grant(name) or isinstance(held, str | int) or any(not grant(item) for item in held) for name, held in roles.items())

    else:

        granted = auth.scopes_of(asked)
        pooled  = [scope for role in asked if role in roles for scope in roles[role]]

        assert len(set(granted)) == len(granted)
        assert all(scope in pooled for scope in granted)

    guard = denied(partial(auth.guard, *scopes, roles=wanted))

    assert (guard is None) == all(grant(item) for item in (*scopes, *wanted))
    assert guard is None or refused(guard, Code.INTERNAL, "auth.guard")

actors()
claimed()
relayed()
codes()
configured()

loop.close()
log.close()

print(f"fuzz auth  examples={EXAMPLES * 5}  ok")
