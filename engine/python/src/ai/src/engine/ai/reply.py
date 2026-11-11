from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
from .arch import Call, Native, STOPS
from .message import Message

@dataclass(frozen=True, slots=True)
class Reply:

    text       : str
    model      : str
    tokens_in  : int = 0
    tokens_out : int = 0
    stop       : str = "stop"
    calls      : tuple[Call, ...] = ()
    raw        : Mapping[str, Any] = field(default_factory=dict)
    native     : Native | None = None

    def __post_init__ ( self ) -> None:

        calls: object = self.calls
        spent = (self.tokens_in, self.tokens_out)

        if type(self.text) is not str: raise self._wrong_("text")
        if type(self.stop) is not str or self.stop not in STOPS: raise self._wrong_("stop")
        if not all(type(count) is int and count >= 0 for count in spent): raise self._wrong_("tokens")

        if not isinstance(calls, list | tuple) or not all(isinstance(call, Call) for call in calls):

            raise self._wrong_("calls")

        object.__setattr__(self, "calls", tuple(calls))

    @property
    def finished ( self ) -> bool:

        return self.stop == "stop"

    def wants ( self ) -> bool:

        return bool(self.calls)

    def message ( self ) -> Message:

        return Message("assistant", self.text, self.calls, native=self.native)

    def said ( self ) -> Message:

        return Message("assistant", self.text)

    def dump ( self ) -> dict[str, Any]:

        return {
            "text": self.text, "model": self.model, "tokens_in": self.tokens_in, "tokens_out": self.tokens_out,
            "stop": self.stop, "finished": self.finished, "calls": [call.dump() for call in self.calls],
        }

    def _wrong_ ( self, what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"ai.{what}")
