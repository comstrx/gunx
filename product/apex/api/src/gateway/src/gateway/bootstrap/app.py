from collections.abc import Mapping

from contract import MESSAGES
from engine.auth import auth
from engine.http import App
from engine.log import log
from engine.metric import metrics
from engine.token import token
from engine.translate import translate

from ..app.controllers import DoorsController
from ..app.repositories import Doors
from ..app.services import Proxy
from ..config.app import ROOT, settings
from ..database.seeders.doors import rows
from ..routes.api import routes

def make ( upstreams: Mapping[str, str] | None = None ) -> App:

    log.setup(settings.log_level)
    metrics.setup(settings.name)
    translate.load(MESSAGES, ROOT / "resources" / "messages")
    token.setup(settings.token_secret, issuer=settings.issuer)
    auth.relay.setup(settings.edge_secret)

    targets = dict(upstreams or { "iam": settings.iam_url, "hello": settings.hello_url, "notify": settings.notify_url })
    proxy   = Proxy(Doors(rows()), targets, settings.name, settings.version)

    return (
        App(settings.name, settings.version, origins=tuple(settings.origins))
        .throttles(read="120/1m:ip", start="10/1m:ip", refresh="30/1m:ip")
        .routing(routes(DoorsController(proxy)))
        .public(ROOT / "public")
        .lifecycle(proxy.rows.run, proxy.run)
    )
