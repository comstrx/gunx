from copy import deepcopy
from typing import Any

from .arch import SCALARS

class Copy:

    __slots__ = ()

    @classmethod
    def read ( cls, value: Any, memo: dict[int, Any] | None = None ) -> Any:

        kind = type(value)

        if kind in SCALARS: return value
        if memo is None: memo = {}
        identity = id(value)

        if identity in memo: return memo[identity]
        if kind is dict:

            found: dict[Any, Any] = {}
            memo[identity] = found

            for key, item in value.items():

                name = key if type(key) in SCALARS else deepcopy(key, memo)
                found[name] = item if type(item) in SCALARS else cls.read(item, memo)

            return found

        if kind is list:

            items: list[Any] = []
            memo[identity] = items

            items.extend(item if type(item) in SCALARS else cls.read(item, memo) for item in value)

            return items

        return deepcopy(value, memo)
