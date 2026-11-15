from dataclasses import dataclass, field
from engine.error import Code, Fault
from .arch import KEY_BYTES, NAME

@dataclass(frozen=True, slots=True)
class Key:

    id     : str
    secret : bytes = field(repr=False)

    def __post_init__ ( self ) -> None:

        named = type(self.id) is str and NAME.fullmatch(self.id) is not None
        sized = type(self.secret) is bytes and len(self.secret) == KEY_BYTES

        if not named or not sized: raise Fault(Code.INTERNAL, reason="crypto.key")
