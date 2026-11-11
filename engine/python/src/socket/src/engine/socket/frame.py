from dataclasses import field
from typing import Any

from engine.error import Code, Fault
from engine.json import json
from engine.validate import Shape, validator
from .arch import MAX_FRAME

class Frame(Shape, kw_only=True):

    event   : str
    channel : str | None = None
    data    : dict[str, Any] = field(default_factory=dict)
    id      : str | None = None

    def encode ( self ) -> bytes:

        return json.encode(self.dump())

    @classmethod
    def decode ( cls, raw: str | bytes, limit: int = MAX_FRAME ) -> Frame:

        if len(raw) > limit: raise Fault(Code.TOO_LARGE, reason="socket.frame")

        return validator.shape(cls, raw if isinstance(raw, bytes) else raw.encode())
