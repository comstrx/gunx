from typing import Any, TYPE_CHECKING

from engine.error import Code, Fault
from engine.log import log
from .arch import VALIDATION

if TYPE_CHECKING:

    from pymongo import AsyncMongoClient
    from pymongo.asynchronous.collection import AsyncCollection
    from pymongo.asynchronous.database import AsyncDatabase

class Mongo:

    name     = "mongo"
    failures : tuple[type[BaseException], ...] = (OSError, TimeoutError)

    def __init__ ( self ) -> None:

        self._client: AsyncMongoClient[dict[str, Any]] | None = None
        self._database: AsyncDatabase[dict[str, Any]] | None = None

    def ready ( self ) -> bool:

        return self._database is not None

    async def connect (
        self, url: str, database: str | None = None, wait: float = 5.0, application: str = "engine",
    ) -> None:

        if self._client is not None: return

        from pymongo import AsyncMongoClient
        from pymongo.errors import PyMongoError

        self.failures = (PyMongoError, OSError, TimeoutError)

        client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(
            url, serverSelectionTimeoutMS=int(wait * 1000), connectTimeoutMS=int(wait * 1000), appname=application,
            tz_aware=True, uuidRepresentation="standard",
        )

        try:

            await client.admin.command("ping")

            self._database = client.get_default_database(database)

        except self.failures as error:

            await client.close()

            raise self.translate(error) from error

        self._client = client

        log.info("database.connected", driver=self.name)

    async def close ( self ) -> None:

        client, self._client, self._database = self._client, None, None

        if client is not None: await client.close()

    async def ping ( self, wait: float = 2.0 ) -> bool:

        if self._client is None: return False

        try: return bool(await self._client.admin.command("ping", maxTimeMS=int(wait * 1000)))
        except self.failures: return False

    def collection ( self, name: str ) -> AsyncCollection[dict[str, Any]]:

        if self._database is None: raise Fault(Code.UNAVAILABLE, "The database is not connected", "database.setup")

        return self._database[name]

    def translate ( self, error: BaseException ) -> Fault:

        from pymongo import errors

        if isinstance(error, errors.DuplicateKeyError):

            return Fault(Code.CONFLICT, "Already exists", "database.unique", { "constraint": [str(error)[:120]] })

        if isinstance(error, errors.WriteError) and error.code == VALIDATION:

            return Fault(Code.VALIDATION, "A constraint refused the data", "database.check")

        if isinstance(error, errors.ServerSelectionTimeoutError | errors.ConnectionFailure | TimeoutError):

            return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

        if isinstance(error, errors.OperationFailure): return Fault(Code.INTERNAL, str(error)[:200], "database.command")
        if isinstance(error, errors.ConfigurationError): return Fault(Code.INTERNAL, str(error)[:200], "database.url")

        return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

    def describe ( self ) -> dict[str, Any]:

        name = self._database.name if self._database is not None else None

        return { "family": "database", "name": self.name, "dialect": "mongo", "database": name }
