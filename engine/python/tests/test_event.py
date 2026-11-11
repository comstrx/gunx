from engine.broker import Broker, Memory
from engine.context import context
from engine.database import Database, Migrator, Outbox, Sql
from engine.error import Code, Fault
from engine.event import Event, Events, Signal, Subscriber
from engine.queue import Queue
from typing import Any, ClassVar, cast
from pathlib import Path
import asyncio, pytest

@pytest.fixture
async def events () -> Events:

    bus = Broker()

    bus.setup(Memory())

    made = Events()

    made.setup("orders", bus)

    await made.declare("orders.*", "payments.*")

    return made

async def test_events_carry_the_context_and_reach_listeners ( events: Events ) -> None:

    seen: list[str] = []

    async def on_any ( event: Event ) -> None: seen.append(f"any:{event.name}")

    async def on_placed ( event: Event ) -> None: seen.append(f"placed:{event.data['id']}:{event.actor}:{event.tenant}")

    async def broken ( event: Event ) -> None: raise Fault(Code.INTERNAL, reason="listener")

    assert events.listen("orders.*", on_any) == 1 and events.listen("orders.placed", on_placed) == 2 and events.listen("orders.placed", broken) == 3
    assert events.patterns() == ("orders.*", "orders.placed") and len(events.listeners("orders.placed")) == 3

    with context.scope(actor={ "id": 7 }, tenant="t1"): made = await events.dispatch("orders.placed", id=5)

    assert made.source == "orders" and made.actor == "7" and made.tenant == "t1" and made.version == 1
    assert seen == ["any:orders.placed", "placed:5:7:t1"] and events.stats()["dispatched"] == 1 and events.stats()["handled"] == 2
    assert Event.load(made.dump()) == made

    with pytest.raises(Fault) as bad: await events.dispatch("noname")

    assert bad.value.reason == "event.name"

    assert await events.consume(wait=0.2) == 1 and seen[-1] == "placed:5:7:t1" and events.stats()["handled"] == 2

    foreign = Event(name="payments.settled", data={ "id": 1 }, source="payments")

    await events._publish_(foreign)

    async def on_settled ( event: Event ) -> None: seen.append(f"settled:{event.source}")

    events.listen("payments.*", on_settled)

    assert await events.consume(wait=0.5) == 1 and seen[-1] == "settled:payments"

    events.start()
    await events._publish_(Event(name="payments.refunded", data={}, source="payments"))

    for _ in range(40):

        if "settled:payments" in seen[-1:] and len(seen) >= 5: break

        await asyncio.sleep(0.05)

    await events.stop()

    assert events.describe()["inbox"] == "events.orders" and Events.blueprint("orders_inbox").primary() == "id"

    events.clear()

    assert events.patterns() == ()

async def test_subscribers_once_listeners_waiters_and_queued_listeners () -> None:

    bus = Broker()

    bus.setup(Memory())

    events = Events()
    jobs   = Queue()

    events.setup("shop", bus)
    jobs.setup(bus, queues=("default",))

    await jobs.declare()
    await events.declare("orders.*", "users.*", "x.*")

    seen: list[str] = []

    class Audit(Subscriber):

        listens: ClassVar[dict[str, str]] = { "orders.*": "on_order", "users.joined": "on_join" }

        async def on_order ( self, event: Event ) -> None: seen.append(f"audit:{event.name}")

        async def on_join ( self, event: Event ) -> None: seen.append("audit:joined")

    assert events.subscribe(Audit()) == 2 and events.patterns() == ("orders.*", "users.joined")

    async def once_only ( event: Event ) -> None: seen.append("once")

    async def later ( event: Event ) -> None: seen.append(f"queued:{event.data['id']}")

    events.listen("orders.paid", once_only, once=True)
    events.queue(jobs)
    events.listen("orders.paid", later, queued=True)

    waiting = asyncio.ensure_future(events.wait("orders.*", timeout=1))

    await asyncio.sleep(0)
    await events.dispatch("orders.paid", id=9)
    await events.dispatch("orders.paid", id=10)

    assert (await waiting).data == { "id": 9 } and seen.count("once") == 1 and "queued:9" not in seen
    assert await jobs.work(wait=0.5) == 2 and seen[-2:] == ["queued:9", "queued:10"]

    with pytest.raises(Fault) as timed: await events.wait("never.*", timeout=0.01)

    assert timed.value.code is Code.TIMEOUT and timed.value.reason == "event.wait"
    assert events.forget("users.joined") == 1 and events.forget("nothing") == 0 and "users.joined" not in events.patterns()

    bare = Events()

    bare.setup("bare", bus)
    bare.listen("x.y", later, queued=True)

    await bare.dispatch("x.y")

    assert bare.stats()["handled"] == 0 and bare.stats()["dispatched"] == 1

    events.clear()

    assert events.patterns() == ()

async def test_a_failed_listener_is_handled_again_and_a_handled_event_only_once ( tmp_path: Path ) -> None:

    bus  = Broker()
    base = Database()

    bus.setup(Memory())

    await base.connect(f"sqlite://{tmp_path / 'inbox.db'}", size=2)

    inbox  = Events.blueprint("shop_inbox")
    outbox = Outbox(base)

    outbox.setup(Outbox.blueprint("shop_outbox"))

    await Migrator(base, [inbox, outbox.table()], Migrator.ledger("shop_schema")).apply()

    events = Events()

    events.setup("shop", bus)
    events.durable(outbox, base, inbox)

    await events.declare("payments.*")

    seen: list[str] = []
    fail = [KeyError("first"), Fault(Code.UNAVAILABLE, reason="second")]

    async def settle ( event: Event ) -> None:

        seen.append(event.id)

        if fail: raise fail.pop(0)

    events.listen("payments.*", settle)

    paid = Event(name="payments.settled", data={ "id": 1 }, source="payments")

    await events._publish_(paid)

    for _ in range(6):

        if await events.consume(wait=0.2) == 1: break

    assert seen == [paid.id] * 3 and events.stats()["skipped"] == 0 and events.stats()["handled"] == 1
    assert await base.value(Sql.select("shop_inbox").count()) == 1

    await events._publish_(paid)

    assert await events.consume(wait=0.2) == 1 and seen == [paid.id] * 3 and events.stats()["skipped"] == 1
    assert await base.value(Sql.select("shop_inbox").count()) == 1

    await base.close()

async def test_settings_listeners_and_names_are_validated () -> None:

    bus = Broker()

    bus.setup(Memory())

    events = Events()

    async def on_any ( event: Event ) -> None: return None

    for setting, make in (
        ("source", lambda: events.setup("")), ("source", lambda: events.setup("a b")), ("source", lambda: events.setup(cast("Any", 7))), ("source", lambda: events.setup("shop", inbox="")),
        ("broker", lambda: events.setup("shop", cast("Any", "bus"))), ("listener", lambda: events.listen("", on_any)), ("listener", lambda: events.listen("a b", on_any)),
        ("listener", lambda: events.listen("orders.*", cast("Any", "handler"))), ("listener", lambda: events.listen(cast("Any", None), on_any)),
    ):

        with pytest.raises(Fault) as unset: make()

        assert unset.value.code is Code.INTERNAL and unset.value.reason == "event.settings" and unset.value.errors == { "setting": [setting] }, setting

    events.setup("shop", bus)

    for name in ("", "noname", "a b.c", "a\n.b", "x" * 129, cast("Any", None), cast("Any", 7)):

        with pytest.raises(Fault) as bad: await events.dispatch(name)

        assert bad.value.reason == "event.name", name

    for setting, work in (("pattern", events.wait("")), ("timeout", events.wait("a.b", 0)), ("timeout", events.wait("a.b", cast("Any", "5"))), ("timeout", events.wait("a.b", 3601))):

        with pytest.raises(Fault) as wrong: await work

        assert wrong.value.reason == "event.settings" and wrong.value.errors == { "setting": [setting] }, setting

    with pytest.raises(Fault) as shape: Event.load({ "name": "a.b", "version": "one" })

    assert shape.value.code in (Code.VALIDATION, Code.BAD_REQUEST)

    assert Event.load({ "name": "a.b", "extra": 1 }).dump()["name"] == "a.b"

    events.clear()

class Nameless(Signal):

    x : int = 0

class Placed(Signal):

    name: ClassVar[str] = "orders.placed"

    order : str
    total : int = 0

async def test_a_signal_is_a_typed_event_that_dispatches_itself ( events: Events ) -> None:

    seen: list[Event] = []

    async def keep ( event: Event ) -> None: seen.append(event)

    events.listen("orders.*", keep)

    sent = await Placed(order="o1", total=5).dispatch(events, actor="u1")

    assert sent.name == "orders.placed" and sent.data == { "order": "o1", "total": 5 } and sent.actor == "u1" and seen == [sent]

    with pytest.raises(Fault) as unnamed: await Nameless().dispatch(events)

    assert unnamed.value.reason == "event.name"
