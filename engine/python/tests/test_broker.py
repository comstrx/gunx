from engine.broker import Broker, Kafka, Memory, Message, Rabbit
from dataclasses import dataclass
from collections.abc import AsyncIterator, Mapping
from engine.error import Code, Fault
import aiormq, asyncio, os, pytest

AMQP = os.environ.get("ENGINE_AMQP_URL", "amqp://guest:guest@127.0.0.1:5672/")

@pytest.fixture(params=["memory", "rabbitmq"])
async def bus ( request: pytest.FixtureRequest ) -> AsyncIterator[Broker]:

    made = Broker()

    if request.param == "memory": made.setup(Memory())
    else:

        driver = Rabbit(AMQP, exchange="engine.test", prefetch=8)

        assert await driver.ready()

        made.setup(driver)

    await made.declare("engine.test.orders", "orders.*")
    await made.purge("engine.test.orders")

    yield made

    await made.delete("engine.test.orders")
    await made.close()

async def test_publish_pull_ack_and_nack ( bus: Broker ) -> None:

    sent = await bus.publish("orders.placed", { "id": 1 }, { "trace": "t1" })

    assert sent.headers["trace"] == "t1" and "sent_at" in sent.headers
    assert bus.queues() == ("engine.test.orders",) and bus.topics("engine.test.orders") == ("orders.*",)

    with pytest.raises(Fault) as unroutable: await bus.publish("nothing.here", {})

    assert unroutable.value.reason == "broker.unroutable"

    pulled = await bus.pull("engine.test.orders", limit=5, wait=2.0)

    assert len(pulled) == 1 and pulled[0].payload == { "id": 1 } and pulled[0].topic == "orders.placed" and pulled[0].headers["trace"] == "t1"

    await bus.nack(pulled[0], requeue=True)

    again = await bus.pull("engine.test.orders", limit=1, wait=2.0)

    assert again and again[0].payload == { "id": 1 } and again[0].attempts >= 1

    await bus.ack(again[0])
    await asyncio.sleep(0.05)

    assert await bus.pull("engine.test.orders", limit=1, wait=0.1) == []

    await bus.publish("orders.paid", { "id": 2 })
    await bus.publish("orders.paid", { "id": 3 })
    await asyncio.sleep(0.1)

    assert await bus.purge("engine.test.orders") >= 0

    with pytest.raises(Fault): bus.topics("nothing")

async def test_handlers_ack_or_requeue ( bus: Broker ) -> None:

    seen: list[int] = []

    async def handler ( message: Message ) -> None:

        if message.payload["id"] == 2 and message.attempts < 2: raise Fault(Code.UNAVAILABLE, reason="later")
        if message.payload["id"] == 3: raise Fault(Code.VALIDATION, reason="never")

        seen.append(message.payload["id"])

    for n in (1, 2, 3): await bus.publish("orders.placed", { "id": n })

    total = 0

    for _ in range(6):

        total += await bus.consume("engine.test.orders", handler, limit=5, wait=0.5)

        if total == 2: break

    assert total == 2 and sorted(seen) == [1, 2]
    assert bus.stats()["handled"] == 2 and bus.describe()["driver"] in ("memory", "rabbitmq")

    bus.subscribe("engine.test.orders", handler)

    await bus.publish("orders.placed", { "id": 9 })

    for _ in range(40):

        if 9 in seen: break

        await asyncio.sleep(0.05)

    assert 9 in seen

    bus.unsubscribe("engine.test.orders")

async def test_decorated_handlers_and_streams () -> None:

    bus = Broker()

    bus.setup(Memory())

    await bus.declare("q.stream", "s.*")
    await bus.declare("q.on", "o.*")

    seen: list[int] = []

    @bus.on("q.on", limit=4)
    async def handle ( message: Message ) -> None: seen.append(message.payload["n"])

    for n in range(3): await bus.publish("o.x", { "n": n })

    for _ in range(50):

        if len(seen) == 3: break

        await asyncio.sleep(0.01)

    assert sorted(seen) == [0, 1, 2]

    bus.unsubscribe("q.on")

    for n in range(2): await bus.publish("s.x", { "n": n })

    pulled: list[int] = []

    async for message in bus.stream("q.stream", limit=1, wait=0.1):

        pulled.append(message.payload["n"])

        await bus.ack(message)

        if len(pulled) == 2: bus.unsubscribe("q.stream")

    assert pulled == [0, 1]

    await bus.close()

async def test_memory_driver_edges () -> None:

    driver = Memory()

    with pytest.raises(Fault) as missing: await driver.pull("nothing", 1, 0.0)

    assert missing.value.reason == "broker.queue"
    assert await driver.purge("nothing") == 0 and await driver.depth("nothing") == 0

    await driver.declare("q", ["a.#"])
    await driver.publish(Message.make("a.b.c", { "x": 1 }))

    assert await driver.depth("q") == 1 and (await driver.pull("q", 1, 0.0))[0].queue == "q" and driver.inflight() == 1

    await driver.delete("q")

    broken = Rabbit("amqp://guest:guest@127.0.0.1:1/", wait=0.3)

    assert not await broken.ready()

    with pytest.raises(Fault) as down: await broken.publish(Message.make("x.y", {}))

    assert down.value.code is Code.UNAVAILABLE and down.value.reason == "broker.connect"

    await broken.close()

async def test_a_failing_message_climbs_its_attempts_and_is_dropped_at_its_tries ( bus: Broker ) -> None:

    seen: list[int] = []

    async def handler ( message: Message ) -> None:

        seen.append(message.attempts)

        raise Fault(Code.UNAVAILABLE, reason="later")

    await bus.publish("orders.placed", { "id": 1 })

    for _ in range(8):

        await bus.consume("engine.test.orders", handler, limit=1, wait=1.0, tries=4)

        if len(seen) == 4: break

    assert seen == [1, 2, 3, 4]
    assert await bus.pull("engine.test.orders", limit=1, wait=0.2) == [] and await bus.depth("engine.test.orders") == 0

async def test_a_handler_that_breaks_is_retried_then_dropped_and_never_stops_the_loop ( bus: Broker ) -> None:

    seen: list[tuple[int, int]] = []

    async def handler ( message: Message ) -> None:

        seen.append((message.payload["id"], message.attempts))

        if message.payload["id"] == 1: raise KeyError("missing")

    bus.subscribe("engine.test.orders", handler, limit=4, tries=2)

    await bus.publish("orders.placed", { "id": 1 })
    await bus.publish("orders.placed", { "id": 2 })

    for _ in range(80):

        if len(seen) == 3: break

        await asyncio.sleep(0.05)

    assert sorted(seen) == [(1, 1), (1, 2), (2, 1)] and bus.stats()["handled"] == 1

    bus.unsubscribe("engine.test.orders")
    bus.subscribe("engine.test.orders", handler, limit=4, tries=2)

    await bus.publish("orders.placed", { "id": 3 })

    for _ in range(80):

        if (3, 1) in seen: break

        await asyncio.sleep(0.05)

    assert seen.count((3, 1)) == 1

    bus.unsubscribe("engine.test.orders")

    assert await bus.drain() >= 1 and await bus.drain() == 0

async def test_what_is_not_pulled_yet_still_counts_and_is_purged ( bus: Broker ) -> None:

    for n in range(3): await bus.publish("orders.placed", { "id": n })

    await asyncio.sleep(0.1)

    first = await bus.pull("engine.test.orders", limit=1, wait=2.0)

    await asyncio.sleep(0.1)

    assert len(first) == 1 and await bus.depth("engine.test.orders") == 2
    assert await bus.purge("engine.test.orders") == 2 and await bus.depth("engine.test.orders") == 0
    assert await bus.pull("engine.test.orders", limit=4, wait=0.2) == []

    await bus.ack(first[0])

    assert await bus.depth("engine.test.absent") == 0 and await bus.purge("engine.test.absent") == 0

    with pytest.raises(Fault) as missing: await bus.pull("engine.test.absent", limit=1, wait=0.1)

    assert missing.value.code is Code.INTERNAL and missing.value.reason == "broker.queue"

async def take ( source: Broker | Rabbit, queue: str, count: int ) -> list[Message]:

    taken: list[Message] = []

    for _ in range(40):

        if len(taken) >= count: break

        taken += await source.pull(queue, count - len(taken), 0.25)

    return taken

async def test_a_batch_is_settled_at_once_and_never_comes_back ( bus: Broker ) -> None:

    for n in range(6): await bus.publish("orders.placed", { "id": n })

    pulled = await take(bus, "engine.test.orders", 6)

    assert sorted(message.payload["id"] for message in pulled) == list(range(6))

    await bus.ack(*pulled[1:4])
    await bus.ack()
    await bus.ack(pulled[0], pulled[4], pulled[4])
    await bus.nack(pulled[5], requeue=True)

    again = await take(bus, "engine.test.orders", 1)

    assert [message.payload["id"] for message in again] == [pulled[5].payload["id"]] and again[0].attempts == 2

    await bus.ack(*again)
    await asyncio.sleep(0.1)

    assert await bus.depth("engine.test.orders") == 0 and await bus.pull("engine.test.orders", limit=6, wait=0.2) == []

@pytest.fixture
async def rabbit () -> AsyncIterator[Rabbit]:

    driver = Rabbit(AMQP, exchange="engine.test", prefetch=8)

    await driver.declare("engine.test.resume", ["resume.*"])
    await driver.purge("engine.test.resume")

    yield driver

    await driver.delete("engine.test.resume")
    await driver.close()

@pytest.fixture
async def wire () -> AsyncIterator[aiormq.abc.AbstractChannel]:

    connection = await aiormq.connect(AMQP)

    yield await connection.channel()

    await connection.close()

async def test_rabbit_resumes_after_its_channel_and_its_connection_die ( rabbit: Rabbit ) -> None:

    await rabbit.publish(Message.make("resume.a", { "n": 1 }))

    first = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert len(first) == 1 and first[0].attempts == 1

    await (await rabbit.inlet()).close()

    with pytest.raises(Fault) as stale: await rabbit.ack(first[0])

    assert stale.value.code is Code.CONFLICT and stale.value.reason == "broker.stale" and not stale.value.retryable()

    with pytest.raises(Fault) as refused: await rabbit.nack(first[0], requeue=False)

    assert refused.value.reason == "broker.stale"

    await rabbit.nack(first[0], requeue=True)

    again = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert len(again) == 1 and again[0].id == first[0].id and again[0].attempts >= 2 and again[0].tag != first[0].tag

    await rabbit.ack(again[0])
    await rabbit.publish(Message.make("resume.b", { "n": 2 }))

    held = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert len(held) == 1 and held[0].payload == { "n": 2 }

    await (await rabbit.inlet()).connection.close()

    back = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert len(back) == 1 and back[0].id == held[0].id and back[0].attempts >= 2

    with pytest.raises(Fault): await rabbit.ack(held[0])

    await rabbit.ack(back[0])
    await (await rabbit.outlet()).connection.close()
    await rabbit.publish(Message.make("resume.c", { "n": 3 }))

    last = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert [message.payload for message in last] == [{ "n": 3 }]

    await rabbit.ack(last[0])
    await asyncio.sleep(0.1)

    assert await rabbit.depth("engine.test.resume") == 0

async def test_rabbit_loop_keeps_consuming_through_a_dead_channel ( rabbit: Rabbit ) -> None:

    bus = Broker()

    bus.setup(rabbit)

    seen: list[int] = []

    async def handler ( message: Message ) -> None: seen.append(message.payload["n"])

    bus.subscribe("engine.test.resume", handler)

    await bus.publish("resume.a", { "n": 1 })

    for _ in range(80):

        if seen: break

        await asyncio.sleep(0.05)

    await (await rabbit.inlet()).close()
    await bus.publish("resume.a", { "n": 2 })

    for _ in range(120):

        if 2 in seen: break

        await asyncio.sleep(0.05)

    assert seen == [1, 2]

    bus.unsubscribe("engine.test.resume")

    await bus.drain()

async def test_rabbit_keeps_one_consumer_under_concurrent_pulls ( rabbit: Rabbit, wire: aiormq.abc.AbstractChannel ) -> None:

    pulled = await asyncio.gather(*(rabbit.pull("engine.test.resume", 1, 0.3) for _ in range(12)))
    found  = await wire.queue_declare("engine.test.resume", passive=True)

    assert pulled == [[]] * 12 and found.consumer_count == 1

    await (await rabbit.inlet()).close()

    pulled = await asyncio.gather(*(rabbit.pull("engine.test.resume", 1, 0.3) for _ in range(12)))
    found  = await wire.queue_declare("engine.test.resume", passive=True)

    assert pulled == [[]] * 12 and found.consumer_count == 1

async def test_rabbit_discards_a_malformed_body_and_keeps_the_rest ( rabbit: Rabbit, wire: aiormq.abc.AbstractChannel ) -> None:

    for body in (b"{not json", b"[1, 2]", b"\xff\xfe"):

        await wire.basic_publish(body, exchange="engine.test", routing_key="resume.raw")

    await wire.basic_publish(b"", exchange="engine.test", routing_key="resume.raw")
    await rabbit.publish(Message.make("resume.good", { "n": 1 }, { "trace": "t9" }))

    pulled = await rabbit.pull("engine.test.resume", 8, 2.0)

    await asyncio.sleep(0.2)

    assert [(message.topic, message.payload) for message in pulled] == [("resume.raw", {}), ("resume.good", { "n": 1 })]
    assert pulled[1].headers["trace"] == "t9" and pulled[0].id

    for message in pulled: await rabbit.ack(message)

    await rabbit.close()

    found = await wire.queue_declare("engine.test.resume", passive=True)

    for _ in range(40):

        if found.consumer_count == 0: break

        await asyncio.sleep(0.05)

        found = await wire.queue_declare("engine.test.resume", passive=True)

    assert found.message_count == 0 and found.consumer_count == 0

async def test_rabbit_survives_a_probe_of_a_missing_queue_and_a_deleted_queue ( rabbit: Rabbit, wire: aiormq.abc.AbstractChannel ) -> None:

    await rabbit.publish(Message.make("resume.a", { "n": 1 }))

    held = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert await rabbit.depth("engine.test.absent") == 0 and await rabbit.purge("engine.test.absent") == 0

    with pytest.raises(Fault) as long: await rabbit.publish(Message.make("resume." + "x" * 300, {}))

    assert long.value.reason == "broker.topic"

    with pytest.raises(Fault) as nowhere: await rabbit.publish(Message.make("nothing.here", {}))

    assert nowhere.value.reason == "broker.unroutable"

    await rabbit.ack(held[0])
    await wire.queue_delete("engine.test.resume")
    await asyncio.sleep(0.3)

    with pytest.raises(Fault) as gone: await rabbit.pull("engine.test.resume", 1, 0.2)

    assert gone.value.reason == "broker.queue"

    await rabbit.declare("engine.test.resume", ["resume.*"])
    await rabbit.publish(Message.make("resume.a", { "n": 2 }))

    fresh = await rabbit.pull("engine.test.resume", 1, 3.0)

    assert [message.payload for message in fresh] == [{ "n": 2 }]

    await rabbit.ack(fresh[0])

async def test_rabbit_settles_a_leading_run_in_one_frame_and_never_reaches_past_it (
    rabbit: Rabbit, monkeypatch: pytest.MonkeyPatch,
) -> None:

    for n in range(7): await rabbit.publish(Message.make("resume.a", { "n": n }))

    held    = await take(rabbit, "engine.test.resume", 7)
    channel = await rabbit.inlet()
    real    = channel.basic_ack
    sent: list[tuple[int, bool]] = []

    async def spy ( tag: int, multiple: bool = False, wait: bool = True ) -> None:

        sent.append((tag, multiple))

        await real(tag, multiple, wait)

    monkeypatch.setattr(channel, "basic_ack", spy)

    assert [message.payload["n"] for message in held] == list(range(7))

    tags = [message.tag[1] for message in held]

    await rabbit.ack(held[1], held[3])

    assert sent == [(tags[1], False), (tags[3], False)]

    await rabbit.ack(held[2], held[0], held[4])

    assert sent[2:] == [(tags[4], True)]

    await rabbit.ack(held[5])

    assert sent[3:] == [(tags[5], False)]

    with pytest.raises(Fault) as twice: await rabbit.ack(held[0])

    assert twice.value.code is Code.CONFLICT and twice.value.reason == "broker.stale" and len(sent) == 4

    with pytest.raises(Fault) as mixed: await rabbit.ack(held[2], held[6], held[4])

    assert mixed.value.reason == "broker.stale" and sent[4:] == [(tags[6], False)]

    with pytest.raises(Fault) as gone: await rabbit.nack(held[6], requeue=False)

    assert gone.value.reason == "broker.stale"

    await rabbit.nack(held[6], requeue=True)
    await rabbit.publish(Message.make("resume.b", { "n": 7 }))
    await rabbit.publish(Message.make("resume.b", { "n": 8 }))

    more = await take(rabbit, "engine.test.resume", 2)

    assert [message.payload["n"] for message in more] == [7, 8] and all(message.attempts == 1 for message in more)

    await asyncio.gather(rabbit.ack(more[1]), rabbit.nack(more[0], requeue=False), rabbit.ack())
    await asyncio.sleep(0.2)

    assert await rabbit.inlet() is channel and not channel.is_closed and await rabbit.depth("engine.test.resume") == 0
    assert await rabbit.pull("engine.test.resume", 4, 0.3) == []

async def test_rabbit_maps_deliveries_without_trusting_their_headers () -> None:

    driver = Rabbit(AMQP)

    def made ( body: bytes, headers: Mapping[str, object] | None = None, *, redelivered: bool = False ) -> Delivered:

        return Delivered(body, Header(Properties("m-1", headers)), Delivery("orders.placed", 7), redelivered)

    first = driver.message(made(b'{"id": 1}', { "trace": "t1", "x-death": 3 }), "orders", 4)

    assert first is not None and first.attempts == 1 and first.headers == { "trace": "t1" } and first.tag == (4, 7)
    assert first.id == "m-1" and first.queue == "orders" and first.topic == "orders.placed"

    cases: tuple[tuple[Mapping[str, object] | None, bool, int], ...] = (
        ({ "x-acquired-count": 3 }, True, 4), ({ "x-delivery-count": 2, "x-acquired-count": 5 }, True, 6),
        ({ "x-delivery-count": "many" }, True, 2), ({ "x-delivery-count": -4 }, False, 1), (None, True, 2),
    )

    for headers, redelivered, attempts in cases:

        mapped = driver.message(made(b"{}", headers, redelivered=redelivered), "orders")

        assert mapped is not None and mapped.attempts == attempts, headers

    assert driver.message(made(b"{broken"), "orders") is None
    assert driver.message(made(b'"text"'), "orders") is None

    await driver.close()

@dataclass(frozen=True, slots=True)
class Properties:

    message_id : str | None
    headers    : Mapping[str, object] | None

@dataclass(frozen=True, slots=True)
class Header:

    properties : Properties

@dataclass(frozen=True, slots=True)
class Delivery:

    routing_key  : str
    delivery_tag : int

@dataclass(frozen=True, slots=True)
class Delivered:

    body        : bytes
    header      : Header
    delivery    : Delivery
    redelivered : bool

@dataclass(frozen=True, slots=True)
class Record:

    topic     : str
    partition : int
    offset    : int
    value     : bytes | None
    headers   : tuple[tuple[str, bytes], ...]

async def test_kafka_driver_maps_records_and_refuses_a_dead_cluster () -> None:

    driver = Kafka("kafka://127.0.0.1:1,127.0.0.1:2", group="tests", wait=0.3)

    assert driver.describe()["servers"] == 2 and driver.describe()["group"] == "tests" and not await driver.ready()
    assert Kafka.pattern(["orders.*", "audit.#", "plain.topic"]) == r"^(?:(?:orders\.[^.]+)|(?:audit\..*)|(?:plain\.topic))$"

    message = driver.message(Record("orders.placed", 2, 41, b'{"id": 1}', (("trace", b"t1"), ("id", b"m-1"), ("attempts", b"3"))), "orders")

    assert message.id == "m-1" and message.attempts == 3 and message.headers == { "trace": "t1" } and message.payload == { "id": 1 }
    assert message.queue == "orders" and message.tag is not None and message.tag[1] == 41 and message.tag[0].partition == 2

    bare = driver.message(Record("orders.placed", 0, 7, None, (("attempts", b"many"),)), "orders")

    assert bare.id == "orders.placed:0:7" and bare.payload == {} and bare.attempts == 1

    for poison in (b"{broken", b"[1, 2]"):

        with pytest.raises(Fault): driver.message(Record("orders.placed", 0, 8, poison, ()), "orders")

    later = driver.message(Record("orders.placed", 2, 57, b"{}", ()), "orders")
    other = driver.message(Record("orders.paid", 0, 3, b"{}", ()), "ledger")
    marks = Kafka.marks([later, message, other, Message.make("orders.placed", {})])

    assert marks == { "orders": { message.tag[0]: 58 }, "ledger": { other.tag[0]: 4 } } and Kafka.marks([]) == {}

    await driver.ack(later, message, other)
    await driver.ack()

    with pytest.raises(Fault) as down: await driver.publish(Message.make("orders.placed", {}))

    assert down.value.code is Code.UNAVAILABLE and down.value.reason == "broker.connect"

    with pytest.raises(Fault) as unknown: await driver.pull("nothing", 1, 0.0)

    assert unknown.value.reason == "broker.queue"

    with pytest.raises(Fault) as refused: await driver.purge("orders")

    assert refused.value.reason == "broker.capability"

    await driver.close()
