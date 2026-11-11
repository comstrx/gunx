from engine.error import Code, Fault
from engine.exception import Exceptions
from engine.log import log
from engine.test import Bench
from pathlib import Path

class Declined(Exception): ...

class Expired(Declined): ...

class Stale(Expired): ...

class Lapsed(Stale): ...

class Voided(Lapsed): ...

bench     = Bench()
plain     = Exceptions()
quiet     = Exceptions()
loud      = Exceptions()
muted     = Exceptions()
late      = TimeoutError()
deep      = Voided()
wild      = ValueError("wild")
known     = Fault(Code.CONFLICT, reason="taken")
handled   = RuntimeError("handled")
told: list[str] = []

log.setup("info", "json", Path("/dev/null"))

plain.map(Declined, Code.PAYMENT_REQUIRED, "payment.declined")
loud.context(lambda: { "tenant": "t-17", "actor": "u-9" })
loud.report(lambda fault, _: told.append(fault.code.value))
muted.throttle(1, 3600)
quiet.handle(handled)

def mapped () -> None: plain.fault(late)

def ladder () -> None: plain.fault(deep)

def unmapped () -> None: plain.fault(wild)

def passed () -> None: plain.fault(known)

def dropped () -> None: quiet.handle(Fault(Code.NOT_FOUND))

def seen () -> None: quiet.handle(handled)

def boom () -> None: raise RuntimeError("boom")

def reported () -> None:

    try: boom()
    except RuntimeError as error: loud.handle(error)

    told.clear()

def warned () -> None: loud.handle(ConnectionResetError())

def throttled () -> None: muted.handle(RuntimeError("same"))

def safe () -> None: quiet.safe(0, int)

def fallen () -> None: quiet.safe(0, lambda: int("x"))

bench.measure("exception.fault.mapped", mapped)
bench.measure("exception.fault.ladder", ladder)
bench.measure("exception.fault.unmapped", unmapped)
bench.measure("exception.fault.passed", passed)
bench.measure("exception.handle.dropped", dropped)
bench.measure("exception.handle.seen", seen)
bench.measure("exception.handle.reported", reported, rounds=5000)
bench.measure("exception.handle.warned", warned, rounds=5000)
bench.measure("exception.handle.throttled", throttled)
bench.measure("exception.safe", safe)
bench.measure("exception.safe.fallen", fallen, rounds=5000)

log.close()
