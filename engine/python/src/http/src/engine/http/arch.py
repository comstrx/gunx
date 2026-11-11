from collections.abc import Awaitable, Callable, Mapping
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from http import HTTPStatus
from itertools import count
from typing import Any, TYPE_CHECKING

from multidict import istr
from sanic import HTTPResponse
from sanic.response import ResponseStream
from engine.error import Code, Fault
import inspect, re

if TYPE_CHECKING:

    from .channel import Channel
    from .group import Group
    from .request import Request
    from .route import Route

type Lifecycle = Callable[[], AbstractAsyncContextManager[Any]]
type Renderer = Callable[[Request, Fault], Awaitable[Answer | None]]
type Mountable = Route | Group | Channel

type Guard = Callable[[Request], Awaitable[None]]
type Next = Callable[[Request], Awaitable[Answer]]
type Middleware = Callable[[Request, Next], Awaitable[Answer]]

type Call = Callable[..., Awaitable[Any]]

type Answer = HTTPResponse | ResponseStream
type Meta = Mapping[str, object]
type Headers = Mapping[str, str]

type Handler = Callable[..., Awaitable[Any]]
type Bound = Callable[..., Awaitable[Answer]]
type Resolver = Callable[[Request, Mapping[str, Any]], Any]
type Plan = list[tuple[str, Resolver]]

type Upgraded = Callable[..., Awaitable[None]]

PHASES    = ("trace", "down", "preflight", "actor", "throttle", "guards", "middleware", "handler", "render", "stamp")
INSTANCES = count(1)

KINDS    = { "int": "integer", "float": "number", "uuid": "string", "str": "string", "path": "string" }
ENVELOPE = "#/components/schemas/Envelope"
ERRORS   = { "type": ["object", "null"], "additionalProperties": { "type": "array", "items": { "type": "string" } } }
SCHEMA   = {
    "type"       : "object",
    "required"   : ["data", "message", "errors", "code", "reason", "meta"],
    "properties" : {
        "data"    : {},
        "message" : { "type": "string" },
        "errors"  : ERRORS,
        "code"    : { "type": "string", "enum": [code.value for code in Code] },
        "reason"  : { "type": ["string", "null"] },
        "meta"    : {
            "type": "object", "required": ["request_id"], "properties": { "request_id": { "type": "string" } },
        },
    },
}
TRACED   = { "X-Request-Id": { "schema": { "type": "string" }, "description": "The correlation id" } }
WAIT     = { "Retry-After": { "schema": { "type": "integer" }, "description": "Seconds to wait" } }

SECURITY = {
    "X-Content-Type-Options" : "nosniff",
    "X-Frame-Options"        : "DENY",
    "Referrer-Policy"        : "no-referrer",
    "Cache-Control"          : "no-store",
}
EXPOSED  = "X-Request-Id, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining"
FIXED    = tuple((name.encode(), value.encode()) for name, value in SECURITY.items())
CACHED   = tuple(pair for pair in FIXED if pair[0] != b"Cache-Control")
HEADERS  = ("Accept", "Accept-Language", "Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id")
METHODS  = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
AGE      = "600"
IDENTITY = 64
BACKLOG  = 1024
REFUSED  = 400
DEFERRED = "http.deferred"
TRACE    = istr("X-Request-Id")
BEARER   = istr("Authorization")
ORIGIN   = istr("Origin")
LANGUAGE = istr("Accept-Language")
CACHE    = istr("Cache-Control")
MEDIA    = istr("content-type")
ASKED    = istr("Access-Control-Request-Method")
UNIQUE   = (istr("authorization"), istr("content-length"), istr("host"))

PRIVATE = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1/128", "fc00::/7")
NAMED   = 256

names: dict[str, bytes] = {}

CARRIED: dict[str, Callable[[Request], Any]] = {
    "request"     : lambda request: request,
    "locale"      : lambda request: request.locale(),
    "principal"   : lambda request: getattr(request.ctx, "principal", None),
    "actor"       : lambda request: request.actor(),
    "bearer"      : lambda request: request.bearer(),
    "fingerprint" : lambda request: request.fingerprint(),
    "client"      : lambda request: request.client(),
    "trace"       : lambda request: request.trace(),
}

JSON      = "application/json"
TEXT      = "text/plain; charset=utf-8"
CHALLENGE = "Bearer"
WORDS: dict[tuple[str, int, str], str] = {}
KEPT      = 4096
BODILESS  = frozenset({ HTTPStatus.NO_CONTENT, HTTPStatus.NOT_MODIFIED })
ANSWERS   = (HTTPResponse, ResponseStream)

ALL     = ("GET", "POST", "PUT", "PATCH", "DELETE")
KNOWN   = frozenset({ *ALL, "HEAD", "OPTIONS" })
KEYS    = frozenset({ "ip", "actor" })
NAME    = 128
HOUR    = 3600
SPREAD  = frozenset({ inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD })
BODIES  = frozenset({ "POST", "PUT", "PATCH" })
SKIP    = object()
PARAM         = re.compile(r"<(\w+)(?::(\w+))?>")
ACTIONS = (
    ("index", ("GET",), ""), ("store", ("POST",), ""), ("show", ("GET",), "/<key>"),
    ("update", ("PUT", "PATCH"), "/<key>"), ("destroy", ("DELETE",), "/<key>"),
)

@dataclass(frozen=True, slots=True)
class Limits:

    body_bytes       : int = 1024 * 1024
    header_bytes     : int = 16384
    request_seconds  : int = 30
    response_seconds : int = 60
    keepalive_seconds: int = 15
    shutdown_seconds : int = 10
    socket_bytes     : int = 65536
    concurrency      : int = 0
    admission_seconds: float = 1.0

    def __post_init__ ( self ) -> None:

        counts = (
            self.body_bytes, self.header_bytes, self.request_seconds, self.response_seconds, self.keepalive_seconds,
            self.shutdown_seconds, self.socket_bytes,
        )
        wait: object = self.admission_seconds

        if not all(type(count) is int and count > 0 for count in counts): raise self._wrong_()
        if type(self.concurrency) is not int or self.concurrency < 0: raise self._wrong_()
        if not isinstance(wait, int | float) or type(wait) is bool or not 0 < wait <= HOUR: raise self._wrong_()

    @staticmethod
    def _wrong_ () -> Fault:

        return Fault(Code.INTERNAL, reason="http.limits")
