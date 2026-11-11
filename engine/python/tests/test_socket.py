from collections.abc import AsyncIterator, Callable
from engine.cache import Memory, cache
from engine.error import Code, Fault
from engine.http import App, Channel
from engine.json import json
from engine.socket import Frame, Hub, Socket, Sockets
from typing import Any, cast
import aiohttp, asyncio, pytest

FLAG: Any = True

@pytest.fixture
async def live () -> AsyncIterator[tuple[Sockets, str]]:

    cache.use(Memory())

    sockets = Sockets()

    sockets.setup(capacity=2, limit=512, idle=2.0)

    @sockets.on("echo")
    async def echo ( socket: Socket, frame: Frame ) -> None:

        await socket.send("echoed", frame.data, frame.channel, frame.id)

    @sockets.on("shout")
    async def shout ( socket: Socket, frame: Frame ) -> None:

        if not frame.channel: raise Fault(Code.VALIDATION, reason="socket.channel")

        await sockets.hub.emit(frame.channel, "shouted", frame.data, skip=socket.id)

    app = App("Socket App", docs=False)

    app.mount(Channel.define("/socket", sockets))

    async with app.listen() as url: yield sockets, url.replace("http", "ws") + "/socket"

async def read ( ws: aiohttp.ClientWebSocketResponse ) -> dict[str, object]:

    message = await asyncio.wait_for(ws.receive(), 3)

    return dict(json.decode(message.data))

async def test_sockets_join_rooms_and_echo ( live: tuple[Sockets, str] ) -> None:

    sockets, url = live

    async with aiohttp.ClientSession() as http, http.ws_connect(url) as first, http.ws_connect(url) as second:

        hello = await read(first)

        assert hello["event"] == "connected" and hello["data"]["id"]  # type: ignore[index]

        await read(second)

        await first.send_str(json.dumps({ "event": "join", "channel": "room:1", "id": "j1" }))
        await second.send_str(json.dumps({ "event": "join", "channel": "room:1" }))

        joined = await read(first)

        assert joined["event"] == "joined" and joined["channel"] == "room:1" and joined["id"] == "j1"

        await read(second)

        assert sockets.hub.count("room:1") == 2 and sockets.hub.channels() == ("room:1",) and sockets.hub.count() == 2

        await first.send_str(json.dumps({ "event": "echo", "data": { "n": 1 }, "id": "e1" }))

        echoed = await read(first)

        assert echoed == { "event": "echoed", "channel": None, "data": { "n": 1 }, "id": "e1" }

        await first.send_str(json.dumps({ "event": "shout", "channel": "room:1", "data": { "hi": True } }))

        shouted = await read(second)

        assert shouted["event"] == "shouted" and shouted["data"] == { "hi": True }

        await first.send_str(json.dumps({ "event": "shout" }))

        error = await read(first)

        assert error["event"] == "error" and error["data"] == { "code": "validation", "reason": "socket.channel" }

        await first.send_str(json.dumps({ "event": "nothing" }))

        unknown = await read(first)

        assert unknown["data"]["reason"] == "socket.event"  # type: ignore[index]

        await first.send_str(json.dumps({ "event": "ping", "id": "p" }))

        pong = await read(first)

        assert pong["event"] == "pong" and pong["id"] == "p"

        await first.send_str(json.dumps({ "event": "leave", "channel": "room:1" }))
        await read(first)

        assert sockets.hub.count("room:1") == 1

        async with http.ws_connect(url) as third:

            refused = await third.receive()

            assert refused.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.TEXT)

        await first.send_str("x" * 600)

        closed = await first.receive()

        assert closed.type in (aiohttp.WSMsgType.TEXT, aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED)

    await asyncio.sleep(0.05)

    assert sockets.hub.count() == 0 and sockets.events() == ("echo", "shout") and sockets.describe()["sockets"] == 0

def test_frames_and_hubs_offline () -> None:

    frame = Frame.decode('{"event": "x", "data": {"a": 1}}')

    assert frame.event == "x" and frame.data == { "a": 1 } and frame.channel is None and json.decode(frame.encode())["event"] == "x"

    with pytest.raises(Fault) as big: Frame.decode("x" * 10, limit=5)

    assert big.value.code is Code.TOO_LARGE

    with pytest.raises(Fault): Frame.decode('{"nope": 1}')

    hub = Hub(capacity=1)

    class Pipe:

        def __init__ ( self ) -> None: self.sent: list[str] = []

        async def send ( self, text: str ) -> None: self.sent.append(text)

        async def close ( self, code: int, reason: str ) -> None: self.sent.append(f"close:{code}")

    one = Socket("s1", Pipe(), "user-1")

    hub.add(one)

    with pytest.raises(Fault) as full: hub.add(Socket("s2", Pipe(), None))

    assert full.value.reason == "socket.capacity"

    hub.join(one, "a")

    assert hub.members("a") == [one] and one.describe()["channels"] == ["a"]
    assert asyncio.run(hub.emit("a", "hello", { "x": 1 })) == 1 and asyncio.run(hub.send_to("user-1", "direct")) == 1
    assert asyncio.run(hub.emit("a", "hello", skip="s1")) == 0 and len(one.connection.sent) == 2
    assert asyncio.run(hub.close_all()) == 1 and hub.count() == 0 and one.closed

async def test_hubs_replay_history_and_sockets_gate_joins_and_rates () -> None:

    class Pipe:

        def __init__ ( self ) -> None: self.sent: list[dict[str, object]] = []

        async def send ( self, text: str ) -> None: self.sent.append(dict(json.decode(text)))

        async def close ( self, code: int, reason: str ) -> None: self.sent.append({ "close": code })

    sockets = Sockets()

    sockets.setup(capacity=5, rate=2, span=60.0, channels=1, history=2)

    async def gate ( socket: Socket, channel: str ) -> bool: return not channel.startswith("private")

    sockets.authorize(gate)

    early = Socket("s1", Pipe(), "u1")
    late  = Socket("s2", Pipe(), "u2")

    sockets.hub.add(early)
    sockets.hub.add(late)

    await sockets.dispatch(early, Frame(event="join", channel="room"))

    for n in range(3): await sockets.hub.emit("room", "tick", { "n": n })

    assert sockets.hub.history("room") == [("tick", { "n": 1 }), ("tick", { "n": 2 })]

    await sockets.dispatch(late, Frame(event="join", channel="room", id="j"))

    events = [frame["event"] for frame in late.connection.sent]

    assert events == ["joined", "tick", "tick"] and late.connection.sent[1]["data"] == { "n": 1 }

    await sockets.dispatch(late, Frame(event="join", channel="second"))

    assert late.connection.sent[-1]["data"] == { "code": "too_many_requests", "reason": "socket.channels" }

    await sockets.dispatch(early, Frame(event="leave", channel="room"))
    await sockets.dispatch(early, Frame(event="join", channel="private:1"))

    assert early.connection.sent[-1]["data"] == { "code": "forbidden", "reason": "socket.forbidden" } and "private:1" not in early.channels
    assert sockets.allow(early) and sockets.allow(early) and not sockets.allow(early) and sockets.describe()["refused"] == 1
    assert sockets.describe()["history"] == 2 and sockets.describe()["rooms"] == 1

    await sockets.hub.close_all()

    assert sockets.hub.history("room") == []

async def test_presence_whispers_and_broadcasts () -> None:

    class Pipe:

        def __init__ ( self ) -> None: self.sent: list[dict[str, object]] = []

        async def send ( self, text: str ) -> None: self.sent.append(dict(json.decode(text)))

        async def close ( self, code: int, reason: str ) -> None: self.sent.append({ "close": code })

    sockets = Sockets()

    sockets.setup(capacity=5)

    one = Socket("s1", Pipe(), "user-1")
    two = Socket("s2", Pipe(), "user-2")
    far = Socket("s3", Pipe(), "user-2")

    for socket in (one, two, far): sockets.hub.add(socket)

    await sockets.dispatch(one, Frame(event="join", channel="room"))
    await sockets.dispatch(two, Frame(event="join", channel="room"))
    await sockets.dispatch(far, Frame(event="join", channel="other"))

    assert sockets.hub.presence("room") == ["user-1", "user-2"] and sockets.hub.find("s2") is two and sockets.hub.find("zz") is None

    await sockets.dispatch(one, Frame(event="presence", channel="room", id="p"))

    assert one.connection.sent[-1]["event"] == "presence" and one.connection.sent[-1]["data"] == { "actors": ["user-1", "user-2"] }

    await sockets.dispatch(far, Frame(event="presence", channel="room"))

    assert far.connection.sent[-1]["data"]["reason"] == "socket.forbidden"

    await sockets.dispatch(one, Frame(event="whisper", data={ "to": "s2", "data": { "hi": 1 } }))

    assert two.connection.sent[-1] == { "event": "whisper", "channel": None, "data": { "from": "s1", "data": { "hi": 1 } }, "id": None }

    await sockets.dispatch(one, Frame(event="whisper", data={ "to": "s3", "data": {} }, id="w"))

    assert one.connection.sent[-1]["data"]["reason"] == "socket.whisper" and one.connection.sent[-1]["id"] == "w"

    await sockets.dispatch(one, Frame(event="whisper", data={ "to": "s1" }))

    assert one.connection.sent[-1]["data"]["reason"] == "socket.whisper"
    assert await sockets.hub.broadcast("notice", { "n": 1 }, skip="s1") == 2 and far.connection.sent[-1]["event"] == "notice"
    assert await sockets.hub.close_all() == 3

class Pipe:

    def __init__ ( self ) -> None:

        self.sent: list[dict[str, Any]] = []

    async def send ( self, text: str ) -> None:

        self.sent.append(dict(json.decode(text)))

    async def close ( self, code: int, reason: str ) -> None:

        self.sent.append({ "close": code, "reason": reason })

async def test_the_hub_contains_a_crashing_handler_or_gate_and_refuses_bad_settings () -> None:

    sockets = Sockets()
    pipe    = Pipe()
    socket  = Socket("s1", pipe, "user-1")

    @sockets.on("crash")
    async def crash ( socket: Socket, frame: Frame ) -> None: raise ValueError("boom")

    @sockets.on("deny")
    async def deny ( socket: Socket, frame: Frame ) -> None: raise Fault(Code.FORBIDDEN, reason="nope")

    async def gate ( socket: Socket, channel: str ) -> bool:

        if channel == "crashing": raise RuntimeError("gate")
        if channel == "faulty": raise Fault(Code.UNAVAILABLE, reason="gate.down")

        return channel == "open"

    sockets.authorize(gate)
    sockets.hub.add(socket)

    await sockets.dispatch(socket, Frame(event="crash", id="1"))
    await sockets.dispatch(socket, Frame(event="deny", id="2"))
    await sockets.dispatch(socket, Frame(event="join", channel="open", id="3"))
    await sockets.dispatch(socket, Frame(event="join", channel="crashing", id="4"))
    await sockets.dispatch(socket, Frame(event="join", channel="faulty", id="5"))
    await sockets.dispatch(socket, Frame(event="join", channel="x" * 129, id="6"))
    await sockets.dispatch(socket, Frame(event="join", channel="a\nb", id="7"))
    await sockets.dispatch(socket, Frame(event="unknown", id="8"))

    assert [frame.get("id") for frame in pipe.sent] == ["1", "2", "3", "4", "5", "6", "7", "8"] and socket.channels == { "open" }
    assert [(frame["event"], frame["data"].get("code"), frame["data"].get("reason")) for frame in pipe.sent] == [
        ("error", "internal", None), ("error", "forbidden", "nope"), ("joined", None, None), ("error", "forbidden", "socket.forbidden"),
        ("error", "forbidden", "socket.forbidden"), ("error", "validation", "socket.channel"), ("error", "validation", "socket.channel"),
        ("error", "not_found", "socket.event"),
    ]
    assert not socket.closed and sockets.events() == ("crash", "deny")

    with pytest.raises(Fault) as bad: sockets.hub.join(socket, "")

    assert bad.value.reason == "socket.channel"

    for setting, make in (
        ("capacity", lambda: sockets.setup(capacity=0)), ("capacity", lambda: sockets.setup(capacity=cast("Any", "9"))), ("limit", lambda: sockets.setup(limit=0)),
        ("idle", lambda: sockets.setup(idle=0)), ("idle", lambda: sockets.setup(idle=cast("Any", "1"))), ("rate", lambda: sockets.setup(rate=-1)),
        ("rate", lambda: sockets.setup(rate=FLAG)), ("span", lambda: sockets.setup(span=0)), ("channels", lambda: sockets.setup(channels=0)),
        ("history", lambda: sockets.setup(history=-1)), ("gate", lambda: sockets.authorize(cast("Any", "open"))), ("capacity", lambda: Hub(0)), ("history", lambda: Hub(1, -1)),
    ):

        with pytest.raises(Fault) as refused: make()

        assert refused.value.reason == "socket.settings" and refused.value.errors == { "setting": [setting] }, setting

    wrongs: tuple[Callable[[], object], ...] = (
        lambda: sockets.on("")(crash), lambda: sockets.on("a b" * 60)(crash), lambda: sockets.on("x")(cast("Any", "handler")),
    )

    for wrong in wrongs:

        with pytest.raises(Fault) as broken: wrong()

        assert broken.value.reason == "socket.handler"

    sockets.setup(capacity=1, limit=64, idle=1.0, rate=2, span=60.0, channels=1, history=2)

    assert sockets.describe()["rate"] == 2 and sockets.describe()["rooms"] == 1
