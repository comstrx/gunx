from collections.abc import Callable
from enum import StrEnum
from functools import partial
from typing import Any, ClassVar, cast, override

from engine.adapter import Adapter, Manager, Receipt
from engine.error import Code, Fault
from engine.context import context
from engine.json import json
from engine.rand import rand
from engine.exception import Exceptions
from engine.metric import Metrics
from engine.log import log
import asyncio, pytest, weakref

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

    assert await mail.close() == 3 and not mail.ready()

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

            with pytest.raises(Fault) as blocked: mail.use(Pigeon())

            assert blocked.value.reason == "mail.closing"

            await super().close()

    mail.use(Crow())
    mail.use(Late())
    mail.use(Hawk())

    with log.capture() as events:

        assert await mail.close() == 2

    failed = [event for event in events if event["event"] == "adapter.close"]

    assert Hawk.closed == ["late", "hawk"] and mail.names() == ()
    assert [(event["level"], event["family"], event["name"], event["kind"]) for event in failed] == [("warning", "mail", "crow", "OSError")]

    class Stopped(Hawk):

        name = "stopped"

        @override
        async def close ( self ) -> None:

            raise asyncio.CancelledError

    mail = Manager("mail")
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

        code = Code.UNAVAILABLE if given.retryable() else Code.INTERNAL

        assert (hidden.value.code, hidden.value.reason, hidden.value.errors) == (code, reason, errors)
        assert hidden.value.server() and hidden.value.retryable() is given.retryable()

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

@pytest.mark.parametrize("code", [Code.BAD_REQUEST, Code.UNAUTHORIZED, Code.NOT_FOUND, Code.TOO_MANY_REQUESTS, Code.REQUEST_TIMEOUT, Code.CONFLICT, Code.LOCKED])
@pytest.mark.parametrize("unknown", [False, True])
async def test_upstream_preserves_retry_safety_and_delay ( code: Code, unknown: bool ) -> None:

    original = Fault(code, reason="remote.refused", retry_after=4.5, unknown=unknown)

    async def reject () -> None: raise original

    with pytest.raises(Fault) as caught: await Owl().upstream(reject())

    found = caught.value

    assert found.retryable() is original.retryable()
    assert found.safe() is original.safe()
    assert found.safe(idempotent=True) is original.safe(idempotent=True)
    assert found.retry_after == 4.5 and found.unknown is unknown and found.__cause__ is original
    assert found.server() and found.reason == "mail.provider"

async def test_upstream_does_not_relabel_local_encoding_or_cancellation () -> None:

    async def reject ( failure: BaseException ) -> None: raise failure

    fault = Fault(Code.INTERNAL, reason="json.encode")

    with pytest.raises(Fault) as caught: await Owl().upstream(reject(fault))

    assert caught.value is fault

    cancelled = asyncio.CancelledError()

    with pytest.raises(asyncio.CancelledError) as stopped: await Owl().upstream(reject(cancelled))

    assert stopped.value is cancelled

@pytest.mark.parametrize("body", [{"status": " "}, {"status": "\t\n"}, {"status": "a\nb"}, {"status": "a\x00b"}, {"id": " "}])
def test_receipt_rejects_empty_normalized_or_control_fields ( body: dict[str, str] ) -> None:

    with pytest.raises(Fault) as caught: Owl().receipt(body)

    assert caught.value.reason == "mail.reply" and caught.value.unknown
    assert not caught.value.safe() and caught.value.safe(idempotent=True)

def test_receipt_owns_its_raw_snapshot () -> None:

    source: dict[str, Any] = { "id": "r-1", "status": "sent", "nested": { "items": [1, 2] } }
    first = Owl().receipt(source)
    second = Receipt("r-1", "sent", source)

    source["nested"]["items"].append(3)

    assert first.raw["nested"] == second.raw["nested"] == { "items": [1, 2] }

    first.raw["nested"]["items"].append(4)

    assert second.raw["nested"]["items"] == [1, 2]
    assert source["nested"]["items"] == [1, 2, 3]
    assert "nested" not in repr(first)

async def test_retired_resources_are_drained_once_without_closing_active_replacement () -> None:

    class Owned(Adapter):

        family = "mail"
        name = "owned"

        def __init__ ( self ) -> None: self.closed = 0

        @override
        async def close ( self ) -> None: self.closed += 1

    first, second, third = Owned(), Owned(), Owned()
    mail: Manager[Adapter] = Manager("mail")

    mail.use(first)
    mail.use(first)
    mail.use(second)

    assert first.closed == 0 and mail.get() is second and mail.pending() == 1
    assert await mail.drain() == 1
    assert first.closed == 1 and second.closed == 0 and mail.ready() and mail.pending() == 0

    mail.use(third)
    assert mail.forget("owned")
    assert not mail.ready()
    assert await mail.close() == 2
    assert (first.closed, second.closed, third.closed) == (1, 1, 1)
    assert await mail.close() == await mail.drain() == 0

async def test_reregistering_a_retired_instance_transfers_it_back_to_active () -> None:

    class Owned(Hawk):

        name = "owned"
        closed: ClassVar[list[str]] = []

    first, second = Owned(), Owned()
    mail: Manager[Adapter] = Manager("mail")

    mail.use(first)
    mail.use(second)
    mail.use(first)

    assert await mail.drain() == 1 and len(Owned.closed) == 1 and mail.get() is first
    assert await mail.close() == 1 and len(Owned.closed) == 2 and mail.names() == ()

async def test_close_failure_and_cancellation_keep_unfinished_resources () -> None:

    class Owned(Adapter):

        family = "mail"
        name = "owned"

        def __init__ ( self, fail: bool = False ) -> None:

            self.calls = 0
            self.fail = fail

        @override
        async def close ( self ) -> None:

            self.calls += 1

            if self.fail: raise OSError("unavailable")

    class Last(Owned):

        name = "last"

    first, last = Owned(fail=True), Last()
    mail: Manager[Adapter] = Manager("mail")

    mail.use(first)
    mail.use(last)

    assert await mail.close() == 1 and not mail.ready() and mail.pending() == 1
    assert (first.calls, last.calls) == (1, 1)

    first.fail = False

    assert await mail.close() == 1 and (first.calls, last.calls) == (2, 1)

    class Cancel(Owned):

        name = "cancel"

        @override
        async def close ( self ) -> None:

            self.calls += 1

            if self.fail: raise asyncio.CancelledError

    cancelled, last = Cancel(fail=True), Last()
    mail.use(cancelled)
    mail.use(last)

    with pytest.raises(asyncio.CancelledError): await mail.close()

    assert not mail.ready() and (cancelled.calls, last.calls) == (1, 0)

    cancelled.fail = False

    assert await mail.close() == 2
    assert (cancelled.calls, last.calls) == (2, 1)

async def test_concurrent_close_and_mutation_are_refused_without_double_close () -> None:

    entered, release = asyncio.Event(), asyncio.Event()

    class Slow(Adapter):

        family = "mail"
        name = "slow"

        def __init__ ( self ) -> None: self.calls = 0

        @override
        async def close ( self ) -> None:

            self.calls += 1
            entered.set()
            await release.wait()

    mail: Manager[Adapter] = Manager("mail")
    slow = Slow()
    mail.use(slow)
    task = asyncio.create_task(mail.close())
    await entered.wait()

    try:

        with pytest.raises(Fault) as closed: await mail.close()
        with pytest.raises(Fault) as drained: await mail.drain()
        with pytest.raises(Fault) as changed: mail.use(Pigeon())

        assert all(hit.value.reason == "mail.closing" for hit in (closed, drained, changed))
        assert slow.calls == 1 and not mail.ready()

    finally:

        release.set()
        await task

    assert await mail.close() == 0

async def test_task_cancellation_retains_current_and_remaining_resources () -> None:

    entered, release = asyncio.Event(), asyncio.Event()

    class Slow(Adapter):

        family = "mail"
        name = "slow"

        def __init__ ( self ) -> None: self.calls = 0

        @override
        async def close ( self ) -> None:

            self.calls += 1
            entered.set()
            await release.wait()

    class Last(Slow):

        name = "last"

    first, last = Slow(), Last()
    mail: Manager[Adapter] = Manager("mail")
    mail.use(first)
    mail.use(last)
    closing = asyncio.create_task(mail.close())
    await entered.wait()
    closing.cancel()

    with pytest.raises(asyncio.CancelledError): await closing

    assert (first.calls, last.calls) == (1, 0) and not mail.ready()

    release.set()

    assert await mail.close() == 2 and (first.calls, last.calls) == (2, 1)
    assert await mail.close() == 0

def test_receipt_snapshot_keeps_cycles_detached () -> None:

    source: dict[str, Any] = {}
    source["loop"] = source
    held = Receipt("r", "sent", source)

    assert held.raw is not source and held.raw["loop"] is held.raw

async def test_drain_releases_retired_references () -> None:

    mail: Manager[Adapter] = Manager("mail")
    first = Owl()
    retired = weakref.ref(first)

    mail.use(first)
    mail.use(Owl())

    del first

    assert retired() is not None
    assert await mail.drain() == 1
    assert retired() is None and mail.ready()

    await mail.close()


def test_capability_lookup_refuses_unhashable_strings () -> None:

    class Unhashable(str):

        __slots__ = ()

        @override
        def __hash__ ( self ) -> int: raise TypeError("unhashable")

    assert not Owl().can(Unhashable("send"))

async def test_foundation_pipeline_keeps_task_identity_safety_and_redaction () -> None:

    registry = Metrics("proof")
    active = registry.gauge("active")
    calls = registry.counter("calls")
    exceptions = Exceptions()
    reported: list[tuple[Fault, int]] = []
    finished: list[int] = []
    credentials: list[str] = []

    exceptions.report(lambda fault, _: reported.append((fault, context.get("tenant"))))
    log.setup("error", "json")

    async def work ( index: int ) -> None:

        identity = rand.hex(8)
        credential = rand.token(24)
        credentials.append(credential)

        with context.scope(request_id=identity, tenant=index), active.track():

            await asyncio.sleep(0)
            original = Fault(Code.TOO_MANY_REQUESTS, reason="remote.busy", retry_after=0.25, unknown=True)
            packet = json.decode(json.encode({ "context": context.dump(), "fault": original }))
            moved = Fault.load(packet["fault"])

            async def reject () -> None: raise moved

            with pytest.raises(Fault) as caught: await Pigeon().upstream(reject())

            fault = exceptions.handle(caught.value)

            assert fault.retry_after == 0.25 and fault.unknown and not fault.safe() and fault.safe(idempotent=True)
            assert fault.__cause__ is moved and moved.dump() == original.dump()
            assert packet["context"]["request_id"] == identity and packet["context"]["tenant"] == index
            log.error("refused", detail=f"bEaReR {credential}")
            assert context.defer(lambda: finished.append(index))
            assert await context.flush() == 1
            calls.inc(outcome="refused")

    with log.capture() as events: await asyncio.gather(*(work(index) for index in range(32)))

    assert active.value() == 0 and calls.value(outcome="refused") == 32
    assert sorted(finished) == list(range(32)) == sorted(tenant for _, tenant in reported)
    assert exceptions.stats()["reported"] == 32 and len(events) == 32
    assert sorted(event["tenant"] for event in events) == list(range(32))
    assert all(credential not in str(events) for credential in credentials)
    assert all(event["detail"] == "bEaReR ***" for event in events)
