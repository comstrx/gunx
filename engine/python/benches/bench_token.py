from engine.test import Bench
from engine.token import Issuer, token
from engine.cache import Cache, Memory
from engine.rand import rand
from typing import Any
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption

bench = Bench()

token.setup("bench-secret-" + "k" * 40, issuer="bench", access=600, refresh=3600)

held   = token.issue("user-7", "access", role="admin")
made   = token.opaque()
plain  = made.plain
hashed = made.hashed

def issue () -> None: token.issue("user-7", "access", role="admin")

def verify () -> None: token.verify(held, "access")

def peek () -> None: token.peek(held)

def pair () -> None: token.pair("user-7", "device-1")

def opaque () -> None: token.opaque()

def matches () -> None: token.matches(plain, hashed)

def bearer () -> None: token.bearer("Bearer " + held)

bench.measure("token.issue", issue)
bench.measure("token.verify", verify)
bench.measure("token.peek", peek)
bench.measure("token.pair", pair)
bench.measure("token.opaque", opaque)
bench.measure("token.matches", matches)
bench.measure("token.bearer", bearer)

async def scoped () -> None:

    store = Cache(Memory())
    private = Ed25519PrivateKey.generate().private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    options: dict[str, dict[str, Any]] = {
        "jwt": { "format": "jwt", "secret": rand.bytes(32) },
        "opaque": { "format": "opaque", "store": store },
        "paseto.local": { "format": "paseto", "secret": rand.bytes(32) },
        "paseto.public": { "format": "paseto", "secret": private, "protection": "public" },
    }

    try:

        for name, settings in options.items():

            issuer = token.options(**settings)
            text = await issuer.issue("user-7", role="admin")

            async def read ( issuer: Issuer = issuer, text: str = text ) -> None:

                await issuer.verify(text)

            async def create ( issuer: Issuer = issuer ) -> None:

                made = await issuer.issue("user-7", role="admin")

                if issuer.format == "opaque": await store.forget(issuer.key(made))

            await bench.measure_async(name + ".issue" + (".forget" if name == "opaque" else ""), create, rounds=5000)
            await bench.measure_async(name + ".verify", read, rounds=5000)

    finally: await store.close()

bench.run(scoped())
