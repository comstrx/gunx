from dataclasses import dataclass, field, replace
from typing import Any

from engine.error import Code, Fault
from .arch import MAX_WINDOW, MIN_WINDOW, WINDOW
from .message import Message

@dataclass(slots=True)
class Turn:

    messages : list[Message] = field(default_factory=list)
    window   : int = WINDOW

    def __post_init__ ( self ) -> None:

        given: object = self.messages

        if type(self.window) is not int or not MIN_WINDOW <= self.window <= MAX_WINDOW: raise self._wrong_("window")
        if not isinstance(given, list | tuple): raise self._wrong_("messages")
        if not all(isinstance(message, Message) for message in given): raise self._wrong_("messages")

        self.messages = list(given)

        if len(self.messages) > self.window: self._trim_()

    def say ( self, role: str, content: str ) -> Turn:

        return self.add(Message(role, content))

    def add ( self, message: Message ) -> Turn:

        if not isinstance(message, Message): raise self._wrong_("messages")

        self.messages.append(message)

        if len(self.messages) > self.window: self._trim_()

        return self

    def dump ( self ) -> list[dict[str, Any]]:

        return [message.dump() for message in self.messages]

    def _trim_ ( self ) -> None:

        held   = self.messages
        pinned = next((at for at, message in enumerate(held) if message.role == "system"), None)
        head   = [] if pinned is None else [held[pinned]]
        rest   = held if pinned is None else held[:pinned] + held[pinned + 1:]
        start  = max(len(rest) - max(self.window * 3 // 4 - len(head), 1), 0)

        while start > 0 and rest[start].role == "tool": start -= 1

        tail = rest[start:]

        while tail and tail[0].role == "tool": tail.pop(0)

        if tail and tail[0].role != "user":

            head += [message for message in reversed(rest[:start]) if message.role == "user"][:1]

        self.messages[:] = [self._loose_(message) for message in head + tail]

    def _loose_ ( self, message: Message ) -> Message:

        bound = message.native is not None and message.native.bound

        return replace(message, native=None) if bound else message

    def _wrong_ ( self, what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"ai.{what}")
