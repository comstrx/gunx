from engine.error import Code, Fault
from engine.net import Remote, net
from engine.sms import Http, Log, Sms, Text
from collections.abc import Callable
from typing import Any, cast
import pytest

async def test_texts_go_through_the_texter () -> None:

    service = Sms()
    logger  = Log()

    service.setup(logger, sender="ENGINE")

    receipt = await service.text("+201099000000", "Your code is 123456")

    assert receipt.accepted() and logger.outbox[-1].sender == "ENGINE" and logger.outbox[-1].channel == "sms"
    assert (await service.text("+201099000000", "hi", "whatsapp")).accepted() and service.stats() == { "sent": 2 }
    assert service.compose("+201099000000", "x").dump()["channel"] == "sms" and service.describe()["sender"] == "ENGINE"

    with pytest.raises(Fault) as phone: service.compose("12", "x")

    assert phone.value.code is Code.VALIDATION and phone.value.reason == "sms.text"

    with pytest.raises(Fault): service.compose("+201099000000", "x" * 2000)
    with pytest.raises(Fault): service.compose("+201099000000", "x", "fax")
    with pytest.raises(Fault): await Sms().text("+201099000000", "x")

    assert logger.clear() == 2 and service.ready()

    await service.close()

FLAG: Any = True

def test_texts_and_settings_are_validated () -> None:

    service = Sms()

    wrongs: tuple[tuple[str, Callable[[], object]], ...] = (
        ("to", lambda: Text("", "x")), ("to", lambda: Text("a b", "x")), ("to", lambda: Text("+" + "1" * 32, "x")), ("to", lambda: Text(cast("Any", 201), "x")),
        ("body", lambda: Text("+201", "")), ("body", lambda: Text("+201", "x" * 1001)), ("body", lambda: Text("+201", cast("Any", None))),
        ("sender", lambda: Text("+201", "x", sender="")), ("sender", lambda: Text("+201", "x", sender="a\nb")), ("sender", lambda: Text("+201", "x", sender=cast("Any", 7))),
    )

    for what, make in wrongs:

        with pytest.raises(Fault) as refused: make()

        assert refused.value.code is Code.VALIDATION and refused.value.reason == "sms.text" and refused.value.errors == { what: ["is invalid"] }, what

    with pytest.raises(Fault) as channel: Text("+201", "x", "fax")

    assert channel.value.reason == "sms.channel"

    with pytest.raises(Fault) as other: service.compose("+201099000000", "x", cast("Any", None))

    assert other.value.reason == "sms.channel"

    wrongs2: tuple[tuple[str, Callable[[], object]], ...] = (
        ("texter", lambda: service.setup(cast("Any", "log"))), ("sender", lambda: service.setup(sender="")), ("sender", lambda: service.setup(sender="x" * 33)),
        ("sender", lambda: service.setup(sender=cast("Any", 7))), ("remote", lambda: Http(cast("Any", "http://x"))),
        ("path", lambda: Http(Remote(net, "http://127.0.0.1:9"), "messages")), ("path", lambda: Http(Remote(net, "http://127.0.0.1:9"), "/a b")),
    )

    for setting, make in wrongs2:

        with pytest.raises(Fault) as wrong: make()

        assert wrong.value.reason == "sms.settings" and wrong.value.errors == { "setting": [setting] }, setting

    assert Text("+201", "x", "whatsapp", "ENGINE").dump() == { "to": "+201", "body": "x", "channel": "whatsapp", "sender": "ENGINE" }

async def test_the_http_texter_hides_a_broken_or_hostile_provider ( provider: Any ) -> None:


    service = Sms()

    service.setup(Http(provider.remote(), "/v1/sms"), sender="ENGINE")

    provider.answer({ "id": "m-1", "status": "Queued" }, {}, None, { "status": "failed", "why": "blocked" })

    receipt = await service.text("+201099000000", "hello", "whatsapp")

    assert (receipt.id, receipt.status, receipt.raw) == ("m-1", "queued", { "id": "m-1", "status": "Queued" }) and receipt.accepted()
    assert provider.seen[-1][:2] == ("POST", "/v1/sms") and provider.last() == { "to": "+201099000000", "body": "hello", "channel": "whatsapp", "sender": "ENGINE" }
    assert (await service.text("+201099000000", "x")).accepted() and (await service.text("+201099000000", "x")).accepted()

    failed = await service.text("+201099000000", "x")

    assert not failed.accepted() and failed.raw["why"] == "blocked" and service.stats() == { "sent": 4 }

    for reason, answer in (
        ("sms.reply", [1]), ("sms.reply", { "id": 7 }), ("sms.reply", { "status": "" }), ("sms.reply", { "status": "مرسل" }), ("sms.reply", b"{not json"),
        ("sms.provider", 400), ("sms.provider", 401), ("sms.provider", 429),
    ):

        provider.answer(answer)

        with pytest.raises(Fault) as broken: await service.text("+201099000000", "x")

        assert broken.value.reason == reason and broken.value.server(), (reason, answer)

    provider.answer(503)

    with pytest.raises(Fault) as down: await service.text("+201099000000", "x")

    assert down.value.code is Code.UNAVAILABLE and down.value.reason == "remote.503"

    with pytest.raises(Fault) as odd: await service.send(cast("Any", { "to": "x" }))

    assert odd.value.reason == "sms.text"

    await service.close()
