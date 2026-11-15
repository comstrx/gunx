from dataclasses import dataclass
lazy from .wire import Wire
from .arch import LIMIT, VERSION

@dataclass(frozen=True, slots=True)
class Sealed:

    key       : str
    nonce     : bytes
    body      : bytes
    algorithm : str = "aes-gcm"
    version   : int = VERSION

    def encode ( self ) -> str:

        return Wire.encode(self)

    @classmethod
    def decode ( cls, text: str, limit: int = LIMIT ) -> Sealed:

        return Wire.decode(text, limit)
