from collections.abc import Iterator, Mapping
from typing import Any
from engine.error import Code, Fault
from engine.json import json
from .arch import DEPTH_LIMIT, DOCUMENT_LIMIT, FORMATS, NODE_LIMIT, SCALARS
from .yaml import Yaml
import tomllib
lazy import tomli_w

class Codec:

    __slots__ = ()

    def kind ( self, name: str ) -> str:

        if not isinstance(name, str): raise Fault(Code.UNSUPPORTED_MEDIA, reason="parse.kind")

        chosen = name.lower().lstrip(".")
        chosen = "yaml" if chosen == "yml" else chosen

        if chosen not in FORMATS: raise Fault(Code.UNSUPPORTED_MEDIA, reason="parse.kind")

        return chosen

    def load ( self, text: str | bytes, kind: str = "json" ) -> Any:

        chosen = self.kind(kind)

        if not isinstance(text, (str, bytes)): raise Fault(Code.BAD_REQUEST, reason=f"parse.{chosen}")
        if len(text) > DOCUMENT_LIMIT: raise Fault(Code.TOO_LARGE, reason="parse.size")

        try:

            if chosen == "json": value = json.decode(text)
            else:

                plain = text.decode("utf-8") if isinstance(text, bytes) else text
                value = tomllib.loads(plain) if chosen == "toml" else Yaml().load(plain)

        except (ValueError, UnicodeError, RecursionError) as error:

            raise Fault(Code.BAD_REQUEST, "Malformed document", f"parse.{chosen}") from error

        except Fault as error: raise Fault(error.code, reason=f"parse.{chosen}") from error

        self.check(value)

        return value

    def dump ( self, value: Any, kind: str = "json", pretty: bool = False ) -> str:

        chosen = self.kind(kind)
        self.check(value)

        if chosen == "toml" and not isinstance(value, Mapping): raise Fault(Code.BAD_REQUEST, reason="parse.toml")

        try:

            if chosen == "json": text = json.dumps(value, pretty=pretty)
            elif chosen == "toml": text = tomli_w.dumps(value)

            else: text = Yaml().dump(value)

        except (ValueError, TypeError, RecursionError) as error:

            raise Fault(Code.BAD_REQUEST, "Cannot encode document", f"parse.{chosen}") from error

        except Fault as error: raise Fault(error.code, reason=f"parse.{chosen}") from error

        if len(text) > DOCUMENT_LIMIT: raise Fault(Code.TOO_LARGE, reason="parse.size")

        return text

    def check ( self, value: Any ) -> None:

        stack: list[tuple[Iterator[Any], int | None]] = [(iter((value,)), None)]
        active: set[int] = set()
        count = 0

        while stack:

            source, identity = stack[-1]

            try: item = next(source)
            except StopIteration:

                stack.pop()

                if identity is not None: active.remove(identity)

                continue

            count += 1

            if count > NODE_LIMIT or len(stack) > DEPTH_LIMIT: raise Fault(Code.TOO_LARGE, reason="parse.depth")
            if type(item) in SCALARS or not isinstance(item, (Mapping, list, tuple)): continue
            if len(item) > NODE_LIMIT: raise Fault(Code.TOO_LARGE, reason="parse.depth")
            if id(item) in active: raise Fault(Code.BAD_REQUEST, reason="parse.cycle")
            if isinstance(item, Mapping) and any(not isinstance(key, str) for key in item):

                raise Fault(Code.BAD_REQUEST, reason="parse.keys")

            active.add(id(item))
            stack.append((iter(item.values() if isinstance(item, Mapping) else item), id(item)))
