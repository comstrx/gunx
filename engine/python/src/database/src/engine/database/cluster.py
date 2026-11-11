from typing import Any

from engine.error import Code, Fault
from engine.log import log
from .arch import POSTGRES_FAILURES, Provision
from .postgres import POSTGRES
from .postgresdriver import PostgresDriver
import asyncpg

class Cluster:

    async def provision ( self, plan: Provision, wait: float = 10.0 ) -> dict[str, bool]:

        if plan.role == plan.admin: raise Fault(Code.INTERNAL, reason="provision.role")

        made = { "role": False, "database": False }

        try:

            admin = await self._connect_(plan, plan.maintenance, wait)

        except POSTGRES_FAILURES as error: raise PostgresDriver.fault(error) from error

        try:

            role   = POSTGRES.ident(plan.role)
            secret = self._literal_(plan.secret)

            if not await admin.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", plan.role):

                flags = "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"

                await admin.execute(f"CREATE ROLE {role} {flags} PASSWORD {secret}")

                made["role"] = True

            else: await admin.execute(f"ALTER ROLE {role} NOSUPERUSER NOBYPASSRLS PASSWORD {secret}")

            if not await admin.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", plan.database):

                await admin.execute(f"CREATE DATABASE {POSTGRES.ident(plan.database)} OWNER {role}")

                made["database"] = True

        except POSTGRES_FAILURES as error: raise PostgresDriver.fault(error) from error
        finally: await admin.close()

        await self.extensions(plan, wait)

        log.info("database.provisioned", role=plan.role, database=plan.database, **made)

        return made

    async def extensions ( self, plan: Provision, wait: float = 10.0 ) -> int:

        try:

            owner = await self._connect_(plan, plan.database, wait)

        except POSTGRES_FAILURES as error: raise PostgresDriver.fault(error) from error

        try:

            for extension in plan.extensions:

                await owner.execute(f"CREATE EXTENSION IF NOT EXISTS {POSTGRES.ident(extension)}")

        except POSTGRES_FAILURES as error: raise PostgresDriver.fault(error) from error
        finally: await owner.close()

        return len(plan.extensions)

    async def bypasses ( self, url: str ) -> bool:

        try: connection = await asyncpg.connect(url)
        except POSTGRES_FAILURES as error: raise PostgresDriver.fault(error) from error

        query = "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user"

        try: return bool(await connection.fetchval(query))
        finally: await connection.close()

    async def _connect_ ( self, plan: Provision, database: str, wait: float ) -> asyncpg.Connection[Any]:

        return await asyncpg.connect(
            host=plan.host, port=plan.port, user=plan.admin, password=plan.password or None, database=database,
            timeout=wait,
        )

    def _literal_ ( self, text: str ) -> str:

        return "'" + text.replace("'", "''") + "'"
