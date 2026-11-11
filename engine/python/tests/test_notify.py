from engine.error import Code, Fault
from engine.net import Remote, net
from engine.notify import Http, Log, Notice, Notify
from collections.abc import Callable
from typing import Any, cast
import pytest

async def test_notices_reach_every_token_once () -> None:

    service = Notify()
    logger  = Log()

    service.setup(logger)

    notice = service.compose(["t1", "t2", "t1"], "Hello", "Body", { "k": "v" }, badge=3, urgent=True)

    assert notice.tokens == ("t1", "t2") and notice.badge == 3 and notice.urgent and notice.dump()["data"] == { "k": "v" }
    assert (await service.push(notice)).raw == { "delivered": 2 } and service.stats() == { "sent": 1 } and service.ready()
    assert service.compose("t1", "x", "y").tokens == ("t1",) and service.describe()["default"] == "log"

    with pytest.raises(Fault) as empty: service.compose([], "x", "y")

    assert empty.value.code is Code.VALIDATION and empty.value.reason == "notify.tokens"

    with pytest.raises(Fault) as blank: service.compose(["t1"], "", "y")

    assert blank.value.reason == "notify.notice"

    with pytest.raises(Fault): service.compose([f"t{i}" for i in range(600)], "x", "y")
    with pytest.raises(Fault): await Notify().push(notice)

    assert logger.clear() == 1

    await service.close()

FLAG: Any = True

def test_notices_and_settings_are_validated () -> None:

    service = Notify()

    wrongs: tuple[tuple[str, Callable[[], object]], ...] = (
        ("tokens", lambda: Notice((), "t", "b")), ("tokens", lambda: Notice(("",), "t", "b")), ("tokens", lambda: Notice(("a b",), "t", "b")),
        ("tokens", lambda: Notice(("t", "t"), "t", "b")), ("tokens", lambda: Notice(("x" * 4097,), "t", "b")), ("tokens", lambda: Notice(cast("Any", "t1"), "t", "b")),
        ("tokens", lambda: Notice(tuple(f"t{at}" for at in range(501)), "t", "b")), ("title", lambda: Notice(("t",), "", "b")), ("title", lambda: Notice(("t",), "x" * 257, "b")),
        ("title", lambda: Notice(("t",), cast("Any", 7), "b")), ("body", lambda: Notice(("t",), "t", "x" * 4097)), ("body", lambda: Notice(("t",), "t", cast("Any", None))),
        ("data", lambda: Notice(("t",), "t", "b", cast("Any", [("a", "b")]))), ("data", lambda: Notice(("t",), "t", "b", { "": "v" })), ("data", lambda: Notice(("t",), "t", "b", { "k": cast("Any", 1) })),
        ("data", lambda: Notice(("t",), "t", "b", { f"k{at}": "v" for at in range(65) })), ("data", lambda: Notice(("t",), "t", "b", { "k": "x" * 1025 })),
        ("badge", lambda: Notice(("t",), "t", "b", badge=-1)), ("badge", lambda: Notice(("t",), "t", "b", badge=100000)), ("badge", lambda: Notice(("t",), "t", "b", badge=FLAG)),
        ("sound", lambda: Notice(("t",), "t", "b", sound="")), ("sound", lambda: Notice(("t",), "t", "b", sound="x" * 65)), ("urgent", lambda: Notice(("t",), "t", "b", urgent=cast("Any", 1))),
    )

    for what, make in wrongs:

        with pytest.raises(Fault) as refused: make()

        reason = "notify.tokens" if what == "tokens" else "notify.notice"

        assert refused.value.code is Code.VALIDATION and refused.value.reason == reason and refused.value.errors == { what: ["is invalid"] }, what

    with pytest.raises(Fault) as options: service.compose("t1", "t", "b", color="red")

    assert options.value.reason == "notify.notice" and options.value.errors == { "options": ["color"] }

    with pytest.raises(Fault) as kind: service.compose(cast("Any", 7), "t", "b")

    assert kind.value.reason == "notify.tokens"

    wrongs2: tuple[tuple[str, Callable[[], object]], ...] = (
        ("pusher", lambda: service.setup(cast("Any", "log"))), ("remote", lambda: Http(cast("Any", "http://x"))),
        ("path", lambda: Http(Remote(net, "http://127.0.0.1:9"), "push")),
    )

    for setting, make in wrongs2:

        with pytest.raises(Fault) as wrong: make()

        assert wrong.value.reason == "notify.settings" and wrong.value.errors == { "setting": [setting] }, setting

    assert Notice(cast("Any", ["t1", "t2"]), "t", "b").tokens == ("t1", "t2")

async def test_the_http_pusher_hides_a_broken_or_hostile_provider ( provider: Any ) -> None:


    service = Notify()

    service.setup(Http(provider.remote()))

    provider.answer({ "id": "n-1", "status": "accepted", "failed": 0 }, None, { "status": "partial" })

    notice  = service.compose(["t1", "t2"], "Hello", "Body", { "k": "v" }, badge=1, sound="ping", urgent=True)
    receipt = await service.push(notice)

    assert (receipt.id, receipt.status) == ("n-1", "accepted") and receipt.accepted() and provider.seen[-1][:2] == ("POST", "/push")
    assert provider.last() == { "tokens": ["t1", "t2"], "title": "Hello", "body": "Body", "data": { "k": "v" }, "badge": 1, "sound": "ping", "urgent": True }
    assert (await service.push(notice)).accepted() and not (await service.push(notice)).accepted() and service.stats() == { "sent": 3 }

    for reason, answer in (("notify.reply", [1]), ("notify.reply", { "id": "" }), ("notify.reply", b"x"), ("notify.provider", 400), ("notify.provider", 403), ("notify.provider", 429)):

        provider.answer(answer)

        with pytest.raises(Fault) as broken: await service.push(notice)

        assert broken.value.reason == reason and broken.value.server(), (reason, answer)

    provider.answer(500)

    with pytest.raises(Fault) as down: await service.push(notice)

    assert down.value.reason == "remote.500"

    with pytest.raises(Fault) as odd: await service.push(cast("Any", notice.dump()))

    assert odd.value.reason == "notify.notice"

    await service.close()
