from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from contract import MESSAGES, SCOPES
from engine.auth import auth
from engine.broker import Rabbit, broker
from engine.database import Database, Migrator, Outbox, POSTGRES
from engine.event import events
from engine.http import App
from engine.log import log
from engine.metric import metrics
from engine.token import token
from engine.translate import translate

from ..app.controllers import SessionsController
from ..app.repositories import Memberships, Sessions as SessionRows, Tenants, Users
from ..app.services import Sessions
from ..config.app import ROOT, settings
from ..database.migrations import TABLES, inbox, ledger, outbox as outbox_table
from ..database.seeders import memberships as member_seed, tenants as tenant_seed, users as user_seed
from ..routes.api import routes

def make () -> App:

    log.setup(settings.log_level)
    metrics.setup(settings.name)
    translate.load(MESSAGES, ROOT / "resources" / "messages")
    token.setup(settings.token_secret, issuer=settings.issuer)
    auth.setup(roles=dict(SCOPES), fixed_code=settings.fixed_code)

    if settings.amqp_url: broker.setup(Rabbit(settings.amqp_url))

    database    = Database()
    users       = Users(database)
    tenants     = Tenants(database)
    memberships = Memberships(database)
    sessions    = SessionRows(database)
    outbox      = Outbox(database, table=outbox_table)
    service     = Sessions(users, tenants, memberships, sessions)

    events.setup(settings.name, broker)
    events.durable(outbox, database, inbox)

    @asynccontextmanager
    async def storage () -> AsyncIterator[None]:

        await database.connect(
            settings.database_url, application=settings.name, search_path=settings.database_schema,
            ssl=settings.database_ssl or None,
        )

        try:

            await database.execute(f"CREATE SCHEMA IF NOT EXISTS {POSTGRES.ident(settings.database_schema)}")
            await Migrator(database, TABLES, ledger).apply()

            if await users.count() == 0:

                await tenants.insert_many([row.dump() for row in tenant_seed.rows()])
                await users.insert_many([row.dump() for row in user_seed.rows()])

                for row in member_seed.rows():

                    async with database.transaction(tenant=row.tenant_id): await memberships.create(**row.dump())

            outbox.start()

            yield

        finally:

            await outbox.stop()
            await database.close()

    return (
        App(settings.name, settings.version)
        .throttles(start="10/1m:ip", refresh="30/1m:ip")
        .routing(routes(SessionsController(service)))
        .public(ROOT / "public")
        .lifecycle(storage, users.run)
    )
