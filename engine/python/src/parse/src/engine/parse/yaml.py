from collections.abc import Iterator
from itertools import chain
from typing import Any
from engine.error import Code, Fault
from .arch import ALIAS_LIMIT, DEPTH_LIMIT, NODE_LIMIT
lazy import yaml

class Yaml:

    __slots__ = ()

    def load ( self, text: str ) -> Any:

        loader_type = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
        depth = aliases = tokens = 0

        try:

            for token in yaml.scan(text, Loader=loader_type):

                tokens += 1

                if isinstance(token, (yaml.BlockMappingStartToken, yaml.BlockSequenceStartToken,
                                      yaml.FlowMappingStartToken, yaml.FlowSequenceStartToken)): depth += 1
                elif isinstance(token, (yaml.BlockEndToken, yaml.FlowMappingEndToken,
                                        yaml.FlowSequenceEndToken)): depth -= 1
                elif isinstance(token, yaml.AliasToken): aliases += 1

                if depth > DEPTH_LIMIT or tokens > NODE_LIMIT or aliases > ALIAS_LIMIT:

                    raise Fault(Code.TOO_LARGE, reason="parse.yaml")

            loader: Any = loader_type(text)
            loader.yaml_constructors = dict(loader.yaml_constructors)
            loader.yaml_constructors["tag:yaml.org,2002:map"] = self._mapping_

            try:

                if aliases:

                    node = loader.get_single_node()
                    self._aliases_(node)

                    return loader.construct_document(node) if node is not None else None

                return loader.get_single_data()

            finally: loader.dispose()

        except (yaml.YAMLError, ValueError, TypeError, RecursionError) as error:

            raise Fault(Code.BAD_REQUEST, "Malformed YAML", "parse.yaml") from error

    def dump ( self, value: Any ) -> str:

        try:

            return str(yaml.dump(
                value, Dumper=getattr(yaml, "CSafeDumper", yaml.SafeDumper),
                allow_unicode=True, sort_keys=False,
            ))

        except (yaml.YAMLError, ValueError, TypeError, RecursionError) as error:

            raise Fault(Code.BAD_REQUEST, "Cannot encode YAML", "parse.yaml") from error

    def _aliases_ ( self, node: Any ) -> None:

        stack: list[tuple[Iterator[Any], int | None]] = [(iter((node,)), None)]
        active: set[int] = set()
        count = 0

        while stack:

            source, identity = stack[-1]

            try: current = next(source)
            except StopIteration:

                stack.pop()

                if identity is not None: active.remove(identity)

                continue

            count += 1

            if count > NODE_LIMIT or len(stack) > DEPTH_LIMIT: raise Fault(Code.TOO_LARGE, reason="parse.yaml")
            if not isinstance(current, (yaml.MappingNode, yaml.SequenceNode)): continue
            if id(current) in active: raise Fault(Code.BAD_REQUEST, reason="parse.cycle")

            children = chain.from_iterable(current.value) if isinstance(current, yaml.MappingNode) else current.value
            active.add(id(current))
            stack.append((iter(children), id(current)))

    def _mapping_ ( self, loader: Any, node: Any ) -> dict[str, Any]:

        explicit: set[str] = set()

        for key_node, _ in node.value:

            key = "<<" if key_node.tag == "tag:yaml.org,2002:merge" else loader.construct_object(key_node, deep=True)

            if not isinstance(key, str) or key in explicit:

                raise Fault(Code.BAD_REQUEST, "YAML keys must be unique strings", "parse.yaml")

            explicit.add(key)

        loader.flatten_mapping(node)
        found: dict[str, Any] = {}

        for key_node, value_node in node.value:

            key = loader.construct_object(key_node, deep=True)

            if not isinstance(key, str): raise Fault(Code.BAD_REQUEST, reason="parse.yaml")

            found[key] = loader.construct_object(value_node, deep=True)

        return found
