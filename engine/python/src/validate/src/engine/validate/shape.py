from collections.abc import Mapping
from dataclasses import fields, is_dataclass
from typing import Any, ClassVar, Self, cast

from engine.error import Bag, Code, Fault
from .arch import Member, REFUSED, SCALARS, UNKNOWN
import msgspec

class Shape(msgspec.Struct, kw_only=True, forbid_unknown_fields=True):

    _decoder : ClassVar[msgspec.json.Decoder[Any] | None] = None
    _fields  : ClassVar[tuple[str, ...] | None] = None
    _members : ClassVar[tuple[Member, ...] | None] = None
    strict   : ClassVar[bool] = False
    fillable : ClassVar[tuple[str, ...]] = ()
    hidden   : ClassVar[tuple[str, ...]] = ()

    @classmethod
    def decoder ( cls ) -> msgspec.json.Decoder[Any]:

        found = cls.__dict__.get("_decoder")

        if found is None:

            found = msgspec.json.Decoder(cls, strict=cls.strict)

            cls._decoder = found

        return cast("msgspec.json.Decoder[Any]", found)

    @classmethod
    def from_json ( cls, data: bytes | bytearray | memoryview | str ) -> Self:

        if isinstance(data, memoryview) and not data.c_contiguous: data = data.tobytes()

        try: return cast("Self", cls.decoder().decode(data))
        except msgspec.ValidationError as error: raise cls._fault_(error) from error
        except msgspec.DecodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed JSON", "validate.json") from error
        except UnicodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed text", "validate.encoding") from error

    @classmethod
    def from_mapping ( cls, payload: Mapping[str, Any] ) -> Self:

        try: return msgspec.convert(payload, cls, strict=cls.strict)
        except msgspec.ValidationError as error: raise cls._fault_(error) from error
        except UnicodeError as error: raise Fault(Code.BAD_REQUEST, "Malformed text", "validate.encoding") from error

    def dump ( self ) -> dict[str, Any]:

        found = cast("dict[str, Any]", msgspec.to_builtins(self))

        if self.hidden or any(type(value) not in SCALARS for value in found.values()): self._hide_(self, found)

        return found

    @staticmethod
    def _hide_ ( source: Any, target: Any ) -> None:

        if type(source) in SCALARS: return
        if isinstance(source, Shape): source._mask_(target)
        elif isinstance(source, msgspec.Struct) and isinstance(target, dict): Shape._struct_(source, target)
        elif is_dataclass(source) and isinstance(target, dict): Shape._record_(source, target)

        elif isinstance(source, Mapping) and isinstance(target, dict):

            for name, item in source.items():

                if name in target: Shape._hide_(item, target[name])

        elif isinstance(source, list | tuple | set | frozenset) and isinstance(target, list):

            for item, plain in zip(source, target, strict=True): Shape._hide_(item, plain)

    @staticmethod
    def _record_ ( source: Any, target: dict[str, Any] ) -> None:

        for item in fields(source):

            if item.name in target: Shape._hide_(getattr(source, item.name), target[item.name])

    @staticmethod
    def _struct_ ( source: msgspec.Struct, target: dict[str, Any] ) -> None:

        cls = type(source)

        for name, encoded in zip(cls.__struct_fields__, cls.__struct_encode_fields__, strict=True):

            if encoded in target: Shape._hide_(getattr(source, name), target[encoded])

    def _mask_ ( self, target: dict[str, Any] ) -> None:

        cls = type(self)

        for name, encoded in zip(cls.__struct_fields__, cls.__struct_encode_fields__, strict=True):

            if name in self.hidden or encoded in self.hidden: target.pop(encoded, None)
            elif encoded in target: Shape._hide_(getattr(self, name), target[encoded])

    def fill ( self, **changes: Any ) -> Self:

        guarded = sorted(set(changes) - set(self.fillable))

        if guarded:

            raise Fault(Code.VALIDATION, reason="validate.guarded", errors={ name: ["is guarded"] for name in guarded })

        return self.copy(**changes)

    def copy ( self, **changes: Any ) -> Self:

        cls = type(self)
        given = msgspec.structs.asdict(self)
        unknown = changes.keys() - given.keys()

        if unknown:

            raise Fault(
                Code.VALIDATION, reason="validate.shape", errors={ name: [REFUSED] for name in sorted(unknown) },
            )

        given.update(changes)
        if cls.__struct_fields__ != cls.__struct_encode_fields__:

            given = {
                encoded: given[name]
                for name, encoded in zip(cls.__struct_fields__, cls.__struct_encode_fields__, strict=True)
            }

        try: plain = msgspec.to_builtins(given)
        except (TypeError, ValueError, RecursionError) as error:

            raise Fault(Code.VALIDATION, reason="validate.shape", errors={"body": ["unsupported value"]}) from error

        return cls.from_mapping(plain)

    @classmethod
    def schema ( cls ) -> dict[str, Any]:

        return msgspec.json.schema(cls)

    @classmethod
    def fields ( cls ) -> tuple[str, ...]:

        found = cls.__dict__.get("_fields")

        if found is None:

            found = tuple(info.encode_name for info in msgspec.structs.fields(cls))

            cls._fields = found

        return cast("tuple[str, ...]", found)

    @classmethod
    def members ( cls ) -> tuple[Member, ...]:

        found = cls.__dict__.get("_members")

        if found is None:

            found = tuple(
                Member(info.name, info.type, None if info.default is msgspec.NODEFAULT else info.default)
                for info in msgspec.structs.fields(cls)
            )

            cls._members = found

        return cast("tuple[Member, ...]", found)

    @classmethod
    def _fault_ ( cls, error: msgspec.ValidationError ) -> Fault:

        text    = str(error)
        unknown = UNKNOWN.search(text)

        if unknown: return Fault(Code.VALIDATION, reason="validate.shape", errors={ unknown.group(1): [REFUSED] })

        field = text.rsplit(" at `$.", 1)[1].rstrip("`") if " at `$." in text else "body"
        bag   = Bag().add(field, text.split(" at `$.", maxsplit=1)[0].removesuffix(" -"))

        return Fault(Code.VALIDATION, reason="validate.shape", errors=bag.dump())
