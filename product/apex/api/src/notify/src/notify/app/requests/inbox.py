from typing import Any, ClassVar, override

from ..utils.cycle import Request

class DeviceRequest(Request):

    carries : ClassVar[tuple[str, ...]] = ("principal",)
    rules   : ClassVar[dict[str, str]] = {
        "token": "required|string|min:8|max:512", "platform": "required|in:ios,android,web",
    }
    reason  : ClassVar[str] = "device.input"

    token    : str
    platform : str

class IndexRequest(Request):

    carries : ClassVar[tuple[str, ...]] = ("principal",)
    rules   : ClassVar[dict[str, str]] = {
        "page": "sometimes|integer|min:1", "limit": "sometimes|integer|between:1,100",
    }
    reason  : ClassVar[str] = "notice.paging"

    page  : int = 1
    limit : int = 20

    @classmethod
    @override
    def prepare ( cls, data: dict[str, Any] ) -> dict[str, Any]:

        given = super().prepare(data)

        for name in ("page", "limit"):

            value = given.get(name)

            if isinstance(value, str) and value.lstrip("-").isdigit(): given[name] = int(value)

        return given

class ReadRequest(Request):

    carries : ClassVar[tuple[str, ...]] = ("principal",)
    rules   : ClassVar[dict[str, str]] = { "notice": "required|uuid" }
    reason  : ClassVar[str] = "notice.missing"

    notice: str
