from enum import StrEnum
from http import HTTPStatus

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

        found = STATUSES.get(status)

        if found is not None: return found
        if status >= HTTPStatus.INTERNAL_SERVER_ERROR: return cls.INTERNAL
        if status >= HTTPStatus.BAD_REQUEST: return cls.BAD_REQUEST

        return cls.OK

    @classmethod
    def parse ( cls, text: str, default: Code | None = None ) -> Code | None:

        wanted = text.strip().lower().replace("-", "_").replace(" ", "_")

        return next((code for code in cls if code.value == wanted), default)

    @classmethod
    def failures ( cls ) -> tuple[Code, ...]:

        return tuple(code for code in cls if not code.success())

TABLE: dict[Code, tuple[HTTPStatus, str]] = {
    Code.OK                    : (HTTPStatus.OK, "Done"),
    Code.CREATED               : (HTTPStatus.CREATED, "Created"),
    Code.ACCEPTED              : (HTTPStatus.ACCEPTED, "Accepted"),
    Code.NO_CONTENT            : (HTTPStatus.NO_CONTENT, "Nothing to return"),
    Code.BAD_REQUEST           : (HTTPStatus.BAD_REQUEST, "The request is malformed"),
    Code.UNAUTHORIZED          : (HTTPStatus.UNAUTHORIZED, "Authentication is required"),
    Code.PAYMENT_REQUIRED      : (HTTPStatus.PAYMENT_REQUIRED, "Payment is required"),
    Code.FORBIDDEN             : (HTTPStatus.FORBIDDEN, "This action is not allowed"),
    Code.NOT_FOUND             : (HTTPStatus.NOT_FOUND, "The resource was not found"),
    Code.METHOD_NOT_ALLOWED    : (HTTPStatus.METHOD_NOT_ALLOWED, "The method is not allowed"),
    Code.NOT_ACCEPTABLE        : (HTTPStatus.NOT_ACCEPTABLE, "No acceptable representation exists"),
    Code.REQUEST_TIMEOUT       : (HTTPStatus.REQUEST_TIMEOUT, "The request took too long to arrive"),
    Code.CONFLICT              : (HTTPStatus.CONFLICT, "The request conflicts with the current state"),
    Code.GONE                  : (HTTPStatus.GONE, "The resource is gone"),
    Code.PRECONDITION_FAILED   : (HTTPStatus.PRECONDITION_FAILED, "The resource changed since it was read"),
    Code.TOO_LARGE             : (HTTPStatus.CONTENT_TOO_LARGE, "The request is too large"),
    Code.UNSUPPORTED_MEDIA     : (HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "The content type is not supported"),
    Code.VALIDATION            : (HTTPStatus.UNPROCESSABLE_CONTENT, "The given data is invalid"),
    Code.LOCKED                : (HTTPStatus.LOCKED, "The resource is locked"),
    Code.PRECONDITION_REQUIRED : (HTTPStatus.PRECONDITION_REQUIRED, "The request must be conditional"),
    Code.TOO_MANY_REQUESTS     : (HTTPStatus.TOO_MANY_REQUESTS, "Too many requests"),
    Code.INTERNAL              : (HTTPStatus.INTERNAL_SERVER_ERROR, "Something went wrong"),
    Code.NOT_IMPLEMENTED       : (HTTPStatus.NOT_IMPLEMENTED, "This is not implemented"),
    Code.BAD_GATEWAY           : (HTTPStatus.BAD_GATEWAY, "An upstream answered badly"),
    Code.UNAVAILABLE           : (HTTPStatus.SERVICE_UNAVAILABLE, "The service is unavailable"),
    Code.TIMEOUT               : (HTTPStatus.GATEWAY_TIMEOUT, "The operation timed out"),
}
STATUSES  = { int(status): code for code, (status, _) in TABLE.items() }
TRANSIENT = frozenset({
    Code.REQUEST_TIMEOUT, Code.LOCKED, Code.TOO_MANY_REQUESTS, Code.BAD_GATEWAY, Code.UNAVAILABLE, Code.TIMEOUT,
})
