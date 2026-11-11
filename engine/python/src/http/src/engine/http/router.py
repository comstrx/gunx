from collections.abc import Mapping
from typing import Any

from engine.error import Code, Fault
from engine.parse import parse
from .arch import PARAM
from .route import Route
from .throttle import Throttle
import re

class Router:

    def __init__ ( self ) -> None:

        self._routes: dict[str, Route] = {}
        self._policies: dict[str, Throttle] = {}

    def register ( self, route: Route ) -> None:

        if route.name:

            if route.name in self._routes:

                raise Fault(Code.INTERNAL, reason="route.duplicate", errors={ "name": [route.name] })

            self._routes[route.name] = route

    def policy ( self, name: str, text: str ) -> Throttle:

        made = Throttle.parse(text)

        self._policies[name] = made

        return made

    def throttle ( self, name: str ) -> Throttle:

        found = self._policies.get(name)

        if found is None: raise Fault(Code.INTERNAL, reason="throttle.unknown", errors={ "policy": [name] })

        return found

    def has ( self, name: str ) -> bool:

        return name in self._routes

    def url ( self, route_: str, **params: Any ) -> str:

        route = self._routes.get(route_)

        if route is None: raise Fault(Code.INTERNAL, reason="route.unknown", errors={ "name": [route_] })

        def fill ( found: re.Match[str] ) -> str:

            key = found.group(1)

            if key not in params: raise Fault(Code.INTERNAL, reason="route.param", errors={ key: ["is missing"] })

            return parse.quote(params.pop(key))

        path  = PARAM.sub(fill, route.path)
        query = parse.encode(params)

        return f"{path}?{query}" if query else path

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._routes))

    def routes ( self ) -> tuple[Route, ...]:

        return tuple(self._routes.values())

    def describe ( self ) -> Mapping[str, Any]:

        return { name: route.describe() for name, route in sorted(self._routes.items()) }

    def clear ( self ) -> None:

        self._routes   = {}
        self._policies = {}
