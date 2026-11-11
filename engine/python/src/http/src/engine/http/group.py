from collections.abc import Iterator, Sequence
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING

from engine.error import Code, Fault
from .arch import Guard, Middleware


if TYPE_CHECKING:

    from .route import Route

@dataclass(frozen=True, slots=True)
class Group:

    prefix   : str
    routes   : tuple[Route | Group, ...]
    name     : str | None = None
    guards   : tuple[Guard, ...] = ()
    layers   : tuple[Middleware, ...] = ()
    throttle : str | None = None
    tags     : tuple[str, ...] = ()

    @classmethod
    def of (
        cls, prefix: str, *routes: Route | Group, name: str | None = None, guards: Sequence[Guard] = (),
        layers: Sequence[Middleware] = (), throttle: str | None = None, tags: Sequence[str] = (),
    ) -> Group:

        if type(prefix) is not str or (prefix and not prefix.startswith("/")) or " " in prefix:

            raise Fault(Code.INTERNAL, reason="group.prefix", errors={ "prefix": [str(prefix)[:64]] })

        marks = tuple(tags) if tags or name is None else (name,)

        return cls(prefix.rstrip("/"), tuple(routes), name, tuple(guards), tuple(layers), throttle, marks)

    def walk (
        self, prefix: str = "", name: str | None = None, guards: Sequence[Guard] = (),
        layers: Sequence[Middleware] = (), throttle: str | None = None, tags: Sequence[str] = (),
    ) -> Iterator[Route]:

        base   = f"{prefix}{self.prefix}"
        named  = ".".join(part for part in (name, self.name) if part) or None
        shield = (*guards, *self.guards)
        wraps  = (*layers, *self.layers)
        limit  = self.throttle or throttle
        marks  = (*tags, *self.tags)

        for item in self.routes:

            if isinstance(item, Group):

                yield from item.walk(base, named, shield, wraps, limit, marks)

                continue

            path = f"{base}{item.path}" if item.path != "/" or not base else base

            yield replace(
                item, path=path or "/", name=".".join(part for part in (named, item.name) if part) or None,
                guards=(*shield, *item.guards), layers=(*wraps, *item.layers), throttle=item.throttle or limit,
                tags=(*marks, *item.tags),
            )

    def count ( self ) -> int:

        return sum(1 for _ in self.walk())
