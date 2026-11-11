from engine.database import POSTGRES, Database
from engine.test import stage
import pytest

SCHEMAS = ("iam", "notify")

@pytest.fixture(scope="session", autouse=True)
async def fresh_schemas () -> None:

    database = Database()

    await database.connect(stage.database_url(), application="api-tests", ssl="disable")

    for schema in SCHEMAS: await database.execute(f"DROP SCHEMA IF EXISTS {POSTGRES.ident(schema)} CASCADE")

    await database.close()
