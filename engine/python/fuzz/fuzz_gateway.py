from engine.crypto import crypto
from engine.error import Code, Fault
from engine.gateway import Charge, Gateway, Mock, Refund, Webhook
from engine.gateway.arch import METHODS, STATUSES
from engine.json import json
from engine.log import log
from engine.number import Money
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any
import asyncio

EXAMPLES = 1000
WORDS    = st.one_of(st.text(max_size=12), st.sampled_from(["ch_1", "", "a\nb", "x" * 129]), st.none(), st.integers())
STATUS   = st.one_of(st.sampled_from([*sorted(STATUSES), "paid", ""]), st.none())
METHOD   = st.one_of(st.sampled_from([*sorted(METHODS), "crypto", ""]), st.none())
MONEY    = st.one_of(st.builds(Money, st.integers(-5, 1 << 40), st.sampled_from(["EGP", "USD"])), st.none(), st.integers())
LINKS    = st.one_of(st.none(), st.sampled_from(["https://x/return", "/done", "javascript:alert(1)", "ftp://x", "a\nb"]), st.text(max_size=8))
BODIES   = st.one_of(st.binary(max_size=40), st.builds(json.encode, st.dictionaries(st.sampled_from(["event", "charge", "status", "reference", "extra"]), st.one_of(st.none(), st.text(max_size=12), st.integers(-(1 << 62), 1 << 62), st.lists(st.integers(-9, 9), max_size=2)), max_size=5)), st.builds(json.encode, st.lists(st.integers(-9, 9), max_size=2)))

loop = asyncio.new_event_loop()
pay  = Gateway()
mock = Mock("fuzz-secret-0123456789", fail_over=50_000)

log.setup("error", "json", Path("/dev/null"))
crypto.setup([crypto.key("k1")])
pay.use(mock)

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

def run ( work: Any ) -> Any:

    try: return loop.run_until_complete(work)
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WORDS, WORDS, MONEY, STATUS, WORDS, METHOD, LINKS)
def charged ( key: Any, provider: Any, amount: Any, status: Any, reference: Any, method: Any, redirect: Any ) -> None:

    made = tried(lambda: Charge(key, provider, amount, status, reference, method or "card", redirect))

    if isinstance(made, Fault):

        assert made.code is Code.INTERNAL
        assert made.reason in ("gateway.status", "gateway.charge", "gateway.redirect")

        return

    assert made.status in STATUSES and made.method in METHODS and isinstance(made.amount, Money)
    assert made.paid() == (status == "captured")
    assert made.dump()["amount"] == made.amount.dump()

    refund = tried(lambda: Refund(key, key, amount, status or "refunded"))

    assert not isinstance(refund, Fault) or refund.reason == "gateway.refund"

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(BODIES, st.booleans(), st.text(max_size=6))
def hooked ( body: bytes, signed: bool, noise: str ) -> None:

    signature = mock.sign(body) if signed else noise
    made      = tried(lambda: pay.webhook(body, { "x-signature": signature }))

    if not signed:

        assert isinstance(made, Fault)
        assert (made.code, made.reason) == (Code.UNAUTHORIZED, "gateway.signature")

        return

    try: payload = json.decode(body)
    except Fault: payload = None

    sound = isinstance(payload, dict) and all(payload.get(name) is None or type(payload.get(name)) is str for name in ("event", "charge", "status", "reference"))
    sound = sound and isinstance(payload, dict) and 0 < len(str(payload.get("event") or "")) <= 128 and str(payload.get("event")).isprintable()

    if isinstance(made, Webhook):

        assert sound and isinstance(payload, dict)
        assert made.event == payload.get("event") and made.raw == payload

    else:

        assert isinstance(made, Fault)
        assert (made.code, made.reason) == (Code.BAD_REQUEST, "gateway.webhook")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(-10, 100_000), st.sampled_from(["EGP", "USD", "SAR"]), st.text(max_size=70), st.sampled_from(["card", "wallet", "cash", "bank", "crypto"]), st.integers(0, 100_000))
def paid ( minor: int, currency: str, reference: str, method: str, back: int ) -> None:

    made = run(pay.charge(Money(minor, currency), reference, method))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason in ("gateway.amount", "gateway.charge")
        assert minor <= 0 or not reference or len(reference) > 64 or method not in METHODS or not reference.isprintable()

        return

    assert made.amount == Money(minor, currency) and made.reference == reference
    assert made.status == ("failed" if minor > 50_000 else "captured" if method in ("card", "wallet") else "pending")

    refund = run(pay.refund(made.id, Money(back, currency)))

    if isinstance(refund, Fault): assert refund.reason in ("gateway.amount", "gateway.unpaid", "gateway.refund") and (back <= 0 or not made.paid() or back > minor)
    else: assert refund.amount.minor == back and (run(pay.fetch(made.id))).status == "refunded"

charged()
hooked()
paid()

loop.close()

print(f"fuzz gateway  examples={EXAMPLES * 3}  ok")
