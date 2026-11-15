from enum import StrEnum
from http import HTTPStatus
from typing import cast
from .arch import STATUSES, TABLE, TRANSIENT

class Code(StrEnum):

    OK                    = "ok"
    CREATED               = "created"
    ACCEPTED              = "accepted"
    NO_CONTENT            = "no_content"
    BAD_REQUEST           = "bad_request"
    UNAUTHORIZED          = "unauthorized"
    PAYMENT_REQUIRED      = "payment_required"
    FORBIDDEN             = "forbidden"
    NOT_FOUND             = "not_found"
    METHOD_NOT_ALLOWED    = "method_not_allowed"
    NOT_ACCEPTABLE        = "not_acceptable"
    REQUEST_TIMEOUT       = "request_timeout"
    CONFLICT              = "conflict"
    GONE                  = "gone"
    PRECONDITION_FAILED   = "precondition_failed"
    TOO_LARGE             = "too_large"
    UNSUPPORTED_MEDIA     = "unsupported_media"
    VALIDATION            = "validation"
    LOCKED                = "locked"
    PRECONDITION_REQUIRED = "precondition_required"
    TOO_MANY_REQUESTS     = "too_many_requests"
    INTERNAL              = "internal"
    NOT_IMPLEMENTED       = "not_implemented"
    BAD_GATEWAY           = "bad_gateway"
    UNAVAILABLE           = "unavailable"
    TIMEOUT               = "timeout"

    def status ( self ) -> HTTPStatus:

        return TABLE[self][0]

    def message ( self ) -> str:

        return TABLE[self][1]

    def success ( self ) -> bool:

        return self.status() < HTTPStatus.BAD_REQUEST

    def client ( self ) -> bool:

        return HTTPStatus.BAD_REQUEST <= self.status() < HTTPStatus.INTERNAL_SERVER_ERROR

    def server ( self ) -> bool:

        return self.status() >= HTTPStatus.INTERNAL_SERVER_ERROR

    def transient ( self ) -> bool:

        return self in TRANSIENT

    @classmethod
    def of ( cls, status: int ) -> Code:

        if not isinstance(cast("object", status), int) or status < HTTPStatus.CONTINUE: return cls.INTERNAL

        found = STATUSES.get(status)

        if found is not None: return cls(found)
        if status >= HTTPStatus.INTERNAL_SERVER_ERROR: return cls.INTERNAL
        if status >= HTTPStatus.BAD_REQUEST: return cls.BAD_REQUEST

        return cls.OK

    @classmethod
    def parse ( cls, text: str, default: Code | None = None ) -> Code | None:

        wanted = text.strip().lower().replace("-", "_").replace(" ", "_")

        return cls(wanted) if wanted in TABLE else default

    @classmethod
    def failures ( cls ) -> tuple[Code, ...]:

        return tuple(code for code in cls if not code.success())
