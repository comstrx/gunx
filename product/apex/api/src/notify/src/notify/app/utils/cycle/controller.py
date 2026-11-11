from typing import Any

from engine.http import Answer, Response

class Controller[S]:

    def __init__ ( self, service: S ) -> None:

        self.service = service

    def ok ( self, data: Any = None, message: str | None = None ) -> Answer:

        return Response.ok(data, message)

    def created ( self, data: Any = None, message: str | None = None, location: str | None = None ) -> Answer:

        return Response.created(data, message, location=location)

    def accepted ( self, data: Any = None, message: str | None = None ) -> Answer:

        return Response.accepted(data, message)

    def empty ( self ) -> Answer:

        return Response.empty()

    def page ( self, rows: list[dict[str, Any]], total: int, page: int, limit: int ) -> Answer:

        return Response.page(rows, total, page, limit)

    def json ( self, document: Any ) -> Answer:

        return Response.json(document)
