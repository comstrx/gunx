from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING


if TYPE_CHECKING:

    from .event import Event

type Listener = Callable[["Event"], Awaitable[None]]

KIND = "event"
TASK = "event.listener"
NAME    = 128
MOST    = 4_096
LONGEST = 3_600.0

def named ( value: object ) -> bool:

    return type(value) is str and 0 < len(value) <= NAME and value.isprintable() and " " not in value
