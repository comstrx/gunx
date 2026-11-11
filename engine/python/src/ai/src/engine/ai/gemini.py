from collections.abc import AsyncGenerator, Mapping, Sequence
from functools import partial
from typing import Any, override
import contextlib

from engine.json import json
from engine.net import Remote
from .arch import (
    Asked, Call, EVENTS, GEMINI_CHOICES, GEMINI_STOPS, JSON, LOCAL, MODELS, Native, SIGNED, stops, TIMEOUT, Tool,
)
from .hosted import Hosted
from .message import Message
from .reply import Reply

class Gemini(Hosted):

    name         = "gemini"
    capabilities = frozenset({ "chat", "embed", "stream", "tools", "json" })

    def __init__ (
        self, remote: Remote, model: str, embedding: str = "gemini-embedding-2", *, timeout: float = TIMEOUT,
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

        wire = await self._wire_(messages, partial(self._body_, messages, (tools, schema, options)))
        body = await self._ask_(self._post_(self._path_(self._model, "generateContent"), wire))

        return self._reply_(body)

    @override
    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        wire   = await self._wire_(messages, partial(self._body_, messages, ((), None, options)))
        path   = self._path_(self._model, "streamGenerateContent")
        source = self._remote.net().sse(self._open_(path, wire, { "Accept": EVENTS }, { "alt": "sse" }))
        ended  = False

        async with contextlib.aclosing(self._fed_(source)) as events:

            async for _, data in events:

                event = self._event_(data)

                if event.get("error") is not None: raise self._broken_("stream")

                first = self._first_(event)
                text  = self._spoken_(first)

                if text: yield text
                if first.get("finishReason") or self._blocked_(event): ended = True
                if ended: break

        if not ended: raise self._broken_("cut")

    @override
    async def embed ( self, texts: Sequence[str] ) -> list[list[float]]:

        name = self._embedder_()
        made = { "requests": [self._asking_(f"models/{name}", text) for text in texts] }
        path = self._path_(name, "batchEmbedContents")
        body = self._mapping_(await self._ask_(self._post_(path, json.encode(made))), "body")
        rows = self._listed_(body.get("embeddings"), "embeddings")
        held = [row.get("values") if isinstance(row, Mapping) else None for row in rows]

        return await self._vectors_(held, len(texts))

    def _path_ ( self, model: str, verb: str ) -> str:

        return f"{MODELS}/{self._remote.net().segment(model)}:{verb}"

    def _asking_ ( self, name: str, text: str ) -> dict[str, Any]:

        made: dict[str, Any] = { "model": name, "content": { "parts": [{ "text": text }] } }

        if self.dimensions: made["outputDimensionality"] = self.dimensions

        return made

    def _body_ ( self, messages: Sequence[Message], asked: Asked ) -> dict[str, Any]:

        tools, schema, options = asked
        system = self._system_(messages)
        limit  = options.get("max_tokens", self._max)
        tuned: dict[str, Any] = {}
        made: dict[str, Any] = { "contents": self._contents_(messages) }

        if system: made["systemInstruction"] = { "parts": [{ "text": system }] }
        if tools: made["tools"] = [{ "functionDeclarations": [self._tool_(tool) for tool in tools] }]

        if tools and "tool_choice" in options:

            made["toolConfig"] = { "functionCallingConfig": { "mode": GEMINI_CHOICES[options["tool_choice"]] } }

        if limit is not None: tuned["maxOutputTokens"] = limit
        if "temperature" in options: tuned["temperature"] = options["temperature"]
        if "top_p" in options: tuned["topP"] = options["top_p"]
        if "stop" in options: tuned["stopSequences"] = stops(options["stop"])
        if schema is not None: tuned.update(responseMimeType=JSON, responseJsonSchema=dict(schema))
        if tuned: made["generationConfig"] = tuned

        return made

    def _contents_ ( self, messages: Sequence[Message] ) -> list[dict[str, Any]]:

        names = { call.id: call.name for message in messages for call in message.calls }
        made: list[dict[str, Any]] = []

        for message in messages:

            if message.role == "system": continue

            role  = "model" if message.role == "assistant" else "user"
            parts = self._parts_(message, names)

            if not parts: continue

            if made and made[-1]["role"] == role: made[-1]["parts"].extend(parts)
            else: made.append({ "role": role, "parts": parts })

        return made

    def _parts_ ( self, message: Message, names: Mapping[str, str] ) -> list[Any]:

        if message.role == "tool": return [self._result_(message, names)]

        kept = self._kept_(message)

        if kept is not None: return kept

        made: list[Any] = [
            { "inlineData": { "mimeType": kind, "data": data } } for kind, data in message.pictures()
        ]

        if message.content.strip(): made.append({ "text": message.content })

        made.extend({ "functionCall": self._asked_(call) } for call in message.calls)

        return made

    def _kept_ ( self, message: Message ) -> list[Any] | None:

        native = message.native

        if message.role != "assistant" or native is None or native.owner != self.owner(): return None

        parts = native.content.get("parts") if isinstance(native.content, Mapping) else None

        return list(parts) if isinstance(parts, list) and parts else None

    @staticmethod
    def _result_ ( message: Message, names: Mapping[str, str] ) -> dict[str, Any]:

        key   = message.call_id or ""
        field = "error" if message.failed else "result"
        made: dict[str, Any] = {
            "name": message.name or names.get(key, "tool"), "response": { field: message.content },
        }

        if not key.startswith(LOCAL): made["id"] = key

        return { "functionResponse": made }

    @staticmethod
    def _asked_ ( call: Call ) -> dict[str, Any]:

        made: dict[str, Any] = { "name": call.name, "args": call.arguments }

        if not call.id.startswith(LOCAL): made["id"] = call.id

        return made

    @staticmethod
    def _tool_ ( tool: Tool ) -> dict[str, Any]:

        made: dict[str, Any] = { "name": tool.name, "parametersJsonSchema": dict(tool.parameters) }

        if tool.description: made["description"] = tool.description

        return made

    def _reply_ ( self, body: object ) -> Reply:

        held   = self._mapping_(body, "body")
        usage  = held.get("usageMetadata")
        spent  = usage if isinstance(usage, Mapping) else {}
        first  = self._first_(held)
        tokens = (
            self._count_(spent.get("promptTokenCount")),
            self._count_(spent.get("candidatesTokenCount")) + self._count_(spent.get("thoughtsTokenCount")),
        )

        if not first and self._blocked_(held): return self._made_("", (), "refused", tokens, held)
        if not first: raise self._broken_("candidates")

        content = first.get("content")
        parts   = content.get("parts") if isinstance(content, Mapping) else None
        texts: list[str] = []
        calls: list[Call] = []
        signed = False

        for part in parts if isinstance(parts, list) else []:

            item = self._mapping_(part, "part")
            call = item.get("functionCall")

            if SIGNED in item: signed = True

            if isinstance(call, Mapping): calls.append(self._call_(call.get("id"), call.get("name"), call.get("args")))
            elif item.get("thought") is not True: texts.append(self._text_(item.get("text"), "text"))

        native = Native(self.owner(), content) if signed else None
        stop   = GEMINI_STOPS.get(self._word_(first.get("finishReason")), "other")

        return self._made_("".join(texts), calls, stop, tokens, held, native)

    def _first_ ( self, held: Mapping[str, Any] ) -> Mapping[str, Any]:

        candidates = held.get("candidates")

        if candidates is None: return {}

        listed = self._listed_(candidates, "candidates")

        return self._mapping_(listed[0], "candidate") if listed else {}

    @staticmethod
    def _blocked_ ( held: Mapping[str, Any] ) -> bool:

        feedback = held.get("promptFeedback")

        return isinstance(feedback, Mapping) and bool(feedback.get("blockReason"))

    @staticmethod
    def _spoken_ ( first: Mapping[str, Any] ) -> str:

        content = first.get("content")
        parts   = content.get("parts") if isinstance(content, Mapping) else None

        if not isinstance(parts, list): return ""

        return "".join(
            part["text"] for part in parts
            if isinstance(part, Mapping) and part.get("thought") is not True and type(part.get("text")) is str
        )
