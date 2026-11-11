from engine.auth import Actor, Auth, Relay
from engine.cache import Cache, Memory
from engine.crypto import crypto
from engine.log import log
from engine.test import Bench
from engine.token import token
from pathlib import Path
from typing import Any
import asyncio

bench = Bench()
auth  = Auth()
relay = Relay()
store = Memory()
loop  = asyncio.new_event_loop()

log.setup("error", "json", Path("/dev/null"))
crypto.setup([crypto.key("k1")])
token.setup("bench-secret-that-is-long-enough-00000001")
auth.setup(Cache(store), roles={ "admin": ["orders.*", "users.read", "reports.*"], "user": ["orders.read", "profile.*"] })
auth.define("orders.cancel", lambda actor, order: actor.has_role("admin") or order["owner"] == actor.id)
relay.setup("relay-secret-for-the-bench-0000000000001")

actor   = Actor("user-1", ("user", "support"), auth.scopes_of(["user"]), "tenant-1", { "name": "Ali", "sid": "s1" })
boss    = Actor("user-2", ("admin",), auth.scopes_of(["admin"]), "tenant-1")
pair    = auth.issue(actor, "ua|ip")
claims  = token.verify(pair.access, fingerprint="ua|ip")
headers = relay.sign(actor, "req-1")
lowered = { name.lower(): value for name, value in headers.items() }

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

def building () -> None: Actor("user-1", ("user", "support"), ("orders.read", "profile.*"), "tenant-1", { "name": "Ali" })

def exact () -> None: actor.can("orders.read")

def wild () -> None: boss.can("orders.cancel")

def miss () -> None: actor.can("reports.daily")

def issuing () -> None: auth.issue(actor, "ua|ip")

def loading () -> None: Actor.from_claims(token.verify(pair.access, fingerprint="ua|ip"))

def claimed () -> None: Actor.from_claims(claims)

def signing () -> None: relay.sign(actor, "req-1")

def reading () -> None: relay.read(headers, "req-1")

def lowercase () -> None: relay.read(lowered, "req-1")

async def allowed () -> None: await auth.allowed(actor, "orders.cancel", { "owner": "user-1" })

async def scoped () -> None: await auth.allowed(actor, "orders.read")

async def revoked () -> None: await auth.revoked("jti-1")

async def otp () -> None:

    code = (await auth.otp("bench")).code

    await store.delete("otp:cooldown")
    await auth.verify("bench", code)

async def cycle () -> None:

    await store.clear()
    await otp()

bench.measure("auth.actor.build", building)
bench.measure("auth.actor.can.exact", exact)
bench.measure("auth.actor.can.wild", wild)
bench.measure("auth.actor.can.miss", miss)
bench.measure("auth.issue", issuing, rounds=5000)
bench.measure("auth.verify.from_claims", loading, rounds=5000)
bench.measure("auth.from_claims", claimed)
bench.measure("auth.relay.sign", signing)
bench.measure("auth.relay.read", reading)
bench.measure("auth.relay.read.lower", lowercase)
run(bench.measure_async("auth.allowed.ability", allowed))
run(bench.measure_async("auth.allowed.scope", scoped))
run(bench.measure_async("auth.revoked.memory", revoked))
run(bench.measure_async("auth.otp.cycle.memory", cycle, rounds=2000))

loop.close()
log.close()
