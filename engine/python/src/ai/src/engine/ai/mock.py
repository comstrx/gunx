from collections.abc import AsyncGenerator, Mapping, Sequence
from typing import Any, override
import math

from engine.crypto import crypto
from engine.error import Code, Fault
from .arch import Call, DIGEST, Tool
from .message import Message
from .model import Model
from .reply import Reply

class Mock(Model):

    name         = "mock"
    capabilities = frozenset({ "chat", "embed", "stream", "tools", "json" })

    def __init__ ( self, answer: str | None = None, calls: Sequence[Call] = (), dimensions: int = 8 ) -> None:

        given: object = calls

        if answer is not None and type(answer) is not str: raise self._wrong_("answer")
        if not isinstance(given, list | tuple) or not all(isinstance(call, Call) for call in given):

            raise self._wrong_("calls")

        if type(dimensions) is not int or not 1 <= dimensions <= DIGEST: raise self._wrong_("dimensions")

        self._answer    = answer
        self._calls     = tuple(given)
        self.dimensions = dimensions
        self.seen: list[list[Message]] = []

    @override
    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        self.seen.append(list(messages))

        spent = sum(len(message.content) for message in messages) // 4
        last  = messages[-1] if messages else None

        if tools and self._calls and (last is None or last.role != "tool"):

            return Reply("", self.name, spent, 0, "tools", self._calls)

        said = last.content if last is not None else ""
        text = self._answer if self._answer is not None else f"echo: {said}"

        return Reply(text, self.name, spent, len(text) // 4)

    @override
    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        reply = await self.chat(messages, **options)

        for index, word in enumerate(reply.text.split(" ")): yield word if index == 0 else f" {word}"

    @override
    async def embed ( self, texts: Sequence[str] ) -> list[list[float]]:

        return [self._vector_(text) for text in texts]

    def _vector_ ( self, text: str ) -> list[float]:

        raw = [0.0] * self.dimensions

        for token in text.lower().split():

            digest = bytes.fromhex(crypto.hash(token.strip(".,!?;:").encode("utf-8", "surrogatepass"), "sha256"))

            for index in range(self.dimensions): raw[index] += digest[index] / 255.0 - 0.5

        norm = math.sqrt(sum(value * value for value in raw)) or 1.0

        return [value / norm for value in raw]

    def _wrong_ ( self, what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="ai.settings", errors={ "setting": [what] })
