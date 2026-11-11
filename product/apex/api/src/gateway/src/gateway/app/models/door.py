from contract import Audience

from ..utils.cycle import Model

class Door(Model):

    id       : str
    method   : str
    path     : str
    service  : str
    target   : str
    audience : Audience
    scope    : str | None = None
    policy   : str = "read"

    def public ( self ) -> bool:

        return self.audience is Audience.PUBLIC
