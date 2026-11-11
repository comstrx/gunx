from contract import MESSAGES
from engine.auth import auth
from engine.http import App
from engine.log import log
from engine.metric import metrics
from engine.translate import translate

from ..app.controllers import HelloController
from ..app.repositories import Greetings
from ..app.services import Greeter
from ..config.app import ROOT, settings
from ..database.seeders.greetings import rows
from ..routes.api import routes

def make () -> App:

    log.setup(settings.log_level)
    metrics.setup(settings.name)
    translate.load(MESSAGES, ROOT / "resources" / "messages")
    auth.relay.setup(settings.edge_secret)

    greetings = Greetings(rows())

    return (
        App(settings.name, settings.version)
        .throttles(read="120/1m:ip")
        .routing(routes(HelloController(Greeter(greetings))))
        .public(ROOT / "public")
        .lifecycle(greetings.run)
    )
