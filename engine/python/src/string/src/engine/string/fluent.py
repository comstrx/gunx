from collections.abc import Callable
from typing import TYPE_CHECKING, Any, overload, override

if TYPE_CHECKING:

    from .string import String

class Fluent:

    __slots__ = ("_owner", "_text")

    def __init__ ( self, text: str, owner: String ) -> None:

        self._text  = text
        self._owner = owner

    def __getattr__ ( self, name: str ) -> Callable[..., Any]:

        if name.startswith("_"): raise AttributeError(name)

        verb  = getattr(self._owner, name, None)
        bound = verb is not None

        if not bound: verb = getattr(self._text, name, None)
        if verb is None or not callable(verb): raise AttributeError(name)

        def call ( *args: Any, **kwargs: Any ) -> Any:

            result = verb(self._text, *args, **kwargs) if bound else verb(*args, **kwargs)

            return Fluent(result, self._owner) if isinstance(result, str) else result

        return call

    def get ( self ) -> str:

        return self._text

    @overload
    def pipe ( self, step: Callable[[str], str] ) -> Fluent: ...

    @overload
    def pipe [T] ( self, step: Callable[[str], T] ) -> T | Fluent: ...

    def pipe [T] ( self, step: Callable[[str], T] ) -> T | Fluent:

        result = step(self._text)

        return Fluent(result, self._owner) if isinstance(result, str) else result

    def when [T] ( self, condition: bool, step: Callable[[Fluent], T] ) -> T | Fluent:

        return step(self) if condition else self

    def unless [T] ( self, condition: bool, step: Callable[[Fluent], T] ) -> T | Fluent:

        return self if condition else step(self)

    def tap ( self, step: Callable[[str], object] ) -> Fluent:

        step(self._text)

        return self

    @override
    def __str__ ( self ) -> str:

        return self._text

    @override
    def __repr__ ( self ) -> str:

        return f"Fluent({self._text!r})"

    def __len__ ( self ) -> int:

        return len(self._text)

    def __bool__ ( self ) -> bool:

        return bool(self._text)

    def __contains__ ( self, part: str ) -> bool:

        return part in self._text

    @override
    def __eq__ ( self, other: object ) -> bool:

        return self._text == (other._text if isinstance(other, Fluent) else other)

    @override
    def __hash__ ( self ) -> int:

        return hash(self._text)
