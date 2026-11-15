from dataclasses import dataclass
from .arch import ACCESS, LEEWAY, LIFETIME
from .base import Base

@dataclass(frozen=True, slots=True)
class Settings:

    issuer   : str
    purpose  : str
    audience : str | None
    ttl      : int
    leeway   : int = LEEWAY

    def __post_init__ ( self ) -> None:

        for name, value in (("issuer", self.issuer), ("purpose", self.purpose)):

            if not Base.label(value): raise Base.setting(name)

        if self.audience is not None and not Base.label(self.audience): raise Base.setting("audience")
        if type(self.ttl) is not int or not 0 < self.ttl <= LIFETIME: raise Base.setting("ttl")
        if type(self.leeway) is not int or not 0 <= self.leeway <= ACCESS: raise Base.setting("leeway")
