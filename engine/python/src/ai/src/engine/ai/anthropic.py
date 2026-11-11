from collections.abc import AsyncGenerator, Mapping, Sequence
from functools import partial
from typing import Any, override
import contextlib

from engine.error import Code, Fault
from engine.log import log
from engine.net import Remote
from .arch import (
    ANTHROPIC_STOPS, Asked, Call, counted, DEPTH, ECHOED, EVENTS, FORMATS, KEYED, KEYWORDS, LISTED, MESSAGES, named,
    Native, NESTED, SPENT, stops, THOUGHT, TIMEOUT, TOKENS, Tool, VERSION, WORDED,
)
from .hosted import Hosted
from .message import Message
from .reply import Reply

class Anthropic(Hosted):

    name         = "anthropic"
    capabilities = frozenset({ "chat", "stream", "tools", "json" })

    def __init__ (
        self, remote: Remote, model: str, max_tokens: int = TOKENS, *, timeout: float = TIMEOUT, version: str = VERSION,
    ) -> None:

        if not counted(max_tokens): raise self._unset_("max_tokens")
        if not named(version): raise self._unset_("version")

        super().__init__(remote, model, timeout=timeout, max_tokens=max_tokens)

        self._heads = { "anthropic-version": version }

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        asked = (tools, schema, options)
        echo  = any(self._mine_(message) for message in messages[self._last_(messages) + 1:])
        body  = await self._ask_(self._twice_(messages, asked) if echo else self._send_(messages, asked, echo=False))

        return self._reply_(body)

    @override
    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        build  = partial(self._body_, messages, ((), None, options), echo=False, live=True)
        wire   = await self._wire_(messages, build)
        source = self._remote.net().sse(self._open_(MESSAGES, wire, { **self._heads, "Accept": EVENTS }))
        ended  = False

        async with contextlib.aclosing(self._fed_(source)) as events:

            async for event, data in events:

                if event == "error": raise self._broken_("stream")
                if event == "message_stop": ended = True
                if ended: break
                if event != "content_block_delta": continue

                delta = self._event_(data).get("delta")
                text  = delta.get("text") if isinstance(delta, Mapping) and delta.get("type") == "text_delta" else None

                if type(text) is str and text: yield text

        if not ended: raise self._broken_("cut")

    async def _send_ ( self, messages: Sequence[Message], asked: Asked, *, echo: bool ) -> Any:

        wire = await self._wire_(messages, partial(self._body_, messages, asked, echo=echo))

        return await self._post_(MESSAGES, wire, self._heads)

    async def _twice_ ( self, messages: Sequence[Message], asked: Asked ) -> Any:

        try: return await self._send_(messages, asked, echo=True)
        except Fault as fault:

            if fault.code is not Code.BAD_REQUEST: raise

        log.warning("ai.replay", model=self._model)

        return await self._send_(messages, asked, echo=False)

    def _body_ ( self, messages: Sequence[Message], asked: Asked, *, echo: bool, live: bool = False ) -> dict[str, Any]:

        tools, schema, options = asked
        system = self._system_(messages)
        made: dict[str, Any] = {
            "model": self._model, "max_tokens": options.get("max_tokens", self._max),
            "messages": self._messages_(messages, echo),
        }

        if system: made["system"] = system
        if "stop" in options: made["stop_sequences"] = stops(options["stop"])
        if tools: made["tools"] = [self._tool_(tool) for tool in tools]
        if tools and "tool_choice" in options: made["tool_choice"] = { "type": options["tool_choice"] }
        if live: made["stream"] = True

        if schema is not None:

            made["output_config"] = { "format": { "type": "json_schema", "schema": self._schema_(schema, 0) } }

        return made

    def _messages_ ( self, messages: Sequence[Message], echo: bool ) -> list[dict[str, Any]]:

        made: list[dict[str, Any]] = []
        last = self._last_(messages)

        for at, message in enumerate(messages):

            if message.role == "system": continue

            role   = "assistant" if message.role == "assistant" else "user"
            blocks = self._blocks_(message, echo and at > last)

            if not blocks: continue

            if made and made[-1]["role"] == role: made[-1]["content"].extend(blocks)
            else: made.append({ "role": role, "content": blocks })

        return made

    def _blocks_ ( self, message: Message, echo: bool ) -> list[Any]:

        if message.role == "tool": return [self._result_(message)]
        if echo and message.native is not None and self._mine_(message): return list(message.native.content)

        made: list[Any] = [
            { "type": "image", "source": { "type": "base64", "media_type": kind, "data": data } }
            for kind, data in message.pictures()
        ]

        if message.content.strip(): made.append({ "type": "text", "text": message.content })

        made.extend(
            { "type": "tool_use", "id": call.id, "name": call.name, "input": call.arguments } for call in message.calls
        )

        return made

    def _result_ ( self, message: Message ) -> dict[str, Any]:

        made: dict[str, Any] = { "type": "tool_result", "tool_use_id": message.call_id, "content": message.content }

        if message.failed: made.update(is_error=True, content=message.content or "failed")

        return made

    def _tool_ ( self, tool: Tool ) -> dict[str, Any]:

        made: dict[str, Any] = { "name": tool.name, "input_schema": dict(tool.parameters) }

        if tool.description: made["description"] = tool.description

        return made

    def _schema_ ( self, schema: object, depth: int ) -> Any:

        if depth > DEPTH: raise Fault(Code.INTERNAL, reason="ai.schema")
        if isinstance(schema, list): return [self._schema_(item, depth + 1) for item in schema]
        if not isinstance(schema, Mapping): return schema

        made: dict[str, Any] = {}

        for key, value in schema.items():

            name = "anyOf" if key == "oneOf" else key

            if name not in KEYWORDS or name == "additionalProperties" or not self._sound_(name, value): continue

            if name in NESTED: made[name] = self._schema_(value, depth + 1)
            elif name in KEYED: made[name] = { field: self._schema_(item, depth + 1) for field, item in value.items() }
            else: made[name] = value

        if made.get("type") == "object" or "properties" in made: made["additionalProperties"] = False

        return made

    @staticmethod
    def _sound_ ( name: str, value: object ) -> bool:

        words = isinstance(value, list) and all(type(item) is str for item in value)

        if name == "format": return type(value) is str and value in FORMATS
        if name in WORDED: return type(value) is str
        if name in LISTED: return words
        if name == "type": return type(value) is str or words
        if name in KEYED: return isinstance(value, Mapping)

        return True

    def _reply_ ( self, body: object ) -> Reply:

        held  = self._mapping_(body, "body")
        usage = held.get("usage")
        spent = usage if isinstance(usage, Mapping) else {}
        texts: list[str] = []
        calls: list[Call] = []
        kept: list[Any] = []
        thought = False

        for block in self._listed_(held.get("content"), "content"):

            item = self._mapping_(block, "block")
            kind = self._word_(item.get("type"))

            if kind == "text": texts.append(self._text_(item.get("text"), "text"))
            if kind == "tool_use": calls.append(self._call_(item.get("id"), item.get("name"), item.get("input")))
            if kind in THOUGHT: thought = True
            if kind in ECHOED: kept.append(item)

        native = Native(self.owner(), kept, bound=True) if thought else None
        tokens = (sum(self._count_(spent.get(name)) for name in SPENT), self._count_(spent.get("output_tokens")))
        stop   = ANTHROPIC_STOPS.get(self._word_(held.get("stop_reason")), "other")

        return self._made_("".join(texts), calls, stop, tokens, held, native)

    def _mine_ ( self, message: Message ) -> bool:

        native = message.native

        if message.role != "assistant" or native is None: return False

        return native.owner == self.owner() and isinstance(native.content, list)

    @staticmethod
    def _last_ ( messages: Sequence[Message] ) -> int:

        return max((at for at, message in enumerate(messages) if message.role == "user"), default=-1)
