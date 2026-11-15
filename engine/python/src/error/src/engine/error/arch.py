from http import HTTPStatus
from enum import Enum
from collections.abc import Mapping

type Errors = Mapping[str, list[str]]
type Headers = Mapping[str, str]

MAPPINGS = (dict, Mapping)

class Missing(Enum):

    VALUE = 0

TABLE: dict[str, tuple[HTTPStatus, str]] = {
    "ok"                    : (HTTPStatus.OK, "Done"),
    "created"               : (HTTPStatus.CREATED, "Created"),
    "accepted"              : (HTTPStatus.ACCEPTED, "Accepted"),
    "no_content"            : (HTTPStatus.NO_CONTENT, "Nothing to return"),
    "bad_request"           : (HTTPStatus.BAD_REQUEST, "The request is malformed"),
    "unauthorized"          : (HTTPStatus.UNAUTHORIZED, "Authentication is required"),
    "payment_required"      : (HTTPStatus.PAYMENT_REQUIRED, "Payment is required"),
    "forbidden"             : (HTTPStatus.FORBIDDEN, "This action is not allowed"),
    "not_found"             : (HTTPStatus.NOT_FOUND, "The resource was not found"),
    "method_not_allowed"    : (HTTPStatus.METHOD_NOT_ALLOWED, "The method is not allowed"),
    "not_acceptable"        : (HTTPStatus.NOT_ACCEPTABLE, "No acceptable representation exists"),
    "request_timeout"       : (HTTPStatus.REQUEST_TIMEOUT, "The request took too long to arrive"),
    "conflict"              : (HTTPStatus.CONFLICT, "The request conflicts with the current state"),
    "gone"                  : (HTTPStatus.GONE, "The resource is gone"),
    "precondition_failed"   : (HTTPStatus.PRECONDITION_FAILED, "The resource changed since it was read"),
    "too_large"             : (HTTPStatus.CONTENT_TOO_LARGE, "The request is too large"),
    "unsupported_media"     : (HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "The content type is not supported"),
    "validation"            : (HTTPStatus.UNPROCESSABLE_CONTENT, "The given data is invalid"),
    "locked"                : (HTTPStatus.LOCKED, "The resource is locked"),
    "precondition_required" : (HTTPStatus.PRECONDITION_REQUIRED, "The request must be conditional"),
    "too_many_requests"     : (HTTPStatus.TOO_MANY_REQUESTS, "Too many requests"),
    "internal"              : (HTTPStatus.INTERNAL_SERVER_ERROR, "Something went wrong"),
    "not_implemented"       : (HTTPStatus.NOT_IMPLEMENTED, "This is not implemented"),
    "bad_gateway"           : (HTTPStatus.BAD_GATEWAY, "An upstream answered badly"),
    "unavailable"           : (HTTPStatus.SERVICE_UNAVAILABLE, "The service is unavailable"),
    "timeout"               : (HTTPStatus.GATEWAY_TIMEOUT, "The operation timed out"),
}
STATUSES  = { int(status): code for code, (status, _) in TABLE.items() }
TRANSIENT = frozenset({
    "request_timeout", "locked", "too_many_requests", "bad_gateway", "unavailable", "timeout",
})
