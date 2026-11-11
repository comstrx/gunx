from typing import ClassVar

from ..utils.cycle import Event

class SessionStarted(Event):

    name: ClassVar[str] = "iam.session.started"

    user   : str
    tenant : str | None
    email  : str
    who    : str
