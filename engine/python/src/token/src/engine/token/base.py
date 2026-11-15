from collections.abc import Mapping
from typing import Any
from engine.error import Code, Fault
from engine.json import json
from engine.string import string
import math
from .arch import KEYS, KEY_ID, LONGEST

class Base:

    __slots__ = ()

    @staticmethod
    def setting ( name: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="token.settings", errors={ "setting": [name] })

    @staticmethod
    def refused () -> Fault:

        return Fault(Code.UNAUTHORIZED, reason="token.invalid")

    @staticmethod
    def label ( value: object ) -> bool:

        return type(value) is str and 0 < len(value) <= KEY_ID and value.isprintable() and bool(value.strip())

    @staticmethod
    def instant ( value: Any ) -> float | None:

        if type(value) is int: return float(value) if abs(value) < 2 ** 62 else None
        if type(value) is float and math.isfinite(value) and abs(value) < 2 ** 62: return value

        return None

    @staticmethod
    def bounded ( value: str ) -> str:

        if type(value) is not str or not value or len(value) > LONGEST or not value.isascii(): raise Base.refused()

        return value

    @staticmethod
    def pack ( value: bytes ) -> str:

        return string.base64(value, url=True)

    @staticmethod
    def unpack ( value: str ) -> bytes:

        try: return string.unbase64(value, url=True, canonical=True)
        except Fault as error: raise Base.refused() from error

    @staticmethod
    def payload ( value: bytes ) -> dict[str, Any]:

        if len(value) > LONGEST: raise Base.refused()

        try: found = json.decode(value)
        except Fault as error: raise Base.refused() from error

        if type(found) is not dict: raise Base.refused()

        return found

    @staticmethod
    def ring ( keys: Mapping[str, str | bytes], active: str ) -> None:

        held: object = keys

        if not isinstance(held, Mapping) or not 0 < len(held) <= KEYS: raise Base.setting("keys")
        if not Base.label(active) or active not in keys: raise Base.setting("active")
        if not all(Base.label(name) for name in keys): raise Fault(Code.INTERNAL, reason="token.key")

    @staticmethod
    def secret ( value: str | bytes, least: int, *, exact: bool = False ) -> bytes:

        if type(value) not in (str, bytes): raise Fault(Code.INTERNAL, reason="token.secret")

        try: raw = value.encode() if isinstance(value, str) else value
        except UnicodeError as error: raise Fault(Code.INTERNAL, reason="token.secret") from error

        if len(raw) < least or len(raw) > LONGEST or (exact and len(raw) != least):

            raise Fault(Code.INTERNAL, reason="token.secret")

        return raw
