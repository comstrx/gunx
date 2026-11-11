from dataclasses import dataclass
from typing import Any

from engine.error import Code, Fault
from engine.string import string
from engine.json import json
from .arch import Call, IMAGES, MAX_IMAGES, MAX_OUTPUT, media, named, Native, ROLES, TOOLS

@dataclass(frozen=True, slots=True)
class Message:

    role    : str
    content : str
    calls   : tuple[Call, ...] = ()
    call_id : str | None = None
    name    : str | None = None
    images  : tuple[bytes, ...] = ()
    failed  : bool = False
    native  : Native | None = None

    def __post_init__ ( self ) -> None:

        role = self.role

        if type(role) is not str or role not in ROLES: raise self._wrong_("role", str(role)[:32])
        if type(self.content) is not str: raise self._wrong_("content", role)
        if len(self.content) > MAX_OUTPUT: raise self._big_("input")
        if self.calls: self._called_()
        if self.images: self._shown_()
        if role == "tool" and not named(self.call_id): raise self._wrong_("call", role)
        if self.name is not None and not named(self.name): raise self._wrong_("name", role)

    def dump ( self ) -> dict[str, Any]:

        made: dict[str, Any] = { "role": self.role, "content": self.content }

        if self.calls: made["calls"] = [call.dump() for call in self.calls]
        if self.call_id: made["call_id"] = self.call_id
        if self.name: made["name"] = self.name
        if self.images: made["images"] = len(self.images)
        if self.failed: made["failed"] = True

        return made

    def pictures ( self ) -> list[tuple[str, str]]:

        return [(media(image) or "", string.base64(image)) for image in self.images]

    def weight ( self ) -> int:

        return len(self.content) + sum(len(image) for image in self.images)

    def empty ( self ) -> bool:

        return not self.content and not self.calls and not self.images and self.native is None

    @classmethod
    def result ( cls, call: Call, value: Any, failed: bool = False ) -> Message:

        text = value if isinstance(value, str) else json.dumps(value)

        return cls("tool", text, call_id=call.id, name=call.name, failed=failed)

    def _called_ ( self ) -> None:

        calls: object = self.calls

        if self.role != "assistant" or not isinstance(calls, list | tuple) or len(calls) > TOOLS:

            raise self._wrong_("calls", self.role)

        if not all(isinstance(call, Call) for call in calls): raise self._wrong_("calls", self.role)

        object.__setattr__(self, "calls", tuple(calls))

    def _shown_ ( self ) -> None:

        images: object = self.images

        if self.role != "user" or not isinstance(images, list | tuple): raise self._wrong_("images", self.role)
        if not all(isinstance(image, bytes) for image in images): raise self._wrong_("images", self.role)
        if len(images) > IMAGES or sum(len(image) for image in images) > MAX_IMAGES: raise self._big_("images")
        if not all(media(image) for image in images): raise Fault(Code.VALIDATION, reason="ai.image")

        object.__setattr__(self, "images", tuple(images))

    def _wrong_ ( self, what: str, shown: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"ai.{what}", errors={ what: [shown] })

    def _big_ ( self, what: str ) -> Fault:

        return Fault(Code.TOO_LARGE, reason=f"ai.{what}")
