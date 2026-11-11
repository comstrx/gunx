from aiohttp import web
from engine.ai import Ai, Anthropic, Call, Gemini, Message, Mock, Model, Ollama, Openai, Reply, Tool, Turn
from engine.ai.arch import checked, DEPTH, IDENT, KEYED, KEYWORDS, LISTED, MAX_OUTPUT, MAX_WINDOW, MIN_WINDOW, STOPS, TOOLS, WORDED
from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from engine.net import Egress, Remote, net
from engine.validate import Shape
from collections.abc import Awaitable, Callable, Coroutine, Mapping, Sequence
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, cast, override
import asyncio, math

type Made[T] = T | Fault
type Op      = tuple[str, str, int]

EXAMPLES = 400
LOCAL    = Egress(allow_private=True, ports=frozenset())
PNG      = b"\x89PNG\r\n\x1a\n0"
ROLES    = ("system", "user", "assistant", "tool", "robot", "", "USER")
WHATS    = frozenset({
    "body", "content", "block", "text", "call", "calls", "size", "json", "choices", "choice", "message", "refusal", "candidates",
    "candidate", "part", "error", "stream", "cut", "event", "count", "vector", "index", "data", "embeddings",
})
STOPPED  = frozenset({ "ai.reply", "ai.provider", "net.status", "net.timeout" })
OPAQUE   = frozenset({ "const", "default", "enum" })
NAMES    = st.one_of(st.sampled_from(["weather", "ping", "", "a b", "x" * (IDENT + 1), "n\n", "ok_1"]), st.text(max_size=8))
INTS     = st.integers(-(1 << 63), (1 << 63) - 1)
SAID     = st.one_of(st.text(max_size=32), st.none(), INTS, st.lists(st.text(max_size=3), max_size=3))
TEXTS    = st.one_of(SAID, st.just("x" * (MAX_OUTPUT + 1)))
KEYS     = st.one_of(st.sampled_from(["toolu_1", "call_1", "c", "", "local_x", "a\nb", "k" * (IDENT + 1)]), st.none(), INTS)
ARGS     = st.one_of(st.none(), st.dictionaries(st.text(max_size=4), INTS, max_size=3), st.text(max_size=12), INTS, st.lists(INTS, max_size=2))
LEAVES   = st.one_of(st.none(), st.booleans(), INTS, st.floats(allow_nan=False, allow_infinity=False), st.text(max_size=6))
BODIES   = st.recursive(LEAVES, lambda inner: st.one_of(st.lists(inner, max_size=4), st.dictionaries(st.text(max_size=6), inner, max_size=4)), max_leaves=12)
WORDS    = st.sampled_from([*sorted(KEYWORDS), "oneOf", "minimum", "pattern", "minLength", "maxItems", "patternProperties", "x"])
FORMATS  = st.sampled_from(["email", "uuid", "date-time", "phone", "", "uri", 7])
STEPS    = st.lists(st.tuples(st.sampled_from(["user", "assistant", "tool", "calls", "bound"]), st.text(max_size=3), st.integers(0, 3)), max_size=40)
OPTIONS  = st.dictionaries(
    st.sampled_from(["max_tokens", "temperature", "top_p", "stop", "tool_choice", "seed", "rounds"]),
    st.one_of(st.none(), st.integers(-2, 20), st.floats(allow_nan=False), st.text(max_size=4), st.lists(st.text(max_size=3), max_size=5), st.booleans()),
    max_size=4,
)
FENCES   = st.sampled_from(["```json\n", "```\n", "```", "\n```", "  ", "\n", '{"name":"a","age":1}', '{"name":"a"}', "{", "}", "x", '"'])

class Person ( Shape ):

    name : str
    age  : int

class Scripted ( Model ):

    name         = "scripted"
    capabilities = frozenset({ "chat", "json" })

    def __init__ ( self ) -> None:

        self.text = ""

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        return Reply(self.text, self.name)

class Fake:

    def __init__ ( self ) -> None:

        self.port = 0
        self.seen: list[Any] = []
        self.body = b"{}"
        self.kind = "application/json"
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

        return Remote(net, f"http://127.0.0.1:{self.port}", {}, LOCAL)

    async def handle ( self, request: web.Request ) -> web.Response:

        raw = await request.read()

        self.seen.append(json.loads(raw) if raw else None)

        return web.Response(status=200, body=self.body, content_type=self.kind)

loop = asyncio.new_event_loop()
fake = Fake()

log.setup("error", "json", Path("/dev/null"))
loop.run_until_complete(fake.start())

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

async def tried [T] ( work: Awaitable[T] ) -> Made[T]:

    try: return await work
    except Fault as fault: return fault

async def drained ( source: Any ) -> list[str]:

    return [piece async for piece in source]

def denied ( job: Callable[[], object] ) -> Fault | None:

    try: job()
    except Fault as fault: return fault

    return None

def refused ( made: object, codes: frozenset[Code], reasons: frozenset[str] | None = None ) -> bool:

    if not isinstance(made, Fault): return False
    if made.code not in codes: return False

    return reasons is None or made.reason in reasons

def internal ( made: object ) -> bool:

    return isinstance(made, Fault) and made.code is Code.INTERNAL and (made.reason or "").startswith("ai.")

def broken ( made: object ) -> bool:

    if not isinstance(made, Fault): return False
    if made.reason == "ai.reply": return made.code is Code.UNAVAILABLE and made.errors is not None and set(made.errors["reply"]) <= WHATS
    if made.reason == "ai.provider": return made.code in (Code.UNAVAILABLE, Code.BAD_GATEWAY)

    return made.reason in STOPPED and made.code in (Code.UNAVAILABLE, Code.TIMEOUT)

def adapters () -> tuple[Anthropic, Openai, Gemini, Ollama]:

    return Anthropic(fake.remote(), "m"), Openai(fake.remote(), "m", dimensions=0), Gemini(fake.remote(), "m", dimensions=0), Ollama(fake.remote(), "m", dimensions=0)

def clean ( schema: object, depth: int = 0 ) -> bool:

    if depth > DEPTH: return False
    if isinstance(schema, list): return all(clean(item, depth + 1) for item in schema)
    if not isinstance(schema, Mapping): return True

    shaped = schema.get("type") == "object" or "properties" in schema
    sound  = set(schema) <= KEYWORDS and "oneOf" not in schema and (not shaped or schema.get("additionalProperties") is False)
    sound  = sound and all(type(schema[key]) is str for key in WORDED if key in schema)
    sound  = sound and all(isinstance(schema[key], list) and all(type(item) is str for item in schema[key]) for key in LISTED if key in schema)

    return sound and all(_inner_(key, value, depth) for key, value in schema.items())

def _inner_ ( key: str, value: object, depth: int ) -> bool:

    if key in OPAQUE: return True
    if key in KEYED and isinstance(value, Mapping): return all(clean(item, depth + 2) for item in value.values())

    return clean(value, depth + 1)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(ROLES), TEXTS, st.lists(st.tuples(KEYS, NAMES, ARGS), max_size=3), KEYS, NAMES, st.lists(st.sampled_from([PNG, b"plain", b""]), max_size=3), st.booleans())
def messages ( role: str, content: Any, calls: list[Any], call_id: Any, name: Any, images: list[bytes], failed: bool ) -> None:

    made: list[Call] = []

    for key, title, arguments in calls:

        fault = denied(partial(Call, key, title, arguments))

        if fault is None: made.append(Call(key, title, arguments))
        else: assert (fault.code, fault.reason) == (Code.INTERNAL, "ai.call")

    held: list[Message] = []
    fault = denied(lambda: held.append(Message(role, content, tuple(made), call_id or None, name or None, tuple(images), failed)))

    if fault is not None:

        assert fault.code in (Code.INTERNAL, Code.TOO_LARGE, Code.VALIDATION)
        assert (fault.reason or "").startswith("ai.")

        return

    message = held[0]
    dump    = message.dump()

    assert (dump["role"], dump["content"]) == (role, content)
    assert json.loads(json.dumps(dump)) == dump
    assert message.weight() >= len(content)
    assert message.empty() == (not content and not made and not images)
    assert len(message.pictures()) == len(images)
    assert all(kind.startswith("image/") for kind, _ in message.pictures())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(MIN_WINDOW - 1, 12), STEPS, st.booleans())
def turns ( window: int, steps: list[Op], pinned: bool ) -> None:

    made: list[Turn] = []
    fault = denied(lambda: made.append(Turn([Message("system", "s")] if pinned else [], window)))

    if fault is not None:

        assert (fault.code, fault.reason) == (Code.INTERNAL, "ai.window")
        assert not MIN_WINDOW <= window <= MAX_WINDOW

        return

    turn = made[0]
    open_calls: list[Call] = []

    for kind, text, count in steps:

        if kind == "calls":

            open_calls = [Call(f"c{len(turn.messages)}-{at}", "w") for at in range(count + 1)]

            turn.add(Message("assistant", text, tuple(open_calls)))

        elif kind == "tool":

            if open_calls and turn.messages[-1].role in ("assistant", "tool"): turn.add(Message.result(open_calls.pop(0), text))

        else:

            open_calls = []

            turn.say("assistant" if kind == "bound" else kind, text)

        held  = turn.messages
        known = { call.id for message in held for call in message.calls }
        runs  = max((sum(1 for _ in group) for group in _runs_(held)), default=0)

        assert len(held) <= window + runs + 2
        assert all(message.call_id in known for message in held if message.role == "tool")
        assert sum(message.role == "system" for message in held) <= (1 if pinned else 0)
        assert not pinned or not held or held[0].role == "system"

def _runs_ ( held: list[Message] ) -> list[list[Message]]:

    made: list[list[Message]] = []

    for message in held:

        if message.role == "tool" and made and made[-1] and made[-1][-1].role == "tool": made[-1].append(message)
        elif message.role == "tool": made.append([message])

    return made

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(OPTIONS)
def options ( given: dict[str, Any] ) -> None:

    held: list[dict[str, Any]] = []
    fault = denied(lambda: held.append(checked(given)))

    if fault is not None:

        assert (fault.code, fault.reason) == (Code.INTERNAL, "ai.option")
        assert fault.errors is not None

        return

    made = held[0]

    assert set(made) <= set(given)
    assert None not in made.values()
    assert all(given[name] == value for name, value in made.items())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.recursive(st.dictionaries(WORDS, st.one_of(LEAVES, FORMATS), max_size=4), lambda inner: st.dictionaries(WORDS, st.one_of(inner, st.lists(inner, max_size=2)), max_size=4), max_leaves=20))
def schemas ( schema: dict[str, Any] ) -> None:

    fake.body = json.dumps({ "content": [{ "type": "text", "text": "{}" }], "stop_reason": "end_turn" }).encode()
    fake.kind = "application/json"

    sent = len(fake.seen)
    made = run(tried(Anthropic(fake.remote(), "m").chat([Message("user", "x")], (), schema)))

    if isinstance(made, Fault):

        assert made.code is Code.INTERNAL
        assert made.reason in ("ai.schema", "json.encode")
        assert len(fake.seen) == sent

        return

    assert isinstance(made, Reply)
    assert len(fake.seen) == sent + 1
    assert clean(fake.seen[-1]["output_config"]["format"]["schema"])

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(BODIES, st.lists(st.tuples(st.sampled_from(["text", "tool_use", "thinking", "x"]), SAID, KEYS, NAMES, ARGS), max_size=4), st.sampled_from([*STOPS, "end_turn", "tool_use", "max_tokens", "tool_calls", "STOP", None, 7]))
def replies ( body: Any, blocks: list[Any], stop: Any ) -> None:

    shaped: dict[str, Any] = { "stop_reason": stop, "finish_reason": stop, "finishReason": stop, "done_reason": stop }
    content = [{ "type": kind, "text": text, "id": key, "name": name, "input": arguments } for kind, text, key, name, arguments in blocks]
    calls   = [{ "id": key, "function": { "name": name, "arguments": arguments } } for _, _, key, name, arguments in blocks]
    parts   = [{ "text": text } if kind == "text" else { "functionCall": { "name": name, "args": arguments, "id": key } } for kind, text, key, name, arguments in blocks]
    forms   = (
        body, { **shaped, "content": content, "usage": body },
        { "choices": [{ "message": { "content": blocks[0][1] if blocks else "", "tool_calls": calls }, **shaped }], "usage": body },
        { "candidates": [{ "content": { "parts": parts }, **shaped }], "usageMetadata": body },
        { "message": { "content": blocks[0][1] if blocks else "", "tool_calls": calls }, **shaped, "eval_count": body },
    )

    for form in forms:

        fake.body = json.dumps(form).encode()
        fake.kind = "application/json"

        for model in adapters():

            made = run(tried(model.chat([Message("user", "x")])))

            if isinstance(made, Reply):

                assert made.stop in STOPS
                assert len(made.text) <= MAX_OUTPUT
                assert len(made.calls) <= TOOLS
                assert len({ call.id for call in made.calls }) == len(made.calls)
                assert made.stop != "tools" or made.calls
                assert min(made.tokens_in, made.tokens_out) >= 0
                assert made.model == "m"

            else: assert broken(made), made

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.one_of(st.binary(max_size=40), st.sampled_from([b"event: message_stop\ndata: {}\n\n", b"data: [DONE]\n\n", b'{"done":true}\n', b"data: ", b"\n\n", b'{"message":{"content":"a"}}\n', b'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}}\n\n', b'data: {"choices":[{"delta":{"content":"a"}}]}\n\n', b'data: {"candidates":[{"content":{"parts":[{"text":"a"}]},"finishReason":"STOP"}]}\n\n'])), max_size=8))
def streams ( pieces: list[bytes] ) -> None:

    fake.body = b"".join(pieces)

    for model in adapters():

        fake.kind = "application/x-ndjson" if isinstance(model, Ollama) else "text/event-stream"

        made = run(tried(drained(model.stream([Message("user", "x")]))))

        if isinstance(made, list): assert all(type(piece) is str and piece for piece in made)
        else: assert broken(made), made

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(BODIES, st.lists(st.one_of(st.lists(st.one_of(st.floats(allow_nan=False, allow_infinity=False), INTS, st.text(max_size=2), st.none()), max_size=5), LEAVES), max_size=4)), st.integers(0, 5), st.integers(1, 3))
def vectors ( rows: Any, dimensions: int, count: int ) -> None:

    fake.body = json.dumps({ "embeddings": rows, "data": [{ "index": at, "embedding": row } for at, row in enumerate(rows)] if isinstance(rows, list) else rows }).encode()
    fake.kind = "application/json"

    texts = [f"t{at}" for at in range(count)]

    for model in (Ollama(fake.remote(), "m", dimensions=dimensions), Openai(fake.remote(), "m", dimensions=dimensions), Gemini(fake.remote(), "m", dimensions=dimensions)):

        made = run(tried(model.embed(texts)))

        if isinstance(made, list):

            assert len(made) == count
            assert all(type(value) is float and math.isfinite(value) for row in made for value in row)
            assert len({ len(row) for row in made }) == 1
            assert not dimensions or len(made[0]) == dimensions

        else: assert broken(made) or (made.code is Code.INTERNAL and made.reason == "ai.dimensions" and dimensions > 0), made

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(FENCES, max_size=8))
def fences ( parts: list[str] ) -> None:

    model = Scripted()
    brain = Ai()

    brain.setup(timeout=2.0)
    brain.use(model, default=True)

    model.text = "".join(parts)

    made = run(tried(brain.extract([Message("user", "who")], Person)))

    if isinstance(made, Person): assert (made.name, made.age) == ("a", 1)
    else:

        assert refused(made, frozenset({ Code.UNAVAILABLE }), frozenset({ "ai.schema" }))
        assert made.errors == { "reply": ["shape"] }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.text(max_size=12), max_size=6), st.integers(1, 8))
def mocked ( texts: list[str], dimensions: int ) -> None:

    brain = Ai()
    model = Mock(dimensions=dimensions)

    brain.setup(timeout=2.0)
    brain.use(model, default=True)

    made = run(tried(brain.embed(texts)))

    if isinstance(made, list):

        assert len(made) == len(texts)
        assert all(len(row) == dimensions for row in made)
        assert all(math.isfinite(value) for row in made for value in row)

    else: assert internal(made) or made.code is Code.VALIDATION, made

    said = run(tried(brain.complete(texts[0] if texts else "")))

    assert isinstance(said, str) or internal(said) or said.code is Code.VALIDATION

messages()
turns()
options()
schemas()
replies()
streams()
vectors()
fences()
mocked()

run(net.close())
run(fake.stop())
loop.close()
log.close()

print(f"fuzz ai  examples={EXAMPLES * 9}  ok")
