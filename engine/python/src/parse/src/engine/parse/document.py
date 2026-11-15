from collections.abc import Callable, Mapping
from copy import deepcopy
from typing import Any, Self, cast
from engine.error import Code, Fault
from engine.json import json
from engine.string import string
from .codec import Codec
from .arch import DOCUMENT_LIMIT

class Document:

    __slots__ = ("_format", "_separator", "_value")

    def __init__ ( self, value: Any, kind: str = "json", separator: str = "." ) -> None:

        if not isinstance(cast("object", separator), str) or not separator:

            raise Fault(Code.BAD_REQUEST, reason="parse.path")

        self._separator = separator
        codec = Codec()
        codec.check(value)
        self._format = codec.kind(kind)
        self._value = deepcopy(value)

    def value ( self ) -> Any:

        return deepcopy(self._value)

    def get ( self, path: str, default: Any = None ) -> Any:

        return deepcopy(json.get(self._value, path, default, self._separator))

    def has ( self, path: str ) -> bool:

        return json.has(self._value, path, self._separator)

    def set ( self, path: str, value: Any ) -> Self:

        Codec().check(value)
        made = json.edit(self._value, {path: value}, separator=self._separator)
        Codec().check(made)
        self._value = made

        return self

    def update ( self, values: Mapping[str, Any] ) -> Self:

        Codec().check(values)
        made = json.edit(self._value, values, separator=self._separator)
        Codec().check(made)
        self._value = made

        return self

    def remove ( self, *paths: str ) -> Self:

        self._value = json.edit(self._value, {}, remove=paths, separator=self._separator)

        return self

    def keys ( self ) -> list[str]:

        return [path for path, _ in json.entries(self._value, self._separator)]

    def match ( self, pattern: str ) -> dict[str, Any]:

        return {
            path: deepcopy(value) for path, value in json.entries(self._value, self._separator)
            if string.glob(path, pattern)
        }

    def map ( self, change: Callable[[Any], Any] ) -> Self:

        value = json.walk(deepcopy(self._value), change)
        Codec().check(value)
        self._value = deepcopy(value)

        return self

    def render (
        self, values: Mapping[str, object], *, delimiters: tuple[str, str] = ("{", "}"),
        strict: bool = True, keys: bool = False,
    ) -> Self:

        size = 0

        def replace ( value: Any ) -> Any:

            nonlocal size

            if not isinstance(value, str): return value

            made = string.template(value, values, strict, delimiters=delimiters)
            size += len(made)

            if size > DOCUMENT_LIMIT: raise Fault(Code.TOO_LARGE, reason="parse.size")

            return made

        self._value = json.walk(self._value, replace, keys=replace if keys else None)

        return self

    def text ( self, kind: str | None = None, pretty: bool = False ) -> str:

        return Codec().dump(self._value, kind or self._format, pretty)

    def dict ( self ) -> dict[str, Any]:

        if not isinstance(self._value, dict): raise Fault(Code.BAD_REQUEST, reason="parse.object")

        return deepcopy(self._value)

    def list ( self ) -> list[Any]:

        if not isinstance(self._value, list): raise Fault(Code.BAD_REQUEST, reason="parse.array")

        return deepcopy(self._value)
