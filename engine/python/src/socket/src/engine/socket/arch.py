from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from engine.error import Code, Fault

if TYPE_CHECKING:

    from .frame import Frame
    from .socket import Socket

type Handler = Callable[["Socket", "Frame"], Awaitable[None]]
type Gate = Callable[["Socket", str], Awaitable[bool]]

MAX_FRAME = 65536
IDLE      = 60.0
SEND_WAIT = 5.0
CHANNELS  = 64
NAME      = 128
LONGEST   = 86_400.0

def whole ( value: object, what: str, least: int = 1 ) -> int:

    if type(value) is int and value >= least: return value

    raise Fault(Code.INTERNAL, reason="socket.settings", errors={ "setting": [what] })

def timed ( value: object, what: str ) -> float:

    if isinstance(value, int | float) and type(value) is not bool and 0 < value <= LONGEST: return float(value)

    raise Fault(Code.INTERNAL, reason="socket.settings", errors={ "setting": [what] })

def roomed ( channel: object ) -> bool:

    return type(channel) is str and 0 < len(channel) <= NAME and channel.isprintable()
