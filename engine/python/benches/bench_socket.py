from engine.cache import Memory, cache
from engine.http import App, Channel
from engine.json import json
from engine.log import log
from engine.socket import Frame, Hub, Socket, Sockets
from engine.test import Bench
from pathlib import Path
from typing import Any
import aiohttp, asyncio

bench = Bench()
loop  = asyncio.new_event_loop()
raw   = json.encode({ "event": "echo", "channel": "room", "data": { "n": 1, "text": "hello" }, "id": "m1" })

log.setup("error", "json", Path("/dev/null"))
cache.use(Memory())

class Quiet:

    def __init__ ( self ) -> None:

        self.count = 0

    async def send ( self, _: str ) -> None:

        self.count += 1

    async def recv ( self ) -> str:

        return raw.decode()

    async def close ( self, *_: object ) -> None:

        return None

def decoding () -> None: Frame.decode(raw)

def encoding () -> None: Frame(event="echo", channel="room", data={ "n": 1, "text": "hello" }, id="m1").encode()

async def hubbing () -> None:

    hub = Hub(1000)
    pool = [Socket(f"s{at}", Quiet(), f"u{at % 10}") for at in range(100)]

    for socket in pool:

        hub.add(socket)
        hub.join(socket, "room")

    await hub.emit("room", "tick", { "n": 1 })
    await hub.broadcast("tock")

    hub.presence("room")

    for socket in pool: hub.remove(socket)

async def sending () -> None: await QUIET.send("tick", { "n": 1 }, "room")

QUIET = Socket("q", Quiet(), None)

async def dispatching () -> None: await SOCKETS.dispatch(QUIET, FRAME)

SOCKETS = Sockets()
FRAME   = Frame.decode(raw)

async def echo ( socket: Socket, frame: Frame ) -> None: await socket.send("echoed", frame.data, frame.channel, frame.id)

SOCKETS.on("echo")(echo)

async def live () -> None:

    sockets = Sockets()

    sockets.on("echo")(echo)

    app = App("Socket Bench", docs=False)

    app.mount(Channel.define("/socket", sockets))

    async with app.listen() as url, aiohttp.ClientSession() as session, session.ws_connect(url.replace("http", "ws") + "/socket") as ws:

        await ws.receive()

        async def round_trip () -> None:

            await ws.send_bytes(raw)
            await ws.receive()

        await bench.measure_async("socket.echo.round_trip", round_trip, rounds=2000)

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

bench.measure("socket.frame.decode", decoding)
bench.measure("socket.frame.encode", encoding)
run(bench.measure_async("socket.send.quiet", sending))
run(bench.measure_async("socket.dispatch.echo", dispatching))
run(bench.measure_async("socket.hub.100.emit+broadcast", hubbing, rounds=300))
run(live())
loop.close()
log.close()
