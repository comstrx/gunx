from collections.abc import Sequence
from typing import Any, get_type_hints

from engine.error import Code
from engine.validate import Shape, validator
from .action import Action
from .arch import BODIES, ENVELOPE, KINDS, PARAM, SCHEMA, TRACED, WAIT
from .route import Route
import inspect

class Docs:

    def __init__ ( self, title: str, version: str, description: str = "" ) -> None:

        self.title       = title
        self.version     = version
        self.description = description

    def build ( self, routes: Sequence[Route], servers: Sequence[str] = () ) -> dict[str, Any]:

        paths: dict[str, Any] = {}
        shapes: list[type[Shape]] = []

        for route in routes:

            if route.hidden: continue

            path  = PARAM.sub(lambda found: "{" + found.group(1) + "}", route.path)
            entry = paths.setdefault(path, {})
            body  = self._body_(route, shapes)

            for method in route.methods:

                fallback  = f"{method.lower()}_{route.path.strip('/').replace('/', '_') or 'root'}"
                bodied    = body is not None and method in BODIES
                operation: dict[str, Any] = {
                    "operationId" : route.name or fallback,
                    "summary"     : route.summary or (route.name or "").replace(".", " "),
                    "tags"        : list(route.tags) or ["default"],
                    "parameters"  : self._params_(route, bodied),
                    "responses"   : self._answers_(route, bodied),
                    "security"    : [{ "bearer": [] }] if route.guards else [],
                }

                if bodied: operation["requestBody"] = body
                if route.throttle: operation["x-throttle"] = route.throttle

                entry[method.lower()] = operation

        template   = "#/components/schemas/{name}"
        components = { "Envelope": SCHEMA, **validator.components(shapes, template) }
        security   = { "bearer": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" } }

        return {
            "openapi"    : "3.1.0",
            "info"       : { "title": self.title, "version": self.version, "description": self.description },
            "servers"    : [{ "url": url } for url in servers],
            "paths"      : dict(sorted(paths.items())),
            "components" : { "schemas": components, "securitySchemes": security },
        }

    def _answers_ ( self, route: Route, bodied: bool ) -> dict[str, Any]:

        codes: list[Code] = []

        if bodied: codes += [Code.UNSUPPORTED_MEDIA, Code.VALIDATION]
        if route.params(): codes += [Code.NOT_FOUND, Code.VALIDATION]
        if route.guards: codes += [Code.UNAUTHORIZED, Code.FORBIDDEN]
        if route.throttle: codes.append(Code.TOO_MANY_REQUESTS)

        answers = { "2XX": self._answer_("The envelope with data") }

        for code in sorted(set(codes), key=lambda found: found.status()):

            waits = code is Code.TOO_MANY_REQUESTS

            answers[str(int(code.status()))] = self._answer_(code.message(), waits)

        answers["default"] = self._answer_("The envelope with code and reason")

        return answers

    def _answer_ ( self, text: str, waits: bool = False ) -> dict[str, Any]:

        return {
            "description" : text,
            "headers"     : { **TRACED, **WAIT } if waits else TRACED,
            "content"     : { "application/json": { "schema": { "$ref": ENVELOPE } } },
        }

    def _params_ ( self, route: Route, bodied: bool ) -> list[dict[str, Any]]:

        found = [
            { "name": f.group(1), "in": "path", "required": True, "schema": { "type": self._kind_(f.group(2)) } }
            for f in PARAM.finditer(route.path)
        ]

        if bodied or not isinstance(route.handler, Action): return found

        schema   = route.handler.form.schema()
        defined  = next(iter(schema.get("$defs", {}).values()), schema)
        required = set(defined.get("required", ()))
        named    = { param["name"] for param in found }

        for name, kind in defined.get("properties", {}).items():

            if name in named: continue

            found.append({ "name": name, "in": "query", "required": name in required, "schema": kind })

        return found

    def _kind_ ( self, converter: str | None ) -> str:

        return KINDS.get(converter or "str", "string")

    def _body_ ( self, route: Route, shapes: list[type[Shape]] ) -> dict[str, Any] | None:

        if isinstance(route.handler, Action): return self._shape_(route.handler.form, shapes)

        for name, kind in get_type_hints(route.handler).items():

            if name != "return" and inspect.isclass(kind) and issubclass(kind, Shape): return self._shape_(kind, shapes)

        return None

    def _shape_ ( self, kind: type[Shape], shapes: list[type[Shape]] ) -> dict[str, Any]:

        if kind not in shapes: shapes.append(kind)

        schema = { "$ref": f"#/components/schemas/{kind.__name__}" }

        return { "required": True, "content": { "application/json": { "schema": schema } } }
