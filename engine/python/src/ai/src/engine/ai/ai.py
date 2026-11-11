from collections.abc import AsyncGenerator, Awaitable, Mapping, Sequence
from functools import partial
from pathlib import Path
from typing import Any
import asyncio, inspect, math

from engine.adapter import Manager
from engine.cache import Cache
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.fs import file
from engine.json import json
from engine.log import log
from engine.thread import thread
from engine.validate import Shape, validator
from .arch import (
    ABREAST, ACTED, BATCH, Call, checked, FENCE, HALTED, IDENT, LOAD, LONGEST, MAX_IMAGES, MAX_INPUT,
    MAX_OUTPUT, MAX_ROUNDS, MAX_WINDOW, named, PACK, ROUNDS, TASKS, TEXTS, timed, TIMEOUT, Tool, TOOLS, TTL,
)
from .message import Message
from .model import Model
from .reply import Reply
from .turn import Turn

class Ai:

    def __init__ ( self ) -> None:

        self._manager: Manager[Model] = Manager("ai")
        self._routes: dict[str, str] = {}
        self._cache: Cache | None = None
        self._ttl: float = TTL
        self._timeout = TIMEOUT
        self._calls   = 0
        self._in      = 0
        self._out     = 0
        self._cached  = 0

    def setup (
        self, timeout: float = TIMEOUT, routes: Mapping[str, str] | None = None, cache: Cache | None = None,
        ttl: float = TTL,
    ) -> None:

        held: object = cache
        life: object = ttl

        if not timed(timeout): raise self._unset_("timeout")
        if not isinstance(life, int | float) or type(life) is bool: raise self._unset_("ttl")
        if not math.isfinite(life) or life <= 0: raise self._unset_("ttl")
        if held is not None and not isinstance(held, Cache): raise self._unset_("cache")
        if routes is not None: self._routes = self._routed_(routes)

        self._timeout = float(timeout)
        self._cache   = cache
        self._ttl     = float(life)

    def use ( self, model: Model, default: bool = False, tasks: Sequence[str] = () ) -> Model:

        held: object = model
        asked: object = tasks

        if not isinstance(held, Model): raise Fault(Code.INTERNAL, reason="ai.model")
        if not isinstance(asked, list | tuple): raise self._task_(asked)

        for task in asked:

            if type(task) is not str or task not in TASKS: raise self._task_(task)

        self._manager.use(model, default)

        for task in asked: self._routes[task] = model.name

        return model

    def model ( self, task: str = "chat" ) -> Model:

        if type(task) is not str or task not in TASKS: raise self._task_(task)

        return self._manager.get(self._routes.get(task))

    def ready ( self ) -> bool:

        return self._manager.ready()

    def names ( self ) -> tuple[str, ...]:

        return self._manager.names()

    async def chat (
        self, messages: Sequence[Message] | Turn, task: str = "chat", tools: Sequence[Tool] = (),
        schema: Mapping[str, Any] | None = None, **options: Any,
    ) -> Reply:

        model = self.model(task)
        items = self._items_(messages)
        known = self._tools_(tools)
        asked = checked(options)
        shape: object = schema

        if shape is not None and not isinstance(shape, Mapping): raise Fault(Code.INTERNAL, reason="ai.schema")

        model.ensure("chat")

        if known: model.ensure("tools")
        if schema is not None: model.ensure("json")

        reply: object = await self._guard_(model.chat(items, known, schema, **asked))

        if not isinstance(reply, Reply): raise Fault(Code.INTERNAL, reason="ai.model")

        self._calls += 1
        self._in    += reply.tokens_in
        self._out   += reply.tokens_out

        log.debug("ai.chat", model=model.name, task=task, spent=reply.tokens_in + reply.tokens_out, stop=reply.stop)

        return reply

    async def attach ( self, path: Path, limit: int = MAX_IMAGES ) -> bytes:

        return await file.read(path, limit)

    async def document ( self, path: Path, limit: int = MAX_INPUT * 4 ) -> str:

        return (await file.read_text(path, limit))[:MAX_INPUT]

    async def complete ( self, prompt: str, system: str | None = None, task: str = "complete", **options: Any ) -> str:

        messages = ([Message("system", system)] if system else []) + [Message("user", prompt)]

        return (await self.chat(messages, task, **options)).text

    async def stream (
        self, messages: Sequence[Message] | Turn, task: str = "stream", **options: Any,
    ) -> AsyncGenerator[str]:

        model = self.model(task)
        items = self._items_(messages)
        asked = checked(options)

        model.ensure("chat")

        source: object = model.stream(items, **asked)

        if not isinstance(source, AsyncGenerator):

            if inspect.iscoroutine(source): source.close()

            raise Fault(Code.INTERNAL, reason="ai.model")

        self._calls += 1

        clock = asyncio.get_running_loop().time
        ends  = clock() + LONGEST
        sent  = 0

        try:

            while True:

                try:

                    async with asyncio.timeout(max(min(self._timeout, ends - clock()), 0)): piece = await anext(source)

                except StopAsyncIteration: break
                except TimeoutError as error: raise self._late_() from error

                if type(piece) is not str: raise Fault(Code.INTERNAL, reason="ai.model")

                sent += len(piece)

                if sent > MAX_OUTPUT: raise self._off_("ai.reply", "size")

                yield piece

        finally: await source.aclose()

    async def extract [T: Shape] (
        self, messages: Sequence[Message] | Turn, kind: type[T], task: str = "extract", **options: Any,
    ) -> T:

        given: object = kind

        if not isinstance(given, type) or not issubclass(given, Shape): raise Fault(Code.INTERNAL, reason="ai.shape")

        reply = await self.chat(messages, task, schema=self._flatten_(kind.schema()), **options)

        if reply.stop in HALTED: raise self._off_("ai.schema", reply.stop)

        try: return validator.shape(kind, self._bare_(reply.text))
        except Fault as fault: raise self._off_("ai.schema", "shape") from fault

    async def run (
        self, turn: Turn, tools: Sequence[Tool], task: str = "chat", rounds: int = ROUNDS, **options: Any,
    ) -> Reply:

        held: object = turn

        if not isinstance(held, Turn): raise Fault(Code.INTERNAL, reason="ai.messages")

        if type(rounds) is not int or not 1 <= rounds <= MAX_ROUNDS:

            raise Fault(Code.INTERNAL, reason="ai.option", errors={ "option": ["rounds"] })

        known = { tool.name: tool for tool in self._tools_(tools) }
        given = tuple(known.values())

        for _ in range(rounds):

            reply = await self.chat(turn, task, given, **options)

            if not reply.calls or reply.stop not in ACTED:

                turn.add(reply.said() if reply.calls else reply.message())

                return reply

            turn.add(reply.message())

            await self._acted_(turn, known, reply.calls)

        raise Fault(Code.UNAVAILABLE, "The tool loop did not settle", "ai.rounds", unknown=True)

    async def embed ( self, texts: Sequence[str], task: str = "embed" ) -> list[list[float]]:

        model = self.model(task)
        items = self._texts_(texts)

        model.ensure("embed")

        if not items: return []

        space = model.space()
        keys  = [self._key_(space, text) for text in items]
        found = await self._known_(keys, model.dimensions)
        fresh = { key: text for key, text in zip(keys, items, strict=True) if key not in found }

        self._cached += sum(key in found for key in keys)

        if fresh:

            packs = self._packs_(list(fresh.items()), model.batch)
            parts = await thread.map(packs, partial(self._batch_, model), ABREAST)

            for part in parts: found.update(part)

            self._calls += len(packs)

        return [list(found[key]) for key in keys]

    def dimensions ( self, task: str = "embed" ) -> int:

        return self.model(task).dimensions

    def stats ( self ) -> dict[str, int]:

        return { "calls": self._calls, "tokens_in": self._in, "tokens_out": self._out, "cached": self._cached }

    def describe ( self ) -> dict[str, Any]:

        return { "routes": dict(self._routes), "timeout": self._timeout, **self._manager.describe(), **self.stats() }

    async def close ( self ) -> None:

        await self._manager.close()

    def _routed_ ( self, routes: object ) -> dict[str, str]:

        if not isinstance(routes, Mapping): raise self._unset_("routes")

        for task, name in routes.items():

            if type(task) is not str or task not in TASKS or not named(name): raise self._unset_("routes")

        return dict(routes)

    def _items_ ( self, messages: object ) -> list[Message]:

        given = messages.messages if isinstance(messages, Turn) else messages

        if not isinstance(given, list | tuple): raise Fault(Code.INTERNAL, reason="ai.messages")
        if len(given) > MAX_WINDOW: raise Fault(Code.TOO_LARGE, reason="ai.input")

        items: list[Message] = list(given)

        if not all(isinstance(item, Message) for item in items): raise Fault(Code.INTERNAL, reason="ai.messages")
        if all(item.role == "system" or item.empty() for item in items): raise Fault(Code.VALIDATION, reason="ai.empty")
        if sum(item.weight() for item in items) > LOAD: raise Fault(Code.TOO_LARGE, reason="ai.input")

        return items

    def _tools_ ( self, tools: object ) -> tuple[Tool, ...]:

        if not isinstance(tools, list | tuple) or len(tools) > TOOLS: raise Fault(Code.INTERNAL, reason="ai.tools")

        given: tuple[Tool, ...] = tuple(tools)

        if not all(isinstance(tool, Tool) for tool in given): raise Fault(Code.INTERNAL, reason="ai.tools")
        if len({ tool.name for tool in given }) != len(given): raise Fault(Code.INTERNAL, reason="ai.tools")

        return given

    def _texts_ ( self, texts: object ) -> list[str]:

        if not isinstance(texts, list | tuple): raise Fault(Code.INTERNAL, reason="ai.texts")
        if len(texts) > TEXTS: raise Fault(Code.TOO_LARGE, reason="ai.input")

        items: list[str] = list(texts)

        if not all(type(text) is str for text in items): raise Fault(Code.INTERNAL, reason="ai.texts")
        if any(len(text) > MAX_INPUT for text in items): raise Fault(Code.TOO_LARGE, reason="ai.input")
        if not all(text and not text.isspace() for text in items): raise Fault(Code.VALIDATION, reason="ai.empty")

        return items

    async def _acted_ ( self, turn: Turn, known: Mapping[str, Tool], calls: Sequence[Call] ) -> None:

        done = 0

        try:

            for call in calls:

                turn.add(await self._result_(known.get(call.name), call))

                done += 1

        finally:

            for call in calls[done:]: turn.add(Message.result(call, "cancelled", failed=True))

    async def _result_ ( self, tool: Tool | None, call: Call ) -> Message:

        if tool is None: return Message.result(call, "unknown tool", failed=True)
        if call.broken: return Message.result(call, "malformed arguments", failed=True)

        try:

            async with asyncio.timeout(self._timeout): value = await tool.run(call)

            return Message.result(call, value)

        except TimeoutError: return Message.result(call, "timed out", failed=True)
        except Fault as fault: return Message.result(call, self._reason_(tool, fault), failed=True)
        except Exception as error:

            log.exception("ai.tool", tool=tool.name, error=type(error).__name__)

            return Message.result(call, "failed", failed=True)

    def _reason_ ( self, tool: Tool, fault: Fault ) -> Any:

        word = fault.reason or fault.code.value

        if not fault.client():

            log.error("ai.tool", tool=tool.name, reason=word)

            return "failed"

        return { "reason": word, "errors": fault.errors } if fault.errors else word

    async def _known_ ( self, keys: Sequence[str], width: int ) -> dict[str, list[float]]:

        if self._cache is None: return {}

        try: found = await self._cache.many(list(dict.fromkeys(keys)))
        except Fault as fault:

            log.warning("ai.cache", reason=fault.reason or fault.code.value)

            return {}

        return { key: value for key, value in found.items() if self._vector_(value, width) }

    async def _batch_ ( self, model: Model, pack: Sequence[tuple[str, str]] ) -> dict[str, list[float]]:

        rows: object = await self._guard_(model.embed([text for _, text in pack]))

        if not isinstance(rows, list) or len(rows) != len(pack): raise self._off_("ai.embed", "count")
        if not all(self._vector_(row, model.dimensions) for row in rows): raise self._off_("ai.embed", "vector")

        made: dict[str, list[float]] = { key: row for (key, _), row in zip(pack, rows, strict=True) }

        if self._cache is None: return made

        try: await self._cache.set_many(made, self._ttl)
        except Fault as fault: log.warning("ai.cache", reason=fault.reason or fault.code.value)

        return made

    @staticmethod
    def _packs_ ( pairs: Sequence[tuple[str, str]], batch: object ) -> list[list[tuple[str, str]]]:

        size = batch if type(batch) is int and batch > 0 else BATCH
        made: list[list[tuple[str, str]]] = []
        held: list[tuple[str, str]] = []
        load = 0

        for pair in pairs:

            if held and (len(held) >= size or load + len(pair[1]) > PACK):

                made.append(held)

                held, load = [], 0

            held.append(pair)

            load += len(pair[1])

        if held: made.append(held)

        return made

    @staticmethod
    def _vector_ ( value: object, width: int ) -> bool:

        return isinstance(value, list) and len(value) == (width or len(value)) and len(value) > 0

    @staticmethod
    def _key_ ( space: str, text: str ) -> str:

        try: raw = f"{space}\x00{text}".encode()
        except UnicodeEncodeError as error: raise Fault(Code.VALIDATION, reason="ai.text") from error

        return f"ai:embed:{crypto.digest(raw)}"

    async def _guard_ [T] ( self, work: Awaitable[T] ) -> T:

        held: object = work

        if not inspect.isawaitable(held): raise Fault(Code.INTERNAL, reason="ai.model")

        try:

            async with asyncio.timeout(self._timeout): return await work

        except TimeoutError as error: raise self._late_() from error

    @staticmethod
    def _flatten_ ( schema: Mapping[str, Any] ) -> dict[str, Any]:

        made = dict(schema)
        ref  = made.get("$ref")
        defs = made.get("$defs")
        name = ref.rsplit("/", 1)[-1] if type(ref) is str else ""

        if not name or not isinstance(defs, Mapping) or not isinstance(defs.get(name), Mapping): return made

        rest = { key: value for key, value in defs.items() if key != name }
        used = f'"{ref}"' in json.dumps([defs[name], rest])
        kept = dict(defs) if used else rest
        made = { **defs[name], **{ key: value for key, value in made.items() if key not in ("$ref", "$defs") } }

        if kept: made["$defs"] = kept

        return made

    @staticmethod
    def _bare_ ( text: str ) -> str:

        bare = text.strip()

        if not bare.startswith(FENCE): return bare

        body = bare.partition("\n")[2]

        return body.rsplit(FENCE, 1)[0].strip() if FENCE in body else body.strip()

    @staticmethod
    def _late_ () -> Fault:

        return Fault(Code.TIMEOUT, reason="ai.timeout", unknown=True)

    @staticmethod
    def _off_ ( reason: str, what: str ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason=reason, errors={ "reply": [what] }, unknown=True)

    @staticmethod
    def _task_ ( task: object ) -> Fault:

        shown = task[:IDENT] if type(task) is str else type(task).__name__

        return Fault(Code.INTERNAL, reason="ai.task", errors={ "task": [shown] })

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="ai.settings", errors={ "setting": [what] })
