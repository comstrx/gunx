from collections.abc import Callable
from enum import StrEnum
from functools import partial
from typing import Any, ClassVar, cast, override

from engine.adapter import Adapter, Manager, Receipt
from engine.error import Code, Fault
from engine.log import log
import asyncio, pytest

class Pigeon(Adapter):

    family       = "mail"
    name         = "pigeon"
    capabilities = frozenset({ "send" })

class Owl(Adapter):

    family       = "mail"
    name         = "owl"
    capabilities = frozenset({ "send", "track" })

class Truck(Adapter):

    family = "freight"
    name   = "truck"

class Hawk(Adapter):

    family = "mail"
    name   = "hawk"
    closed : ClassVar[list[str]] = []

    @override
    async def close ( self ) -> None:

        self.closed.append(self.name)

class Crow(Hawk):

    name = "crow"

    @override
    async def close ( self ) -> None:

        raise OSError("crow gone")

class State(StrEnum):

    SENT = "sent"
    LOST = "lost"

class Word(str):

    __slots__ = ()

class Odd:

    @override
    def __eq__ ( self, other: object ) -> bool: raise ValueError("ambiguous")

    @override
    def __hash__ ( self ) -> int: return 1

def refused ( work: Callable[[], object] ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL

    return caught.value

def made ( **declared: object ) -> Adapter:

    return cast("Adapter", type("Made", (Adapter,), { "family": "mail", "name": "made", **declared })())

async def test_adapters_declare_what_they_can () -> None:

    owl = Owl()

    assert owl.can("track") and not owl.can("fly") and not owl.can("") and not owl.can("sen")
    assert owl.describe() == { "family": "mail", "name": "owl", "capabilities": ["send", "track"] }
    assert Truck().describe() == { "family": "freight", "name": "truck", "capabilities": [] }
    assert await owl.ready()

    await owl.close()

    owl.ensure("send")

    fault = refused(partial(Pigeon().ensure, "track"))

    assert fault.reason == "mail.capability" and fault.errors == { "capability": ["track"] }
    assert fault.message == "pigeon cannot track"

    for capability in (5, None, ["send"], { "send" }, b"send"):

        assert not owl.can(cast("Any", capability))
        assert refused(partial(owl.ensure, cast("Any", capability))).errors == { "capability": [type(capability).__name__] }

    assert refused(partial(owl.ensure, "s" * 5000)).errors == { "capability": ["s" * 64] }
    assert len(refused(partial(owl.ensure, "s" * 5000)).message) == len("owl cannot ") + 64

def test_need_names_every_setting_left_blank () -> None:

    owl = Owl()

    owl.need()
    owl.need(key="k", zero=0, off=False, ratio=0.0, odd=Odd(), raw=b" ", many=[0], pair=(None,), held={ "a": None })

    fault = refused(partial(owl.need, key="", region=None, ok="x"))

    assert fault.reason == "mail.settings" and fault.errors == { "missing": ["key", "region"] }
    assert fault.message == "owl needs key, region"

    blanks: dict[str, object] = {
        "spaced": "   ", "lined": "\n\t", "raw": b"", "buffer": bytearray(), "many": [], "pair": (), "held": {}, "one": set(),
        "frozen": frozenset(),
    }

    assert refused(partial(owl.need, **blanks, ok=" x ")).errors == { "missing": list(blanks) }

async def test_managers_hold_one_family () -> None:

    mail: Manager[Adapter] = Manager("mail")

    assert not mail.ready() and mail.default() is None and mail.names() == () and mail.family == "mail"
    assert mail.describe() == { "family": "mail", "default": None, "adapters": {} }

    pigeon = Pigeon()

    assert mail.use(pigeon) is pigeon and mail.default() == "pigeon"

    mail.use(Owl(), default=True)
    mail.use(Hawk())

    assert mail.ready() and mail.default() == "owl" and mail.names() == ("hawk", "owl", "pigeon")
    assert mail.get().name == "owl" and mail.get("").name == "owl" and mail.get("pigeon") is pigeon
    assert mail.has("owl") and not mail.has("falcon") and not mail.has("")
    assert mail.matrix() == { "hawk": [], "owl": ["send", "track"], "pigeon": ["send"] }
    assert [adapter.name for adapter in mail.supporting("track")] == ["owl"]
    assert [adapter.name for adapter in mail.supporting("send")] == ["pigeon", "owl"] and mail.supporting("fly") == []
    assert mail.describe() == { "family": "mail", "default": "owl", "adapters": mail.matrix() }

    fault = refused(partial(mail.get, "falcon"))

    assert fault.reason == "mail.adapter" and fault.message == "No mail adapter falcon"
    assert refused(partial(mail.get, "f" * 5000)).message == "No mail adapter " + "f" * 64

    for name in (5, 0, False, b"owl", ["owl"], ("owl",), Odd()):

        assert refused(partial(mail.get, cast("Any", name))).message == f"No mail adapter {type(name).__name__}"
        assert not mail.has(cast("Any", name)) and not mail.forget(cast("Any", name))

    for capability in (5, None, ["send"], Odd()): assert mail.supporting(cast("Any", capability)) == []

    assert await mail.close() == 3 and mail.ready()

    mail.clear()

    assert not mail.ready() and mail.default() is None and refused(mail.get).message == "No mail adapter"
    assert refused(partial(mail.get, "owl")).reason == "mail.adapter" and await mail.close() == 0

def test_a_replaced_or_forgotten_adapter_leaves_the_default_sound () -> None:

    mail: Manager[Adapter] = Manager("mail")
    first, second = Owl(), Owl()

    log.setup("debug", "json")

    with log.capture() as events:

        mail.use(first)
        mail.use(first)
        mail.use(Hawk(), default=True)
        mail.use(second)
        mail.use(Pigeon())

    assert [event["replaced"] for event in events] == [False, False, False, True, False]
    assert all(event["event"] == "adapter.registered" and event["family"] == "mail" for event in events)
    assert [event["name"] for event in events] == ["owl", "owl", "hawk", "owl", "pigeon"]
    assert mail.get("owl") is second and mail.default() == "hawk" and mail.names() == ("hawk", "owl", "pigeon")

    assert mail.forget("pigeon") and not mail.forget("pigeon") and mail.default() == "hawk"
    assert mail.forget("hawk") and mail.default() == "owl" and mail.get() is second
    assert mail.forget("owl") and mail.default() is None and not mail.ready()

    mail.use(Pigeon())

    assert mail.default() == "pigeon"

def test_a_manager_refuses_what_it_cannot_hold () -> None:

    for family in ("", None, 5, "Mail", "mail box", "9mail", "mail.box", "m" * 33, ["mail"], b"mail", "mail\n"):

        fault = refused(partial(Manager, cast("Any", family)))

        assert fault.reason == "adapter.family" and fault.errors is None

    assert Manager("m" * 32).family == "m" * 32 and Manager("mail_2").family == "mail_2"

    mail: Manager[Adapter] = Manager("mail")

    for stray, word in ((object(), "object"), (None, "NoneType"), (Owl, "type"), ("owl", "str"), (Truck(), "freight")):

        fault = refused(partial(mail.use, cast("Any", stray)))

        assert fault.reason == "mail.family" and fault.errors == { "family": [word] }

    assert refused(partial(mail.use, made(family="f" * 5000))).errors == { "family": ["f" * 64] }
    assert refused(partial(mail.use, made(family=5))).errors == { "family": ["int"] }
    assert refused(partial(mail.use, made(family=Odd()))).errors == { "family": ["Odd"] }

    names = (("", ""), (5, "int"), (None, "NoneType"), (["made"], "list"), ("two words", "two words"), ("-made", "-made"))
    led   = (("_made", "_made"), (".made", ".made"), (":made", ":made"), (Word("made"), "Word"))

    for name, word in (*names, *led, ("n" * 65, "n" * 64), ("made\n", "made\n"), ("m/1", "m/1"), (b"made", "bytes")):

        fault = refused(partial(mail.use, made(name=name)))

        assert fault.reason == "mail.name" and fault.errors == { "name": [word] }

    worded = frozenset({ Word("send") })

    for able in ("send", ["send"], { "send" }, None, frozenset({ "send", 5 }), frozenset({ "" }), frozenset({ "s" * 65 }), worded):

        fault = refused(partial(mail.use, made(capabilities=able)))

        assert fault.reason == "mail.capabilities" and fault.errors == { "name": ["made"] }

    assert not mail.ready() and mail.default() is None

    for name in ("n" * 64, "SES", "gpt-4o", "eu.west:1", "9", "a_b"):

        assert mail.use(made(name=name, capabilities=frozenset({ "s" * 64 }))).name == name

    assert mail.names() == tuple(sorted(("n" * 64, "SES", "gpt-4o", "eu.west:1", "9", "a_b"))) and mail.default() == "n" * 64

    mail.use(made(name="wide", capabilities=frozenset("hgfedcba")))

    assert mail.matrix()["wide"] == list("abcdefgh") and mail.get("wide").describe()["capabilities"] == list("abcdefgh")

async def test_close_reaches_every_adapter_past_a_failing_one () -> None:

    mail: Manager[Adapter] = Manager("mail")

    Hawk.closed.clear()
    log.setup("debug", "json")

    class Late(Hawk):

        name = "late"

        @override
        async def close ( self ) -> None:

            await asyncio.sleep(0)

            mail.use(Pigeon())
            mail.forget("crow")

            await super().close()

    mail.use(Crow())
    mail.use(Late())
    mail.use(Hawk())

    with log.capture() as events:

        assert await mail.close() == 2

    failed = [event for event in events if event["event"] == "adapter.close"]

    assert Hawk.closed == ["late", "hawk"] and mail.names() == ("hawk", "late", "pigeon")
    assert [(event["level"], event["family"], event["name"], event["kind"]) for event in failed] == [("warning", "mail", "crow", "OSError")]

    class Stopped(Hawk):

        name = "stopped"

        @override
        async def close ( self ) -> None:

            raise asyncio.CancelledError

    mail.clear()
    mail.use(Stopped())
    mail.use(Hawk())

    with pytest.raises(asyncio.CancelledError): await mail.close()

    assert Hawk.closed == ["late", "hawk"]

def test_receipts () -> None:

    assert Receipt("1", "sent").accepted() and not Receipt("2", "failed", { "why": "x" }).accepted()
    assert all(Receipt("1", status).accepted() for status in ("accepted", "sent", "queued", "delivered", "ok"))
    assert all(Receipt("1", status).accepted() for status in ("SENT", "Queued", " ok ", "Delivered\n"))
    assert not any(Receipt("1", status).accepted() for status in ("", "sen", "sent!", "okay", "rejected", "o k"))
    assert not any(Receipt("1", status).accepted() for status in ("O\u212a", "\u017fent", "\xa0sent", "sent\u2003"))
    assert not any(Receipt("1", cast("Any", status)).accepted() for status in (None, 5, True, ["sent"], b"sent", Odd()))
    assert Receipt("1", State.SENT).accepted() and not Receipt("1", State.LOST).accepted()

    first, second = Receipt("1", "sent", { "a": [1] }), Receipt("1", "sent", { "b": 2 })

    assert hash(first) == hash(second) and first != second and first == Receipt("1", "sent", { "a": [1] })
    assert len({ first, second, Receipt("1", "sent", { "a": [1] }) }) == 2 and Receipt("1", "sent").raw == {}
    assert Receipt("1", "sent").raw is not Receipt("1", "sent").raw

    with pytest.raises(AttributeError): cast("Any", first).status = "failed"

async def test_an_adapter_hides_a_provider_refusal_and_reads_a_loose_receipt () -> None:

    owl = Owl()

    async def answer ( value: object ) -> object:

        if isinstance(value, Fault): raise value

        return value

    assert await owl.upstream(answer(7)) == 7

    for given, reason, errors in (
        (Fault(Code.BAD_REQUEST, reason="remote.bad_request"), "mail.provider", { "provider": ["remote.bad_request"] }),
        (Fault(Code.NOT_FOUND), "mail.provider", { "provider": ["not_found"] }),
        (Fault(Code.TOO_MANY_REQUESTS, reason="remote.too_many_requests"), "mail.provider", { "provider": ["remote.too_many_requests"] }),
    ):

        with pytest.raises(Fault) as hidden: await owl.upstream(answer(given))

        assert (hidden.value.code, hidden.value.reason, hidden.value.errors) == (Code.BAD_GATEWAY, reason, errors) and hidden.value.server()

    with pytest.raises(Fault) as garbled: await owl.upstream(answer(Fault(Code.BAD_REQUEST, reason="json.decode")))

    assert (garbled.value.code, garbled.value.reason) == (Code.UNAVAILABLE, "mail.reply")

    for given in (Fault(Code.UNAVAILABLE, reason="remote.503"), Fault(Code.TIMEOUT, reason="net.timeout"), Fault(Code.INTERNAL, reason="x")):

        with pytest.raises(Fault) as passed: await owl.upstream(answer(given))

        assert passed.value is given

    made = owl.receipt({ "id": "m-1", "status": "Queued", "extra": 1 })

    assert (made.id, made.status, made.raw) == ("m-1", "queued", { "id": "m-1", "status": "Queued", "extra": 1 }) and made.accepted()
    assert owl.receipt(None).status == "sent" and len(owl.receipt({}).id) == 12 and owl.receipt({}, "accepted").accepted()
    assert owl.receipt({ "status": "failed" }).status == "failed" and not owl.receipt({ "status": "failed" }).accepted()

    bodies: tuple[Any, ...] = ([], "text", 7, { "id": 7 }, { "id": "" }, { "id": "a\nb" }, { "id": "x" * 257 }, { "status": "" }, { "status": "x" * 65 }, { "status": "مرسل" }, { "status": None })

    for body in bodies:

        with pytest.raises(Fault) as broken: owl.receipt(cast("Any", body))

        assert (broken.value.code, broken.value.reason, broken.value.unknown) == (Code.UNAVAILABLE, "mail.reply", True), body
