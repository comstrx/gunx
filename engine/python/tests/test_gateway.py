from engine.crypto import crypto
from engine.error import Code, Fault
from engine.gateway import Charge, Gateway, Http, Mock, Refund, Webhook
from engine.json import json
from engine.number import Money
from collections.abc import Awaitable, Callable
from typing import Any, cast
import pytest

async def test_charges_refunds_and_webhooks () -> None:

    crypto.setup([crypto.key("k1")])

    pay  = Gateway()
    mock = Mock("mock-secret-0123", fail_over=50000)

    pay.use(mock)

    assert pay.ready() and pay.names() == ("mock",) and pay.provider().name == "mock"

    charge = await pay.charge(Money(1999, "EGP"), "order-1", customer={ "email": "a@x.io" }, returns="https://x/return")

    assert charge.paid() and charge.redirect == "https://x/return" and charge.dump()["amount"] == { "minor": 1999, "currency": "EGP" }
    assert (await pay.fetch(charge.id)) == charge and pay.stats() == { "charged": 1 }
    assert (await pay.charge(Money(500, "EGP"), "order-2", "cash")).status == "pending"
    assert (await pay.charge(Money(90000, "EGP"), "order-3")).status == "failed"

    refund = await pay.refund(charge.id, Money(999, "EGP"))

    assert refund.status == "refunded" and refund.dump()["charge"] == charge.id and (await pay.fetch(charge.id)).status == "refunded"

    body = json.encode({ "event": "charge.captured", "charge": charge.id, "status": "captured", "reference": "order-1" })
    hook = pay.webhook(body, { "x-signature": mock.sign(body) })

    assert hook.event == "charge.captured" and hook.charge == charge.id and hook.reference == "order-1"

    with pytest.raises(Fault) as forged: pay.webhook(body, { "x-signature": "00" * 32 })

    assert forged.value.code is Code.UNAUTHORIZED and forged.value.reason == "gateway.signature"

    with pytest.raises(Fault) as zero: await pay.charge(Money(0, "EGP"), "x")

    assert zero.value.code is Code.VALIDATION and zero.value.reason == "gateway.amount"

    with pytest.raises(Fault): await pay.charge(Money(1, "EGP"), "x", "crypto")
    with pytest.raises(Fault): await pay.refund(charge.id, Money(1, "USD"))
    with pytest.raises(Fault): await pay.refund("ch_missing", Money(1, "EGP"))
    with pytest.raises(Fault): Charge("x", "mock", Money(1, "EGP"), "weird", "r")
    with pytest.raises(Fault): await Gateway().charge(Money(1, "EGP"), "x")

    assert pay.describe()["charged"] == 3

    await pay.close()

FLAG: Any = True
EGP  = Money(1999, "EGP")

def test_charges_refunds_and_webhooks_are_validated () -> None:

    wrongs: tuple[tuple[str, Callable[[], object]], ...] = (
        ("gateway.status", lambda: Charge("c", "mock", EGP, "paid", "r")), ("gateway.status", lambda: Charge("c", "mock", EGP, cast("Any", None), "r")),
        ("gateway.charge", lambda: Charge("", "mock", EGP, "captured", "r")), ("gateway.charge", lambda: Charge("c", "", EGP, "captured", "r")),
        ("gateway.charge", lambda: Charge("c", "mock", cast("Any", 1999), "captured", "r")), ("gateway.charge", lambda: Charge("c", "mock", EGP, "captured", "")),
        ("gateway.charge", lambda: Charge("c", "mock", EGP, "captured", "x" * 65)), ("gateway.charge", lambda: Charge("c", "mock", EGP, "captured", "r", "crypto")),
        ("gateway.charge", lambda: Charge("c", "mock", EGP, "captured", "r", raw=cast("Any", []))), ("gateway.redirect", lambda: Charge("c", "mock", EGP, "captured", "r", redirect="javascript:x")),
        ("gateway.redirect", lambda: Charge("c", "mock", EGP, "captured", "r", redirect="//evil")), ("gateway.redirect", lambda: Charge("c", "mock", EGP, "captured", "r", redirect="")),
        ("gateway.refund", lambda: Refund("", "c", EGP, "refunded")), ("gateway.refund", lambda: Refund("r", "c", cast("Any", 5), "refunded")), ("gateway.refund", lambda: Refund("r", "c", EGP, "")),
        ("gateway.webhook", lambda: Webhook("", "e", None, None, None)), ("gateway.webhook", lambda: Webhook("mock", "", None, None, None)), ("gateway.webhook", lambda: Webhook("mock", "e", cast("Any", 7), None, None)),
        ("gateway.webhook", lambda: Webhook("mock", "e", "x" * 257, None, None)), ("gateway.webhook", lambda: Webhook("mock", "e", None, None, None, cast("Any", []))),
    )

    for reason, make in wrongs:

        with pytest.raises(Fault) as refused: make()

        assert refused.value.code is Code.INTERNAL and refused.value.reason == reason, reason

    assert Charge("c", "mock", EGP, "captured", "r", redirect="/done").redirect == "/done"
    assert Webhook("mock", "e", "c", "captured", "r").dump() == { "provider": "mock", "event": "e", "charge": "c", "status": "captured", "reference": "r" }

    mocks: tuple[tuple[str, Callable[[], object]], ...] = (
        ("secret", lambda: Mock("short")), ("secret", lambda: Mock(cast("Any", None))), ("fail_over", lambda: Mock("mock-secret-0123", -1)),
        ("fail_over", lambda: Mock("mock-secret-0123", FLAG)),
    )

    for setting, make in mocks:

        with pytest.raises(Fault) as unset: make()

        assert unset.value.reason == "gateway.settings" and unset.value.errors == { "setting": [setting] }, setting

async def test_the_gateway_refuses_what_a_provider_must_never_see () -> None:

    pay  = Gateway()
    mock = Mock("mock-secret-0123")

    pay.use(mock)

    charge = await pay.charge(EGP, "order-1")

    for reason, work in (
        ("gateway.amount", pay.charge(cast("Any", 1999), "r")), ("gateway.amount", pay.charge(Money(0, "EGP"), "r")), ("gateway.customer", pay.charge(EGP, "r", customer=cast("Any", "me"))),
        ("gateway.returns", pay.charge(EGP, "r", returns=cast("Any", None))), ("gateway.returns", pay.charge(EGP, "r", returns="x" * 2049)), ("gateway.charge", pay.charge(EGP, "")),
        ("gateway.charge", pay.charge(EGP, "a\nb")), ("gateway.charge", pay.charge(EGP, "r", "crypto")), ("gateway.charge", pay.fetch("")), ("gateway.charge", pay.fetch(cast("Any", 7))),
        ("gateway.charge", pay.refund("", EGP)), ("gateway.amount", pay.refund(charge.id, Money(-1, "EGP"))), ("gateway.amount", pay.refund(charge.id, cast("Any", "1"))),
    ):

        with pytest.raises(Fault) as refused: await work

        assert refused.value.code is Code.VALIDATION and refused.value.reason == reason, reason

    body = json.encode({ "event": "charge.captured", "charge": charge.id })

    for reason, raw, headers in (
        ("gateway.webhook", cast("Any", "text"), { "x-signature": mock.sign(body) }), ("gateway.webhook", b"x" * (1024 * 1024 + 1), { "x-signature": "0" }),
        ("gateway.webhook", body, cast("Any", None)), ("gateway.signature", body, {}), ("gateway.signature", body, { "x-signature": "" }),
        ("gateway.signature", body, { "x-signature": "00" * 32 }), ("gateway.webhook", b"[1]", { "x-signature": mock.sign(b"[1]") }),
        ("gateway.webhook", b"{not json", { "x-signature": mock.sign(b"{not json") }), ("gateway.webhook", b'{"event": 7}', { "x-signature": mock.sign(b'{"event": 7}') }),
        ("gateway.webhook", b'{"event": "e", "charge": ["c"]}', { "x-signature": mock.sign(b'{"event": "e", "charge": ["c"]}') }),
    ):

        with pytest.raises(Fault) as wrong: pay.webhook(raw, headers)

        assert wrong.value.reason == reason, (reason, raw[:20])

    hook = pay.webhook(body, { "X-Signature": mock.sign(body) })

    assert hook.event == "charge.captured" and hook.charge == charge.id and hook.status is None and hook.raw == { "event": "charge.captured", "charge": charge.id }
    with pytest.raises(Fault) as unnamed: pay.webhook(b'{"status": "captured"}', { "x-signature": mock.sign(b'{"status": "captured"}') })

    assert unnamed.value.reason == "gateway.webhook"

async def test_the_http_provider_hides_a_broken_or_hostile_gateway ( provider: Any ) -> None:

    pay  = Gateway()
    http = Http(provider.remote(), "gateway-secret-0123456789", frozenset({ "EGP" }))

    pay.use(http)

    provider.answer({ "id": "ch_1", "status": "captured", "redirect": "https://pay.test/ch_1" })

    charge = await pay.charge(EGP, "order-1", customer={ "email": "a@x.io" }, returns="https://x/return")

    assert charge == Charge("ch_1", "http", EGP, "captured", "order-1", "card", "https://pay.test/ch_1", charge.raw)
    assert provider.last() == { "amount": { "minor": 1999, "currency": "EGP" }, "reference": "order-1", "method": "card", "customer": { "email": "a@x.io" }, "return_url": "https://x/return" }

    provider.answer({ "id": "ch_1", "status": "captured", "amount": { "minor": 1999, "currency": "EGP" }, "reference": "order-1" })

    assert (await pay.fetch("ch_1")).amount == EGP and provider.seen[-1][1] == "/charges/ch_1"

    provider.answer({ "id": "re_1", "status": "refunded" })

    refund = await pay.refund("ch 1", Money(500, "EGP"))

    assert refund.id == "re_1" and provider.seen[-1][1] == "/charges/ch%201/refunds"

    with pytest.raises(Fault) as currency: await pay.charge(Money(1, "USD"), "r")

    assert currency.value.reason == "gateway.currency"

    broken_: tuple[tuple[str, Any, Callable[[], Awaitable[object]]], ...] = (
        ("gateway.reply", { "status": "captured" }, lambda: pay.charge(EGP, "r")), ("gateway.reply", [1], lambda: pay.charge(EGP, "r")),
        ("gateway.reply", { "id": "c", "status": "weird" }, lambda: pay.charge(EGP, "r")), ("gateway.reply", { "id": "c", "redirect": "javascript:x" }, lambda: pay.charge(EGP, "r")),
        ("gateway.reply", { "id": "c" }, lambda: pay.fetch("c")), ("gateway.reply", { "id": "c", "amount": { "minor": "x", "currency": "EGP" } }, lambda: pay.fetch("c")),
        ("gateway.reply", { "id": "c", "amount": { "minor": 1 } }, lambda: pay.fetch("c")), ("gateway.reply", "text", lambda: pay.refund("c", EGP)), ("gateway.reply", { "id": "" }, lambda: pay.refund("c", EGP)),
        ("gateway.reply", b"{not json", lambda: pay.charge(EGP, "r")), ("gateway.provider", 400, lambda: pay.charge(EGP, "r")), ("gateway.provider", 402, lambda: pay.charge(EGP, "r")),
        ("gateway.provider", 429, lambda: pay.fetch("c")),
    )

    for reason, answer, work in broken_:

        provider.answer(answer)

        with pytest.raises(Fault) as broken: await work()

        assert broken.value.reason == reason and broken.value.server(), (reason, answer)

    provider.answer(500)

    with pytest.raises(Fault) as down: await pay.charge(EGP, "r")

    assert down.value.reason == "remote.500"

    unsets: tuple[tuple[str, Callable[[], object]], ...] = (
        ("remote", lambda: Http(cast("Any", "http://x"), "gateway-secret-0123456789")), ("secret", lambda: Http(provider.remote(), "short")),
        ("currencies", lambda: Http(provider.remote(), "gateway-secret-0123456789", cast("Any", ["EGP"]))),
    )

    for setting, make in unsets:

        with pytest.raises(Fault) as unset: make()

        assert unset.value.reason == "gateway.settings" and unset.value.errors == { "setting": [setting] }, setting

    with pytest.raises(Fault) as blank: Http(provider.remote(), "")

    assert blank.value.errors == { "missing": ["secret"] }

    await pay.close()
