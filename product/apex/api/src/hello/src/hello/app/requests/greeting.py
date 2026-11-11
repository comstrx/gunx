from typing import Any, ClassVar, override

from engine.string import string

from ..enums import Tone
from ..utils.cycle import Request

class WorldRequest(Request):

    carries: ClassVar[tuple[str, ...]] = ("locale",)

    tone: Tone = Tone.PLAIN

class NameRequest(Request):

    carries : ClassVar[tuple[str, ...]] = ("locale",)
    rules   : ClassVar[dict[str, str]] = { "name": "required|max:40" }
    reason  : ClassVar[str] = "hello.name"

    name: str

    @classmethod
    @override
    def prepare ( cls, data: dict[str, Any] ) -> dict[str, Any]:

        return { key: string.squish(value) if isinstance(value, str) else value for key, value in data.items() }

class MeRequest(Request):

    carries: ClassVar[tuple[str, ...]] = ("principal", "locale")
