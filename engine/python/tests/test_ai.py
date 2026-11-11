from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Mapping, Sequence
from functools import partial
from pathlib import Path
from typing import Any, NamedTuple, Self, cast, override

from aiohttp import web
from engine.ai import Ai, Anthropic, Call, Gemini, Hosted, Message, Mock, Model, Ollama, Openai, Reply, Tool, Turn, ai
from engine.ai.arch import (
    ANTHROPIC_STOPS, BATCH, checked, DEPTH, DESCRIPTION, DONE, halts, IDENT, IMAGES, MAX_IMAGES, MAX_INPUT, MAX_OUTPUT,
    MAX_ROUNDS, MAX_WINDOW, media, MOST, named, Native, STOPS, stops, TASKS, TEXTS, TOKENS, TOOLS, VERSION, WIDEST,
)
from engine.cache import Cache, Memory
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.json import json
from engine.net import Egress, Remote, net
from engine.validate import Shape
import asyncio, base64, math, pytest, sys

type Wrong  = tuple[str, Callable[[], object]]
type Answer = Mapping[str, Any] | Raw
type Asked  = tuple[list[Message], tuple[Tool, ...], Mapping[str, Any] | None, dict[str, Any]]

LOCAL = Egress(allow_private=True, ports=frozenset())
PNG   = b"\x89PNG\r\n\x1a\n0"
JPEG  = b"\xff\xd8\xff0"
GIF   = b"GIF89a0"
WEBP  = b"RIFF0000WEBP0"
FLAG: Any = True
PLACE = { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }

class Person(Shape):

    name : str
    age  : int

class Node(Shape):

    name : str
    kids : list[Node] | None = None

class Seen(NamedTuple):

    path  : str
    heads : Mapping[str, str]
    body  : Any

class Raw(NamedTuple):

    status : int
    body   : bytes
    kind   : str = "application/json"
    pause  : float = 0.0

class Fake:

    def __init__ ( self ) -> None:

        self.port = 0
        self.seen: list[Seen] = []
        self.answers: list[Answer] = []
        self._runner: web.AppRunner | None = None

    async def __aenter__ ( self ) -> Self:

        app = web.Application(client_max_size=64 * 1024 * 1024)

        app.router.add_route("*", "/{tail:.*}", self.handle)

        self._runner = web.AppRunner(app)

        await self._runner.setup()
        await web.TCPSite(self._runner, "127.0.0.1", 0).start()

        self.port = int(self._runner.addresses[0][1])

        return self

    async def __aexit__ ( self, *_: object ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    def remote ( self ) -> Remote:

        return Remote(net, f"http://127.0.0.1:{self.port}", { "X-Key": "k" }, LOCAL)

    def answer ( self, *answers: Answer ) -> Self:

        self.answers.extend(answers)

        return self

    def last ( self ) -> Seen:

        return self.seen[-1]

    async def handle ( self, request: web.Request ) -> web.StreamResponse:

        raw = await request.read()

        self.seen.append(Seen(request.raw_path, dict(request.headers), json.loads(raw) if raw else None))

        answer = self.answers.pop(0) if self.answers else Raw(500, b"{}")

        if not isinstance(answer, Raw): return web.json_response(answer)
        if not answer.pause: return web.Response(status=answer.status, body=answer.body, content_type=answer.kind)

        response = web.StreamResponse(status=answer.status, headers={ "Content-Type": answer.kind })
        half     = len(answer.body) // 2

        await response.prepare(request)
        await response.write(answer.body[:half])
        await asyncio.sleep(answer.pause)
        await response.write(answer.body[half:])

        return response

class Scripted(Model):

    name         = "scripted"
    capabilities = frozenset({ "chat", "embed", "stream", "tools", "json" })

    def __init__ ( self, *replies: object, dimensions: int = 2, batch: int = BATCH ) -> None:

        self.replies    = list(replies)
        self.dimensions = dimensions
        self.batch      = batch
        self.asked: list[Asked] = []
        self.texts: list[list[str]] = []
        self.pieces: Sequence[object] = ()
        self.rows: Callable[[Sequence[str]], object] | None = None
        self.delay  = 0.0
        self.closed = 0
        self.active = 0
        self.peak   = 0

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        self.asked.append((list(messages), tuple(tools), schema, options))

        if self.delay: await asyncio.sleep(self.delay)

        made = self.replies.pop(0) if self.replies else Reply("ok", self.name, 2, 1)

        if isinstance(made, BaseException): raise made

        return cast("Reply", made)

    @override
    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        self.asked.append((list(messages), (), None, options))

        try:

            for piece in self.pieces:

                if self.delay: await asyncio.sleep(self.delay)
                if isinstance(piece, BaseException): raise piece

                yield cast("str", piece)

        finally: self.closed += 1

    @override
    async def embed ( self, texts: Sequence[str] ) -> list[list[float]]:

        self.texts.append(list(texts))

        self.active += 1
        self.peak    = max(self.peak, self.active)

        try:

            if self.delay: await asyncio.sleep(self.delay)
            if self.rows is not None: return cast("list[list[float]]", self.rows(texts))

            return [[float(len(text)), 1.0][:self.dimensions] for text in texts]

        finally: self.active -= 1

class Plain(Model):

    name = "plain"

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        return Reply("plain", self.name)

class Mute(Model):

    name         = "mute"
    capabilities = frozenset({ "embed" })

class Flaky(Memory):

    @override
    async def many ( self, keys: Any ) -> dict[str, Any]:

        raise Fault(Code.UNAVAILABLE, reason="cache.down")

    @override
    async def set_many ( self, items: Mapping[str, Any], ttl: float | None = None ) -> None:

        raise Fault(Code.UNAVAILABLE, reason="cache.down")

def refused ( work: Callable[[], object], code: Code, reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert (caught.value.code, caught.value.reason) == (code, reason)

    return caught.value

async def failed ( work: Awaitable[object], code: Code, reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: await work

    assert (caught.value.code, caught.value.reason) == (code, reason)

    return caught.value

async def drained ( source: AsyncGenerator[str] ) -> list[str]:

    return [piece async for piece in source]

async def cut ( source: AsyncGenerator[str], code: Code, reason: str ) -> Fault:

    return await failed(drained(source), code, reason)

def brain ( *models: Model, timeout: float = 2.0, cache: Cache | None = None ) -> Ai:

    made = Ai()

    made.setup(timeout=timeout, cache=cache, ttl=60)

    for at, model in enumerate(models): made.use(model, default=at == 0)

    return made

def asks ( *texts: str ) -> list[Message]:

    return [Message("user", text) for text in texts or ("hello",)]

def sse ( *events: tuple[str | None, object] ) -> bytes:

    made = [f"event: {event}\n" if event else "" for event, _ in events]
    data = [item if isinstance(item, str) else json.dumps(item) for _, item in events]

    return "".join(f"{head}data: {body}\n\n" for head, body in zip(made, data, strict=True)).encode()

def ndjson ( *events: object ) -> bytes:

    return "".join(f"{json.dumps(event)}\n" for event in events).encode()

def module ( kind: type ) -> Any:

    return sys.modules[kind.__module__]

@pytest.fixture
async def fake () -> AsyncIterator[Fake]:

    async with Fake() as made: yield made

    await net.close()

def test_the_surface_names_every_task_and_stop () -> None:

    assert TASKS == ("chat", "complete", "embed", "summarize", "extract", "classify", "stream")
    assert frozenset({ "stop", "length", "tools", "refused", "paused", "other" }) == STOPS
    assert type(ai) is Ai and issubclass(Hosted, Model) and issubclass(Anthropic, Hosted) and issubclass(Mock, Model)
    assert VERSION == "2026-10-21"

def test_a_message_refuses_what_no_provider_could_carry () -> None:

    call = Call("c", "n")
    many = tuple(Call(f"c{at}", "n") for at in range(TOOLS + 1))
    wrong: tuple[Wrong, ...] = (
        ("ai.role", lambda: Message("robot", "x")), ("ai.role", lambda: Message(cast("Any", 7), "x")),
        ("ai.content", lambda: Message("user", cast("Any", b"x"))), ("ai.content", lambda: Message("user", cast("Any", None))),
        ("ai.calls", lambda: Message("user", "x", (call,))), ("ai.calls", lambda: Message("assistant", "x", cast("Any", ("c",)))),
        ("ai.calls", lambda: Message("assistant", "x", cast("Any", "cc"))), ("ai.calls", lambda: Message("assistant", "x", many)),
        ("ai.images", lambda: Message("assistant", "x", images=(PNG,))),
        ("ai.images", lambda: Message("user", "x", images=cast("Any", ("text",)))),
        ("ai.images", lambda: Message("user", "x", images=cast("Any", PNG))),
        ("ai.call", lambda: Message("tool", "x")), ("ai.call", lambda: Message("tool", "x", call_id="")),
        ("ai.name", lambda: Message("user", "x", name="")), ("ai.name", lambda: Message("user", "x", name="a\nb")),
        ("ai.name", lambda: Message("user", "x", name="n" * (IDENT + 1))),
    )

    for reason, make in wrong: refused(make, Code.INTERNAL, reason)

    refused(lambda: Message("user", "x" * (MAX_OUTPUT + 1)), Code.TOO_LARGE, "ai.input")
    refused(lambda: Message("user", "x", images=(PNG,) * (IMAGES + 1)), Code.TOO_LARGE, "ai.images")
    refused(lambda: Message("user", "x", images=(PNG + bytes(MAX_IMAGES),)), Code.TOO_LARGE, "ai.images")
    refused(lambda: Message("user", "x", images=(b"plain bytes",)), Code.VALIDATION, "ai.image")
    refused(lambda: Message("user", "x", images=(b"RIFF0000WAVE",)), Code.VALIDATION, "ai.image")

    assert len(Message("user", "x" * MAX_OUTPUT).content) == MAX_OUTPUT

def test_a_message_dumps_weighs_and_carries_pictures () -> None:

    call = Call("c1", "weather", { "city": "Cairo" })
    said = Message("assistant", "", cast("Any", [call]))
    seen = Message("user", "look", images=cast("Any", [PNG, JPEG, GIF, WEBP]))
    done = Message.result(call, { "sky": "sunny" })
    bad  = Message.result(call, "boom", failed=True)

    assert said.calls == (call,) and type(seen.images) is tuple
    assert said.dump() == { "role": "assistant", "content": "", "calls": [{ "id": "c1", "name": "weather", "arguments": { "city": "Cairo" } }] }
    assert seen.dump() == { "role": "user", "content": "look", "images": 4 }
    assert [kind for kind, _ in seen.pictures()] == ["image/png", "image/jpeg", "image/gif", "image/webp"]
    assert base64.b64decode(seen.pictures()[0][1]) == PNG and seen.weight() == 4 + len(PNG + JPEG + GIF + WEBP)
    assert Message("assistant", "").empty() and not said.empty() and not seen.empty() and not Message("user", " ").empty()
    assert not Message("assistant", "", native=Native("x", [])).empty()
    assert (done.role, done.content, done.call_id, done.name, done.failed) == ("tool", '{"sky":"sunny"}', "c1", "weather", False)
    assert bad.content == "boom" and bad.failed and bad.dump() == { "role": "tool", "content": "boom", "call_id": "c1", "name": "weather", "failed": True }
    assert [media(image) for image in (PNG, JPEG, GIF, b"GIF87a", WEBP, b"RIFF", b"", b"BM")] == ["image/png", "image/jpeg", "image/gif", "image/gif", "image/webp", None, None, None]

def test_a_call_is_named_and_carries_a_dict () -> None:

    wrong: tuple[Callable[[], object], ...] = (
        lambda: Call("", "n"), lambda: Call("c", ""), lambda: Call("c", "n", cast("Any", [1])), lambda: Call(cast("Any", 1), "n"),
        lambda: Call("c" * (IDENT + 1), "n"), lambda: Call("c", "n\x00"), lambda: Call("c", cast("Any", None)),
    )

    for make in wrong: refused(make, Code.INTERNAL, "ai.call")

    assert Call("c", "n").dump() == { "id": "c", "name": "n", "arguments": {} }
    assert Call("c", "n", { "a": 1 }, broken=True).dump() == { "id": "c", "name": "n", "arguments": { "a": 1 }, "broken": True }
    assert named("a b") and not named("") and not named(7) and not named("a\tb") and not named("x" * (IDENT + 1))

async def test_a_tool_checks_its_definition_and_binds_arguments_before_running () -> None:

    wrong: tuple[Wrong, ...] = (
        ("name", lambda: Tool("bad name", "d")), ("name", lambda: Tool("", "d")), ("name", lambda: Tool("n" * 65, "d")),
        ("name", lambda: Tool(cast("Any", 7), "d")), ("description", lambda: Tool("n", "d" * (DESCRIPTION + 1))),
        ("description", lambda: Tool("n", cast("Any", None))), ("parameters", lambda: Tool("n", "d", cast("Any", [1]))),
        ("handler", lambda: Tool("n", "d", handler=cast("Any", 7))),
    )
    ran: list[object] = []

    def plain ( city: str, days: int = 1 ) -> dict[str, object]:

        ran.append(city)

        return { "city": city, "days": days }

    async def slow ( city: str ) -> str:

        await asyncio.sleep(0)

        return city.upper()

    for what, make in wrong: assert refused(make, Code.INTERNAL, "ai.tool").errors == { "tool": [what] }

    tool  = Tool("w", "d", PLACE, plain)
    calls = (
        Call("c", "w", { "town": "x" }), Call("c", "w", { "city": "x", "extra": 1 }), Call("c", "w"),
        Call("c", "w", { "city": "x" }, broken=True),
    )

    assert await tool.run(Call("c", "w", { "city": "Cairo" })) == { "city": "Cairo", "days": 1 }
    assert await Tool("w", "d", handler=slow).run(Call("c", "w", { "city": "giza" })) == "GIZA"
    assert Tool("w", "d").dump() == { "name": "w", "description": "d", "parameters": { "type": "object", "properties": {} } }
    assert tool.dump()["parameters"] == PLACE and tool.dump()["parameters"] is not PLACE

    await failed(Tool("w", "d").run(Call("c", "w")), Code.INTERNAL, "ai.handler")

    for call in calls: assert (await failed(tool.run(call), Code.VALIDATION, "ai.arguments")).errors == { "tool": ["w"] }

    assert ran == ["Cairo"]

def test_a_reply_knows_its_stop_and_turns_into_a_message () -> None:

    call  = Call("c1", "w")
    kept  = Native("anthropic:m", [{ "type": "thinking" }], bound=True)
    reply = Reply("hi", "m", 3, 2, "tools", cast("Any", [call]), native=kept)
    wrong: tuple[Wrong, ...] = (
        ("ai.stop", lambda: Reply("x", "m", stop="weird")), ("ai.stop", lambda: Reply("x", "m", stop=cast("Any", ["stop"]))),
        ("ai.text", lambda: Reply(cast("Any", None), "m")), ("ai.tokens", lambda: Reply("x", "m", -1)),
        ("ai.tokens", lambda: Reply("x", "m", 1, cast("Any", None))), ("ai.tokens", lambda: Reply("x", "m", cast("Any", 1.5))),
        ("ai.calls", lambda: Reply("x", "m", calls=cast("Any", "cc"))), ("ai.calls", lambda: Reply("x", "m", calls=cast("Any", ({},)))),
    )

    for reason, make in wrong: refused(make, Code.INTERNAL, reason)

    assert reply.calls == (call,) and not reply.finished and reply.wants()
    assert Reply("x", "m").finished and not Reply("x", "m").wants() and not Reply("x", "m", stop="length").finished
    assert reply.message() == Message("assistant", "hi", (call,), native=kept) and reply.said() == Message("assistant", "hi")
    assert reply.dump() == {
        "text": "hi", "model": "m", "tokens_in": 3, "tokens_out": 2, "stop": "tools", "finished": False,
        "calls": [{ "id": "c1", "name": "w", "arguments": {} }],
    }

def test_a_turn_trims_to_its_window_and_keeps_the_system_message () -> None:

    for window in (1, 0, -4, MAX_WINDOW + 1, 2.0, True, None): refused(partial(Turn, window=cast("Any", window)), Code.INTERNAL, "ai.window")

    refused(partial(Turn, cast("Any", "text")), Code.INTERNAL, "ai.messages")
    refused(partial(Turn, cast("Any", ["text"])), Code.INTERNAL, "ai.messages")
    refused(partial(Turn().add, cast("Any", "text")), Code.INTERNAL, "ai.messages")

    turn  = Turn(window=4)
    bound = Native("anthropic:m", [{ "type": "thinking" }], bound=True)
    loose = Native("gemini:m", { "parts": [{ "text": "x" }] })

    turn.say("system", "s").say("user", "u1").add(Message("assistant", "a1", native=bound)).say("user", "u2")

    assert [message.content for message in turn.messages] == ["s", "u1", "a1", "u2"]
    assert [message.native for message in turn.messages] == [None, None, bound, None]

    turn.add(Message("assistant", "a2", native=bound))

    assert [message.content for message in turn.messages] == ["s", "u2", "a2"]
    assert [message.native for message in turn.messages] == [None, None, None]
    assert turn.dump() == [{ "role": "system", "content": "s" }, { "role": "user", "content": "u2" }, { "role": "assistant", "content": "a2" }]

    turn.say("user", "u3").add(Message("assistant", "a3", native=loose)).say("user", "u4")

    assert [message.content for message in turn.messages] == ["s", "u3", "a3", "u4"]
    assert [message.native for message in turn.messages] == [None, None, loose, None]
    assert [message.content for message in Turn(asks("a", "b", "c", "d", "e"), 4).messages] == ["c", "d", "e"]
    assert Turn(cast("Any", tuple(asks("a")))).messages == asks("a")

def test_a_trimmed_turn_never_orphans_a_tool_result () -> None:

    for window in (2, 3, 4, 5, 8):

        turn = Turn([Message("system", "s")], window)

        for step in range(12):

            calls = tuple(Call(f"c{step}-{at}", "w") for at in range(step % 3 + 1))

            turn.say("user", f"u{step}").add(Message("assistant", "", calls))

            for call in calls: turn.add(Message.result(call, "done"))

            held  = turn.messages
            known = { call.id for message in held for call in message.calls }
            first = next(message for message in held if message.role != "system")

            assert held[0].role == "system" and first.role == "user" and len(held) <= window + 5
            assert all(message.call_id in known for message in held if message.role == "tool")
            assert all(held[at - 1].role in ("assistant", "tool") for at, message in enumerate(held) if message.role == "tool")

def test_options_are_a_closed_checked_set () -> None:

    good = { "max_tokens": 5, "temperature": 0, "top_p": 1, "stop": ["a", "b"], "tool_choice": "any" }
    bad: tuple[dict[str, Any], ...] = (
        { "max_tokens": 0 }, { "max_tokens": True }, { "max_tokens": MOST + 1 }, { "max_tokens": 1.5 }, { "temperature": -0.1 },
        { "temperature": 2.1 }, { "temperature": "hot" }, { "temperature": math.nan }, { "temperature": True }, { "top_p": 0 },
        { "top_p": 1.5 }, { "top_p": math.inf }, { "stop": "" }, { "stop": [] }, { "stop": ["a"] * 5 }, { "stop": [1] },
        { "stop": "a\nb" }, { "tool_choice": "required" }, { "tool_choice": ["auto"] }, { "seed": 1 }, { "model": "x" },
        { "seed": None }, { "x" * 999: 1 },
    )

    assert checked(good) == good and checked({ "temperature": None, "stop": "END" }) == { "stop": "END" } and checked({}) == {}
    assert stops("END") == ["END"] and stops(("a", "b")) == ["a", "b"] and halts(("a",)) and not halts(7)

    for options in bad:

        fault = refused(partial(checked, options), Code.INTERNAL, "ai.option")

        assert fault.errors == { "option": [next(iter(options))[:IDENT]] }

def test_setup_refuses_settings_no_model_could_honor () -> None:

    made = Ai()
    bad: tuple[tuple[str, dict[str, Any]], ...] = (
        ("timeout", { "timeout": 0 }), ("timeout", { "timeout": -1 }), ("timeout", { "timeout": True }),
        ("timeout", { "timeout": "2" }), ("timeout", { "timeout": math.nan }), ("timeout", { "timeout": math.inf }),
        ("timeout", { "timeout": 3_600.5 }), ("ttl", { "ttl": 0 }), ("ttl", { "ttl": -5 }), ("ttl", { "ttl": True }),
        ("ttl", { "ttl": "60" }), ("ttl", { "ttl": math.nan }), ("ttl", { "ttl": math.inf }), ("cache", { "cache": Memory() }),
        ("cache", { "cache": "redis" }), ("routes", { "routes": "chat" }), ("routes", { "routes": { "nope": "m" } }),
        ("routes", { "routes": { "chat": "" } }), ("routes", { "routes": { "chat": 5 } }), ("routes", { "routes": { 5: "m" } }),
    )

    for what, settings in bad:

        fault = refused(partial(made.setup, **settings), Code.INTERNAL, "ai.settings")

        assert fault.errors == { "setting": [what] }

    assert made.describe() == {
        "routes": {}, "timeout": 120.0, "family": "ai", "default": None, "adapters": {}, "calls": 0, "tokens_in": 0,
        "tokens_out": 0, "cached": 0,
    }

    made.setup(5, { "chat": "scripted", "embed": "mute" }, Cache(Memory()), 9)
    made.setup(7)

    assert made.describe()["routes"] == { "chat": "scripted", "embed": "mute" } and made.describe()["timeout"] == 7.0

def test_models_are_registered_and_routed_by_task () -> None:

    made   = Ai()
    first  = Scripted()
    second = Plain()
    third  = Mute()
    odd    = Scripted()
    tasks: tuple[tuple[object, str], ...] = (
        ("chat", "chat"), (["nope"], "nope"), ([5], "int"), (["chat", None], "NoneType"), ({ "chat" }, "set"),
        (["x" * 999], "x" * IDENT),
    )

    assert not made.ready() and made.names() == ()

    refused(made.model, Code.INTERNAL, "ai.adapter")
    refused(partial(made.use, cast("Any", "model")), Code.INTERNAL, "ai.model")
    refused(partial(made.use, cast("Any", Scripted)), Code.INTERNAL, "ai.model")

    for asked, shown in tasks:

        fault = refused(partial(made.use, first, tasks=cast("Any", asked)), Code.INTERNAL, "ai.task")

        assert fault.errors == { "task": [shown] } and not made.ready()

    cast("Any", odd).name = "no name"

    refused(partial(made.use, odd, tasks=["chat"]), Code.INTERNAL, "ai.name")

    cast("Any", odd).name   = "odd"
    cast("Any", odd).family = "mail"

    refused(partial(made.use, odd, tasks=["chat"]), Code.INTERNAL, "ai.family")

    assert not made.ready() and made.describe()["routes"] == {}
    assert made.use(first) is first and made.use(second, tasks=["complete", "summarize"]) is second
    assert made.use(third, default=False, tasks=("embed",)) is third
    assert made.ready() and made.names() == ("mute", "plain", "scripted")
    assert made.model() is first and made.model("stream") is first and made.model("complete") is second
    assert made.model("summarize") is second and made.model("embed") is third and made.dimensions() == 0

    for task, shown in (("nope", "nope"), (5, "int"), (None, "NoneType"), ("x" * 999, "x" * IDENT)):

        fault = refused(partial(made.model, cast("Any", task)), Code.INTERNAL, "ai.task")

        assert fault.errors == { "task": [shown] }

    made.use(second, default=True)

    assert made.model() is second and made.model("embed") is third
    assert made.describe()["default"] == "plain" and made.describe()["family"] == "ai"
    assert made.describe()["adapters"] == {
        "mute": ["embed"], "plain": ["chat"], "scripted": ["chat", "embed", "json", "stream", "tools"],
    }

    made.setup(routes={ "chat": "ghost" })

    refused(made.model, Code.INTERNAL, "ai.adapter")

    assert made.model("embed") is second

async def test_chat_refuses_malformed_input_before_any_model_is_asked () -> None:

    model = Scripted()
    made  = brain(model)
    tool  = Tool("w", "weather")
    big   = Message("user", "x" * MAX_OUTPUT)
    wrong: tuple[tuple[Code, str, Callable[[], Awaitable[object]]], ...] = (
        (Code.VALIDATION, "ai.empty", partial(made.chat, [])),
        (Code.VALIDATION, "ai.empty", partial(made.chat, [Message("system", "s")])),
        (Code.VALIDATION, "ai.empty", partial(made.chat, [Message("user", "")])),
        (Code.VALIDATION, "ai.empty", partial(made.chat, Turn())),
        (Code.INTERNAL, "ai.messages", partial(made.chat, cast("Any", "hello"))),
        (Code.INTERNAL, "ai.messages", partial(made.chat, cast("Any", ["hello"]))),
        (Code.INTERNAL, "ai.messages", partial(made.chat, cast("Any", None))),
        (Code.TOO_LARGE, "ai.input", partial(made.chat, asks() * (MAX_WINDOW + 1))),
        (Code.TOO_LARGE, "ai.input", partial(made.chat, [big] * 65)),
        (Code.INTERNAL, "ai.tools", partial(made.chat, asks(), tools=cast("Any", "w"))),
        (Code.INTERNAL, "ai.tools", partial(made.chat, asks(), tools=cast("Any", ["w"]))),
        (Code.INTERNAL, "ai.tools", partial(made.chat, asks(), tools=[tool, Tool("w", "again")])),
        (Code.INTERNAL, "ai.tools", partial(made.chat, asks(), tools=[Tool(f"t{at}", "") for at in range(TOOLS + 1)])),
        (Code.INTERNAL, "ai.option", partial(made.chat, asks(), seed=1)),
        (Code.INTERNAL, "ai.option", partial(made.chat, asks(), max_tokens=0)),
        (Code.INTERNAL, "ai.schema", partial(made.chat, asks(), schema=cast("Any", "object"))),
        (Code.INTERNAL, "ai.task", partial(made.chat, asks(), "nope")),
    )

    for code, reason, work in wrong: await failed(work(), code, reason)

    await failed(Ai().chat(cast("Any", "hello")), Code.INTERNAL, "ai.adapter")

    assert model.asked == [] and made.stats()["calls"] == 0

async def test_chat_asks_only_what_the_model_can_do () -> None:

    made = brain(Plain())
    tool = Tool("w", "weather")

    made.use(Mute(), tasks=["embed", "classify"])

    wrong: tuple[tuple[str, Callable[[], Awaitable[object]]], ...] = (
        ("tools", partial(made.chat, asks(), tools=[tool])), ("json", partial(made.chat, asks(), schema=PLACE)),
        ("chat", partial(made.chat, asks(), "classify")), ("embed", partial(made.embed, ["a"], "chat")),
        ("chat", partial(drained, made.stream(asks(), "classify"))),
    )

    for what, work in wrong:

        fault = await failed(work(), Code.INTERNAL, "ai.capability")

        assert fault.errors == { "capability": [what] }

    assert (await made.chat(asks())).text == "plain" and await drained(made.stream(asks())) == ["plain"]

async def test_chat_hands_the_model_checked_input_and_counts_what_it_spent () -> None:

    call  = Call("c1", "w", { "city": "Cairo" })
    model = Scripted(Reply("one", "scripted", 5, 2), Reply("", "scripted", 7, 1, "tools", (call,)))
    made  = brain(model)
    tool  = Tool("w", "weather", PLACE)
    turn  = Turn().say("system", "s").say("user", "u")

    first  = await made.chat(turn, tools=(tool,), schema=PLACE, max_tokens=9, temperature=None, stop="END")
    second = await made.chat(asks("again"))
    third  = await made.chat(asks("more"))

    assert (first.text, second.calls, third.text) == ("one", (call,), "ok")
    assert model.asked[0] == (turn.messages, (tool,), PLACE, { "max_tokens": 9, "stop": "END" })
    assert model.asked[1] == (asks("again"), (), None, {})
    assert made.stats() == { "calls": 3, "tokens_in": 14, "tokens_out": 4, "cached": 0 }

async def test_chat_refuses_a_model_that_breaks_its_contract () -> None:

    down  = Fault(Code.UNAVAILABLE, reason="scripted.down")
    model = Scripted("text", None, { "text": "x" }, down, ValueError("boom"))
    made  = brain(model)

    for _ in range(3): await failed(made.chat(asks()), Code.INTERNAL, "ai.model")

    with pytest.raises(Fault) as caught: await made.chat(asks())

    assert caught.value is down

    with pytest.raises(ValueError, match="boom"): await made.chat(asks())

    cast("Any", model).chat = lambda *_, **__: Reply("sync", "scripted")

    await failed(made.chat(asks()), Code.INTERNAL, "ai.model")

    assert made.stats()["calls"] == 0

async def test_chat_gives_a_slow_model_a_deadline_and_passes_cancellation_on () -> None:

    model = Scripted()
    made  = brain(model, timeout=0.05)

    model.delay = 5.0

    fault = await failed(made.chat(asks()), Code.TIMEOUT, "ai.timeout")

    assert fault.unknown and made.stats()["calls"] == 0

    task = asyncio.create_task(made.chat(asks()))

    await asyncio.sleep(0.01)

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    model.delay = 0.0

    assert (await made.chat(asks())).text == "ok" and made.stats()["calls"] == 1

async def test_complete_is_a_prompt_in_and_text_out () -> None:

    model = Scripted(Reply("one", "scripted"), Reply("two", "scripted"), Reply("three", "scripted"))
    made  = brain(model)

    assert await made.complete("hi") == "one" and await made.complete("hi", "be brief", max_tokens=5) == "two"
    assert await made.complete("hi", "") == "three"
    assert [asked[0] for asked in model.asked] == [asks("hi"), [Message("system", "be brief"), *asks("hi")], asks("hi")]
    assert model.asked[1][3] == { "max_tokens": 5 }

    made.use(Plain(), tasks=["complete"])

    assert await made.complete("hi") == "plain" and await made.complete("hi", task="chat") == "ok"

    await failed(made.complete(""), Code.VALIDATION, "ai.empty")
    await failed(made.complete(cast("Any", 5)), Code.INTERNAL, "ai.content")
    await failed(made.complete("hi", cast("Any", 5)), Code.INTERNAL, "ai.content")
    await failed(made.complete("x" * (MAX_OUTPUT + 1)), Code.TOO_LARGE, "ai.input")

async def test_stream_hands_pieces_on_and_always_closes_its_source () -> None:

    model = Scripted()
    made  = brain(model)

    model.pieces = ("he", "llo", "")

    assert await drained(made.stream(asks("hi"), max_tokens=4)) == ["he", "llo", ""]
    assert model.asked == [(asks("hi"), (), None, { "max_tokens": 4 })] and model.closed == 1

    source = made.stream(Turn(asks("hi")))

    assert await anext(source) == "he"

    await source.aclose()

    assert model.closed == 2 and made.stats()["calls"] == 2

    idle = made.stream(asks())

    await idle.aclose()

    assert model.closed == 2 and made.stats()["calls"] == 2 and len(model.asked) == 2

async def test_stream_checks_its_input_on_the_first_piece () -> None:

    model = Scripted()
    made  = brain(model)
    wrong: tuple[tuple[Code, str, AsyncGenerator[str]], ...] = (
        (Code.INTERNAL, "ai.messages", made.stream(cast("Any", "hello"))),
        (Code.VALIDATION, "ai.empty", made.stream([])),
        (Code.INTERNAL, "ai.option", made.stream(asks(), seed=1)),
        (Code.INTERNAL, "ai.task", made.stream(asks(), "nope")),
        (Code.INTERNAL, "ai.adapter", Ai().stream(asks())),
    )

    for code, reason, source in wrong: await cut(source, code, reason)

    assert model.asked == [] and made.stats()["calls"] == 0

async def test_stream_refuses_a_source_that_breaks_its_contract () -> None:

    down  = Fault(Code.UNAVAILABLE, reason="scripted.down")
    model = Scripted()
    made  = brain(model, timeout=0.05)

    model.pieces = ("a", down)

    source = made.stream(asks())

    assert await anext(source) == "a"

    with pytest.raises(Fault) as caught: await anext(source)

    assert caught.value is down and model.closed == 1

    model.pieces = ("a", 5)

    await cut(made.stream(asks()), Code.INTERNAL, "ai.model")

    model.pieces = ("x" * MAX_OUTPUT, "y")

    fault = await cut(made.stream(asks()), Code.UNAVAILABLE, "ai.reply")

    assert fault.errors == { "reply": ["size"] } and fault.unknown and model.closed == 3

    model.pieces = ("a", "b")
    model.delay  = 5.0

    fault = await cut(made.stream(asks()), Code.TIMEOUT, "ai.timeout")

    assert fault.unknown and model.closed == 4

    async def listed ( *_: object, **__: object ) -> list[str]:

        return ["a"]

    cast("Any", model).stream = listed

    await cut(made.stream(asks()), Code.INTERNAL, "ai.model")

    cast("Any", model).stream = lambda *_, **__: ["a"]

    await cut(made.stream(asks()), Code.INTERNAL, "ai.model")

    assert made.stats()["calls"] == 4

async def test_a_cancelled_stream_closes_its_source () -> None:

    model = Scripted()
    made  = brain(model, timeout=30)

    model.pieces = ("a", "b")
    model.delay  = 30.0

    task = asyncio.create_task(drained(made.stream(asks())))

    await asyncio.sleep(0.02)

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    assert model.closed == 1 and len(model.asked) == 1

async def test_extract_answers_a_validated_shape () -> None:

    fenced = '```json\n{"name": "Mona", "age": 9}\n```'
    open_  = '```\n{"name": "Omar", "age": 4}'
    model  = Scripted(Reply('{"name": "Ali", "age": 3}', "scripted"), Reply(fenced, "scripted"), Reply(open_, "scripted"))
    made   = brain(model)

    assert await made.extract(asks("who"), Person, max_tokens=50) == Person(name="Ali", age=3)
    assert await made.extract(Turn(asks("who")), Person) == Person(name="Mona", age=9)
    assert await made.extract(asks("who"), Person) == Person(name="Omar", age=4)

    schema = model.asked[0][2]

    assert schema is not None and schema["type"] == "object" and schema["additionalProperties"] is False
    assert set(schema["properties"]) == { "name", "age" } and "$ref" not in schema and "$defs" not in schema
    assert model.asked[0][3] == { "max_tokens": 50 } and model.asked[0][1] == ()

    model.replies = [Reply('{"name": "root", "kids": [{"name": "leaf"}]}', "scripted")]

    tree  = await made.extract(asks("tree"), Node)
    asked = model.asked[-1][2]

    assert tree.name == "root" and tree.kids is not None and tree.kids[0].name == "leaf"
    assert asked is not None and asked["type"] == "object" and "Node" in asked["$defs"] and "$ref" not in asked

async def test_extract_refuses_what_does_not_fit_the_shape () -> None:

    texts = ("nope", "", "```", '{"name": "Ali"}', '{"name": "Ali", "age": "old"}', '{"name": "Ali", "age": 3, "extra": 1}', "[1]")
    model = Scripted(*(Reply(text, "scripted") for text in texts))
    made  = brain(model)

    for _ in texts:

        fault = await failed(made.extract(asks("who"), Person), Code.UNAVAILABLE, "ai.schema")

        assert fault.errors == { "reply": ["shape"] } and fault.unknown and isinstance(fault.__cause__, Fault)

    for stop in ("length", "refused", "paused"):

        model.replies = [Reply('{"name": "Ali", "age": 3}', "scripted", stop=stop)]

        fault = await failed(made.extract(asks("who"), Person), Code.UNAVAILABLE, "ai.schema")

        assert fault.errors == { "reply": [stop] }

    for kind in (dict, Person(name="Ali", age=3), "Person", None):

        await failed(made.extract(asks("who"), cast("Any", kind)), Code.INTERNAL, "ai.shape")

    fault = await failed(brain(Plain()).extract(asks("who"), Person), Code.INTERNAL, "ai.capability")

    assert fault.errors == { "capability": ["json"] } and len(model.asked) == len(texts) + 3

def giving ( value: object ) -> Callable[..., object]:

    def handler ( **_: object ) -> object:

        return value

    return handler

def raising ( error: BaseException ) -> Callable[..., object]:

    def handler ( **_: object ) -> object:

        raise error

    return handler

async def test_run_loops_tools_until_the_model_settles () -> None:

    seen: list[str] = []

    def weather ( city: str ) -> dict[str, str]:

        seen.append(city)

        return { "city": city, "sky": "clear" }

    async def slow ( city: str ) -> str:

        await asyncio.sleep(0)

        return f"slow {city}"

    calls = (Call("c1", "weather", { "city": "Cairo" }), Call("c2", "slow", { "city": "Giza" }))
    model = Scripted(Reply("thinking", "scripted", 3, 1, "tools", calls), Reply("sunny", "scripted", 4, 2))
    made  = brain(model)
    tools = [Tool("weather", "The weather", PLACE, weather), Tool("slow", "Slowly", PLACE, slow)]
    turn  = Turn(asks("weather?"))
    reply = await made.run(turn, tools, max_tokens=9)

    assert reply.text == "sunny" and seen == ["Cairo"]
    assert made.stats() == { "calls": 2, "tokens_in": 7, "tokens_out": 3, "cached": 0 }
    assert turn.messages == [
        *asks("weather?"), Message("assistant", "thinking", calls),
        Message.result(calls[0], { "city": "Cairo", "sky": "clear" }), Message("tool", "slow Giza", call_id="c2", name="slow"),
        Message("assistant", "sunny"),
    ]
    assert [(asked[1], asked[3]) for asked in model.asked] == [(tuple(tools), { "max_tokens": 9 })] * 2
    assert [len(asked[0]) for asked in model.asked] == [1, 4]

async def test_run_answers_every_failed_tool_to_the_model () -> None:

    async def stuck ( **_: object ) -> str:

        await asyncio.sleep(5)

        return "late"

    known = Fault(Code.VALIDATION, reason="place.unknown", errors={ "city": ["unknown"] })
    tools = [
        Tool("weather", "", PLACE, lambda city: city), Tool("denied", "", handler=raising(Fault(Code.FORBIDDEN, reason="place.denied"))),
        Tool("invalid", "", handler=raising(known)), Tool("down", "", handler=raising(Fault(Code.UNAVAILABLE, reason="place.down"))),
        Tool("crash", "", handler=raising(ValueError("secret detail"))), Tool("stuck", "", handler=stuck),
        Tool("odd", "", handler=giving(object())), Tool("huge", "", handler=giving("x" * (MAX_OUTPUT + 1))), Tool("bare", ""),
    ]
    calls = (
        Call("c1", "weather", { "town": 1 }), Call("c2", "ghost"), Call("c3", "weather", broken=True), Call("c4", "denied"),
        Call("c5", "invalid"), Call("c6", "down"), Call("c7", "crash"), Call("c8", "stuck"), Call("c9", "odd"),
        Call("c10", "huge"), Call("c11", "bare"), Call("c12", "weather", { "city": "Cairo" }),
    )
    wants = (
        json.dumps({ "reason": "ai.arguments", "errors": { "tool": ["weather"] } }), "unknown tool", "malformed arguments",
        "place.denied", json.dumps({ "reason": "place.unknown", "errors": { "city": ["unknown"] } }), "failed", "failed",
        "timed out", "failed", "ai.input", "failed", "Cairo",
    )
    model = Scripted(Reply("", "scripted", 1, 1, "tools", calls))
    made  = brain(model, timeout=0.05)
    turn  = Turn(asks(), window=64)
    reply = await made.run(turn, tools)
    told  = turn.messages[2:-1]

    assert reply.text == "ok" and [message.content for message in told] == list(wants)
    assert [message.failed for message in told] == [True] * 11 + [False]
    assert [(message.call_id, message.name) for message in told] == [(call.id, call.name) for call in calls]
    assert "secret" not in str(turn.dump()) and turn.messages[-1] == Message("assistant", "ok")

async def test_run_stops_a_loop_that_never_settles () -> None:

    call  = Call("c", "weather", { "city": "Cairo" })
    model = Scripted(*[Reply("", "scripted", 1, 1, "tools", (call,))] * 9)
    made  = brain(model)
    tool  = Tool("weather", "The weather", PLACE, giving("hot"))
    fault = await failed(made.run(Turn(asks()), [tool], rounds=3), Code.UNAVAILABLE, "ai.rounds")

    assert fault.unknown and len(model.asked) == 3

    for rounds in (0, -1, MAX_ROUNDS + 1, True, "2", 2.0, None):

        fault = await failed(made.run(Turn(asks()), [tool], rounds=cast("Any", rounds)), Code.INTERNAL, "ai.option")

        assert fault.errors == { "option": ["rounds"] }

    await failed(made.run(cast("Any", asks()), [tool]), Code.INTERNAL, "ai.messages")
    await failed(made.run(Turn(asks()), [tool, tool]), Code.INTERNAL, "ai.tools")
    await failed(made.run(Turn(), [tool]), Code.VALIDATION, "ai.empty")
    await failed(made.run(Turn(asks()), [tool], seed=1), Code.INTERNAL, "ai.option")

    assert len(model.asked) == 3

async def test_run_never_executes_a_cut_or_refused_turn () -> None:

    ran: list[str] = []

    def weather ( city: str ) -> str:

        ran.append(city)

        return city

    call = Call("c", "weather", { "city": "Cairo" })
    tool = Tool("weather", "The weather", PLACE, weather)

    for stop in ("length", "refused", "paused", "other"):

        model = Scripted(Reply("partial", "scripted", 1, 1, stop, (call,)))
        turn  = Turn(asks())
        reply = await brain(model).run(turn, [tool])

        assert reply.stop == stop and ran == [] and len(model.asked) == 1
        assert turn.messages == [*asks(), Message("assistant", "partial")]

    for stop in ("tools", "stop"):

        model = Scripted(Reply("acting", "scripted", 1, 1, stop, (call,)))
        turn  = Turn(asks())
        reply = await brain(model).run(turn, [tool])

        assert reply.text == "ok" and len(model.asked) == 2 and turn.messages[2] == Message.result(call, "Cairo")

    assert ran == ["Cairo", "Cairo"]

async def test_a_cancelled_run_leaves_no_call_unanswered () -> None:

    gate = asyncio.Event()

    async def wait ( **_: object ) -> str:

        gate.set()

        await asyncio.sleep(30)

        return "late"

    calls = (Call("c1", "quick"), Call("c2", "wait"), Call("c3", "quick"))
    model = Scripted(Reply("", "scripted", 1, 1, "tools", calls))
    made  = brain(model, timeout=60)
    turn  = Turn(asks())
    task  = asyncio.create_task(made.run(turn, [Tool("quick", "", handler=giving("done")), Tool("wait", "", handler=wait)]))

    await gate.wait()

    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    assert [(message.content, message.failed) for message in turn.messages[2:]] == [
        ("done", False), ("cancelled", True), ("cancelled", True),
    ]
    assert [message.call_id for message in turn.messages[2:]] == ["c1", "c2", "c3"]

def fixed ( rows: object ) -> Callable[[Sequence[str]], object]:

    return lambda _: rows

def written ( path: Path, body: bytes ) -> Path:

    path.write_bytes(body)

    return path

async def test_embed_asks_once_for_each_distinct_text () -> None:

    model = Scripted()
    other = Scripted()
    cache = Cache(Memory())
    made  = brain(model, cache=cache)
    rows  = await made.embed(["a", "bb", "a"])
    key   = f"ai:embed:{crypto.digest(b'scripted:2\x00zz')}"

    assert rows == [[1.0, 1.0], [2.0, 1.0], [1.0, 1.0]] and model.texts == [["a", "bb"]]
    assert made.stats() == { "calls": 1, "tokens_in": 0, "tokens_out": 0, "cached": 0 }

    rows[0][0] = 99.0

    assert await made.embed(("a", "ccc")) == [[1.0, 1.0], [3.0, 1.0]] and model.texts[-1] == ["ccc"]
    assert await made.embed(["a", "a", "bb"]) == [[1.0, 1.0], [1.0, 1.0], [2.0, 1.0]] and len(model.texts) == 2
    assert made.stats()["cached"] == 4 and made.stats()["calls"] == 2 and made.dimensions() == 2
    assert await made.embed([]) == [] and len(model.texts) == 2

    for junk in ("junk", [1.0], [], { "a": 1 }, 0):

        await cache.set(key, junk)

        assert await made.embed(["zz"]) == [[2.0, 1.0]] and model.texts[-1] == ["zz"] and await cache.get(key) == [2.0, 1.0]

    cast("Any", other).name = "other"

    made.use(other, tasks=["classify"])

    assert await made.embed(["a"], "classify") == [[1.0, 1.0]] and other.texts == [["a"]]

async def test_embed_without_a_cache_asks_every_time_and_survives_a_broken_one () -> None:

    for cache in (None, Cache(Flaky())):

        model = Scripted()
        made  = brain(model, cache=cache)

        assert await made.embed(["a"]) == [[1.0, 1.0]] and await made.embed(["a"]) == [[1.0, 1.0]]
        assert model.texts == [["a"], ["a"]] and made.stats()["cached"] == 0 and made.stats()["calls"] == 2

async def test_embed_refuses_texts_no_model_should_see () -> None:

    model = Scripted()
    made  = brain(model)
    wrong: tuple[tuple[Code, str, object], ...] = (
        (Code.INTERNAL, "ai.texts", "a"), (Code.INTERNAL, "ai.texts", [5]), (Code.INTERNAL, "ai.texts", None),
        (Code.INTERNAL, "ai.texts", { "a" }), (Code.TOO_LARGE, "ai.input", ["a"] * (TEXTS + 1)),
        (Code.TOO_LARGE, "ai.input", ["x" * (MAX_INPUT + 1)]), (Code.VALIDATION, "ai.empty", [""]),
        (Code.VALIDATION, "ai.empty", ["a", " \n\t"]), (Code.VALIDATION, "ai.text", ["\ud800"]),
    )

    for code, reason, texts in wrong: await failed(made.embed(cast("Any", texts)), code, reason)

    await failed(made.embed(["a"], "nope"), Code.INTERNAL, "ai.task")
    await failed(brain(Plain()).embed([]), Code.INTERNAL, "ai.capability")

    assert model.texts == []

async def test_embed_packs_texts_by_count_and_by_size () -> None:

    model = Scripted()
    made  = brain(model)
    long  = [f"{at}{'x' * (MAX_INPUT - 1)}" for at in range(9)]

    model.batch = 2

    assert await made.embed(list("abcde")) == [[1.0, 1.0]] * 5 and sorted(model.texts) == [["a", "b"], ["c", "d"], ["e"]]
    assert made.stats()["calls"] == 3

    model.batch = 0
    model.texts = []

    assert len(await made.embed(list("abcde"))) == 5 and model.texts == [list("abcde")]

    model.texts = []

    assert len(await made.embed(long)) == 9 and sorted(len(pack) for pack in model.texts) == [1, 8]

    model.batch = 1
    model.delay = 0.01
    model.texts = []

    assert len(await made.embed([f"t{at}" for at in range(12)])) == 12 and len(model.texts) == 12 and model.peak == 4

async def test_embed_refuses_rows_that_do_not_match_what_was_asked () -> None:

    model = Scripted()
    made  = brain(model, timeout=0.05)
    wrong: tuple[tuple[str, object], ...] = (
        ("count", [[1.0, 1.0]]), ("count", [[1.0, 1.0]] * 3), ("count", "rows"), ("count", None), ("count", ([1.0, 1.0], [1.0, 1.0])),
        ("vector", [[1.0, 1.0], [1.0]]), ("vector", [[1.0, 1.0], (1.0, 1.0)]), ("vector", [[1.0, 1.0], []]),
        ("vector", [[1.0, 1.0], "ab"]),
    )

    for what, rows in wrong:

        model.rows = fixed(rows)

        fault = await failed(made.embed(["a", "b"]), Code.UNAVAILABLE, "ai.embed")

        assert fault.errors == { "reply": [what] } and fault.unknown

    model.dimensions = 0
    model.rows       = fixed([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])

    assert await made.embed(["a", "b"]) == [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]

    model.rows  = None
    model.delay = 5.0

    await failed(made.embed(["slow"]), Code.TIMEOUT, "ai.timeout")

async def test_attach_and_document_read_bounded_files ( tmp_path: Path ) -> None:

    made  = Ai()
    image = written(tmp_path / "a.png", PNG)
    text  = written(tmp_path / "a.txt", ("ص" * (MAX_INPUT + 5)).encode())
    odd   = written(tmp_path / "b.txt", b"\xff\xfe")

    assert await made.attach(image) == PNG and await made.document(text) == "ص" * MAX_INPUT

    await failed(made.attach(image, len(PNG) - 1), Code.TOO_LARGE, "fs.size")
    await failed(made.document(text, 10), Code.TOO_LARGE, "fs.size")
    await failed(made.document(odd), Code.BAD_REQUEST, "fs.encoding")

    with pytest.raises(Fault) as caught: await made.attach(tmp_path / "ghost.png")

    assert caught.value.code is Code.NOT_FOUND

async def test_close_reaches_every_model_and_survives_a_failing_one () -> None:

    shut: list[str] = []
    first, second = Scripted(), Plain()

    async def closing () -> None:

        shut.append("plain")

    async def failing () -> None:

        raise OSError("gone")

    cast("Any", first).close  = failing
    cast("Any", second).close = closing

    made = brain(first, second)

    await made.close()

    assert shut == ["plain"] and made.ready()

def heads ( seen: Seen ) -> dict[str, str]:

    return { name.lower(): value for name, value in seen.heads.items() }

def worded ( text: object ) -> dict[str, Any]:

    return { "type": "text", "text": text }

def using ( key: object, name: object, arguments: object ) -> dict[str, Any]:

    return { "type": "tool_use", "id": key, "name": name, "input": arguments }

def claude ( *blocks: Mapping[str, Any], stop: str | None = "end_turn", usage: object = None ) -> dict[str, Any]:

    return {
        "id": "msg_1", "type": "message", "role": "assistant", "content": list(blocks), "stop_reason": stop,
        "usage": usage or { "input_tokens": 3, "output_tokens": 2 },
    }

def hosted ( fake: Fake ) -> tuple[Hosted, ...]:

    return (
        Anthropic(fake.remote(), "m"), Openai(fake.remote(), "m"), Gemini(fake.remote(), "m"), Ollama(fake.remote(), "m"),
    )

def test_a_hosted_model_refuses_settings_it_could_not_run_on () -> None:

    remote = Remote(net, "http://127.0.0.1:9", {}, LOCAL)
    wrong: tuple[Wrong, ...] = (
        ("remote", lambda: Anthropic(cast("Any", None), "m")), ("remote", lambda: Openai(cast("Any", "http://x"), "m")),
        ("model", lambda: Anthropic(remote, "")), ("model", lambda: Gemini(remote, "a\nb")),
        ("model", lambda: Ollama(remote, "m" * (IDENT + 1))), ("model", lambda: Openai(remote, cast("Any", 7))),
        ("max_tokens", lambda: Anthropic(remote, "m", 0)), ("max_tokens", lambda: Anthropic(remote, "m", cast("Any", None))),
        ("max_tokens", lambda: Anthropic(remote, "m", MOST + 1)), ("max_tokens", lambda: Gemini(remote, "m", max_tokens=0)),
        ("max_tokens", lambda: Openai(remote, "m", max_tokens=FLAG)),
        ("version", lambda: Anthropic(remote, "m", version="")), ("version", lambda: Anthropic(remote, "m", version=cast("Any", 2026))),
        ("timeout", lambda: Anthropic(remote, "m", timeout=0)), ("timeout", lambda: Openai(remote, "m", timeout=-1)),
        ("timeout", lambda: Gemini(remote, "m", timeout=FLAG)), ("timeout", lambda: Ollama(remote, "m", timeout=3_601)),
        ("timeout", lambda: Ollama(remote, "m", timeout=math.inf)), ("timeout", lambda: Ollama(remote, "m", timeout=math.nan)),
        ("timeout", lambda: Openai(remote, "m", timeout=cast("Any", "5"))),
        ("embedding", lambda: Openai(remote, "m", "")), ("embedding", lambda: Gemini(remote, "m", "e\x00")),
        ("embedding", lambda: Ollama(remote, "m", cast("Any", 7))),
        ("dimensions", lambda: Openai(remote, "m", dimensions=-1)), ("dimensions", lambda: Gemini(remote, "m", dimensions=WIDEST + 1)),
        ("dimensions", lambda: Ollama(remote, "m", dimensions=FLAG)),
        ("dimensions", lambda: Ollama(remote, "m", dimensions=cast("Any", 1.5))),
    )

    for setting, make in wrong:

        assert refused(make, Code.INTERNAL, "ai.settings").errors == { "setting": [setting] }

    assert Gemini(remote, "m", dimensions=WIDEST).dimensions == WIDEST and Anthropic(remote, "m", MOST, timeout=3_600).owner() == "anthropic:m"

async def test_a_hosted_model_names_what_it_owns_and_where_its_vectors_live () -> None:

    remote = Remote(net, "http://127.0.0.1:9", {}, LOCAL)
    made   = Openai(remote, "gpt", "small", timeout=5, max_tokens=64, dimensions=8)
    plain  = Anthropic(remote, "claude")

    assert (made.owner(), made.space(), made.dimensions, made.family) == ("openai:gpt", "openai:small:8", 8, "ai")
    assert made.describe() == {
        "family": "ai", "name": "openai", "capabilities": ["chat", "embed", "json", "stream", "tools"], "model": "gpt",
        "embedding": "small", "dimensions": 8, "timeout": 5.0,
    }
    assert (plain.owner(), plain.space(), plain.dimensions) == ("anthropic:claude", "anthropic:None:0", 0)
    assert "embed" not in plain.capabilities and plain.describe()["embedding"] is None
    assert [(model.name, model.dimensions) for model in (Openai(remote, "m"), Gemini(remote, "m"), Ollama(remote, "m"))] == [("openai", 1536), ("gemini", 768), ("ollama", 768)]
    assert Openai(remote, "a", "e").space() != Openai(remote, "b", "f").space() != Openai(remote, "b", "f", dimensions=256).space()

    await failed(plain.embed(["x"]), Code.INTERNAL, "ai.abstract")

    for model in (Openai(remote, "m", cast("Any", None)), Gemini(remote, "m", cast("Any", None)), Ollama(remote, "m", cast("Any", None))):

        assert (await failed(model.embed(["x"]), Code.INTERNAL, "ai.settings")).errors == { "setting": ["embedding"] }

async def test_a_provider_failure_is_never_the_callers_own ( fake: Fake ) -> None:

    turned: tuple[tuple[int, Code, str, str | None], ...] = (
        (400, Code.BAD_GATEWAY, "ai.provider", "remote.bad_request"), (401, Code.BAD_GATEWAY, "ai.provider", "remote.unauthorized"),
        (403, Code.BAD_GATEWAY, "ai.provider", "remote.forbidden"), (404, Code.BAD_GATEWAY, "ai.provider", "remote.not_found"),
        (408, Code.BAD_GATEWAY, "ai.provider", "remote.408"), (409, Code.BAD_GATEWAY, "ai.provider", "remote.conflict"),
        (413, Code.BAD_GATEWAY, "ai.provider", "remote.413"), (422, Code.BAD_GATEWAY, "ai.provider", "remote.validation"),
        (429, Code.UNAVAILABLE, "ai.provider", "throttled"), (500, Code.UNAVAILABLE, "remote.500", None),
        (503, Code.UNAVAILABLE, "remote.503", None),
    )

    for status, code, reason, what in turned:

        for model in hosted(fake):

            sent = len(fake.seen)

            fake.answer(Raw(status, b'{"error":"secret detail"}'))

            fault = await failed(model.chat(asks()), code, reason)

            assert fault.server() and "secret" not in f"{fault} {fault.errors}"
            assert fault.errors == (None if what is None else { "provider": [what] }) and len(fake.seen) == sent + 1

        for model in hosted(fake)[1:]:

            sent = len(fake.seen)

            fake.answer(Raw(status, b"{}"))

            fault = await failed(model.embed(["x"]), code, reason)

            assert fault.server() and fault.errors == (None if what is None else { "provider": [what] }) and len(fake.seen) == sent + 1

async def test_a_provider_answer_that_is_not_json_or_too_big_is_a_broken_reply ( fake: Fake, monkeypatch: pytest.MonkeyPatch ) -> None:

    for body in (b"<html>busy</html>", b"{", b"\xff\xfe"):

        for model in hosted(fake):

            fake.answer(Raw(200, body, "text/html"))

            assert (await failed(model.chat(asks()), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": ["json"] }

    for body in (b"", b"null", b"[]", b'"text"', b"7"):

        for model in hosted(fake):

            fake.answer(Raw(200, body))

            assert (await failed(model.chat(asks()), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": ["body"] }

    monkeypatch.setattr(module(Hosted), "REPLY", 64)

    for model in hosted(fake):

        fake.answer(Raw(200, json.dumps({ "content": "x" * 4_096 }).encode()))

        fault = await failed(model.chat(asks()), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": ["size"] } and fault.server() and fault.unknown

async def test_a_slow_provider_is_cut_at_the_models_own_timeout_and_asked_once ( fake: Fake ) -> None:

    made = (
        Anthropic(fake.remote(), "m", timeout=0.05), Openai(fake.remote(), "m", timeout=0.05),
        Gemini(fake.remote(), "m", timeout=0.05), Ollama(fake.remote(), "m", timeout=0.05),
    )

    for model in made:

        sent = len(fake.seen)

        fake.answer(Raw(200, b'{"content":[]}', pause=0.4))

        fault = await failed(model.chat(asks()), Code.TIMEOUT, "net.timeout")

        assert fault.unknown and len(fake.seen) == sent + 1

async def test_anthropic_sends_one_messages_request ( fake: Fake ) -> None:

    calls = (Call("toolu_1", "weather", { "city": "Cairo" }), Call("toolu_2", "weather"))
    tools = (Tool("weather", "Looks the sky up", PLACE), Tool("ping", ""))
    model = Anthropic(fake.remote(), "claude-x", 512)
    asked = [
        Message("system", "Be brief."), Message("user", "look", images=(PNG, JPEG)), Message("user", "and tell"),
        Message("system", "Answer in Arabic."), Message("system", ""), Message("assistant", "", calls),
        Message.result(calls[0], "sunny"), Message.result(calls[1], "", failed=True), Message("assistant", "  "),
        Message("user", "thanks"), Message("assistant", "welcome"),
    ]

    fake.answer(claude(worded("ok")))

    reply = await model.chat(asked, tools, None, max_tokens=64, stop="END", tool_choice="any", temperature=0.5, top_p=0.9)
    seen  = fake.last()

    assert reply.text == "ok" and seen.path == "/v1/messages" and len(fake.seen) == 1
    assert (heads(seen)["anthropic-version"], heads(seen)["x-key"], heads(seen)["content-type"]) == (VERSION, "k", "application/json")
    assert seen.body == {
        "model": "claude-x", "max_tokens": 64, "system": "Be brief.\n\nAnswer in Arabic.", "stop_sequences": ["END"],
        "messages": [
            { "role": "user", "content": [
                { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": base64.b64encode(PNG).decode() } },
                { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(JPEG).decode() } },
                worded("look"), worded("and tell"),
            ] },
            { "role": "assistant", "content": [using("toolu_1", "weather", { "city": "Cairo" }), using("toolu_2", "weather", {})] },
            { "role": "user", "content": [
                { "type": "tool_result", "tool_use_id": "toolu_1", "content": "sunny" },
                { "type": "tool_result", "tool_use_id": "toolu_2", "content": "failed", "is_error": True }, worded("thanks"),
            ] },
            { "role": "assistant", "content": [worded("welcome")] },
        ],
        "tools": [
            { "name": "weather", "input_schema": PLACE, "description": "Looks the sky up" },
            { "name": "ping", "input_schema": { "type": "object", "properties": {} } },
        ],
        "tool_choice": { "type": "any" },
    }

    fake.answer(claude(worded("ok")), claude(worded("ok")))

    await Anthropic(fake.remote(), "claude-y", version="2023-06-01").chat(asks(), (), None, stop=["a", "b"], tool_choice="auto")

    assert fake.last().body == { "model": "claude-y", "max_tokens": TOKENS, "messages": [{ "role": "user", "content": [worded("hello")] }], "stop_sequences": ["a", "b"] }
    assert heads(fake.last())["anthropic-version"] == "2023-06-01"

    await model.chat([Message("tool", "boom", call_id="toolu_9", failed=True)])

    assert fake.last().body["messages"] == [{ "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_9", "content": "boom", "is_error": True }] }]

async def test_anthropic_asks_for_a_schema_the_provider_accepts ( fake: Fake ) -> None:

    model  = Anthropic(fake.remote(), "claude-x")
    schema = {
        "type": "object", "title": "Answer", "minProperties": 1, "additionalProperties": True, "required": ["name"],
        "properties": {
            "name": { "type": "string", "minLength": 2, "format": "email", "description": "who" },
            "when": { "type": "string", "format": "phone", "pattern": "x+" }, "minimum": { "type": "integer", "minimum": 0, "default": 1 },
            "kind": { "oneOf": [{ "const": "a" }, { "type": "integer", "maximum": 9 }], "enum": ["a", 1] },
            "tags": { "type": "array", "items": { "$ref": "#/$defs/Tag" }, "maxItems": 3, "uniqueItems": True },
            "both": { "allOf": [{ "$ref": "#/$defs/Tag" }, { "properties": { "extra": { "type": "number", "format": 7 } } }] },
        },
        "$defs": { "Tag": { "type": "object", "properties": { "label": { "type": "string" } }, "patternProperties": {} } },
        "definitions": { "Old": { "type": "object", "additionalProperties": { "type": "string" } } },
    }

    fake.answer(claude(worded("{}")))

    await model.chat(asks(), (), schema)

    assert fake.last().body["output_config"] == { "format": { "type": "json_schema", "schema": {
        "type": "object", "title": "Answer", "required": ["name"], "additionalProperties": False,
        "properties": {
            "name": { "type": "string", "format": "email", "description": "who" }, "when": { "type": "string" },
            "minimum": { "type": "integer", "default": 1 },
            "kind": { "anyOf": [{ "const": "a" }, { "type": "integer" }], "enum": ["a", 1] },
            "tags": { "type": "array", "items": { "$ref": "#/$defs/Tag" } },
            "both": { "allOf": [{ "$ref": "#/$defs/Tag" }, { "properties": { "extra": { "type": "number" } }, "additionalProperties": False }] },
        },
        "$defs": { "Tag": { "type": "object", "properties": { "label": { "type": "string" } }, "additionalProperties": False } },
        "definitions": { "Old": { "type": "object", "additionalProperties": False } },
    } } }
    assert schema["additionalProperties"] is True and len(fake.seen) == 1

    deep: dict[str, Any] = { "type": "string" }

    for _ in range(DEPTH + 2): deep = { "type": "array", "items": deep }

    await failed(model.chat(asks(), (), deep), Code.INTERNAL, "ai.schema")

    assert len(fake.seen) == 1

async def test_anthropic_reads_text_calls_usage_and_stops ( fake: Fake ) -> None:

    model = Anthropic(fake.remote(), "claude-x")
    usage = { "input_tokens": 3, "cache_creation_input_tokens": 10, "cache_read_input_tokens": 100, "output_tokens": 7 }

    fake.answer(claude(worded("He"), worded("llo"), using("toolu_1", "weather", { "city": "Cairo" }), stop="tool_use", usage=usage))

    reply = await model.chat(asks())

    assert (reply.text, reply.model, reply.tokens_in, reply.tokens_out, reply.stop) == ("Hello", "claude-x", 113, 7, "tools")
    assert reply.calls == (Call("toolu_1", "weather", { "city": "Cairo" }),) and reply.native is None and reply.raw["id"] == "msg_1"

    for given, mapped in (*ANTHROPIC_STOPS.items(), ("mystery", "other"), (None, "other"), ("", "other")):

        fake.answer(claude(worded("x"), stop=given))

        assert (await model.chat(asks())).stop == ("other" if mapped == "tools" else mapped)

    fake.answer(claude(using("a", "n", {}), stop="end_turn"), claude(using("a", "n", {}), stop="max_tokens"), claude(using("a", "n", {}), stop="refusal"))

    assert [(await model.chat(asks())).stop for _ in range(3)] == ["tools", "length", "refused"]

    for spent in ("many", [1], { "input_tokens": -1, "output_tokens": True }, { "input_tokens": 1.5, "output_tokens": 1 << 41 }, { "input_tokens": "3" }):

        fake.answer(claude(worded("x"), usage=spent))

        reply = await model.chat(asks())

        assert (reply.tokens_in, reply.tokens_out) == (0, 0)

async def test_anthropic_keeps_what_it_thought_so_the_next_turn_can_replay_it ( fake: Fake ) -> None:

    model  = Anthropic(fake.remote(), "claude-x")
    blocks = (
        { "type": "thinking", "thinking": "hm", "signature": "sig" }, worded("ok"),
        { "type": "server_tool_use", "id": "s", "name": "web_search", "input": {} }, using("toolu_9", "weather", {}),
        { "type": "redacted_thinking", "data": "opaque" },
    )

    fake.answer(claude(*blocks, stop="tool_use"), claude({ "type": "redacted_thinking", "data": "opaque" }), claude(worded("plain")))

    reply = await model.chat(asks())

    assert reply.native == Native("anthropic:claude-x", [blocks[0], blocks[1], blocks[3], blocks[4]], bound=True)
    assert reply.message().native == reply.native and reply.said().native is None and reply.text == "ok"
    assert (await model.chat(asks())).native == Native("anthropic:claude-x", [blocks[4]], bound=True)
    assert (await model.chat(asks())).native is None

async def test_anthropic_refuses_a_reply_it_cannot_read ( fake: Fake ) -> None:

    broken: tuple[tuple[str, Answer], ...] = (
        ("content", { "content": "text" }), ("content", {}), ("content", { "content": { "type": "text" } }),
        ("block", { "content": ["text"] }), ("block", { "content": [worded("x"), None] }), ("text", { "content": [worded(7)] }),
        ("text", { "content": [worded(["x"])] }), ("call", { "content": [using(7, "n", {})] }), ("call", { "content": [using("a", "", {})] }),
        ("call", { "content": [using("a", None, {})] }), ("call", { "content": [using("a", "n" * (IDENT + 1), {})] }),
        ("call", { "content": [using("a\nb", "n", {})] }), ("calls", { "content": [using("a", "n", {}), using("a", "m", {})] }),
        ("calls", { "content": [using(f"c{at}", "n", {}) for at in range(TOOLS + 1)] }),
        ("size", { "content": [worded("x" * (MAX_OUTPUT + 1))] }), ("size", { "content": [worded("x" * MAX_OUTPUT), worded("y")] }),
    )

    for what, answer in broken:

        fault = await failed(Anthropic(fake.answer(answer).remote(), "m").chat(asks()), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] } and fault.server() and fault.unknown

    odd = (worded(None), { "type": "mystery" }, { "type": 7 }, using(None, "n", [1]), using("", "n", '{"a":1}'), using("k", "n", "not json"), using("z", "n", None))

    fake.answer({ "content": list(odd) }, { "content": [worded("x" * MAX_OUTPUT)] }, { "content": [using(f"c{at}", "n", {}) for at in range(TOOLS)] })

    reply = await Anthropic(fake.remote(), "m").chat(asks())

    assert reply.text == "" and reply.stop == "other" and [call.broken for call in reply.calls] == [True, False, True, False]
    assert [call.arguments for call in reply.calls] == [{}, { "a": 1 }, {}, {}] and [call.id for call in reply.calls[2:]] == ["k", "z"]
    assert all(call.id.startswith("local_") and len(call.id) == 22 for call in reply.calls[:2]) and reply.calls[0].id != reply.calls[1].id
    assert len((await Anthropic(fake.remote(), "m").chat(asks())).text) == MAX_OUTPUT
    assert len((await Anthropic(fake.remote(), "m").chat(asks())).calls) == TOOLS

def delta ( text: object ) -> tuple[str, object]:

    return "content_block_delta", { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": text } }

def events ( *items: tuple[str | None, object], pause: float = 0.0 ) -> Raw:

    return Raw(200, sse(*items), "text/event-stream", pause)

STOPPED: tuple[str | None, object] = ("message_stop", { "type": "message_stop" })

async def test_anthropic_streams_text_deltas_until_the_message_stops ( fake: Fake ) -> None:

    model = Anthropic(fake.remote(), "claude-x", 99)
    flow  = events(
        ("message_start", { "type": "message_start", "message": {} }), ("ping", { "type": "ping" }),
        ("content_block_start", { "type": "content_block_start", "index": 0 }), delta("He"), delta(""), delta("llo "),
        ("content_block_delta", { "type": "content_block_delta", "delta": { "type": "input_json_delta", "partial_json": "{" } }),
        ("content_block_delta", { "type": "content_block_delta", "delta": "text" }), ("content_block_delta", { "type": "content_block_delta" }),
        delta(7), delta("مرحبا"), ("content_block_stop", { "type": "content_block_stop" }),
        ("message_delta", { "type": "message_delta", "delta": { "stop_reason": "end_turn" } }), STOPPED, delta("late"),
        pause=0.05,
    )

    fake.answer(flow)

    pieces = await drained(model.stream([Message("system", "brief"), *asks("hi")], max_tokens=5, stop="X"))
    seen   = fake.last()

    assert pieces == ["He", "llo ", "مرحبا"] and seen.path == "/v1/messages"
    assert (heads(seen)["accept"], heads(seen)["anthropic-version"], heads(seen)["x-key"]) == ("text/event-stream", VERSION, "k")
    assert seen.body == {
        "model": "claude-x", "max_tokens": 5, "system": "brief", "stop_sequences": ["X"], "stream": True,
        "messages": [{ "role": "user", "content": [worded("hi")] }],
    }

    fake.answer(events(delta("a"), STOPPED))

    assert await drained(model.stream(asks())) == ["a"] and fake.last().body["max_tokens"] == 99

async def test_anthropic_refuses_a_stream_that_errs_ends_early_or_lies ( fake: Fake ) -> None:

    model  = Anthropic(fake.remote(), "claude-x")
    broken: tuple[tuple[str, Raw], ...] = (
        ("cut", events(delta("a"))), ("cut", Raw(200, b"", "text/event-stream")), ("cut", events(("ping", {}))),
        ("stream", events(delta("a"), ("error", { "type": "error", "error": { "type": "overloaded_error" } }), STOPPED)),
        ("json", events(("content_block_delta", "{not json"), STOPPED)), ("event", events(("content_block_delta", [1]), STOPPED)),
        ("event", events(("content_block_delta", "null"), STOPPED)),
        ("size", Raw(200, b"event: content_block_delta\ndata: " + b"x" * (1024 * 1024 + 1) + b"\n\n", "text/event-stream")),
    )

    for what, flow in broken:

        fake.answer(flow)

        fault = await cut(model.stream(asks()), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] } and fault.server()

    turned: tuple[tuple[int, Code, str, str | None], ...] = (
        (400, Code.BAD_GATEWAY, "ai.provider", "net.status"), (413, Code.BAD_GATEWAY, "ai.provider", "net.status"),
        (429, Code.UNAVAILABLE, "ai.provider", "throttled"), (500, Code.UNAVAILABLE, "net.status", None), (503, Code.UNAVAILABLE, "net.status", None),
    )

    for status, code, reason, kind in turned:

        fake.answer(Raw(status, b'{"error":"hidden"}'))

        fault = await cut(Anthropic(fake.remote(), "m").stream(asks()), code, reason)

        assert fault.errors == (None if kind is None else { "provider": [kind] }) and "hidden" not in str(fault)

    fake.answer(events(delta("a"), delta("b"), STOPPED, pause=0.5))

    slow = Anthropic(fake.remote(), "m", timeout=0.05).stream(asks())

    assert await anext(slow) == "a"

    with pytest.raises(Fault) as caught: await drained(slow)

    assert caught.value.code is Code.TIMEOUT

    fake.answer(events(delta("a"), delta("b"), STOPPED, pause=0.5))

    early = Anthropic(fake.remote(), "m").stream(asks())

    assert await anext(early) == "a"

    await early.aclose()

    with pytest.raises(StopAsyncIteration): await anext(early)

async def test_anthropic_replays_its_own_thinking_and_drops_it_when_the_provider_objects ( fake: Fake ) -> None:

    model   = Anthropic(fake.remote(), "claude-x")
    thought = { "type": "thinking", "thinking": "hm", "signature": "sig" }
    call    = Call("toolu_1", "weather", { "city": "Cairo" })
    mine    = Native("anthropic:claude-x", [thought, worded("looking"), using("toolu_1", "weather", { "city": "Cairo" })], bound=True)
    other   = Native("openai:gpt", [thought], bound=True)
    before  = Message("assistant", "earlier", native=Native("anthropic:claude-x", [thought, worded("earlier")], bound=True))
    asked   = [*asks("a"), before, *asks("weather?"), Message("assistant", "looking", (call,), native=mine), Message.result(call, "sunny")]

    fake.answer(claude(worded("sunny indeed")))

    reply = await model.chat(asked)

    assert reply.text == "sunny indeed" and len(fake.seen) == 1
    assert fake.last().body["messages"] == [
        { "role": "user", "content": [worded("a")] }, { "role": "assistant", "content": [worded("earlier")] },
        { "role": "user", "content": [worded("weather?")] }, { "role": "assistant", "content": list(mine.content) },
        { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": "sunny" }] },
    ]

    fake.answer(Raw(400, b'{"type":"error","error":{"type":"invalid_request_error","message":"signature"}}'), claude(worded("again")))

    assert (await model.chat(asked)).text == "again" and len(fake.seen) == 3
    assert fake.seen[1].body["messages"][3] == { "role": "assistant", "content": list(mine.content) }
    assert fake.seen[2].body["messages"][3] == { "role": "assistant", "content": [worded("looking"), using("toolu_1", "weather", { "city": "Cairo" })] }

    fake.answer(Raw(400, b"{}"), Raw(400, b"{}"))

    fault = await failed(model.chat(asked), Code.BAD_GATEWAY, "ai.provider")

    assert fault.errors == { "provider": ["remote.bad_request"] } and len(fake.seen) == 5

    fake.answer(Raw(500, b"{}"))

    await failed(model.chat(asked), Code.UNAVAILABLE, "remote.500")

    assert len(fake.seen) == 6

    fake.answer(Raw(400, b"{}"), claude(worded("x")))

    plain = [*asks("a"), Message("assistant", "said", native=other), Message("assistant", "", native=Native("anthropic:claude-x", { "not": "a list" }))]

    await failed(model.chat(plain), Code.BAD_GATEWAY, "ai.provider")

    assert len(fake.seen) == 7 and fake.last().body["messages"][1] == { "role": "assistant", "content": [worded("said")] }

    fake.answer(claude(worded("x")))

    await model.chat([*asks("a"), Message("assistant", "", native=Native("anthropic:claude-x", [], bound=True))])

    assert fake.last().body["messages"] == [{ "role": "user", "content": [worded("a")] }] and len(fake.seen) == 8

def choice ( content: object = "ok", calls: object = None, finish: object = "stop", refusal: object = None ) -> dict[str, Any]:

    message: dict[str, Any] = { "role": "assistant", "content": content }

    if calls is not None: message["tool_calls"] = calls
    if refusal is not None: message["refusal"] = refusal

    return { "index": 0, "message": message, "finish_reason": finish }

def gpt ( *choices: Mapping[str, Any], usage: object = None ) -> dict[str, Any]:

    return { "id": "cc", "object": "chat.completion", "choices": list(choices), "usage": usage or { "prompt_tokens": 3, "completion_tokens": 2 } }

def wanting ( key: object, name: object, arguments: object ) -> dict[str, Any]:

    return { "id": key, "type": "function", "function": { "name": name, "arguments": arguments } }

async def test_openai_sends_one_completions_request ( fake: Fake ) -> None:

    calls = (Call("call_1", "weather", { "city": "Cairo" }), Call("call_2", "ping"))
    tools = (Tool("weather", "Looks the sky up", PLACE), Tool("ping", ""))
    model = Openai(fake.remote(), "gpt-x", max_tokens=512)
    asked = [
        Message("system", "Be brief."), Message("user", "look", images=(PNG,)), Message("user", "", images=(GIF,)),
        Message("assistant", "", calls), Message.result(calls[0], { "sky": "clear" }), Message.result(calls[1], "down", failed=True),
        Message("assistant", "ok then", (calls[1],)), Message("user", "thanks"),
    ]

    fake.answer(gpt(choice()))

    reply = await model.chat(asked, tools, PLACE, max_tokens=64, stop=["END"], tool_choice="any", temperature=0.5, top_p=0.9)
    seen  = fake.last()

    assert reply.text == "ok" and seen.path == "/chat/completions" and len(fake.seen) == 1
    assert (heads(seen)["x-key"], heads(seen)["content-type"]) == ("k", "application/json") and "anthropic-version" not in heads(seen)
    assert seen.body == {
        "model": "gpt-x", "max_completion_tokens": 64, "temperature": 0.5, "top_p": 0.9, "stop": ["END"],
        "messages": [
            { "role": "system", "content": "Be brief." },
            { "role": "user", "content": [worded("look"), { "type": "image_url", "image_url": { "url": f"data:image/png;base64,{base64.b64encode(PNG).decode()}" } }] },
            { "role": "user", "content": [{ "type": "image_url", "image_url": { "url": f"data:image/gif;base64,{base64.b64encode(GIF).decode()}" } }] },
            { "role": "assistant", "content": None, "tool_calls": [wanting("call_1", "weather", '{"city":"Cairo"}'), wanting("call_2", "ping", "{}")] },
            { "role": "tool", "tool_call_id": "call_1", "content": '{"sky":"clear"}' },
            { "role": "tool", "tool_call_id": "call_2", "content": '{"error":"down"}' },
            { "role": "assistant", "content": "ok then", "tool_calls": [wanting("call_2", "ping", "{}")] },
            { "role": "user", "content": "thanks" },
        ],
        "tools": [
            { "type": "function", "function": { "name": "weather", "parameters": PLACE, "description": "Looks the sky up" } },
            { "type": "function", "function": { "name": "ping", "parameters": { "type": "object", "properties": {} } } },
        ],
        "tool_choice": "required",
        "response_format": { "type": "json_schema", "json_schema": { "name": "answer", "schema": PLACE } },
    }

    fake.answer(gpt(choice()), gpt(choice()), gpt(choice()))

    await model.chat(asks(), tools, None, tool_choice="none", stop="X")

    assert fake.last().body["tool_choice"] == "none" and fake.last().body["stop"] == ["X"] and fake.last().body["max_completion_tokens"] == 512

    await Openai(fake.remote(), "gpt-y").chat(asks(), (), None, tool_choice="auto")

    assert fake.last().body == { "model": "gpt-y", "messages": [{ "role": "user", "content": "hello" }] }

    await model.chat([Message("tool", "", call_id="call_7", failed=True)])

    assert fake.last().body["messages"] == [{ "role": "tool", "tool_call_id": "call_7", "content": '{"error":"failed"}' }]

async def test_openai_reads_a_choice_its_calls_and_its_refusal ( fake: Fake ) -> None:

    model = Openai(fake.remote(), "gpt-x")
    calls = [wanting("call_1", "weather", '{"city":"Cairo"}'), wanting("call_2", "ping", ""), wanting("call_3", "ping", None), wanting("call_4", "ping", "nope"), wanting(None, "ping", "[1]"), wanting("call_6", "ping", { "a": 1 })]

    fake.answer(gpt(choice(None, calls, "tool_calls"), { "index": 1, "message": { "content": "ignored" } }, usage={ "prompt_tokens": 11, "completion_tokens": 5, "total_tokens": 16 }))

    reply = await model.chat(asks())

    assert (reply.text, reply.tokens_in, reply.tokens_out, reply.stop, reply.native) == ("", 11, 5, "tools", None)
    assert [(call.name, call.arguments, call.broken) for call in reply.calls] == [("weather", { "city": "Cairo" }, False), ("ping", {}, False), ("ping", {}, False), ("ping", {}, True), ("ping", {}, True), ("ping", { "a": 1 }, False)]
    assert reply.calls[4].id.startswith("local_") and reply.raw["id"] == "cc"

    fake.answer(gpt(choice(None, None, "stop", "I cannot")), gpt(choice("partial", None, "content_filter", "nope")), gpt(choice("text", [wanting("c", "n", "{}")], "stop", "refused anyway")))

    first, second, third = [await model.chat(asks()) for _ in range(3)]

    assert (first.text, first.stop, first.finished) == ("I cannot", "refused", False)
    assert (second.text, second.stop) == ("partial", "refused") and (third.text, third.stop, len(third.calls)) == ("text", "tools", 1)

    for given, mapped in (("stop", "stop"), ("length", "length"), ("tool_calls", "other"), ("function_call", "other"), ("content_filter", "refused"), ("weird", "other"), (None, "other"), (7, "other")):

        fake.answer(gpt(choice("x", None, given)))

        assert (await model.chat(asks())).stop == mapped

    fake.answer(gpt(choice("x", [], "stop"), usage="none"), gpt(choice("x", None, "stop"), usage={ "prompt_tokens": "3", "completion_tokens": -2 }))

    assert [(reply.tokens_in, reply.tokens_out, reply.stop) for reply in [await model.chat(asks()) for _ in range(2)]] == [(0, 0, "stop")] * 2

async def test_openai_refuses_a_reply_it_cannot_read ( fake: Fake ) -> None:

    broken: tuple[tuple[str, Answer], ...] = (
        ("choices", {}), ("choices", { "choices": [] }), ("choices", { "choices": "none" }), ("choice", { "choices": ["x"] }),
        ("message", { "choices": [{ "index": 0 }] }), ("message", { "choices": [{ "message": "hi" }] }),
        ("text", gpt(choice(7))), ("text", gpt(choice(["x"]))), ("refusal", gpt(choice("x", None, "stop", 7))),
        ("calls", gpt(choice("x", "none"))), ("calls", gpt(choice("x", { "id": "c" }))), ("call", gpt(choice("x", ["c"]))),
        ("call", gpt(choice("x", [{ "id": "c", "type": "function" }]))), ("call", gpt(choice("x", [{ "id": "c", "function": "weather" }]))),
        ("call", gpt(choice("x", [wanting("c", "", "{}")]))), ("call", gpt(choice("x", [wanting("c", None, "{}")]))),
        ("call", gpt(choice("x", [wanting(7, "n", "{}")]))), ("call", gpt(choice("x", [wanting("c" * (IDENT + 1), "n", "{}")]))),
        ("calls", gpt(choice("x", [wanting("c", "n", "{}"), wanting("c", "m", "{}")]))),
        ("calls", gpt(choice("x", [wanting(f"c{at}", "n", "{}") for at in range(TOOLS + 1)]))),
        ("size", gpt(choice("x" * (MAX_OUTPUT + 1)))),
    )

    for what, answer in broken:

        fault = await failed(Openai(fake.answer(answer).remote(), "m").chat(asks()), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] } and fault.server() and fault.unknown

async def test_openai_streams_deltas_until_done ( fake: Fake ) -> None:

    model = Openai(fake.remote(), "gpt-x", max_tokens=99)

    def piece ( content: object, finish: object = None ) -> tuple[str | None, object]:

        return None, { "id": "cc", "choices": [{ "index": 0, "delta": { "content": content }, "finish_reason": finish }] }

    fake.answer(events(
        (None, { "id": "cc", "choices": [{ "index": 0, "delta": { "role": "assistant" } }] }), piece("He"), piece(""), piece(None),
        (None, { "id": "cc", "choices": [] }), (None, { "id": "cc", "choices": "x" }), (None, { "id": "cc", "choices": ["x"] }),
        (None, { "id": "cc", "choices": [{ "delta": "x" }] }), piece(7), piece("llo", "stop"), (None, { "usage": {} }), (None, DONE),
        piece("late"), pause=0.05,
    ))

    pieces = await drained(model.stream([Message("system", "brief"), *asks("hi")], max_tokens=5, stop="X", temperature=0))
    seen   = fake.last()

    assert pieces == ["He", "llo"] and seen.path == "/chat/completions" and heads(seen)["accept"] == "text/event-stream"
    assert seen.body == {
        "model": "gpt-x", "max_completion_tokens": 5, "stop": ["X"], "temperature": 0, "stream": True,
        "messages": [{ "role": "system", "content": "brief" }, { "role": "user", "content": "hi" }],
    }

    broken: tuple[tuple[str, Raw], ...] = (
        ("cut", events(piece("a"))), ("cut", Raw(200, b"", "text/event-stream")), ("json", events(piece("a"), (None, "[done]"))),
        ("stream", events(piece("a"), (None, { "error": { "message": "overloaded" } }), (None, DONE))),
        ("json", events((None, "{not json"), (None, DONE))), ("event", events((None, [1]), (None, DONE))),
    )

    for what, flow in broken:

        fake.answer(flow)

        assert (await cut(model.stream(asks()), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": [what] }

    fake.answer(Raw(429, b"{}"), Raw(401, b"{}"))

    assert (await cut(Openai(fake.remote(), "m").stream(asks()), Code.UNAVAILABLE, "ai.provider")).errors == { "provider": ["throttled"] }
    assert (await cut(Openai(fake.remote(), "m").stream(asks()), Code.BAD_GATEWAY, "ai.provider")).errors == { "provider": ["net.status"] }

def rows ( *vectors: object, keys: Sequence[object] | None = None ) -> dict[str, Any]:

    listed = list(keys) if keys is not None else list(range(len(vectors)))

    return { "object": "list", "data": [{ "object": "embedding", "index": key, "embedding": vector } for key, vector in zip(listed, vectors, strict=True)] }

async def test_openai_embeds_in_one_request_and_orders_by_index ( fake: Fake ) -> None:

    model = Openai(fake.remote(), "gpt-x", "small", dimensions=2)
    wide  = Openai(fake.remote(), "gpt-x", "big", dimensions=0)

    fake.answer(rows([3.0, 4.0], [1, 2], keys=[1, 0]))

    assert await model.embed(["a", "b"]) == [[1.0, 2.0], [3.0, 4.0]]
    assert fake.last().path == "/embeddings" and heads(fake.last())["x-key"] == "k"
    assert fake.last().body == { "model": "small", "input": ["a", "b"], "encoding_format": "float", "dimensions": 2 }

    fake.answer(rows([1.5, 2.5, 3.5]))

    assert await wide.embed(["a"]) == [[1.5, 2.5, 3.5]] and "dimensions" not in fake.last().body

    fake.answer(rows([1.0] * 20_000, [2.0] * 20_000))

    assert [len(row) for row in await Openai(fake.remote(), "m", "e", dimensions=20_000).embed(["a", "b"])] == [20_000, 20_000]

    broken: tuple[tuple[str, Answer], ...] = (
        ("body", Raw(200, b"[]")), ("data", {}), ("data", { "data": "x" }), ("index", { "data": ["x"] }), ("index", { "data": [{ "embedding": [1.0, 2.0] }] }),
        ("index", { "data": [{ "index": "0", "embedding": [1.0, 2.0] }] }), ("index", rows([1.0, 2.0], keys=[1])), ("index", rows([1.0, 2.0], [1.0, 2.0], keys=[0, 0])),
        ("index", rows()), ("index", rows([1.0, 2.0], [1.0, 2.0])), ("vector", rows("x")), ("vector", rows([])),
        ("vector", rows(["a", "b"])), ("json", rows([1.0, math.inf])), ("json", rows([1.0, math.nan])), ("vector", rows([1.0, None])),
        ("vector", rows([1e308, 1e308])), ("json", rows([1.0, 10 ** 400])), ("vector", rows({ "0": 1.0 })),
    )

    for what, answer in broken:

        fault = await failed(Openai(fake.answer(answer).remote(), "m", "e", dimensions=2).embed(["a"]), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] }, what

    fake.answer(rows([1.0, 2.0, 3.0]), rows([1.0, 2.0], [1.0, 2.0, 3.0]))

    assert (await failed(model.embed(["a"]), Code.INTERNAL, "ai.dimensions")).errors == { "dimensions": ["3"] }
    assert (await failed(model.embed(["a", "b"]), Code.INTERNAL, "ai.dimensions")).errors == { "dimensions": ["3"] }

    fake.answer(rows([1.0, 2.0], [1.0, 2.0, 3.0]), rows([1.0] * (WIDEST + 1)))

    assert (await failed(wide.embed(["a", "b"]), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": ["vector"] }
    assert (await failed(wide.embed(["a"]), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": ["vector"] }

def part ( text: object ) -> dict[str, Any]:

    return { "text": text }

def calling ( name: object, args: object, key: object = None ) -> dict[str, Any]:

    made: dict[str, Any] = { "name": name, "args": args }

    if key is not None: made["id"] = key

    return { "functionCall": made }

def candidate ( *parts: Any, finish: object = "STOP", content: object = None ) -> dict[str, Any]:

    made: dict[str, Any] = { "content": content if content is not None else { "role": "model", "parts": list(parts) }, "index": 0 }

    if finish is not None: made["finishReason"] = finish

    return made

def gem ( *candidates: Mapping[str, Any], usage: object = None, feedback: object = None ) -> dict[str, Any]:

    made: dict[str, Any] = { "candidates": list(candidates), "modelVersion": "g" }

    if usage is not None: made["usageMetadata"] = usage
    if feedback is not None: made["promptFeedback"] = feedback
    if not candidates: del made["candidates"]

    return made

async def test_gemini_sends_one_generate_request ( fake: Fake ) -> None:

    calls = (Call("fc_1", "weather", { "city": "Cairo" }), Call("local_abc", "ping"))
    tools = (Tool("weather", "Looks the sky up", PLACE), Tool("ping", ""))
    model = Gemini(fake.remote(), "gemini/x", max_tokens=512)
    asked = [
        Message("system", "Be brief."), Message("user", "look", images=(PNG,)), Message("user", "and tell"),
        Message("system", "Answer in Arabic."), Message("assistant", "", calls), Message.result(calls[0], { "sky": "clear" }),
        Message.result(calls[1], "down", failed=True), Message("tool", "late", call_id="fc_9"), Message("assistant", " "),
        Message("user", "thanks"), Message("assistant", "welcome"),
    ]

    fake.answer(gem(candidate(part("ok"))))

    reply = await model.chat(asked, tools, PLACE, max_tokens=64, stop="END", tool_choice="any", temperature=0.5, top_p=0.9)
    seen  = fake.last()

    assert reply.text == "ok" and seen.path == "/v1beta/models/gemini%2Fx:generateContent" and len(fake.seen) == 1
    assert (heads(seen)["x-key"], heads(seen)["content-type"]) == ("k", "application/json")
    assert seen.body == {
        "systemInstruction": { "parts": [part("Be brief.\n\nAnswer in Arabic.")] },
        "contents": [
            { "role": "user", "parts": [{ "inlineData": { "mimeType": "image/png", "data": base64.b64encode(PNG).decode() } }, part("look"), part("and tell")] },
            { "role": "model", "parts": [calling("weather", { "city": "Cairo" }, "fc_1"), calling("ping", {})] },
            { "role": "user", "parts": [
                { "functionResponse": { "name": "weather", "response": { "result": '{"sky":"clear"}' }, "id": "fc_1" } },
                { "functionResponse": { "name": "ping", "response": { "error": "down" } } },
                { "functionResponse": { "name": "tool", "response": { "result": "late" }, "id": "fc_9" } }, part("thanks"),
            ] },
            { "role": "model", "parts": [part("welcome")] },
        ],
        "tools": [{ "functionDeclarations": [
            { "name": "weather", "parametersJsonSchema": PLACE, "description": "Looks the sky up" },
            { "name": "ping", "parametersJsonSchema": { "type": "object", "properties": {} } },
        ] }],
        "toolConfig": { "functionCallingConfig": { "mode": "ANY" } },
        "generationConfig": {
            "maxOutputTokens": 64, "temperature": 0.5, "topP": 0.9, "stopSequences": ["END"], "responseMimeType": "application/json",
            "responseJsonSchema": PLACE,
        },
    }

    fake.answer(gem(candidate(part("ok"))), gem(candidate(part("ok"))))

    await model.chat(asks(), tools, None, tool_choice="none", stop=["a", "b"])

    assert fake.last().body["toolConfig"] == { "functionCallingConfig": { "mode": "NONE" } }
    assert fake.last().body["generationConfig"] == { "maxOutputTokens": 512, "stopSequences": ["a", "b"] }

    await Gemini(fake.remote(), "g").chat(asks(), (), None, tool_choice="auto")

    assert fake.last().body == { "contents": [{ "role": "user", "parts": [part("hello")] }] } and fake.last().path == "/v1beta/models/g:generateContent"

    for name in ("", ".", ".."):

        await failed(Gemini(fake.remote(), name or "g", name or ".").chat(asks()) if name else Gemini(fake.remote(), "g", ".").embed(["x"]), Code.VALIDATION, "net.segment")

    assert len(fake.seen) == 3

async def test_gemini_reads_parts_calls_thoughts_and_blocks ( fake: Fake ) -> None:

    model = Gemini(fake.remote(), "g")
    usage = { "promptTokenCount": 10, "candidatesTokenCount": 4, "thoughtsTokenCount": 6, "totalTokenCount": 20 }

    fake.answer(gem(candidate(
        { "text": "secret plan", "thought": True }, part("He"), part("llo"), calling("weather", { "city": "Cairo" }, "fc_1"), calling("ping", None),
        calling("ping", "{}"), calling("ping", "x"), calling("ping", [1]), finish="STOP",
    ), usage=usage))

    reply = await model.chat(asks())

    assert (reply.text, reply.tokens_in, reply.tokens_out, reply.stop, reply.native) == ("Hello", 10, 10, "tools", None)
    assert [(call.name, call.arguments, call.broken) for call in reply.calls] == [("weather", { "city": "Cairo" }, False), ("ping", {}, False), ("ping", {}, False), ("ping", {}, True), ("ping", {}, True)]
    assert reply.calls[0].id == "fc_1" and all(call.id.startswith("local_") for call in reply.calls[1:]) and len({ call.id for call in reply.calls }) == 5

    content = { "role": "model", "parts": [{ "text": "hm", "thought": True, "thoughtSignature": "sig" }, part("ok")] }

    fake.answer(gem(candidate(content=content)), gem(candidate(part("plain"))))

    signed = await model.chat(asks())

    assert signed.text == "ok" and signed.native == Native("gemini:g", content) and not signed.native.bound
    assert (await model.chat(asks())).native is None

    fake.answer(gem(candidate(part("x"), finish="SAFETY")), gem(feedback={ "blockReason": "SAFETY", "safetyRatings": [] }), gem(candidate(part("x"), finish="MAX_TOKENS")), gem(candidate(part("x"), finish=None)), gem(candidate(part("x"), finish="OTHER")), gem(candidate(part("x"), finish=7)))

    assert [(reply.text, reply.stop) for reply in [await model.chat(asks()) for _ in range(6)]] == [("x", "refused"), ("", "refused"), ("x", "length"), ("x", "other"), ("x", "other"), ("x", "other")]

    fake.answer(gem(candidate(content="none"), usage="x"), gem(candidate(content={ "parts": "none" }), usage={ "promptTokenCount": -1, "candidatesTokenCount": 1.5 }), gem(candidate(content={})))

    for _ in range(3):

        reply = await model.chat(asks())

        assert (reply.text, reply.stop, reply.tokens_in, reply.tokens_out, reply.calls) == ("", "stop", 0, 0, ())

async def test_gemini_refuses_a_reply_it_cannot_read ( fake: Fake ) -> None:

    broken: tuple[tuple[str, Answer], ...] = (
        ("candidates", {}), ("candidates", { "candidates": [] }), ("candidates", { "candidates": "x" }), ("candidate", { "candidates": ["x"] }),
        ("candidates", { "promptFeedback": { "blockReason": "" } }), ("candidates", { "promptFeedback": "blocked" }),
        ("part", gem(candidate("text"))), ("part", gem(candidate(None))), ("text", gem(candidate(part(7)))), ("text", gem(candidate(part(["x"])))),
        ("call", gem(candidate(calling("", {})))), ("call", gem(candidate(calling(None, {})))), ("call", gem(candidate(calling("n", {}, 7)))),
        ("call", gem(candidate(calling("n", {}, "a b\n")))), ("calls", gem(candidate(calling("n", {}, "k"), calling("m", {}, "k")))),
        ("calls", gem(candidate(*[calling("n", {}, f"k{at}") for at in range(TOOLS + 1)]))),
        ("size", gem(candidate(part("x" * (MAX_OUTPUT + 1))))), ("size", gem(candidate(part("x" * MAX_OUTPUT), part("y")))),
    )

    for what, answer in broken:

        fault = await failed(Gemini(fake.answer(answer).remote(), "g").chat(asks()), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] } and fault.server() and fault.unknown, what

async def test_gemini_replays_a_signed_turn_only_to_its_owner ( fake: Fake ) -> None:

    model   = Gemini(fake.remote(), "g")
    content = { "role": "model", "parts": [{ "text": "hm", "thought": True, "thoughtSignature": "sig" }, part("plan"), calling("ping", {}, "fc_1")] }
    call    = Call("fc_1", "ping")
    mine    = Message("assistant", "plan", (call,), native=Native("gemini:g", content))
    other   = Message("assistant", "plan", (call,), native=Native("gemini:other", content))
    bare    = Message("assistant", "plan", (call,), native=Native("gemini:g", { "parts": [] }))
    odd     = Message("assistant", "plan", (call,), native=Native("gemini:g", ["parts"]))

    fake.answer(*[gem(candidate(part("ok")))] * 4)

    for message, expected in ((mine, content["parts"]), (other, [part("plan"), calling("ping", {}, "fc_1")]), (bare, [part("plan"), calling("ping", {}, "fc_1")]), (odd, [part("plan"), calling("ping", {}, "fc_1")])):

        await model.chat([*asks("a"), message, Message.result(call, "pong")])

        assert fake.last().body["contents"][1] == { "role": "model", "parts": expected }
        assert fake.last().body["contents"][2] == { "role": "user", "parts": [{ "functionResponse": { "name": "ping", "response": { "result": "pong" }, "id": "fc_1" } }] }

async def test_gemini_streams_text_parts_until_a_finish_reason ( fake: Fake ) -> None:

    model = Gemini(fake.remote(), "g", max_tokens=99)

    def piece ( *parts: Any, finish: object = None, **extra: Any ) -> tuple[str | None, object]:

        return None, { "candidates": [{ "content": { "parts": list(parts) }, **({ "finishReason": finish } if finish else {}) }], **extra }

    fake.answer(events(
        piece(part("He")), piece({ "text": "thinking", "thought": True }), piece(part("")), piece(part(7)), piece(),
        (None, { "candidates": [] }), (None, { "candidates": [{ "content": "x" }] }), (None, { "candidates": [{ "content": { "parts": "x" } }] }),
        (None, { "usageMetadata": {} }), piece(part("llo"), finish="STOP"), piece(part("late")), pause=0.05,
    ))

    pieces = await drained(model.stream([Message("system", "brief"), *asks("hi")], max_tokens=5, stop="X"))
    seen   = fake.last()

    assert pieces == ["He", "llo"] and seen.path == "/v1beta/models/g:streamGenerateContent?alt=sse" and heads(seen)["accept"] == "text/event-stream"
    assert seen.body == {
        "systemInstruction": { "parts": [part("brief")] }, "contents": [{ "role": "user", "parts": [part("hi")] }],
        "generationConfig": { "maxOutputTokens": 5, "stopSequences": ["X"] },
    }

    fake.answer(events((None, { "promptFeedback": { "blockReason": "SAFETY" } })))

    assert await drained(model.stream(asks())) == []

    broken: tuple[tuple[str, Raw], ...] = (
        ("cut", events(piece(part("a")))), ("cut", Raw(200, b"", "text/event-stream")), ("cut", events((None, { "promptFeedback": {} }))),
        ("stream", events(piece(part("a")), (None, { "error": { "code": 503 } }), piece(finish="STOP"))),
        ("json", events((None, "{not json"))), ("event", events((None, [1]))), ("candidates", events((None, { "candidates": "x" }))),
        ("candidate", events((None, { "candidates": ["x"] }))),
    )

    for what, flow in broken:

        fake.answer(flow)

        assert (await cut(model.stream(asks()), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": [what] }, what

    fake.answer(Raw(429, b"{}"), Raw(404, b"{}"))

    assert (await cut(Gemini(fake.remote(), "m").stream(asks()), Code.UNAVAILABLE, "ai.provider")).errors == { "provider": ["throttled"] }
    assert (await cut(Gemini(fake.remote(), "m").stream(asks()), Code.BAD_GATEWAY, "ai.provider")).errors == { "provider": ["net.status"] }

async def test_gemini_embeds_a_batch_in_one_request ( fake: Fake ) -> None:

    model = Gemini(fake.remote(), "g", "embed-x", dimensions=2)
    wide  = Gemini(fake.remote(), "g", "embed/y", dimensions=0)

    fake.answer({ "embeddings": [{ "values": [1.0, 2.0] }, { "values": [3, 4] }] })

    assert await model.embed(["a", "b"]) == [[1.0, 2.0], [3.0, 4.0]] and fake.last().path == "/v1beta/models/embed-x:batchEmbedContents"
    assert fake.last().body == { "requests": [
        { "model": "models/embed-x", "content": { "parts": [part("a")] }, "outputDimensionality": 2 },
        { "model": "models/embed-x", "content": { "parts": [part("b")] }, "outputDimensionality": 2 },
    ] }

    fake.answer({ "embeddings": [{ "values": [1.0, 2.0, 3.0] }] })

    assert await wide.embed(["a"]) == [[1.0, 2.0, 3.0]] and fake.last().path == "/v1beta/models/embed%2Fy:batchEmbedContents"
    assert fake.last().body == { "requests": [{ "model": "models/embed/y", "content": { "parts": [part("a")] } }] }

    broken: tuple[tuple[str, Answer], ...] = (
        ("body", Raw(200, b"[]")), ("embeddings", {}), ("embeddings", { "embeddings": "x" }), ("count", { "embeddings": [] }),
        ("count", { "embeddings": [{ "values": [1.0, 2.0] }] * 2 }), ("vector", { "embeddings": ["x"] }), ("vector", { "embeddings": [{}] }),
        ("vector", { "embeddings": [{ "values": "x" }] }), ("vector", { "embeddings": [{ "values": [] }] }), ("vector", { "embeddings": [{ "values": [1.0, "2"] }] }),
    )

    for what, answer in broken:

        fault = await failed(Gemini(fake.answer(answer).remote(), "g", "e", dimensions=2).embed(["a"]), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] }, what

    fake.answer({ "embeddings": [{ "values": [1.0] }] })

    assert (await failed(model.embed(["a"]), Code.INTERNAL, "ai.dimensions")).errors == { "dimensions": ["1"] }

def spoke ( content: object = "ok", calls: object = None, done: object = "stop", **extra: Any ) -> dict[str, Any]:

    message: dict[str, Any] = { "role": "assistant", "content": content }

    if calls is not None: message["tool_calls"] = calls

    made: dict[str, Any] = { "model": "l", "message": message, "done": True, "prompt_eval_count": 3, "eval_count": 2, **extra }

    if done is not None: made["done_reason"] = done

    return made

def asking ( name: object, arguments: object, key: object = None ) -> dict[str, Any]:

    made: dict[str, Any] = { "function": { "name": name, "arguments": arguments } }

    if key is not None: made["id"] = key

    return made

async def test_ollama_sends_one_chat_request ( fake: Fake ) -> None:

    calls = (Call("c1", "weather", { "city": "Cairo" }), Call("c2", "ping"))
    tools = (Tool("weather", "Looks the sky up", PLACE), Tool("ping", ""))
    model = Ollama(fake.remote(), "llama-x", max_tokens=512)
    asked = [
        Message("system", "Be brief."), Message("user", "look", images=(PNG, GIF)), Message("assistant", "", calls),
        Message.result(calls[0], { "sky": "clear" }), Message.result(calls[1], "down", failed=True), Message("tool", "late", call_id="c9"),
        Message("assistant", "ok then"), Message("user", "thanks"),
    ]

    fake.answer(spoke())

    reply = await model.chat(asked, tools, PLACE, max_tokens=64, stop="END", temperature=0.5, top_p=0.9, tool_choice="auto")
    seen  = fake.last()

    assert reply.text == "ok" and seen.path == "/api/chat" and (heads(seen)["x-key"], heads(seen)["content-type"]) == ("k", "application/json")
    assert seen.body == {
        "model": "llama-x", "stream": False,
        "messages": [
            { "role": "system", "content": "Be brief." },
            { "role": "user", "content": "look", "images": [base64.b64encode(PNG).decode(), base64.b64encode(GIF).decode()] },
            { "role": "assistant", "content": "", "tool_calls": [{ "function": { "name": "weather", "arguments": { "city": "Cairo" } } }, { "function": { "name": "ping", "arguments": {} } }] },
            { "role": "tool", "content": '{"sky":"clear"}', "tool_name": "weather" },
            { "role": "tool", "content": '{"error":"down"}', "tool_name": "ping" },
            { "role": "tool", "content": "late" }, { "role": "assistant", "content": "ok then" }, { "role": "user", "content": "thanks" },
        ],
        "tools": [
            { "type": "function", "function": { "name": "weather", "parameters": PLACE, "description": "Looks the sky up" } },
            { "type": "function", "function": { "name": "ping", "parameters": { "type": "object", "properties": {} } } },
        ],
        "format": PLACE, "options": { "num_predict": 64, "temperature": 0.5, "top_p": 0.9, "stop": ["END"] },
    }

    fake.answer(spoke(), spoke())

    await model.chat(asks(), tools, None, tool_choice="none", stop=["a", "b"])

    assert "tools" not in fake.last().body and fake.last().body["options"] == { "num_predict": 512, "stop": ["a", "b"] }

    await Ollama(fake.remote(), "l").chat(asks())

    assert fake.last().body == { "model": "l", "stream": False, "messages": [{ "role": "user", "content": "hello" }] }

    fault = await failed(model.chat(asks(), tools, None, tool_choice="any"), Code.INTERNAL, "ai.option")

    assert fault.errors == { "option": ["tool_choice"] } and len(fake.seen) == 3

    fake.answer(spoke())

    assert (await model.chat(asks(), (), None, tool_choice="any")).text == "ok" and "tools" not in fake.last().body

async def test_ollama_reads_a_message_its_calls_and_its_counts ( fake: Fake ) -> None:

    model = Ollama(fake.remote(), "l")
    calls = [asking("weather", { "city": "Cairo" }, "c1"), asking("ping", "{}"), asking("ping", None), asking("ping", "nope"), asking("ping", 7)]

    fake.answer(spoke("Hello", calls, "stop", prompt_eval_count=11, eval_count=5, total_duration=10))

    reply = await model.chat(asks())

    assert (reply.text, reply.tokens_in, reply.tokens_out, reply.stop, reply.native) == ("Hello", 11, 5, "tools", None)
    assert [(call.name, call.arguments, call.broken) for call in reply.calls] == [("weather", { "city": "Cairo" }, False), ("ping", {}, False), ("ping", {}, False), ("ping", {}, True), ("ping", {}, True)]
    assert reply.calls[0].id == "c1" and all(call.id.startswith("local_") for call in reply.calls[1:]) and reply.raw["total_duration"] == 10

    for given, mapped in (("stop", "stop"), ("length", "length"), (None, "stop"), ("", "stop"), ("load", "other"), (7, "stop")):

        fake.answer(spoke("x", None, given))

        assert (await model.chat(asks())).stop == mapped

    fake.answer(spoke("x", [], "stop", prompt_eval_count="3", eval_count=-1), spoke(None))

    first, second = [await model.chat(asks()) for _ in range(2)]

    assert (first.tokens_in, first.tokens_out, first.stop) == (0, 0, "stop") and second.text == ""

async def test_ollama_refuses_a_reply_it_cannot_read ( fake: Fake ) -> None:

    broken: tuple[tuple[str, Answer], ...] = (
        ("error", { "error": "model not found" }), ("error", { "error": {} }), ("error", { "error": "", "message": {} }),
        ("message", {}), ("message", { "message": "hi" }), ("text", spoke(7)), ("text", spoke(["x"])),
        ("calls", spoke("x", "none")), ("calls", spoke("x", { "id": "c" })), ("call", spoke("x", ["c"])), ("call", spoke("x", [{ "id": "c" }])),
        ("call", spoke("x", [{ "function": "weather" }])), ("call", spoke("x", [asking("", "{}")])), ("call", spoke("x", [asking(None, "{}")])),
        ("call", spoke("x", [asking("n", "{}", 7)])), ("call", spoke("x", [asking("n", "{}", "a b\n")])),
        ("calls", spoke("x", [asking("n", "{}", "k"), asking("m", "{}", "k")])), ("calls", spoke("x", [asking("n", "{}", f"k{at}") for at in range(TOOLS + 1)])),
        ("size", spoke("x" * (MAX_OUTPUT + 1))),
    )

    for what, answer in broken:

        fault = await failed(Ollama(fake.answer(answer).remote(), "l").chat(asks()), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] } and fault.server() and fault.unknown, what

def lines ( *items: object, pause: float = 0.0 ) -> Raw:

    body = "".join(f"{item}\n" if isinstance(item, str) else f"{json.dumps(item)}\n" for item in items)

    return Raw(200, body.encode(), "application/x-ndjson", pause)

async def test_ollama_streams_ndjson_until_done ( fake: Fake ) -> None:

    model = Ollama(fake.remote(), "l", max_tokens=99)

    def piece ( content: object, done: bool = False ) -> dict[str, Any]:

        return { "model": "l", "message": { "role": "assistant", "content": content }, "done": done }

    fake.answer(lines(
        piece("He"), "", "   ", piece(""), piece(None), piece(7), { "model": "l", "done": False }, { "message": "x" },
        piece("llo"), { "model": "l", "message": { "content": "" }, "done": True, "done_reason": "stop" }, piece("late"), pause=0.05,
    ))

    pieces = await drained(model.stream([Message("system", "brief"), *asks("hi")], max_tokens=5, stop="X"))
    seen   = fake.last()

    assert pieces == ["He", "llo"] and seen.path == "/api/chat" and heads(seen)["accept"] == "application/x-ndjson"
    assert seen.body == {
        "model": "l", "stream": True, "messages": [{ "role": "system", "content": "brief" }, { "role": "user", "content": "hi" }],
        "options": { "num_predict": 5, "stop": ["X"] },
    }

    fake.answer(lines(piece("tail", done=True)))

    assert await drained(model.stream(asks())) == ["tail"]

    fake.answer(Raw(200, json.dumps(piece("no newline", done=True)).encode(), "application/x-ndjson"))

    assert await drained(model.stream(asks())) == ["no newline"]

    broken: tuple[tuple[str, Raw], ...] = (
        ("cut", lines(piece("a"))), ("cut", Raw(200, b"", "application/x-ndjson")), ("cut", lines(piece("a"), { "done": "yes" })),
        ("stream", lines(piece("a"), { "error": "boom" })), ("stream", lines({ "error": {} })), ("json", lines(piece("a"), "{not json")),
        ("event", lines([1])), ("event", lines("null")),
        ("size", Raw(200, b'{"message":{"content":"' + b"x" * (1024 * 1024 + 1) + b'"},"done":true}\n', "application/x-ndjson")),
    )

    for what, flow in broken:

        fake.answer(flow)

        assert (await cut(model.stream(asks()), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": [what] }, what

    fake.answer(Raw(429, b"{}"), Raw(500, b"{}"))

    assert (await cut(Ollama(fake.remote(), "m").stream(asks()), Code.UNAVAILABLE, "ai.provider")).errors == { "provider": ["throttled"] }
    assert (await cut(Ollama(fake.remote(), "m").stream(asks()), Code.UNAVAILABLE, "net.status")).errors is None

async def test_ollama_embeds_in_one_request ( fake: Fake ) -> None:

    model = Ollama(fake.remote(), "l", "nomic", dimensions=2)
    wide  = Ollama(fake.remote(), "l", "big", dimensions=0)

    fake.answer({ "model": "nomic", "embeddings": [[1.0, 2.0], [3, 4]] })

    assert await model.embed(["a", "b"]) == [[1.0, 2.0], [3.0, 4.0]] and fake.last().path == "/api/embed"
    assert fake.last().body == { "model": "nomic", "input": ["a", "b"] }

    fake.answer({ "embeddings": [[1.0, 2.0, 3.0]] })

    assert await wide.embed(["a"]) == [[1.0, 2.0, 3.0]] and fake.last().body == { "model": "big", "input": ["a"] }

    broken: tuple[tuple[str, Answer], ...] = (
        ("body", Raw(200, b"[]")), ("count", {}), ("count", { "embeddings": "x" }), ("count", { "embeddings": [] }), ("count", { "embeddings": [[1.0, 2.0]] * 2 }),
        ("vector", { "embeddings": ["x"] }), ("vector", { "embeddings": [[]] }), ("vector", { "embeddings": [[1.0, "2"]] }), ("vector", { "embeddings": [[1e308, 1e308]] }),
    )

    for what, answer in broken:

        fault = await failed(Ollama(fake.answer(answer).remote(), "l", "e", dimensions=2).embed(["a"]), Code.UNAVAILABLE, "ai.reply")

        assert fault.errors == { "reply": [what] }, what

    fake.answer({ "embeddings": [[1.0, 2.0], [1.0]] })

    assert (await failed(model.embed(["a", "b"]), Code.INTERNAL, "ai.dimensions")).errors == { "dimensions": ["1"] }

    fake.answer({ "embeddings": [[1.0, 2.0], [1.0]] })

    assert (await failed(wide.embed(["a", "b"]), Code.UNAVAILABLE, "ai.reply")).errors == { "reply": ["vector"] }

async def test_the_facade_drives_a_hosted_model_end_to_end ( fake: Fake ) -> None:

    made  = brain(Anthropic(fake.remote(), "claude-x"), Openai(fake.remote(), "gpt-x", dimensions=2), cache=Cache(Memory()))
    tools = [Tool("weather", "Looks the sky up", PLACE, giving({ "sky": "clear" }))]

    made.use(Openai(fake.remote(), "gpt-x", dimensions=2), tasks=("embed",))

    fake.answer(claude(using("toolu_1", "weather", { "city": "Cairo" }), stop="tool_use"), claude(worded("clear skies")))

    turn  = Turn(asks("weather?"))
    reply = await made.run(turn, tools)

    assert reply.text == "clear skies" and len(fake.seen) == 2 and fake.seen[0].path == "/v1/messages"
    assert fake.seen[1].body["messages"][1:] == [
        { "role": "assistant", "content": [using("toolu_1", "weather", { "city": "Cairo" })] },
        { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": '{"sky":"clear"}' }] },
    ]
    assert made.stats() == { "calls": 2, "tokens_in": 6, "tokens_out": 4, "cached": 0 }

    fake.answer(rows([1.0, 2.0], [3.0, 4.0]))

    assert await made.embed(["a", "b", "a"]) == [[1.0, 2.0], [3.0, 4.0], [1.0, 2.0]] and fake.last().path == "/embeddings"
    assert await made.embed(["a"]) == [[1.0, 2.0]] and len(fake.seen) == 3 and made.stats()["cached"] == 1

    fake.answer(events(delta("st"), delta("ream"), STOPPED))

    assert await drained(made.stream(asks("go"))) == ["st", "ream"]

    fake.answer(claude(worded('{"name":"Ali","age":3}')))

    assert await made.extract(asks("who?"), Person) == Person(name="Ali", age=3)
    assert fake.last().body["output_config"]["format"]["schema"]["additionalProperties"] is False

    fake.answer(Raw(429, b"{}"), Raw(400, b"{}"))

    throttled = await failed(made.chat(asks()), Code.UNAVAILABLE, "ai.provider")
    rejected  = await failed(made.chat(asks()), Code.BAD_GATEWAY, "ai.provider")

    assert throttled.errors == { "provider": ["throttled"] } and rejected.errors == { "provider": ["remote.bad_request"] }

    await made.close()
