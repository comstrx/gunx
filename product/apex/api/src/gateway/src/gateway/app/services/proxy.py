from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from typing import Any

from engine.auth import auth
from engine.error import Code, Fault
from engine.health import health
from engine.http import Answer, Request, Response
from engine.json import json
from engine.net import Egress, net

from ..repositories import Doors
from ..resources import DoorResource
from ..utils.cycle import Service

HOP      = frozenset({ "host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade" })
RETURNED = ("content-type", "cache-control", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining")

class Proxy(Service[Doors]):

    resource = DoorResource

    def __init__ (
        self, rows: Doors, upstreams: Mapping[str, str], title: str, version: str, timeout: float = 5.0,
    ) -> None:

        super().__init__(rows)

        self._upstreams = dict(upstreams)
        self._egress    = Egress(allow_private=True, ports=frozenset())
        self._title     = title
        self._version   = version
        self._timeout   = timeout

    def table ( self ) -> list[dict[str, Any]]:

        return self.resource.many(self.rows.snapshot())

    async def doors ( self ) -> list[dict[str, Any]]:

        return self.resource.many(await self.rows.all())

    def upstream ( self, service: str ) -> str:

        found = self._upstreams.get(service)

        if not found: raise Fault(Code.UNAVAILABLE, reason="gateway.upstream", errors={ "service": [service] })

        return found.rstrip("/")

    async def forward ( self, request: Request, key: str ) -> Answer:

        door  = await self.rows.need(key)
        actor = await auth.alive(request) if request.bearer() is not None else None

        if not door.public() and actor is None: raise Fault(Code.UNAUTHORIZED, reason="auth.missing")

        if door.scope and (actor is None or not actor.can(door.scope)):

            raise Fault(Code.FORBIDDEN, reason="auth.scope", errors={ "scope": [door.scope] })

        target  = door.target

        for name, value in request.params().items(): target = target.replace(f"<{name}>", net.segment(value))

        dropped = HOP | auth.relay.names()
        headers = { name: value for name, value in request.headers.items() if name.lower() not in dropped }

        headers.update(auth.relay.sign(actor, request.trace()))
        headers["X-Forwarded-For"] = request.client()

        try:

            search = f"?{request.query_string}" if request.query_string else ""
            url    = f"{self.upstream(door.service)}{target}{search}"
            reply  = await net.request(
                request.method, url, headers=headers, body=request.body or None,
                timeout=self._timeout, egress=self._egress,
            )

        except Fault as fault:

            if fault.code not in (Code.TIMEOUT, Code.UNAVAILABLE, Code.FORBIDDEN): raise

            raise Fault(Code.UNAVAILABLE, reason="gateway.upstream", errors={ "service": [door.service] }) from fault

        kept = { name: value for name, value in reply.headers.items() if name.lower() in RETURNED }

        return Response.raw(reply.body, reply.status, kept.get("content-type", "application/json"), kept)

    async def gathered ( self ) -> dict[str, Any]:

        paths: dict[str, object] = {}

        for service in self.rows.services():

            if not self._upstreams.get(service): continue

            source = f"{self.upstream(service)}/openapi.json"

            try: reply = await net.request("GET", source, timeout=3.0, egress=self._egress)
            except Fault: continue

            found = reply.json() if reply.ok() else None
            body  = found.get("data", found) if isinstance(found, dict) else {}
            known = body.get("paths", {}) if isinstance(body, dict) else {}
            doors = self.rows.targets(service)

            paths.update({ path: operations for path, operations in known.items() if path in doors })

        info = { "title": self._title, "version": self._version }

        return { "openapi": "3.1.0", "info": info, "paths": json.plain(paths) }

    @asynccontextmanager
    async def run ( self ) -> AsyncIterator[None]:

        health.fact(upstreams=sorted(self._upstreams))

        yield
