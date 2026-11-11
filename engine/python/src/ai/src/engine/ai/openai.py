from collections.abc import AsyncGenerator, Mapping, Sequence
from functools import partial
from typing import Any, override
import contextlib

from engine.json import json
from engine.net import Remote
from .arch import (
    ANSWER, Asked, Call, COMPLETIONS, DONE, EMBEDDINGS, EVENTS, OPENAI_CHOICES, OPENAI_STOPS, stops, TIMEOUT, Tool,
)
from .hosted import Hosted
from .message import Message
from .reply import Reply

class Openai(Hosted):

    name         = "openai"
    capabilities = frozenset({ "chat", "embed", "stream", "tools", "json" })

    def __init__ (
        self, remote: Remote, model: str, embedding: str = "text-embedding-3-small", *, timeout: float = TIMEOUT,
        max_tokens: int | None = None, dimensions: int = 1536,
    ) -> None:

        super().__init__(
            remote, model, timeout=timeout, max_tokens=max_tokens, embedding=embedding, dimensions=dimensions,
        )

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        wire = await self._wire_(messages, partial(self._body_, messages, (tools, schema, options)))
        body = await self._ask_(self._post_(COMPLETIONS, wire))

        return self._reply_(body)

    @override
    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        wire   = await self._wire_(messages, partial(self._body_, messages, ((), None, options), live=True))
        source = self._remote.net().sse(self._open_(COMPLETIONS, wire, { "Accept": EVENTS }))
        ended  = False

        async with contextlib.aclosing(self._fed_(source)) as events:

            async for _, data in events:

                if data.strip() == DONE: ended = True
                if ended: break

                text = self._piece_(self._event_(data))

                if text: yield text

        if not ended: raise self._broken_("cut")

    @override
    async def embed ( self, texts: Sequence[str] ) -> list[list[float]]:

        made: dict[str, Any] = { "model": self._embedder_(), "input": list(texts), "encoding_format": "float" }

        if self.dimensions: made["dimensions"] = self.dimensions

        body = self._mapping_(await self._ask_(self._post_(EMBEDDINGS, json.encode(made))), "body")
        rows = self._listed_(body.get("data"), "data")

        if not all(isinstance(row, Mapping) and type(row.get("index")) is int for row in rows):

            raise self._broken_("index")

        if sorted(row["index"] for row in rows) != list(range(len(texts))): raise self._broken_("index")

        return await self._vectors_([row.get("embedding") for row in sorted(rows, key=self._order_)], len(texts))

    def _body_ ( self, messages: Sequence[Message], asked: Asked, *, live: bool = False ) -> dict[str, Any]:

        tools, schema, options = asked
        limit = options.get("max_tokens", self._max)
        made: dict[str, Any] = { "model": self._model, "messages": self._messages_(messages) }

        if limit is not None: made["max_completion_tokens"] = limit
        if "temperature" in options: made["temperature"] = options["temperature"]
        if "top_p" in options: made["top_p"] = options["top_p"]
        if "stop" in options: made["stop"] = stops(options["stop"])
        if tools: made["tools"] = [self._function_(tool) for tool in tools]
        if tools and "tool_choice" in options: made["tool_choice"] = OPENAI_CHOICES[options["tool_choice"]]
        if live: made["stream"] = True

        if schema is not None:

            made["response_format"] = {
                "type": "json_schema", "json_schema": { "name": ANSWER, "schema": dict(schema) },
            }

        return made

    def _messages_ ( self, messages: Sequence[Message] ) -> list[dict[str, Any]]:

        return [self._message_(message) for message in messages]

    def _message_ ( self, message: Message ) -> dict[str, Any]:

        if message.role == "tool":

            return { "role": "tool", "tool_call_id": message.call_id, "content": self._outcome_(message) }

        made: dict[str, Any] = { "role": message.role, "content": self._content_(message) }

        if message.calls:

            made["tool_calls"] = [self._asked_(call) for call in message.calls]

            if not message.content: made["content"] = None

        return made

    def _content_ ( self, message: Message ) -> Any:

        if not message.images: return message.content

        made: list[dict[str, Any]] = [{ "type": "text", "text": message.content }] if message.content else []

        made.extend(
            { "type": "image_url", "image_url": { "url": f"data:{kind};base64,{data}" } }
            for kind, data in message.pictures()
        )

        return made

    @staticmethod
    def _asked_ ( call: Call ) -> dict[str, Any]:

        return {
            "id": call.id, "type": "function",
            "function": { "name": call.name, "arguments": json.dumps(call.arguments) },
        }

    def _reply_ ( self, body: object ) -> Reply:

        held    = self._mapping_(body, "body")
        choices = self._listed_(held.get("choices"), "choices")

        if not choices: raise self._broken_("choices")

        first   = self._mapping_(choices[0], "choice")
        message = self._mapping_(first.get("message"), "message")
        usage   = held.get("usage")
        spent   = usage if isinstance(usage, Mapping) else {}
        text    = self._text_(message.get("content"), "text")
        refusal = self._text_(message.get("refusal"), "refusal")
        calls   = [self._wanted_(item) for item in self._listed_(message.get("tool_calls") or [], "calls")]
        stop    = OPENAI_STOPS.get(self._word_(first.get("finish_reason")), "other")
        tokens  = (self._count_(spent.get("prompt_tokens")), self._count_(spent.get("completion_tokens")))

        if refusal and not calls: return self._made_(text or refusal, (), "refused", tokens, held)

        return self._made_(text, calls, stop, tokens, held)

    def _piece_ ( self, event: Mapping[str, Any] ) -> str:

        if event.get("error") is not None: raise self._broken_("stream")

        choices = event.get("choices")

        if not isinstance(choices, list) or not choices: return ""

        first = choices[0]
        delta = first.get("delta") if isinstance(first, Mapping) else None

        return self._word_(delta.get("content")) if isinstance(delta, Mapping) else ""

    @staticmethod
    def _order_ ( row: Mapping[str, Any] ) -> int:

        index: int = row["index"]

        return index
