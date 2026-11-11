from collections.abc import AsyncIterator, Mapping
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any

from engine.broker import Memory as MemoryBroker, broker
from engine.cache import Memory as MemoryCache, Redis, cache
from engine.config import env
from engine.crypto import crypto
from engine.database import database
from engine.health import health
from engine.http import App, Request, Response, Route
from engine.log import log
from engine.metric import MEDIA, metrics
from engine.net import net
from engine.rand import rand
from engine.token import token
from .arch import AMQP, DATABASE, REDIS
from .client import Client

class Stage:

    def __init__ ( self ) -> None:

        self._secret = rand.token(48)

    def database_url ( self ) -> str:

        return env.text("ENGINE_DATABASE_URL", DATABASE)

    def redis_url ( self ) -> str:

        return env.text("ENGINE_REDIS_URL", REDIS)

    def amqp_url ( self ) -> str:

        return env.text("ENGINE_AMQP_URL", AMQP)

    def wire ( self, secret: str | None = None, redis: bool = False ) -> None:

        log.setup(env.text("LOG_LEVEL", "warning"))
        crypto.setup([crypto.key("stage")])
        token.setup(secret or self._secret, issuer="stage")
        cache.use(Redis(self.redis_url(), prefix="engine-stage:") if redis else MemoryCache())
        broker.setup(MemoryBroker())
        metrics.setup("engine")

    async def provision ( self ) -> None:

        if not database.ready():
            await database.connect(
                self.database_url(), min_size=1, max_size=4, application="engine-stage", ssl="disable",
            )

        health.register("database", database.ping)
        health.register("cache", cache.ping, critical=False)

    def application ( self, *routes: Route, name: str = "Stage", origins: tuple[str, ...] = () ) -> App:

        app = App(name, "0.0.0", origins=origins)

        async def exposition ( request: Request ) -> Any:

            return Response.text(metrics.render(), media=MEDIA)

        app.probes()
        app.mount(Route.get("/metrics", exposition, "metrics").hide(), *routes)

        return app

    @asynccontextmanager
    async def client ( self, app: App, headers: Mapping[str, str] | None = None ) -> AsyncIterator[Client]:

        async with app.listen() as url: yield Client(url, headers)

    async def close ( self ) -> None:

        async with AsyncExitStack() as stack:

            stack.callback(health.clear)

            for shut in (net.close, broker.close, database.close, cache.close): stack.push_async_callback(shut)
