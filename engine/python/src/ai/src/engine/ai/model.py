from collections.abc import AsyncGenerator, Mapping, Sequence
from typing import Any, ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import BATCH, Tool
from .message import Message
from .reply import Reply

class Model(Adapter):

    family       : ClassVar[str] = "ai"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "chat" })
    dimensions   : int = 0
    batch        : int = BATCH

    def owner ( self ) -> str:

        return self.name

    def space ( self ) -> str:

        return f"{self.name}:{self.dimensions}"

    async def chat (
        self, messages: Sequence[Message], tools: Sequence[Tool] = (), schema: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        raise Fault(Code.INTERNAL, reason="ai.abstract")

    async def stream ( self, messages: Sequence[Message], **options: Any ) -> AsyncGenerator[str]:

        reply = await self.chat(messages, **options)

        if reply.text: yield reply.text

    async def embed ( self, texts: Sequence[str] ) -> list[list[float]]:

        raise Fault(Code.INTERNAL, reason="ai.abstract")
