from collections.abc import AsyncGenerator, Mapping, Sequence
from functools import partial
from typing import Any, override
import contextlib

from engine.error import Code, Fault
from engine.json import json
from engine.net import Remote
from .arch import Asked, CHAT, EMBED, NDJSON, OLLAMA_STOPS, stops, TIMEOUT, Tool
from .hosted import Hosted
from .message import Message
from .reply import Reply

class Ollama(Hosted):

    name         = "ollama"
    capabilities = frozenset({ "chat", "embed", "stream", "tools", "json" })

    def __init__ (
        self, remote: Remote, model: str, embedding: str = "nomic-embed-text", *, timeout: float = TIMEOUT,
        max_tokens: int | None = None, dimensions: int = 768,
    ) -> None:

        super().__init__(
            remote, model, timeout=timeout, max_tokens=max_tokens, embedding=embedding, dimensions=dimensions,
        )

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        if tools and options.get("tool_choice") == "any":

            raise Fault(Code.INTERNAL, reason="ai.option", errors={ "option": ["tool_choice"] })

        wire = await self._wire_(messages, partial(self._body_, messages, (tools, schema, options)))
        body = await self._ask_(self._post_(CHAT, wire))

        return self._reply_(body)

    @override
    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        wire   = await self._wire_(messages, partial(self._body_, messages, ((), None, options), live=True))
        source = self._remote.net().lines(self._open_(CHAT, wire, { "Accept": NDJSON }))
        ended  = False

        async with contextlib.aclosing(self._fed_(source)) as lines:

            async for line in lines:

                if not line.strip(): continue

                event = self._event_(line)

                if event.get("error") is not None: raise self._broken_("stream")

                message = event.get("message")
                text    = self._word_(message.get("content")) if isinstance(message, Mapping) else ""

                if text: yield text
                if event.get("done") is True: ended = True
                if ended: break

        if not ended: raise self._broken_("cut")

    @override
    async def embed ( self, texts: Sequence[str] ) -> list[list[float]]:

        made = { "model": self._embedder_(), "input": list(texts) }
        body = self._mapping_(await self._ask_(self._post_(EMBED, json.encode(made))), "body")

        return await self._vectors_(body.get("embeddings"), len(texts))

    def _body_ ( self, messages: Sequence[Message], asked: Asked, *, live: bool = False ) -> dict[str, Any]:

        tools, schema, options = asked
        limit = options.get("max_tokens", self._max)
        tuned: dict[str, Any] = {}
        made: dict[str, Any] = {
            "model": self._model, "messages": [self._message_(message) for message in messages], "stream": live,
        }

        if tools and options.get("tool_choice") != "none": made["tools"] = [self._function_(tool) for tool in tools]
        if schema is not None: made["format"] = dict(schema)
        if limit is not None: tuned["num_predict"] = limit
        if "temperature" in options: tuned["temperature"] = options["temperature"]
        if "top_p" in options: tuned["top_p"] = options["top_p"]
        if "stop" in options: tuned["stop"] = stops(options["stop"])
        if tuned: made["options"] = tuned

        return made

    def _message_ ( self, message: Message ) -> dict[str, Any]:

        made: dict[str, Any] = { "role": message.role, "content": message.content }

        if message.role == "tool": made["content"] = self._outcome_(message)
        if message.role == "tool" and message.name: made["tool_name"] = message.name
        if message.images: made["images"] = [data for _, data in message.pictures()]

        if message.calls:

            made["tool_calls"] = [
                { "function": { "name": call.name, "arguments": call.arguments } } for call in message.calls
            ]

        return made

    def _reply_ ( self, body: object ) -> Reply:

        held = self._mapping_(body, "body")

        if held.get("error") is not None: raise self._broken_("error")

        message = self._mapping_(held.get("message"), "message")
        text    = self._text_(message.get("content"), "text")
        calls   = [self._wanted_(item) for item in self._listed_(message.get("tool_calls") or [], "calls")]
        stop    = OLLAMA_STOPS.get(self._word_(held.get("done_reason")) or "stop", "other")
        tokens  = (self._count_(held.get("prompt_eval_count")), self._count_(held.get("eval_count")))

        return self._made_(text, calls, stop, tokens, held)
