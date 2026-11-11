from dataclasses import dataclass
from typing import Any

from engine.json import json
import ipaddress

MAX_BODY  = 8 * 1024 * 1024
LINE      = 1024 * 1024
EVENT     = 4 * 1024 * 1024
TIMEOUT   = 10.0
LONGEST   = 3_600.0
VERB      = 16
REDIRECTS = 3
SCHEMES   = ("http", "https")
PRIVATE   = "net.private"
MOVED     = frozenset({ 301, 302, 303, 307, 308 })
REWRITTEN = frozenset({ 301, 302 })
SEE_OTHER = 303
CARRIED   = frozenset({
    "accept", "accept-encoding", "accept-language", "content-encoding", "content-language", "content-type",
    "user-agent",
})
BODILY    = frozenset({ "content-encoding", "content-language", "content-length", "content-type", "transfer-encoding" })
EMBEDDED  = (ipaddress.ip_network("64:ff9b::/96"), ipaddress.ip_network("::/96"))
LOW_BITS  = 0xFFFFFFFF
OK_LOW    = 200
OK_HIGH   = 300
THROTTLED = 429
SERVER    = 500
IDEMPOTENT = frozenset({ "GET", "HEAD", "PUT", "DELETE" })

STATUSES = {
    400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 422: "validation",
    429: "too_many_requests",
}

@dataclass(frozen=True, slots=True)
class Reply:

    status  : int
    headers : dict[str, str]
    body    : bytes
    url     : str
    ms      : float
    attempts: int = 1

    def ok ( self ) -> bool:

        return OK_LOW <= self.status < OK_HIGH

    def json ( self ) -> Any:

        return json.decode(self.body) if self.body else None

    def text ( self ) -> str:

        return self.body.decode("utf-8", "replace")
