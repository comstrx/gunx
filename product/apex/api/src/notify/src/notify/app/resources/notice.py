from typing import Any

from engine.date import date

from ..models import Notice
from ..utils.cycle import Resource

class NoticeResource(Resource[Notice]):

    @classmethod
    def dump ( cls, notice: Notice ) -> dict[str, Any]:

        return {
            "id": notice.id, "title": notice.title, "body": notice.body, "data": notice.data, "unread": notice.unread(),
            "read_at": date.iso(notice.read_at) if notice.read_at else None,
            "created_at": date.iso(notice.created_at) if notice.created_at else None,
        }
