from collections.abc import Callable, Mapping
from copy import deepcopy
from types import ModuleType
from typing import Any
from engine.error import Code, Fault
import inspect
from .arch import CEILING, POOLS

class Base:

    __slots__ = ()

    @staticmethod
    def bounds ( mode: str, workers: int ) -> None:

        if type(mode) is not str or mode not in POOLS: raise Fault(Code.INTERNAL, reason="thread.mode")
        if type(workers) is not int or not 1 <= workers <= CEILING: raise Fault(Code.INTERNAL, reason="thread.workers")

    @staticmethod
    def seconds ( value: float ) -> float:

        if (type(value) is not float and type(value) is not int) or not value >= 0:

            raise Fault(Code.INTERNAL, reason="thread.seconds")

        try: return float(value)
        except OverflowError as error: raise Fault(Code.INTERNAL, reason="thread.seconds") from error

    @staticmethod
    async def direct ( handler: Callable[..., Any], item: Any ) -> Any:

        made = handler(item)

        return await made if inspect.isawaitable(made) else made

    @staticmethod
    def space ( value: str | None ) -> str | None:

        if value is not None and (type(value) is not str or not value.strip()):

            raise Fault(Code.INTERNAL, reason="thread.namespace")

        return value

    @staticmethod
    def environment ( value: Mapping[str, Any] | None ) -> dict[str, Any] | None:

        if value is None: return None
        if not isinstance(value, Mapping): raise Fault(Code.INTERNAL, reason="thread.runtime_env")

        try:

            found = dict(value)
            modules = found.get("py_modules", ())
            memo = (
                { id(item): item for item in modules if isinstance(item, ModuleType) }
                if isinstance(modules, (list, tuple)) else {}
            )
            found = deepcopy(found, memo)

        except Exception as error: raise Fault(Code.INTERNAL, reason="thread.runtime_env") from error

        if any(type(key) is not str for key in found): raise Fault(Code.INTERNAL, reason="thread.runtime_env")

        return found
