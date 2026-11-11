from collections.abc import Mapping
from typing import Any, get_type_hints

from engine.error import Code, Fault
from engine.parse import parse
from engine.validate import Shape
from .action import Action
from .arch import Answer, ANSWERS, BODIES, Bound, Handler, Plan, Resolver, SKIP, SPREAD
from .request import Request
from .response import Response
import inspect

class Binder:

    def bind ( self, handler: Handler, methods: tuple[str, ...] ) -> Bound:

        if isinstance(handler, Action): return self._direct_(handler)

        signature = inspect.signature(handler)
        hints     = get_type_hints(handler)
        bodied    = bool(BODIES.intersection(methods))
        names     = list(signature.parameters)
        plan      = [
            (name, self.resolver(name, hints.get(name, str), parameter, bodied))
            for name, parameter in signature.parameters.items() if parameter.kind not in SPREAD
        ]

        direct = len(plan) == 1 and (names[0] == "request" or hints.get(names[0], str) is Request)

        if not plan: made = self._bare_(handler)
        elif direct: made = self._direct_(handler)
        else: made = self._planned_(handler, plan)

        made.__name__ = getattr(handler, "__name__", "handler")

        return made

    def resolver ( self, name: str, kind: Any, parameter: inspect.Parameter, bodied: bool ) -> Resolver:

        if name == "request" or kind is Request: return self._carried_

        shaped   = isinstance(kind, type) and issubclass(kind, Shape)
        required = parameter.default is inspect.Parameter.empty
        coerce   = self.coerce
        shape    = self.shape

        def resolve ( request: Request, params: Mapping[str, Any] ) -> Any:

            if name in params:

                value = params[name]

                return value if type(value) is kind else coerce(kind, value, name)

            if shaped: return shape(request, kind, bodied)
            if required: return coerce(kind, request.query(name), name)

            return SKIP

        return resolve

    def argument (
        self, request: Request, params: Mapping[str, Any], name: str, kind: Any, parameter: inspect.Parameter,
        bodied: bool,
    ) -> Any:

        return self.resolver(name, kind, parameter, bodied)(request, params)

    @staticmethod
    def answer ( result: Any ) -> Answer:

        return Response.answer(result)

    @staticmethod
    def shape [T: Shape] ( request: Request, kind: type[T], bodied: bool ) -> T:

        if bodied and request.body and not request.json_body():

            raise Fault(Code.UNSUPPORTED_MEDIA, reason="http.media", errors={ "content-type": ["must be JSON"] })

        return request.shape(kind)

    def _bare_ ( self, handler: Handler ) -> Bound:

        async def bare ( _: Request, **__: Any ) -> Answer:

            result = await handler()

            return result if isinstance(result, ANSWERS) else Response.answer(result)

        return bare

    def _direct_ ( self, handler: Handler ) -> Bound:

        async def direct ( request: Request, **_: Any ) -> Answer:

            result = await handler(request)

            return result if isinstance(result, ANSWERS) else Response.answer(result)

        return direct

    def _planned_ ( self, handler: Handler, plan: Plan ) -> Bound:

        async def bound ( request: Request, **params: Any ) -> Answer:

            arguments: dict[str, Any] = {}

            for name, resolve in plan:

                found = resolve(request, params)

                if found is not SKIP: arguments[name] = found

            result = await handler(**arguments)

            return result if isinstance(result, ANSWERS) else Response.answer(result)

        return bound

    def coerce ( self, kind: Any, value: Any, name: str ) -> Any:

        if value is None: raise Fault(Code.VALIDATION, reason="http.param", errors={ name: ["is required"] })
        if kind is str or (kind in (int, float) and type(value) is kind): return value

        try:

            if kind is int: return parse.integer(value)
            if kind is float: return parse.number(value)
            if kind is bool: return parse.boolean(value)

        except Fault as fault:

            raise Fault(Code.VALIDATION, reason="http.param", errors={ name: [fault.message] }) from fault

        return value

    def _carried_ ( self, request: Request, _: Mapping[str, Any] ) -> Request:

        return request
