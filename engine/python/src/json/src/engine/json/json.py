from collections.abc import AsyncGenerator, AsyncIterator, Callable, Iterable, Iterator, Mapping, Sequence
from copy import deepcopy
from io import BytesIO
from typing import Any, cast
from types import MappingProxyType

from engine.error import Code, Fault
from .arch import (
    INDEX_DIGITS, KINDS, MISSING, OBJECTS, OPERATIONS, SETS, UNSAFE, MAX_DEPTH, MAX_NODES, SCALARS, Visitor,
)
import orjson

class Json:

    __slots__ = ("_default", "_hook")

    def __init__ ( self ) -> None:

        self._default: Callable[[Any], Any] | None = None
        self._hook = self._fallback_

    def use ( self, default: Callable[[Any], Any] | None ) -> None:

        self._default = default

    def encode ( self, value: object, pretty: bool = False, stable: bool = False ) -> bytes:

        option = orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY

        if pretty: option |= orjson.OPT_INDENT_2
        if stable: option |= orjson.OPT_SORT_KEYS

        try: return orjson.dumps(value, default=self._hook, option=option)
        except (TypeError, ValueError) as error: raise Fault(Code.INTERNAL, reason="json.encode") from error

    async def encode_stream ( self, source: AsyncIterator[object] ) -> AsyncGenerator[bytes]:

        first = True

        try:

            yield b"["

            async for item in source:

                encoded = self.encode(item)

                yield encoded if first else b"," + encoded

                first = False

            yield b"]"

        finally:

            close = getattr(source, "aclose", None)

            if close is not None: await close()

    def decode ( self, data: bytes | bytearray | memoryview | str ) -> Any:

        try: return orjson.loads(data)
        except orjson.JSONDecodeError as error: raise self._malformed_() from error

    def dumps ( self, value: object, pretty: bool = False, stable: bool = False ) -> str:

        return self.encode(value, pretty, stable).decode()

    def loads ( self, text: str | bytes ) -> Any:

        return self.decode(text)

    def pretty ( self, value: object ) -> str:

        return self.dumps(value, pretty=True, stable=True)

    def plain ( self, value: object ) -> Any:

        return orjson.loads(self.encode(value))

    def equal ( self, left: object, right: object ) -> bool:

        return self.encode(left, stable=True) == self.encode(right, stable=True)

    def size ( self, value: object ) -> int:

        return len(self.encode(value))

    def valid ( self, data: bytes | str ) -> bool:

        try: orjson.loads(data)
        except orjson.JSONDecodeError: return False

        return True

    def canonical ( self, value: object ) -> bytes:

        return self.encode(value, stable=True)

    def lines ( self, values: Iterable[object] ) -> bytes:

        with BytesIO() as output:

            output.writelines(self.encode(value) + b"\n" for value in values)

            return output.getvalue()

    def unlines ( self, data: bytes | str ) -> list[Any]:

        raw = data.encode() if isinstance(data, str) else data

        return [self.decode(line) for line in raw.splitlines() if line.strip()]

    def embed ( self, value: object ) -> str:

        text = self.dumps(value)

        for char, escaped in UNSAFE.items(): text = text.replace(char, escaped)

        return text

    def _fallback_ ( self, value: Any ) -> Any:

        if isinstance(value, MappingProxyType):

            try: copied = value.copy()
            except AttributeError: copied = dict(value)

            return copied
        if isinstance(value, SETS): return sorted(value, key=str)
        if isinstance(value, bytes): return value.decode("utf-8")
        dump = getattr(value, "dump", None)

        if callable(dump): return dump()
        if isinstance(value, OBJECTS): return dict(value)
        handled = self._default(value) if self._default is not None else None

        if handled is None: raise TypeError(type(value).__name__)

        return handled

    def _malformed_ ( self ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Malformed JSON", "json.decode")

    def get ( self, value: Any, path: str, default: Any = None, separator: str = "." ) -> Any:

        found = self._walk_(value, path, separator)

        return default if found is MISSING else found

    def has ( self, value: Any, path: str, separator: str = "." ) -> bool:

        return self._walk_(value, path, separator) is not MISSING

    def put ( self, value: Any, path: str, item: Any, separator: str = "." ) -> Any:

        if not path: return item

        copied = deepcopy(value)
        self._put_(copied, self._segments_(path, separator), deepcopy(item))

        return copied

    def edit (
        self, value: Any, updates: Mapping[str, Any], *, remove: Iterable[str] = (), separator: str = ".",
    ) -> Any:

        try:

            copied = deepcopy(value)

            for path, item in updates.items():

                if not path: copied = deepcopy(item)
                else: self._put_(copied, self._segments_(path, separator), deepcopy(item), strict=True)

            for path in remove: self._forget_(copied, path, separator)

        except RecursionError as error: raise Fault(Code.BAD_REQUEST, reason="json.depth") from error

        return copied

    def _put_ ( self, current: Any, parts: Sequence[str], item: Any, strict: bool = False ) -> None:

        for part in parts[:-1]:

            if isinstance(current, list) and self._indexable_(current, part): current = current[int(part)]
            else:

                if not isinstance(current, dict):

                    if strict: raise Fault(Code.BAD_REQUEST, reason="json.path")

                    return
                if not isinstance(current.get(part), dict | list): current[part] = {}

                current = current[part]

        last = parts[-1]

        if isinstance(current, list) and self._indexable_(current, last): current[int(last)] = item
        elif isinstance(current, dict): current[last] = item
        elif strict: raise Fault(Code.BAD_REQUEST, reason="json.path")

    def forget ( self, value: Any, path: str, separator: str = "." ) -> Any:

        copied = deepcopy(value)
        self._forget_(copied, path, separator)

        return copied

    def _forget_ ( self, value: Any, path: str, separator: str ) -> None:

        parts = self._segments_(path, separator)

        if not parts: return

        parent = self._walk_(value, separator.join(parts[:-1]), separator)
        last   = parts[-1]

        if isinstance(parent, dict): parent.pop(last, None)
        elif isinstance(parent, list) and self._indexable_(parent, last): parent.pop(int(last))

    def pick ( self, value: Mapping[str, Any], *paths: str, separator: str = "." ) -> dict[str, Any]:

        kept: dict[str, Any] = {}

        for path in paths:

            found = self._walk_(value, path, separator)

            if found is MISSING: continue
            if not path: kept = deepcopy(dict(value))
            else: self._put_(kept, self._segments_(path, separator), deepcopy(found))

        return kept

    def omit ( self, value: Mapping[str, Any], *paths: str, separator: str = "." ) -> dict[str, Any]:

        kept = deepcopy(dict(value))

        for path in paths: self._forget_(kept, path, separator)

        return kept

    def merge ( self, base: Mapping[str, Any], *others: Mapping[str, Any] ) -> dict[str, Any]:

        merged: dict[str, Any] = dict(base)

        for other in others:

            for key, value in other.items():

                found = merged.get(key)

                if isinstance(found, OBJECTS) and isinstance(value, OBJECTS): merged[key] = self.merge(found, value)
                else: merged[key] = value

        return merged

    def flatten ( self, value: Mapping[str, Any], prefix: str = "", separator: str = "." ) -> dict[str, Any]:

        flat: dict[str, Any] = {}

        self._flatten_(value, prefix or None, separator, flat)

        return flat

    def _flatten_ (
        self, value: Mapping[str, Any], prefix: str | None, separator: str, flat: dict[str, Any],
    ) -> None:

        for key, item in value.items():

            name = f"{prefix}{separator}{key}" if prefix is not None else str(key)

            if isinstance(item, OBJECTS) and item: self._flatten_(item, name, separator, flat)
            else: flat[name] = item

    def unflatten ( self, flat: Mapping[str, Any], separator: str = "." ) -> dict[str, Any]:

        nested: dict[str, Any] = {}

        for path, item in flat.items():

            current = nested
            parts   = path.split(separator)

            for part in parts[:-1]:

                if not isinstance(current.get(part), dict): current[part] = {}

                current = current[part]

            current[parts[-1]] = item

        return nested

    def entries ( self, value: Any, separator: str = "." ) -> Iterator[tuple[str, Any]]:

        if not separator: raise Fault(Code.BAD_REQUEST, reason="json.path")

        if not isinstance(value, (dict, list)): return

        children = iter(value.items()) if isinstance(value, dict) else iter(enumerate(value))
        stack: list[tuple[Iterator[tuple[Any, Any]], str, int]] = [(children, "", id(value))]
        active: set[int] = {id(value)}
        count = 0

        while stack:

            source, prefix, identity = stack[-1]

            try: key, item = next(source)
            except StopIteration:

                stack.pop()

                active.remove(identity)

                continue

            if isinstance(key, str) and (not key or separator in key):

                raise Fault(Code.BAD_REQUEST, "Choose an unambiguous path separator", "json.path")

            path = f"{prefix}{separator}{key}" if prefix else str(key)
            count += 1

            if count > MAX_NODES or len(stack) > MAX_DEPTH: raise Fault(Code.TOO_LARGE, reason="json.depth")

            if isinstance(item, (dict, list)) and item:

                if id(item) in active: raise Fault(Code.BAD_REQUEST, reason="json.cycle")

                active.add(id(item))
                children = iter(item.items()) if isinstance(item, dict) else iter(enumerate(item))
                stack.append((children, path, id(item)))

            elif path: yield path, item

    def paths ( self, value: Mapping[str, Any], separator: str = "." ) -> list[str]:

        return list(self.flatten(value, "", separator))

    def rename ( self, value: Any, change: Callable[[str], str], deep: bool = True ) -> Any:

        return self._transform_(value, lambda item: item, change, deep)

    def walk (
        self, value: Any, change: Callable[[Any], Any], *, keys: Callable[[str], str] | None = None,
    ) -> Any:

        return self._transform_(value, change, keys, deep=True)

    def _transform_ (
        self, value: Any, change: Callable[[Any], Any], keys: Callable[[str], str] | None, deep: bool,
    ) -> Any:

        active: set[int] = set()
        count = 1

        def visit ( item: Any, depth: int, recur: Visitor ) -> Any:

            nonlocal count

            mapping = isinstance(item, OBJECTS)

            if not mapping and (not deep or not isinstance(item, (list, tuple))): return change(item)
            if id(item) in active: raise Fault(Code.BAD_REQUEST, reason="json.cycle")

            count += len(item)

            if count > MAX_NODES or (item and depth >= MAX_DEPTH): raise Fault(Code.TOO_LARGE, reason="json.depth")

            active.add(id(item))

            if mapping:

                made: Any = {}

                for key, child in item.items():

                    name = keys(str(key)) if keys is not None else key

                    if keys is not None and not isinstance(name, str): raise Fault(Code.BAD_REQUEST, reason="json.key")
                    if name in made: raise Fault(Code.CONFLICT, reason="json.key")

                    if not deep: made[name] = child
                    else: made[name] = change(child) if type(child) in SCALARS else recur(child, depth + 1, recur)

            else:

                made = [change(child) if type(child) in SCALARS else recur(child, depth + 1, recur) for child in item]
                made = tuple(made) if isinstance(item, tuple) else made

            active.remove(id(item))

            return made

        return visit(value, 0, visit)

    def prune ( self, value: Any, empty: tuple[Any, ...] = (None, "", [], {}) ) -> Any:

        if isinstance(value, OBJECTS):

            pairs = ((key, self.prune(item, empty)) for key, item in value.items())

            return { key: item for key, item in pairs if not self._empty_(item, empty) }

        if isinstance(value, list):

            pruned = (self.prune(item, empty) for item in value)

            return [item for item in pruned if not self._empty_(item, empty)]

        return value

    def kind ( self, value: Any ) -> str:

        for name, kinds in KINDS:

            if isinstance(value, kinds): return name

        return "null" if value is None else type(value).__name__

    def diff ( self, left: Any, right: Any, pointer: str = "" ) -> list[dict[str, Any]]:

        self._parts_(pointer)
        ops: list[dict[str, Any]] = []

        try: self._diff_(left, right, pointer, ops)
        except RecursionError as error: raise Fault(Code.BAD_REQUEST, reason="json.depth") from error

        return ops

    def _diff_ ( self, left: Any, right: Any, pointer: str, ops: list[dict[str, Any]] ) -> None:

        if left is right: return

        if isinstance(left, OBJECTS) and isinstance(right, OBJECTS):

            for key in left:

                path = f"{pointer}/{self._escape_(key)}"

                if key not in right: ops.append({ "op": "remove", "path": path })
                else: self._diff_(left[key], right[key], path, ops)

            ops.extend(
                { "op": "add", "path": f"{pointer}/{self._escape_(key)}", "value": right[key] }
                for key in right if key not in left
            )

        elif isinstance(left, list) and isinstance(right, list):

            for index in range(min(len(left), len(right))):

                self._diff_(left[index], right[index], f"{pointer}/{index}", ops)

            ops.extend(
                { "op": "remove", "path": f"{pointer}/{index}" }
                for index in reversed(range(len(right), len(left)))
            )
            ops.extend(
                { "op": "add", "path": f"{pointer}/-", "value": right[index] }
                for index in range(len(left), len(right))
            )

        elif type(left) is not type(right) or left != right:

            ops.append({ "op": "replace", "path": pointer, "value": right })

    def patch ( self, value: Any, ops: Sequence[Mapping[str, Any]] ) -> Any:

        ops = self._operations_(ops)

        try:

            current = deepcopy(value)

            for op in ops: current = self._apply_(current, op)

        except (KeyError, IndexError, TypeError, ValueError, RecursionError) as error:

            raise Fault(Code.BAD_REQUEST, reason="json.patch") from error

        return None if current is MISSING else current

    def _apply_ ( self, current: Any, op: Mapping[str, Any] ) -> Any:

        if not isinstance(op, OBJECTS): raise Fault(Code.BAD_REQUEST, reason="json.patch")

        action = op["op"]
        parts  = self._parts_(op["path"])

        if not isinstance(action, str) or action not in OPERATIONS:

            raise Fault(Code.BAD_REQUEST, reason="json.patch")

        if action == "test":

            if not self._same_(self._pointer_(current, parts), op["value"]):

                raise Fault(Code.CONFLICT, reason="json.test")

            return current

        if action in ("move", "copy"):

            origin = self._parts_(op["from"])
            item   = self._pointer_(current, origin)

            if action == "move":

                if len(parts) > len(origin) and parts[:len(origin)] == origin:

                    raise Fault(Code.BAD_REQUEST, reason="json.patch")

                current = self._assign_(current, origin, "remove", None)

            else: item = deepcopy(item)

            return self._assign_(current, parts, "add", item)

        item = deepcopy(op["value"]) if action in ("add", "replace") else None

        return self._assign_(current, parts, action, item)

    def _assign_ ( self, current: Any, parts: Sequence[str], action: str, item: Any ) -> Any:

        if not parts:

            if action != "add" and current is MISSING: raise Fault(Code.BAD_REQUEST, reason="json.patch")

            return MISSING if action == "remove" else item

        parent = self._pointer_(current, parts[:-1])
        last   = parts[-1]

        if isinstance(parent, list):

            index = self._index_(last, len(parent), action == "add")

            if action == "add": parent.insert(index, item)
            elif action == "remove": parent.pop(index)
            else: parent[index] = item

        elif isinstance(parent, dict):

            if action != "add" and last not in parent: raise Fault(Code.BAD_REQUEST, reason="json.patch")
            if action == "remove": del parent[last]
            else: parent[last] = item

        else: raise Fault(Code.BAD_REQUEST, reason="json.patch")

        return current

    def add ( self, value: Any, path: str, item: Any, separator: str = "." ) -> Any:

        return value if self.has(value, path, separator) else self.put(value, path, item, separator)

    def has_any ( self, value: Any, *paths: str, separator: str = "." ) -> bool:

        return any(self.has(value, path, separator) for path in paths)

    def has_all ( self, value: Any, *paths: str, separator: str = "." ) -> bool:

        return bool(paths) and all(self.has(value, path, separator) for path in paths)

    def prefix ( self, value: Mapping[str, Any], text: str ) -> dict[str, Any]:

        return { f"{text}{key}": item for key, item in value.items() }

    def pull ( self, value: Any, path: str, default: Any = None, separator: str = "." ) -> tuple[Any, Any]:

        return self.get(value, path, default, separator), self.forget(value, path, separator)

    def push ( self, value: Any, path: str, item: Any, separator: str = "." ) -> Any:

        found = self.get(value, path, None, separator)

        if isinstance(found, list): items = [*found, item]
        elif found is None: items = [item]
        else: items = [found, item]

        return self.put(value, path, items, separator)

    def flip ( self, value: Mapping[Any, Any] ) -> dict[Any, Any]:

        return { item: key for key, item in value.items() }

    def _walk_ ( self, value: Any, path: str, separator: str ) -> Any:

        current = value

        for part in self._segments_(path, separator):

            if isinstance(current, OBJECTS) and part in current: current = current[part]
            elif self._indexable_(current, part): current = current[int(part)]
            else: return MISSING

        return current

    def _pointer_ ( self, value: Any, parts: Sequence[str] ) -> Any:

        if value is MISSING: raise Fault(Code.BAD_REQUEST, reason="json.patch")

        current = value

        for part in parts:

            if isinstance(current, list): current = current[self._index_(part, len(current))]
            elif isinstance(current, dict): current = current[part]
            else: raise Fault(Code.BAD_REQUEST, reason="json.patch")

        return current

    def _operations_ ( self, ops: Any ) -> Sequence[Mapping[str, Any]]:

        if not isinstance(ops, Sequence) or isinstance(ops, (str, bytes, bytearray, memoryview)):

            raise Fault(Code.BAD_REQUEST, reason="json.patch")

        return ops

    def _parts_ ( self, pointer: Any ) -> list[str]:

        if not isinstance(pointer, str) or (pointer and not pointer.startswith("/")):

            raise Fault(Code.BAD_REQUEST, reason="json.patch")

        parts = pointer.split("/")[1:]

        for part in parts:

            if "~" in part.replace("~0", "").replace("~1", ""):

                raise Fault(Code.BAD_REQUEST, reason="json.patch")

        return [self._unescape_(part) for part in parts]

    def _index_ ( self, part: str, length: int, adding: bool = False ) -> int:

        if adding and part == "-": return length
        if not part.isascii() or not part.isdecimal() or len(part) > INDEX_DIGITS:

            raise Fault(Code.BAD_REQUEST, reason="json.patch")

        if len(part) > 1 and part.startswith("0"): raise Fault(Code.BAD_REQUEST, reason="json.patch")

        index = int(part)

        if index >= length + int(adding): raise Fault(Code.BAD_REQUEST, reason="json.patch")

        return index

    def _same_ ( self, left: Any, right: Any ) -> bool:

        if isinstance(left, OBJECTS) and isinstance(right, OBJECTS):

            return left.keys() == right.keys() and all(self._same_(left[key], right[key]) for key in left)

        if isinstance(left, list) and isinstance(right, list):

            return len(left) == len(right) and all(self._same_(a, b) for a, b in zip(left, right, strict=True))

        if isinstance(left, bool) != isinstance(right, bool): return False

        return bool(left == right)

    def _segments_ ( self, path: str, separator: str ) -> list[str]:

        if not isinstance(cast("object", path), str) or not isinstance(cast("object", separator), str) or not separator:

            raise Fault(Code.BAD_REQUEST, reason="json.path")

        return path.split(separator) if path else []

    def _escape_ ( self, key: Any ) -> str:

        return str(key).replace("~", "~0").replace("/", "~1")

    def _unescape_ ( self, part: str ) -> str:

        return part.replace("~1", "/").replace("~0", "~")

    def _indexable_ ( self, current: Any, part: str ) -> bool:

        if not isinstance(current, (list, tuple, Sequence)) or isinstance(current, (str, bytes, bytearray, memoryview)):

            return False

        return part.isascii() and part.isdecimal() and len(part) <= INDEX_DIGITS and int(part) < len(current)

    def _empty_ ( self, value: Any, empty: tuple[Any, ...] ) -> bool:

        for item in empty:

            if value is item: return True
            if type(value) is type(item) and value == item: return True

        return False
