from array import array
from collections.abc import AsyncGenerator, Awaitable, Callable, Mapping, Sequence
from typing import Any, override
import contextlib, math

from engine.error import Code, Fault
from engine.rand import rand
from engine.json import json
from engine.net import Remote
from engine.thread import thread
from .arch import (
    Call, COUNT, counted, DENSE, HEAVY, JSON, LOCAL, MAX_OUTPUT, named, Native, REPLY, STATUS, timed, TIMEOUT, Tool,
    TOOLS, WIDEST,
)
from .message import Message
from .model import Model
from .reply import Reply

class Hosted(Model):

    def __init__ (
        self, remote: Remote, model: str, *, timeout: float = TIMEOUT, max_tokens: int | None = None,
        embedding: str | None = None, dimensions: int = 0,
    ) -> None:

        held: object = remote

        if not isinstance(held, Remote): raise self._unset_("remote")
        if not named(model): raise self._unset_("model")
        if embedding is not None and not named(embedding): raise self._unset_("embedding")
        if not timed(timeout): raise self._unset_("timeout")
        if max_tokens is not None and not counted(max_tokens): raise self._unset_("max_tokens")
        if type(dimensions) is not int or not 0 <= dimensions <= WIDEST: raise self._unset_("dimensions")

        self._remote    = remote
        self._model     = model
        self._embedding = embedding
        self._timeout   = float(timeout)
        self._max       = max_tokens
        self.dimensions = dimensions

    @override
    def owner ( self ) -> str:

        return f"{self.name}:{self._model}"

    @override
    def space ( self ) -> str:

        return f"{self.name}:{self._embedding}:{self.dimensions}"

    @override
    def describe ( self ) -> dict[str, object]:

        return {
            **super().describe(), "model": self._model, "embedding": self._embedding, "dimensions": self.dimensions,
            "timeout": self._timeout,
        }

    async def _wire_ ( self, messages: Sequence[Message], build: Callable[[], Mapping[str, Any]] ) -> bytes:

        if sum(message.weight() for message in messages) > HEAVY: return await thread.offload(self._packed_, build)

        return self._packed_(build)

    @staticmethod
    def _packed_ ( build: Callable[[], Mapping[str, Any]] ) -> bytes:

        return json.encode(build())

    async def _post_ ( self, path: str, wire: bytes, headers: Mapping[str, str] | None = None ) -> Any:

        sent  = { "Content-Type": JSON, **(headers or {}) }
        reply = await self._remote.call("POST", path, body=wire, headers=sent, timeout=self._timeout, limit=REPLY)

        try: return await thread.offload(reply.json) if len(reply.body) > HEAVY else reply.json()
        except Fault as fault: raise self._broken_("json") from fault

    def _open_ (
        self, path: str, wire: bytes, headers: Mapping[str, str] | None = None, query: Mapping[str, Any] | None = None,
    ) -> AsyncGenerator[bytes]:

        sent = { "Content-Type": JSON, **(headers or {}) }

        return self._remote.stream("POST", path, body=wire, headers=sent, timeout=self._timeout, query=query)

    async def _ask_ [T] ( self, work: Awaitable[T] ) -> T:

        try: return await work
        except Fault as fault:

            if not fault.client(): raise

            raise self._upstream_(fault) from fault

    async def _fed_ [T] ( self, source: AsyncGenerator[T] ) -> AsyncGenerator[T]:

        async with contextlib.aclosing(source) as pieces:

            while True:

                try: piece = await anext(pieces)
                except StopAsyncIteration: return
                except Fault as fault:

                    if not fault.client(): raise

                    raise self._upstream_(fault) from fault

                yield piece

    def _upstream_ ( self, fault: Fault ) -> Fault:

        if fault.code is Code.TOO_MANY_REQUESTS:

            return Fault(
                Code.UNAVAILABLE, reason="ai.provider", errors={ "provider": ["throttled"] },
                retry_after=fault.retry_after,
            )

        if fault.code is Code.TOO_LARGE and fault.reason != STATUS: return self._broken_("size")

        return Fault(Code.BAD_GATEWAY, reason="ai.provider", errors={ "provider": [fault.reason or fault.code.value] })

    def _event_ ( self, data: str | bytes ) -> Mapping[str, Any]:

        try: made = json.decode(data)
        except Fault as fault: raise self._broken_("json") from fault

        return self._mapping_(made, "event")

    def _mapping_ ( self, value: object, what: str ) -> Mapping[str, Any]:

        if not isinstance(value, Mapping): raise self._broken_(what)

        return value

    def _listed_ ( self, value: object, what: str ) -> list[Any]:

        if not isinstance(value, list): raise self._broken_(what)

        return value

    def _text_ ( self, value: object, what: str ) -> str:

        if value is None: return ""
        if type(value) is not str: raise self._broken_(what)

        return value

    @staticmethod
    def _word_ ( value: object ) -> str:

        return value if type(value) is str else ""

    @staticmethod
    def _count_ ( value: object ) -> int:

        return value if type(value) is int and 0 <= value <= COUNT else 0

    @staticmethod
    def _arguments_ ( raw: object ) -> tuple[dict[str, Any], bool]:

        if raw is None or raw == "": return {}, False
        if isinstance(raw, Mapping): return dict(raw), False
        if not isinstance(raw, str): return {}, True

        try: made = json.decode(raw)
        except Fault: return {}, True

        return (dict(made), False) if isinstance(made, Mapping) else ({}, True)

    def _call_ ( self, key: object, name: object, raw: object ) -> Call:

        if key is None or key == "": key = f"{LOCAL}{rand.hex(8)}"
        if not named(key) or not named(name): raise self._broken_("call")

        arguments, broken = self._arguments_(raw)

        return Call(key, name, arguments, broken)

    def _wanted_ ( self, item: object ) -> Call:

        held = self._mapping_(item, "call")
        made = self._mapping_(held.get("function"), "call")

        return self._call_(held.get("id"), made.get("name"), made.get("arguments"))

    @staticmethod
    def _function_ ( tool: Tool ) -> dict[str, Any]:

        made: dict[str, Any] = { "name": tool.name, "parameters": dict(tool.parameters) }

        if tool.description: made["description"] = tool.description

        return { "type": "function", "function": made }

    @staticmethod
    def _outcome_ ( message: Message ) -> str:

        if not message.failed: return message.content

        return json.dumps({ "error": message.content or "failed" })

    def _embedder_ ( self ) -> str:

        if self._embedding is None: raise self._unset_("embedding")

        return self._embedding

    def _made_ (
        self, text: str, calls: Sequence[Call], stop: str, spent: tuple[int, int], raw: Mapping[str, Any],
        native: Native | None = None,
    ) -> Reply:

        if len(text) > MAX_OUTPUT: raise self._broken_("size")
        if len(calls) > TOOLS or len({ call.id for call in calls }) != len(calls): raise self._broken_("calls")
        if calls and stop == "stop": stop = "tools"
        if not calls and stop == "tools": stop = "other"

        return Reply(text, self._model, spent[0], spent[1], stop, tuple(calls), raw, native)

    @staticmethod
    def _system_ ( messages: Sequence[Message] ) -> str:

        return "\n\n".join(message.content for message in messages if message.role == "system" and message.content)

    async def _vectors_ ( self, rows: object, count: int ) -> list[list[float]]:

        if not isinstance(rows, list) or len(rows) != count: raise self._broken_("count")

        dense = sum(len(row) for row in rows if isinstance(row, list)) > DENSE

        return await thread.offload(self._dense_, rows) if dense else self._dense_(rows)

    def _dense_ ( self, rows: list[Any] ) -> list[list[float]]:

        width = len(rows[0]) if rows and isinstance(rows[0], list) else 0

        return [self._vector_(row, self.dimensions or width) for row in rows]

    def _vector_ ( self, row: object, width: int ) -> list[float]:

        if not isinstance(row, list) or not 0 < len(row) <= WIDEST: raise self._broken_("vector")
        if len(row) != width: raise self._uneven_(len(row))

        try: held = array("d", row)
        except (TypeError, OverflowError) as error: raise self._broken_("vector") from error

        if not math.isfinite(sum(held)): raise self._broken_("vector")

        return held.tolist()

    def _uneven_ ( self, width: int ) -> Fault:

        if not self.dimensions: return self._broken_("vector")

        return Fault(Code.INTERNAL, reason="ai.dimensions", errors={ "dimensions": [str(width)] })

    def _broken_ ( self, what: str ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason="ai.reply", errors={ "reply": [what] }, unknown=True)

    def _unset_ ( self, what: str ) -> Fault:

        return Fault(Code.INTERNAL, f"{self.name} needs {what}", "ai.settings", { "setting": [what] })
