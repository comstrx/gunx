from engine.broadcast import Broadcast
from engine.json import json
from engine.log import log
from engine.socket import Hub, Socket
from engine.test import Bench
from pathlib import Path
from typing import Any
import asyncio

bench = Bench()
loop  = asyncio.new_event_loop()
hub   = Hub(1000)
local = Broadcast()
raw   = json.encode({ "channel": "room", "event": "news", "data": { "n": 1, "text": "hello" }, "worker": "other" })

class Quiet:

    async def send ( self, _: str ) -> None:

        return None

    async def close ( self, *_: object ) -> None:

        return None

log.setup("error", "json", Path("/dev/null"))
local.setup(hub)

for at in range(100):

    socket = Socket(f"s{at}", Quiet(), f"u{at % 10}")

    hub.add(socket)
    hub.join(socket, "room")

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

async def publishing () -> None: await local.publish("room", "news", { "n": 1, "text": "hello" })

async def direct () -> None: await local.to("u3", "ping", { "n": 1 })

async def relaying () -> None: await local.relay(raw)

async def dropping () -> None: await local.relay(b"not json")

run(bench.measure_async("broadcast.publish.100", publishing, rounds=1000))
run(bench.measure_async("broadcast.to.10", direct, rounds=2000))
run(bench.measure_async("broadcast.relay.100", relaying, rounds=1000))
run(bench.measure_async("broadcast.relay.dropped", dropping, rounds=2000))
run(local.close())
loop.close()
log.close()
