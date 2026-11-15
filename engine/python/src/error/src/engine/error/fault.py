from http import HTTPStatus
from typing import Self, override

from .arch import Errors, Headers, MAPPINGS, Missing
from .code import Code
import math

class Fault(Exception):

    __slots__ = ("code", "errors", "headers", "message", "reason", "retry_after", "status", "unknown")

    def __init__ (
        self, code: Code, message: str | None = None, reason: str | None = None, errors: Errors | None = None,
        status: HTTPStatus | None = None, *, retry_after: float | None = None, unknown: bool = False,
        headers: Headers | None = None,
    ) -> None:

        self.code        = code
        self.message     = message or code.message()
        self.reason      = reason
        self.errors      = { field: list(messages) for field, messages in errors.items() } if errors else None
        self.status      = status or code.status()
        self.retry_after = self._delay_(retry_after) if retry_after is not None else None
        self.unknown     = unknown
        self.headers     = dict(headers) if headers else None

        super().__init__(self.message)

    def server ( self ) -> bool:

        return self.status >= HTTPStatus.INTERNAL_SERVER_ERROR

    def client ( self ) -> bool:

        return HTTPStatus.BAD_REQUEST <= self.status < HTTPStatus.INTERNAL_SERVER_ERROR

    def retryable ( self ) -> bool:

        return self.code.transient()

    def safe ( self, idempotent: bool = False ) -> bool:

        return self.retryable() and (idempotent or not self.unknown)

    def because ( self, reason: str ) -> Fault:

        return self.copy(reason=reason)

    def saying ( self, message: str ) -> Fault:

        return self.copy(message=message)

    def copy (
        self, code: Code | None = None, message: str | Missing | None = Missing.VALUE,
        reason: str | Missing | None = Missing.VALUE, errors: Errors | Missing | None = Missing.VALUE,
        retry_after: float | Missing | None = Missing.VALUE, *, status: HTTPStatus | Missing | None = Missing.VALUE,
        unknown: bool | Missing = Missing.VALUE, headers: Headers | Missing | None = Missing.VALUE,
    ) -> Self:

        chosen = code or self.code

        if message is Missing.VALUE:

            message = chosen.message() if code is not None and self.message == self.code.message() else self.message

        if status is Missing.VALUE: status = chosen.status() if code is not None else self.status

        made = type(self)(
            chosen, message,
            self.reason if reason is Missing.VALUE else reason, self.errors if errors is Missing.VALUE else errors,
            status, retry_after=self.retry_after if retry_after is Missing.VALUE else retry_after,
            unknown=self.unknown if unknown is Missing.VALUE else unknown,
            headers=self.headers if headers is Missing.VALUE else headers,
        )

        made.__cause__            = self.__cause__
        made.__context__          = self.__context__
        made.__suppress_context__ = self.__suppress_context__

        for note in getattr(self, "__notes__", ()): made.add_note(note)

        return made

    def dump ( self ) -> dict[str, object]:

        errors = { field: list(messages) for field, messages in self.errors.items() } if self.errors else None

        return {
            "code"        : self.code.value,
            "message"     : self.message,
            "reason"      : self.reason,
            "errors"      : errors,
            "status"      : int(self.status),
            "retry_after" : self.retry_after,
            "unknown"     : self.unknown,
            "headers"     : dict(self.headers) if self.headers else None,
        }

    @classmethod
    def load ( cls, payload: object ) -> Self:

        if not isinstance(payload, MAPPINGS): raise cls._invalid_("payload")

        code    = payload.get("code", "")
        unknown = payload.get("unknown", True)

        if not isinstance(code, str): raise cls._invalid_("code")
        if type(unknown) is not bool: raise cls._invalid_("unknown")

        return cls(
            Code.parse(code) or Code.INTERNAL,
            cls._text_(payload.get("message"), "message"), cls._text_(payload.get("reason"), "reason"),
            cls._errors_(payload.get("errors")), cls._status_(payload.get("status")),
            retry_after=payload.get("retry_after"), unknown=unknown,
            headers=cls._headers_(payload.get("headers")),
        )

    @staticmethod
    def _text_ ( value: object, field: str ) -> str | None:

        if value is None or isinstance(value, str): return value

        raise Fault._invalid_(field)

    @staticmethod
    def _errors_ ( value: object ) -> Errors | None:

        if value is None: return None
        if isinstance(value, MAPPINGS) and all(
            isinstance(field, str) and isinstance(messages, list) and all(isinstance(text, str) for text in messages)
            for field, messages in value.items()
        ): return value

        raise Fault._invalid_("errors")

    @staticmethod
    def _headers_ ( value: object ) -> Headers | None:

        if value is None: return None
        if isinstance(value, MAPPINGS) and all(
            isinstance(key, str) and isinstance(text, str) for key, text in value.items()
        ):

            return value

        raise Fault._invalid_("headers")

    @staticmethod
    def _status_ ( value: object ) -> HTTPStatus | None:

        if value is None: return None
        if type(value) is not int and not isinstance(value, HTTPStatus): raise Fault._invalid_("status")

        try: return HTTPStatus(value)
        except ValueError as error: raise Fault._invalid_("status") from error

    @staticmethod
    def _delay_ ( value: object ) -> float | None:

        if value is None: return None

        if type(value) is float: delay = value
        else:

            if isinstance(value, bool) or not isinstance(value, (int, float)): raise Fault._invalid_("retry_after")

            try: delay = float(value)
            except OverflowError as error: raise Fault._invalid_("retry_after") from error

        if not math.isfinite(delay) or delay < 0: raise Fault._invalid_("retry_after")

        return delay

    @staticmethod
    def _invalid_ ( field: str ) -> Fault:

        return Fault(Code.VALIDATION, reason="error.payload", errors={ field: ["has an invalid value"] })

    @classmethod
    def wrap ( cls, error: BaseException, code: Code = Code.INTERNAL, reason: str | None = None ) -> Fault:

        if isinstance(error, Fault): return error

        made = cls(code, reason=reason or f"{type(error).__name__}".lower(), unknown=True)

        made.__cause__ = error

        return made

    @classmethod
    def _revive_ (
        cls, code: Code, message: str, reason: str | None, errors: Errors | None, status: HTTPStatus,
        retry_after: float | None, unknown: bool, headers: Headers | None,
    ) -> Self:

        return cls(code, message, reason, errors, status, retry_after=retry_after, unknown=unknown, headers=headers)

    @override
    def __reduce__ ( self ) -> tuple[object, ...]:

        held = (
            self.code, self.message, self.reason, self.errors, self.status, self.retry_after, self.unknown,
            self.headers,
        )

        state = self.__dict__.copy()

        if "__notes__" in state: state["__notes__"] = list(self.__notes__)

        return (type(self)._revive_, held, state)

    @override
    def __repr__ ( self ) -> str:

        return f"Fault({self.code.value}, reason={self.reason!r}, status={int(self.status)})"
