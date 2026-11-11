from aiohttp import web
from engine.ai import Ai, Anthropic, Call, Message, Mock, Model, Openai, Reply, Tool, Turn
from engine.ai.arch import checked
from engine.cache import Cache, Memory
from engine.json import json
from engine.log import log
from engine.net import Egress, Remote, net
from engine.test import Bench
from engine.validate import Shape
from collections.abc import Awaitable, Coroutine, Mapping, Sequence
from pathlib import Path
from typing import Any, cast, override
import asyncio

LOCAL = Egress(allow_private=True, ports=frozenset())
PLACE = { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }

class Person ( Shape ):

    name : str
    age  : int

class Scripted ( Model ):

    name         = "scripted"
    capabilities = frozenset({ "chat", "json", "tools" })

    def __init__ ( self ) -> None:

        self.replies: list[Reply] = []
        self.at = 0

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        made = self.replies[self.at % len(self.replies)]

        self.at += 1

        return made

class Fake:

    def __init__ ( self ) -> None:

        self.port = 0
        self.body = b"{}"
        self._runner: web.AppRunner | None = None

    async def start ( self ) -> None:

        app = web.Application(client_max_size=64 * 1024 * 1024)

        app.router.add_route("*", "/{tail:.*}", self.handle)

        self._runner = web.AppRunner(app)

        await self._runner.setup()
        await web.TCPSite(self._runner, "127.0.0.1", 0).start()

        self.port = int(self._runner.addresses[0][1])

    async def stop ( self ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    def remote ( self ) -> Remote:

        return Remote(net, f"http://127.0.0.1:{self.port}", { "X-Key": "k" }, LOCAL)

    async def handle ( self, request: web.Request ) -> web.Response:

        await request.read()

        return web.Response(status=200, body=self.body, content_type="application/json")

def weather ( city: str ) -> dict[str, str]:

    return { "city": city, "sky": "clear" }

loop     = asyncio.new_event_loop()
bench    = Bench()
fake     = Fake()
mock     = Mock("The sky over Cairo is clear and warm today.")
scripted = Scripted()
brain    = Ai()
cached   = Ai()
calls    = tuple(Call(f"c{at}", "weather", { "city": "Cairo" }) for at in range(100))
tools    = [Tool("weather", "Looks the sky up", PLACE, weather)]
history  = [Message("system", "Be brief.")] + [Message("user" if at % 2 == 0 else "assistant", f"turn {at} " * 20) for at in range(18)]
options  = { "max_tokens": 64, "temperature": 0.5, "stop": ["END"], "tool_choice": "auto" }
scripted.replies = [Reply("thinking", "scripted", 3, 1, "tools", calls[:2]), Reply("sunny", "scripted", 4, 2)]

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

log.setup("error", "json", Path("/dev/null"))
run(fake.start())

brain.setup(timeout=5.0)
brain.use(mock, default=True)
brain.use(scripted, tasks=("extract",))
cached.setup(timeout=5.0, cache=Cache(Memory()))
cached.use(mock, default=True)

anthropic = Anthropic(fake.remote(), "claude-x")
openai    = Openai(fake.remote(), "gpt-x", dimensions=1536)
claude    = json.dumps({ "content": [{ "type": "text", "text": "The sky over Cairo is clear." }], "stop_reason": "end_turn", "usage": { "input_tokens": 30, "output_tokens": 9 } }).encode()
wanting   = json.dumps({ "content": [{ "type": "tool_use", "id": f"toolu_{at}", "name": "weather", "input": { "city": "Cairo" } } for at in range(100)], "stop_reason": "tool_use", "usage": {} }).encode()
vectors   = json.dumps({ "data": [{ "index": at, "embedding": [0.001 * at] * 1536 } for at in range(96)] }).encode()

def message () -> None: Message("user", "look at the sky", images=()).dump()

def checks () -> None: checked(options)

def turning () -> None:

    turn = Turn(window=20)

    for at in range(60): turn.say("user" if at % 2 == 0 else "assistant", "x")

def replying () -> None: Reply("ok", "m", 3, 2, "tools", calls).message()

async def chatting () -> None: await brain.chat(history, max_tokens=64)

async def completing () -> None: await brain.complete("hello")

async def streaming () -> None:

    async for _ in brain.stream(history): pass

async def extracting () -> None:

    scripted.replies = [Reply('{"name":"Ali","age":3}', "scripted")]

    await brain.extract(history, Person)

async def running () -> None:

    scripted.replies = [Reply("thinking", "scripted", 3, 1, "tools", calls[:2]), Reply("sunny", "scripted", 4, 2)]
    scripted.at      = 0

    await brain.run(Turn([Message("user", "weather?")]), tools, task="extract")

async def embedding () -> None: await brain.embed([f"text {at}" for at in range(32)])

async def hitting () -> None: await cached.embed([f"text {at}" for at in range(32)])

async def posting () -> None: await anthropic.chat(history, tools, None, **options)

async def parsing () -> None: await anthropic.chat(history)

async def vectoring () -> None: await openai.embed([f"text {at}" for at in range(96)])

run(bench.measure_async("ai.cache.warm", hitting, rounds=1))

bench.measure("ai.message", message)
bench.measure("ai.options.checked", checks)
bench.measure("ai.turn.trim60", turning, rounds=5000)
bench.measure("ai.reply.calls100", replying, rounds=5000)
run(bench.measure_async("ai.chat.mock19", chatting))
run(bench.measure_async("ai.complete.mock", completing))
run(bench.measure_async("ai.stream.mock", streaming))
run(bench.measure_async("ai.extract.shape", extracting))
run(bench.measure_async("ai.run.tools2", running))
run(bench.measure_async("ai.embed.mock32", embedding, rounds=2000))
run(bench.measure_async("ai.embed.cached32", hitting))

fake.body = claude

run(bench.measure_async("ai.anthropic.chat19", posting, rounds=2000))

fake.body = wanting

run(bench.measure_async("ai.anthropic.calls100", parsing, rounds=1000))

fake.body = vectors

run(bench.measure_async("ai.openai.embed96x1536", vectoring, rounds=200))

run(net.close())
run(fake.stop())
loop.close()
log.close()
