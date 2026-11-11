from collections.abc import Mapping
from typing import Any, ClassVar, Self, cast

from engine.error import Bag, Code, Fault
from .arch import Member, REFUSED, UNKNOWN
import msgspec

class Shape(msgspec.Struct, kw_only=True, forbid_unknown_fields=True):

    _decoders: ClassVar[dict[type, msgspec.json.Decoder[Any]]] = {}
    fillable : ClassVar[tuple[str, ...]] = ()
    hidden   : ClassVar[tuple[str, ...]] = ()

    @classmethod
    def decoder ( cls ) -> msgspec.json.Decoder[Any]:

        found = Shape._decoders.get(cls)

        if found is None:

            found = msgspec.json.Decoder(cls, strict=False)

            Shape._decoders[cls] = found

        return found

    @classmethod
    def from_json ( cls, data: bytes | str ) -> Self:

        try: return cast("Self", cls.decoder().decode(data if isinstance(data, bytes) else data.encode()))
        except msgspec.ValidationError as error: raise cls._fault_(error) from error
        except msgspec.DecodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed JSON", "validate.json") from error
        except UnicodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed text", "validate.encoding") from error

    @classmethod
    def from_mapping ( cls, payload: Mapping[str, Any] ) -> Self:

        try: return msgspec.convert(payload, cls, strict=False)
        except msgspec.ValidationError as error: raise cls._fault_(error) from error
        except UnicodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed text", "validate.encoding") from error

    def dump ( self ) -> dict[str, Any]:

        found = cast("dict[str, Any]", msgspec.to_builtins(self))

        return { name: value for name, value in found.items() if name not in self.hidden } if self.hidden else found

    def fill ( self, **changes: Any ) -> Self:

        guarded = sorted(set(changes) - set(self.fillable))

        if guarded:

            raise Fault(Code.VALIDATION, reason="validate.guarded", errors={ name: ["is guarded"] for name in guarded })

        return self.copy(**changes)

    def copy ( self, **changes: Any ) -> Self:

        return msgspec.structs.replace(self, **changes)

    @classmethod
    def schema ( cls ) -> dict[str, Any]:

        return msgspec.json.schema(cls)

    @classmethod
    def fields ( cls ) -> tuple[str, ...]:

        return tuple(info.encode_name for info in msgspec.structs.fields(cls))

    @classmethod
    def members ( cls ) -> tuple[Member, ...]:

        return tuple(
            Member(info.name, info.type, None if info.default is msgspec.NODEFAULT else info.default)
            for info in msgspec.structs.fields(cls)
        )

    @classmethod
    def _fault_ ( cls, error: msgspec.ValidationError ) -> Fault:

        text    = str(error)
        unknown = UNKNOWN.search(text)

        if unknown: return Fault(Code.VALIDATION, reason="validate.shape", errors={ unknown.group(1): [REFUSED] })

        field = text.rsplit(" at `$.", 1)[1].rstrip("`") if " at `$." in text else "body"
        bag   = Bag().add(field, text.split(" at `$.", maxsplit=1)[0].removesuffix(" -"))

        return Fault(Code.VALIDATION, reason="validate.shape", errors=bag.dump())
