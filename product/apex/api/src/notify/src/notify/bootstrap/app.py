from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from contract import MESSAGES
from engine.auth import auth
from engine.broker import Rabbit, broker
from engine.database import Database, Migrator, Outbox, POSTGRES
from engine.event import Events
from engine.http import App
from engine.log import log
from engine.metric import metrics
from engine.notify import Log, notify
from engine.queue import queue
from engine.translate import translate

from ..app.controllers import InboxController
from ..app.listeners import SessionListener
from ..app.repositories import Devices, Notices
from ..app.services import Inbox
from ..config.app import ROOT, settings
from ..database.migrations import TABLES, inbox as inbox_table, ledger, outbox as outbox_table
from ..routes.api import routes

QUEUE = "notify"

def make () -> App:

    log.setup(settings.log_level)
    metrics.setup(settings.name)
    translate.load(MESSAGES, ROOT / "resources" / "messages")
    auth.relay.setup(settings.edge_secret)

    if settings.amqp_url: broker.setup(Rabbit(settings.amqp_url))
    if not notify.ready(): notify.setup(Log())

    database = Database()
    notices  = Notices(database)
    devices  = Devices(database)
    outbox   = Outbox(database, table=outbox_table)
    service  = Inbox(notices, devices)
    listener = SessionListener(service)
    bus      = Events()

    bus.setup(settings.name, broker)
    bus.durable(outbox, database, inbox_table)
    bus.listen("iam.session.started", listener.started)

    queue.clear()
    queue.setup(broker, queues=(QUEUE,))
    queue.durable(outbox)
    queue.task("notify.push", queue=QUEUE, tries=3, backoff=0.5)(service.push)

    @asynccontextmanager
    async def storage () -> AsyncIterator[None]:

        await database.connect(
            settings.database_url, application=settings.name, search_path=settings.database_schema,
            ssl=settings.database_ssl or None,
        )

        try:

            await database.execute(f"CREATE SCHEMA IF NOT EXISTS {POSTGRES.ident(settings.database_schema)}")
            await Migrator(database, TABLES, ledger).apply()
            await bus.declare("iam.*")
            await queue.declare()

            outbox.start()
            bus.start()
            queue.start([QUEUE])

            yield

        finally:

            await queue.stop()
            await bus.stop()
            await outbox.stop()
            await database.close()

    return (
        App(settings.name, settings.version)
        .throttles(read="120/1m:actor")
        .routing(routes(InboxController(service)))
        .public(ROOT / "public")
        .lifecycle(storage, notices.run)
    )
