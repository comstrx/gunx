from engine.error import Code, Fault
from datetime import UTC, datetime as DateTime
from .arch import LIMIT

class Base:

    __slots__ = ()

    @staticmethod
    def utc ( value: DateTime ) -> DateTime:

        if value.tzinfo is UTC: return value
        if value.tzinfo is None: return value.replace(tzinfo=UTC)

        try: return value.replace(tzinfo=UTC) if value.utcoffset() is None else value.astimezone(UTC)
        except OverflowError as error:

            details = { "value": [str(value)[:LIMIT]] }

            raise Fault(Code.BAD_REQUEST, "The date is out of range", "date.range", details) from error
