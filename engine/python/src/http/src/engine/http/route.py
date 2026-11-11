from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any

from engine.error import Code, Fault
from .arch import ACTIONS, ALL, Guard, Handler, KNOWN, Middleware, NAME, PARAM
from .group import Group

@dataclass(frozen=True, slots=True)
class Route:

    methods    : tuple[str, ...]
    path       : str
    handler    : Handler
    name       : str | None = None
    guards     : tuple[Guard, ...] = ()
    layers     : tuple[Middleware, ...] = ()
    throttle   : str | None = None
    tags       : tuple[str, ...] = ()
    hidden     : bool = False
    summary    : str = ""

    @classmethod
    def match (
        cls, methods: Sequence[str], path: str, handler: Handler, name: str | None = None, **options: Any,
    ) -> Route:

        held: object = name

        if type(path) is not str or not path.startswith("/") or not path.isprintable() or " " in path:

            raise Fault(Code.INTERNAL, reason="route.path", errors={ "path": [str(path)[:NAME]] })

        if not callable(handler): raise Fault(Code.INTERNAL, reason="route.handler", errors={ "path": [path] })
        if held is not None and not (type(held) is str and 0 < len(held) <= NAME and held.isprintable()):

            raise Fault(Code.INTERNAL, reason="route.name", errors={ "path": [path] })

        verbs = tuple(dict.fromkeys(method.upper() for method in methods if type(method) is str))

        if not verbs or len(verbs) != len(methods) or not all(verb in KNOWN for verb in verbs):

            raise Fault(Code.INTERNAL, reason="route.method", errors={ "path": [path] })

        return cls(verbs, path, handler, name, **options)

    @classmethod
    def get ( cls, path: str, handler: Handler, name: str | None = None, **options: Any ) -> Route:

        return cls.match(("GET",), path, handler, name, **options)

    @classmethod
    def post ( cls, path: str, handler: Handler, name: str | None = None, **options: Any ) -> Route:

        return cls.match(("POST",), path, handler, name, **options)

    @classmethod
    def put ( cls, path: str, handler: Handler, name: str | None = None, **options: Any ) -> Route:

        return cls.match(("PUT",), path, handler, name, **options)

    @classmethod
    def patch ( cls, path: str, handler: Handler, name: str | None = None, **options: Any ) -> Route:

        return cls.match(("PATCH",), path, handler, name, **options)

    @classmethod
    def delete ( cls, path: str, handler: Handler, name: str | None = None, **options: Any ) -> Route:

        return cls.match(("DELETE",), path, handler, name, **options)

    @classmethod
    def any ( cls, path: str, handler: Handler, name: str | None = None, **options: Any ) -> Route:

        return cls.match(ALL, path, handler, name, **options)

    @classmethod
    def resource ( cls, path: str, controller: Any, name: str, only: Sequence[str] = () ) -> Group:

        routes: list[Route] = []

        for action, methods, suffix in ACTIONS:

            if only and action not in only: continue

            handler = getattr(controller, action, None)

            if handler is None: continue

            routes.append(cls.match(methods, f"{path}{suffix}", handler, f"{name}.{action}"))

        return Group("", tuple(routes))

    def guarded ( self, *guards: Guard ) -> Route:

        return replace(self, guards=(*self.guards, *guards))

    def through ( self, *layers: Middleware ) -> Route:

        return replace(self, layers=(*self.layers, *layers))

    def throttled ( self, policy: str ) -> Route:

        return replace(self, throttle=policy)

    def hide ( self ) -> Route:

        return replace(self, hidden=True)

    def tagged ( self, *tags: str ) -> Route:

        return replace(self, tags=(*self.tags, *tags))

    def params ( self ) -> tuple[str, ...]:

        return tuple(found.group(1) for found in PARAM.finditer(self.path))

    def describe ( self ) -> dict[str, Any]:

        return { "methods": list(self.methods), "path": self.path, "name": self.name, "throttle": self.throttle }
