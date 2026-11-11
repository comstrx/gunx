from collections.abc import Mapping, Sequence
from typing import Any

from engine.error import Code, Fault
from .shape import Shape
import msgspec

class Validator:

    def __init__ ( self ) -> None:

        self._seen = 0

    def shape [T: Shape] ( self, kind: type[T], payload: object ) -> T:

        self._seen += 1

        if isinstance(payload, (bytes, bytearray, memoryview)): return kind.from_json(bytes(payload))
        if isinstance(payload, str): return kind.from_json(payload)
        if isinstance(payload, Mapping): return kind.from_mapping(payload)

        raise Fault(Code.BAD_REQUEST, reason="validate.payload")

    def convert ( self, kind: Any, payload: object ) -> Any:

        try: return msgspec.convert(payload, kind, strict=False)
        except msgspec.ValidationError as error: raise Fault(Code.VALIDATION, str(error), "validate.convert") from error
        except UnicodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed text", "validate.encoding") from error

    def components ( self, shapes: Sequence[type[Shape]], template: str ) -> dict[str, Any]:

        return msgspec.json.schema_components(shapes, ref_template=template)[1] if shapes else {}

    def stats ( self ) -> dict[str, int]:

        return { "seen": self._seen }

validator = Validator()
