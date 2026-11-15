import os
from engine.log import log, Render
from engine.test import Bench
from pathlib import Path

bench  = Bench()
render = Render()
plain  = { "event": "order.placed", "order": "01JC8Z5M3Q", "tenant": "t-17", "items": 3, "total": 129.5 }
secret = { "event": "login", "email": "a@b.co", "password": "hunter22", "url": "amqp://guest:guest@127.0.0.1/" }
nested = { "event": "hook", "payload": { "id": 7, "auth": { "token": "s3cr3t-s3cr3t-s3cr3t", "scopes": ["a", "b"] } } }
text   = "POST https://api.example.com/v1/pay?api_key=abcdef123456&amount=5 refused: Authorization: Bearer abcdefghijklmnopqrstuvwx"

log.setup("info", "json", Path(os.devnull))
held = log.bind(job="x")
named = log.get("worker")
long_key = "x" * 300 + "_password"

def info () -> None: log.info("order.placed", order="01JC8Z5M3Q", tenant="t-17", items=3, total=129.5)

def dropped () -> None: log.debug("order.placed", order="01JC8Z5M3Q")

def bound () -> None: log.bind(job="x").info("order.placed", items=3)

def redact_plain () -> None: render.redact(None, "info", dict(plain))

def redact_secret () -> None: render.redact(None, "info", dict(secret))

def redact_nested () -> None: render.redact(None, "info", dict(nested))

def redact_text () -> None: render.redact(None, "info", { "event": "net.failed", "detail": text })

def mask () -> None: Render.mask("supersecrettoken-supersecret")

def scrub_url () -> None: Render.scrub("postgres://user:pw@host/db")

def scrub_plain () -> None: Render.scrub("order 17 was placed by tenant t-9 in 12.5 ms")

def clean () -> None: Render.clean(nested)

def reused () -> None: held.info("order.placed", items=3)

def named_info () -> None: named.info("order.placed", items=3)

def long_redact () -> None: Render.clean({ long_key: "hunter2" })

def span () -> None:

    with log.span("work", count=1) as fields: fields["count"] = 2

def capture () -> None:

    with log.capture() as events:

        with log.capture(): pass

        log.info("captured")

    if len(events) != 1: raise RuntimeError("capture lost an event")

bench.measure("log.reused", reused)
bench.measure("log.named", named_info)
bench.measure("log.long-key", long_redact)
bench.measure("log.span", span)
bench.measure("log.capture", capture)
bench.measure("log.info", info)
bench.measure("log.dropped", dropped)
bench.measure("log.bind", bound)
bench.measure("log.redact.plain", redact_plain)
bench.measure("log.redact.secret", redact_secret)
bench.measure("log.redact.nested", redact_nested)
bench.measure("log.redact.text", redact_text)
bench.measure("log.mask", mask)
bench.measure("log.scrub.url", scrub_url)
bench.measure("log.scrub.plain", scrub_plain)
bench.measure("log.clean", clean)

bench.measure("log.scrub.bearer.mixed", lambda: Render.scrub("bEaReR example_credential_0123456789"))

log.close()

bench.measure("log.scrub.paseto", lambda: Render.scrub("received v4.local." + "a" * 90 + ".Zm9vdGVy next"))
