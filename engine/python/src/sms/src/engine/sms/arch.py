from dataclasses import dataclass
from typing import Any

from engine.error import Code, Fault

MAX_TEXT = 1000
ADDRESS  = 32
CHANNELS = frozenset({ "sms", "whatsapp" })

@dataclass(frozen=True, slots=True)
class Text:

    to      : str
    body    : str
    channel : str = "sms"
    sender  : str | None = None

    def __post_init__ ( self ) -> None:

        if not self._named_(self.to): raise self._wrong_("to")
        if type(self.body) is not str or not 0 < len(self.body) <= MAX_TEXT: raise self._wrong_("body")
        if type(self.channel) is not str or self.channel not in CHANNELS:

            raise Fault(Code.VALIDATION, reason="sms.channel")
        if self.sender is not None and not self._named_(self.sender): raise self._wrong_("sender")

    def dump ( self ) -> dict[str, Any]:

        return { "to": self.to, "body": self.body, "channel": self.channel, "sender": self.sender }

    @staticmethod
    def _named_ ( value: object ) -> bool:

        return type(value) is str and 0 < len(value) <= ADDRESS and value.isprintable() and " " not in value

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        return Fault(Code.VALIDATION, reason="sms.text", errors={ what: ["is invalid"] })
