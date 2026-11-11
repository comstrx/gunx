from collections.abc import Awaitable, Callable
from typing import Any, TYPE_CHECKING

from engine.error import Code, Fault

if TYPE_CHECKING:

    from .spot import Spot

type Work = Callable[[], Awaitable[Any]]
type Filter = Callable[[], bool]
type Failure = Callable[["Spot", BaseException], Awaitable[None]]
type Hook = Callable[["Spot"], Awaitable[None]]

def timed ( value: object, what: str ) -> float:

    if isinstance(value, int | float) and type(value) is not bool and 0 < value <= LONGEST: return float(value)

    raise Fault(Code.INTERNAL, reason=f"schedule.{what}")

ALIASES = {
    "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
    "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *",
}
NAMES   = {
    "sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10,
    "nov": 11, "dec": 12,
}
SUNDAY   = 7
SATURDAY = 6
BOUNDS  = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 6))
FIELDS  = 5
HORIZON = 366 * 24 * 60
DECEMBER = 12
WIDEST   = 256
NAME     = 128
LONGEST  = 86_400.0

TIMEOUT  = 300.0
HOURS    = 23
MINUTES  = 59
WEEKDAYS = 6
