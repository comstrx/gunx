from engine.test import Bench
from engine.token import token

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
