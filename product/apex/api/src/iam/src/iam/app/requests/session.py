from typing import ClassVar

from ..utils.cycle import Request

class CodeRequest(Request):

    rules  : ClassVar[dict[str, str]] = { "email": "required|email" }
    reason : ClassVar[str] = "session.input"

    email: str

class SessionRequest(Request):

    carries : ClassVar[tuple[str, ...]] = ("fingerprint",)
    rules   : ClassVar[dict[str, str]] = {
        "email": "required|email", "code": "required|digits:6", "tenant": "nullable|slug|max:64",
    }
    reason  : ClassVar[str] = "session.input"

    email  : str
    code   : str
    tenant : str | None = None

class RefreshRequest(Request):

    carries: ClassVar[tuple[str, ...]] = ("fingerprint",)

    refresh: str

class EndRequest(Request):

    carries: ClassVar[tuple[str, ...]] = ("bearer",)

class MeRequest(Request):

    carries: ClassVar[tuple[str, ...]] = ("principal",)
