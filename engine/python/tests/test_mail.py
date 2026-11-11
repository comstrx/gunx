from engine.error import Code, Fault
from engine.mail import Http, Log, Mail, Message, Smtp, mail
from engine.net import Remote, net
from engine.view import view
from pathlib import Path
from collections.abc import Callable
from typing import Any, cast
import pytest

async def test_messages_are_composed_rendered_and_logged ( tmp_path: Path ) -> None:

    (tmp_path / "welcome.html").write_text("<p>Hi {{ name }}</p>")
    view.setup(tmp_path)

    box = Mail()
    log = Log()

    box.setup("hello@engine.test", "Engine", log)

    assert box.ready() and box.sender() == "Engine <hello@engine.test>"

    message = box.compose(["a@x.io", "b@x.io"], "Subject", "plain", cc=["c@x.io"], headers={ "X-Tag": "t" })

    assert message.to == ("a@x.io", "b@x.io") and message.recipients() == ("a@x.io", "b@x.io", "c@x.io") and message.sender == box.sender()
    assert box.headers(message)["X-Tag"] == "t" and message.dump()["subject"] == "Subject"

    receipt = await box.send(message)

    assert receipt.accepted() and log.outbox[-1] is message and box.stats() == { "sent": 1 }

    rendered = await box.render("a@x.io", "Welcome", "welcome.html", name="<Ann>")

    assert rendered.html == "<p>Hi &lt;Ann&gt;</p>" and isinstance(rendered, Message)
    assert box.describe()["default"] == "log" and log.clear() == 1

    with pytest.raises(Fault) as bad: box.compose("not-an-email", "x")

    assert bad.value.code is Code.VALIDATION and bad.value.reason == "mail.to"

    with pytest.raises(Fault): box.compose([], "x")
    with pytest.raises(Fault): Mail().setup("nope", "x")
    with pytest.raises(Fault): await Mail().send(message)

    assert not mail.ready() or mail.describe()

    await box.close()

FLAG: Any = True
TO   = ("a@x.io",)

def test_messages_refuse_header_injection_and_oversized_parts () -> None:

    box = Mail()

    wrongs: tuple[tuple[str, Callable[[], object]], ...] = (
        ("to", lambda: Message((), "s")), ("to", lambda: Message(("a x@x.io",), "s")), ("to", lambda: Message(("plain",), "s")), ("to", lambda: Message(cast("Any", "a@x.io"), "s")),
        ("to", lambda: Message(("a@x.io\r\nBcc: b@x.io",), "s")), ("cc", lambda: Message(TO, "s", cc=("nope",))), ("bcc", lambda: Message(TO, "s", bcc=cast("Any", "b@x.io"))),
        ("recipients", lambda: Message(tuple(f"u{at}@x.io" for at in range(501)), "s")), ("subject", lambda: Message(TO, "")), ("subject", lambda: Message(TO, " ")),
        ("subject", lambda: Message(TO, "a\r\nBcc: b@x.io")), ("subject", lambda: Message(TO, "x" * 999)), ("subject", lambda: Message(TO, cast("Any", None))),
        ("text", lambda: Message(TO, "s", cast("Any", b"x"))), ("text", lambda: Message(TO, "s", "x" * (4 * 1024 * 1024 + 1))), ("html", lambda: Message(TO, "s", html=cast("Any", 7))),
        ("sender", lambda: Message(TO, "s", sender="")), ("sender", lambda: Message(TO, "s", sender="a\nb")), ("reply_to", lambda: Message(TO, "s", reply_to="x" * 321)),
        ("headers", lambda: Message(TO, "s", headers=cast("Any", [("a", "b")]))), ("headers", lambda: Message(TO, "s", headers={ "X-Tag": "a\r\nBcc: b@x.io" })),
        ("headers", lambda: Message(TO, "s", headers={ "Bcc": "b@x.io" })), ("headers", lambda: Message(TO, "s", headers={ "X Tag": "v" })), ("headers", lambda: Message(TO, "s", headers={ "": "v" })),
        ("headers", lambda: Message(TO, "s", headers={ f"X-{at}": "v" for at in range(65) })), ("headers", lambda: Message(TO, "s", headers={ "X-Tag": cast("Any", 1) })),
        ("attachments", lambda: Message(TO, "s", attachments=cast("Any", "a.txt"))), ("attachments", lambda: Message(TO, "s", attachments=(cast("Any", ("a.txt", b"x")),))),
        ("attachments", lambda: Message(TO, "s", attachments=(("../a.txt", b"x", "text/plain"),))), ("attachments", lambda: Message(TO, "s", attachments=(("a\n.txt", b"x", "text/plain"),))),
        ("attachments", lambda: Message(TO, "s", attachments=(("a.txt", cast("Any", "x"), "text/plain"),))), ("attachments", lambda: Message(TO, "s", attachments=(("a.txt", b"x", "text"),))),
        ("attachments", lambda: Message(TO, "s", attachments=(("a.txt", b"x", "text/plain; charset=utf-8"),))),
        ("attachments", lambda: Message(TO, "s", attachments=(("a.bin", bytes(13 * 1024 * 1024), "application/octet-stream"), ("b.bin", bytes(13 * 1024 * 1024), "application/octet-stream")))),
    )

    for what, make in wrongs:

        with pytest.raises(Fault) as refused: make()

        assert refused.value.code is Code.VALIDATION and refused.value.reason == "mail.message" and refused.value.errors == { what: ["is invalid"] }, what

    message = Message(cast("Any", ["a@x.io"]), "s", "t", "<p>h</p>", "Me <me@x.io>", "r@x.io", ("c@x.io",), ("b@x.io",), { "X-Tag": "v" }, (("a.txt", b"hi", "text/plain"),))

    assert message.to == ("a@x.io",) and message.recipients() == ("a@x.io", "c@x.io", "b@x.io")
    assert message.dump() == {
        "to": ["a@x.io"], "subject": "s", "text": "t", "html": "<p>h</p>", "sender": "Me <me@x.io>", "reply_to": "r@x.io", "cc": ["c@x.io"], "bcc": ["b@x.io"],
        "headers": { "X-Tag": "v" }, "attachments": [{ "name": "a.txt", "media": "text/plain", "size": 2, "data": "aGk=" }],
    }

    wrongs2: tuple[tuple[str, Callable[[], object]], ...] = (
        ("mail.to", lambda: box.compose("a@x.io", "s", cc=["nope"])), ("mail.to", lambda: box.compose("a@x.io", "s", bcc=cast("Any", 7))),
        ("mail.message", lambda: box.compose("a@x.io", "s", priority="high")), ("mail.message", lambda: box.compose(cast("Any", 7), "s")),
        ("mail.sender", lambda: Mail().setup("nope", "x")),
    )

    for reason, make in wrongs2:

        with pytest.raises(Fault) as wrong: make()

        assert wrong.value.reason == reason, reason

    wrongs3: tuple[tuple[str, Callable[[], object]], ...] = (
        ("name", lambda: Mail().setup("a@x.io", "")), ("name", lambda: Mail().setup("a@x.io", "Me <x>")), ("name", lambda: Mail().setup("a@x.io", cast("Any", 7))),
        ("mailer", lambda: Mail().setup("a@x.io", "Me", cast("Any", "log"))), ("remote", lambda: Http(cast("Any", "http://x"))),
        ("path", lambda: Http(Remote(net, "http://127.0.0.1:9"), "messages")), ("host", lambda: Smtp("a b")), ("port", lambda: Smtp("h", 0)), ("port", lambda: Smtp("h", 70000)),
        ("login", lambda: Smtp("h", 587, cast("Any", None))), ("login", lambda: Smtp("h", 587, "u", "p", cast("Any", "yes"))), ("wait", lambda: Smtp("h", 587, wait=0)),
        ("wait", lambda: Smtp("h", 587, wait=FLAG)),
    )

    for setting, make in wrongs3:

        with pytest.raises(Fault) as unset: make()

        assert unset.value.reason == "mail.settings" and unset.value.errors == { "setting": [setting] }, setting

    with pytest.raises(Fault) as blank: Smtp("")

    assert blank.value.reason == "mail.settings" and blank.value.errors == { "missing": ["host"] }

async def test_the_http_mailer_hides_a_broken_or_hostile_provider ( provider: Any ) -> None:


    box = Mail()

    box.setup("hello@engine.test", "Engine", Http(provider.remote(), "/v3/mail"))

    provider.answer({ "id": "msg-1", "status": "queued" }, {}, { "status": "bounced" })

    message = box.compose(["a@x.io"], "Hi", "plain", "<p>hi</p>", cc="c@x.io", headers={ "X-Tag": "t" }, attachments=[("a.txt", b"hi", "text/plain")])
    receipt = await box.send(message)

    assert (receipt.id, receipt.status) == ("msg-1", "queued") and receipt.accepted() and provider.seen[-1][:2] == ("POST", "/v3/mail")
    assert provider.last()["cc"] == ["c@x.io"] and provider.last()["attachments"][0]["data"] == "aGk=" and provider.last()["sender"] == "Engine <hello@engine.test>"
    assert (await box.send(message)).accepted() and not (await box.send(message)).accepted() and box.stats() == { "sent": 3 }

    for reason, answer in (("mail.reply", [1]), ("mail.reply", { "status": 7 }), ("mail.reply", b"<html>"), ("mail.provider", 400), ("mail.provider", 422), ("mail.provider", 429)):

        provider.answer(answer)

        with pytest.raises(Fault) as broken: await box.send(message)

        assert broken.value.reason == reason and broken.value.server(), (reason, answer)

    provider.answer(502)

    with pytest.raises(Fault) as down: await box.send(message)

    assert down.value.reason == "remote.502"

    with pytest.raises(Fault) as odd: await box.send(cast("Any", message.dump()))

    assert odd.value.reason == "mail.message"

    await box.close()

async def test_smtp_failures_become_faults () -> None:

    mailer = Smtp("127.0.0.1", 9, wait=0.3, tls=False)

    with pytest.raises(Fault) as down: await mailer.send(Message(TO, "s", "t"))

    assert down.value.code is Code.UNAVAILABLE and down.value.reason == "mail.smtp" and down.value.unknown
