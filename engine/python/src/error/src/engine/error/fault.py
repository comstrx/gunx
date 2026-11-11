from collections.abc import Mapping
from http import HTTPStatus
from typing import Self, override

from .arch import Errors, Headers
from .code import Code

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
        self.retry_after = retry_after
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
        self, code: Code | None = None, message: str | None = None, reason: str | None = None,
        errors: Errors | None = None, retry_after: float | None = None,
    ) -> Fault:

        chosen = code or self.code
        worded = message or (chosen.message() if self.message == self.code.message() else self.message)
        made   = Fault(
            chosen, worded, reason or self.reason, errors or self.errors, chosen.status() if code else self.status,
            retry_after=self.retry_after if retry_after is None else retry_after, unknown=self.unknown,
            headers=self.headers,
        )

        made.__cause__ = self.__cause__

        return made

    def dump ( self ) -> dict[str, object]:

        return {
            "code"    : self.code.value,
            "message" : self.message,
            "reason"  : self.reason,
            "errors"  : self.errors,
            "status"  : int(self.status),
        }

    @classmethod
    def load ( cls, payload: Mapping[str, object] ) -> Self:

        code   = Code.parse(str(payload.get("code", "")), Code.INTERNAL) or Code.INTERNAL
        raw    = payload.get("errors")
        errors = { str(k): [str(m) for m in v] for k, v in raw.items() } if isinstance(raw, Mapping) else None
        reason = payload.get("reason")

        return cls(code, str(payload.get("message") or "") or None, str(reason) if reason else None, errors)

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

        return (type(self)._revive_, held)

    @override
    def __repr__ ( self ) -> str:

        return f"Fault({self.code.value}, reason={self.reason!r}, status={int(self.status)})"
