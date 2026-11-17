from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager

from contract import MESSAGES
from engine.auth import auth
from engine.broadcast import broadcast
from engine.cache import Redis, cache
from engine.http import App, Limits
from engine.log import log
from engine.metric import metrics
from engine.socket import sockets
from engine.token import token
from engine.translate import translate

from ..app.controllers import DoorsController
from ..app.repositories import Doors
from ..app.services import Live, Proxy
from ..config.app import ROOT, settings
from ..database.seeders.doors import rows
from ..routes.api import routes

def make ( upstreams: Mapping[str, str] | None = None ) -> App:

    log.setup(settings.log_level)
    metrics.setup(settings.name)
    translate.load(MESSAGES, ROOT / "resources" / "messages")
    token.setup(settings.token_secret, issuer=settings.issuer)
    auth.relay.setup(settings.edge_secret)

    if settings.cache_url: cache.use(Redis(settings.cache_url, prefix="edge:"))

    sockets.setup(rate=30, channels=32)
    broadcast.setup(sockets.hub, settings.cache_url or None)

    live    = Live(sockets)
    targets = dict(upstreams or { "iam": settings.iam_url, "hello": settings.hello_url, "notify": settings.notify_url })
    proxy   = Proxy(Doors(rows()), targets, settings.name, settings.version)

    @asynccontextmanager
    async def relay () -> AsyncIterator[None]:

        broadcast.start()

        try: yield
        finally:

            await sockets.hub.close_all()
            await broadcast.close()

    return (
        App(
            settings.name, settings.version, Limits(body_bytes=32 * 1024 * 1024), origins=tuple(settings.origins),
            headers=("X-Client", "X-Tenant", "X-Currency"),
        )
        .throttles(read="120/1m:ip", start="10/1m:ip", refresh="30/1m:ip")
        .routing(routes(DoorsController(proxy)), live.channel())
        .public(ROOT / "public")
        .lifecycle(proxy.rows.run, proxy.run, relay)
    )
