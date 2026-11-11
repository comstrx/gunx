from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, ClassVar

from .repository import Repository
from .resource import Resource

class Service[R: Repository[Any]]:

    resource: ClassVar[type[Resource[Any]]] = Resource

    def __init__ ( self, rows: R ) -> None:

        self.rows = rows

    async def show ( self, key: Any ) -> dict[str, Any]:

        return self.resource.one(await self.rows.need(key))

    async def index (
        self, page: int = 1, limit: int = 20, order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:

        rows, total = await self.rows.page(page, limit, order or "created_at")

        return self.resource.many(rows), total

    @asynccontextmanager
    async def run ( self ) -> AsyncIterator[None]:

        yield
