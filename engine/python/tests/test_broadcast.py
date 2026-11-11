from engine.broadcast import Broadcast
from engine.error import Code, Fault
from engine.json import json
from engine.socket import Hub, Socket
from collections.abc import Callable
from typing import Any, cast
import asyncio, os, pytest

REDIS = os.environ.get("ENGINE_REDIS_URL", "redis://127.0.0.1:6379/14")

class Pipe:

    def __init__ ( self ) -> None: self.sent: list[str] = []

    async def send ( self, text: str ) -> None: self.sent.append(text)

    async def close ( self, code: int, reason: str ) -> None: self.sent.append("closed")

async def test_broadcast_reaches_local_and_remote_workers () -> None:

    first  = Broadcast()
    second = Broadcast()
    a, b   = Hub(), Hub()

    first.setup(a, REDIS, topic="engine:test:broadcast")
    second.setup(b, REDIS, topic="engine:test:broadcast")

    one = Socket("s1", Pipe(), "u1")
    two = Socket("s2", Pipe(), "u2")

    a.add(one)
    b.add(two)
    a.join(one, "room")
    b.join(two, "room")

    second.start()

    await asyncio.sleep(0.3)

    assert await first.publish("room", "news", { "n": 1 }) == 1 and one.connection.sent and first.ready()

    for _ in range(40):

        if two.connection.sent: break

        await asyncio.sleep(0.05)

    assert two.connection.sent and '"event":"news"' in two.connection.sent[0] and second.stats()["relayed"] == 1
    assert await first.to("u1", "direct") == 1 and first.describe()["topic"] == "engine:test:broadcast"

    await second.stop()
    await first.close()
    await second.close()

    assert not first.ready()

async def test_broadcast_without_redis_stays_local () -> None:

    local = Broadcast()
    hub   = Hub()

    local.setup(hub)

    local.start()

    assert not local.ready() and await local.publish("x", "e") == 0 and local.stats() == { "sent": 1, "relayed": 0, "dropped": 0 }

    broken = Broadcast()

    broken.setup(Hub(), "redis://127.0.0.1:1/0")

    with pytest.raises(Fault) as down: await broken.publish("x", "e")

    assert down.value.reason == "broadcast.redis"

    await broken.close()

async def test_a_hostile_relay_payload_is_dropped_and_counted () -> None:

    hub   = Hub()
    local = Broadcast()
    pipe  = Pipe()
    one   = Socket("s1", pipe, "u1")

    local.setup(hub)
    hub.add(one)
    hub.join(one, "room")

    worker = local.describe()["worker"]
    good   = json.encode({ "channel": "room", "event": "news", "data": { "n": 1 }, "worker": "other" })

    assert await local.relay(good) and pipe.sent and local.stats()["relayed"] == 1
    assert not await local.relay(json.encode({ "channel": "room", "event": "mine", "worker": worker })) and len(pipe.sent) == 1

    for raw in (
        b"not json", b"[]", b"null", b'"text"', json.encode({ "channel": 7, "event": "e" }), json.encode({ "channel": "room" }),
        json.encode({ "channel": "room", "event": "" }), json.encode({ "channel": "room", "event": "e", "data": [1] }),
        json.encode({ "channel": "a\nb", "event": "e" }), json.encode({ "channel": "x" * 129, "event": "e" }), b"x" * (256 * 1024 + 1),
    ):

        assert not await local.relay(raw), raw[:40]

    assert local.stats() == { "sent": 0, "relayed": 1, "dropped": 11 } and len(pipe.sent) == 1
    assert await local.relay(json.encode({ "channel": "room", "event": "e", "data": None, "worker": "w" })) and len(pipe.sent) == 2

    for reason, work in (
        ("broadcast.channel", local.publish("", "e")), ("broadcast.channel", local.publish(cast("Any", 7), "e")), ("broadcast.channel", local.publish("x" * 129, "e")),
        ("broadcast.event", local.publish("room", "")), ("broadcast.event", local.publish("room", "a\nb")), ("broadcast.data", local.publish("room", "e", cast("Any", [1]))),
        ("broadcast.event", local.to("u1", "")), ("broadcast.data", local.to("u1", "e", cast("Any", "x"))),
    ):

        with pytest.raises(Fault) as refused: await work

        assert refused.value.code is Code.VALIDATION and refused.value.reason == reason, reason

    settings: tuple[tuple[str, Callable[[], object]], ...] = (
        ("hub", lambda: local.setup(cast("Any", "hub"))), ("topic", lambda: local.setup(topic="")), ("topic", lambda: local.setup(topic="a b")),
        ("topic", lambda: local.setup(topic=cast("Any", None))), ("url", lambda: local.setup(url="http://x")), ("url", lambda: local.setup(url=cast("Any", 7))),
    )

    for setting, make in settings:

        with pytest.raises(Fault) as wrong: make()

        assert wrong.value.reason == "broadcast.settings" and wrong.value.errors == { "setting": [setting] }, setting

    assert await local.publish("room", "e", { "k": "v" }) == 1 and len(pipe.sent) == 3

    await local.close()
