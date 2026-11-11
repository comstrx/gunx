from collections.abc import Callable, Iterable, Mapping, Sequence
from copy import deepcopy
from typing import Any

from engine.error import Code, Fault
from .arch import KINDS, MISSING, UNSAFE
import orjson

class Json:

    def __init__ ( self ) -> None:

        self._default: Callable[[Any], Any] | None = None
        self._hook = self._fallback_

    def use ( self, default: Callable[[Any], Any] ) -> None:

        self._default = default

    def encode ( self, value: object, pretty: bool = False, stable: bool = False ) -> bytes:

        option = orjson.OPT_NON_STR_KEYS

        if pretty: option |= orjson.OPT_INDENT_2
        if stable: option |= orjson.OPT_SORT_KEYS

        try: return orjson.dumps(value, default=self._hook, option=option)
        except (TypeError, ValueError) as error: raise Fault(Code.INTERNAL, reason="json.encode") from error

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

        return b"".join(self.encode(value) + b"\n" for value in values)

    def unlines ( self, data: bytes | str ) -> list[Any]:

        raw = data.encode() if isinstance(data, str) else data

        return [self.decode(line) for line in raw.splitlines() if line.strip()]

    def embed ( self, value: object ) -> str:

        text = self.dumps(value)

        for char, escaped in UNSAFE.items(): text = text.replace(char, escaped)

        return text

    def _fallback_ ( self, value: Any ) -> Any:

        if isinstance(value, set | frozenset): return sorted(value, key=str)
        if isinstance(value, bytes): return value.decode("utf-8", "replace")
        if hasattr(value, "dump") and callable(value.dump): return value.dump()
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

        copied = deepcopy(value)
        parts  = path.split(separator) if path else []

        if not parts: return item

        current = copied

        for part in parts[:-1]:

            if isinstance(current, list) and part.isdigit() and int(part) < len(current): current = current[int(part)]
            else:

                if not isinstance(current, dict): return copied
                if not isinstance(current.get(part), dict | list): current[part] = {}

                current = current[part]

        last = parts[-1]

        if isinstance(current, list) and last.isdigit() and int(last) < len(current): current[int(last)] = item
        elif isinstance(current, dict): current[last] = item

        return copied

    def forget ( self, value: Any, path: str, separator: str = "." ) -> Any:

        copied = deepcopy(value)
        parts  = path.split(separator) if path else []

        if not parts: return copied

        parent = self._walk_(copied, separator.join(parts[:-1]), separator)
        last   = parts[-1]

        if isinstance(parent, dict): parent.pop(last, None)
        elif isinstance(parent, list) and last.isdigit() and int(last) < len(parent): parent.pop(int(last))

        return copied

    def pick ( self, value: Mapping[str, Any], *paths: str, separator: str = "." ) -> dict[str, Any]:

        kept: dict[str, Any] = {}

        for path in paths:

            found = self._walk_(value, path, separator)

            if found is not MISSING: kept = self.put(kept, path, found, separator)

        return kept

    def omit ( self, value: Mapping[str, Any], *paths: str, separator: str = "." ) -> dict[str, Any]:

        kept: Any = dict(value)

        for path in paths: kept = self.forget(kept, path, separator)

        return dict(kept)

    def merge ( self, base: Mapping[str, Any], *others: Mapping[str, Any] ) -> dict[str, Any]:

        merged: dict[str, Any] = dict(base)

        for other in others:

            for key, value in other.items():

                found = merged.get(key)

                if isinstance(found, Mapping) and isinstance(value, Mapping): merged[key] = self.merge(found, value)
                else: merged[key] = value

        return merged

    def flatten ( self, value: Mapping[str, Any], prefix: str = "", separator: str = "." ) -> dict[str, Any]:

        flat: dict[str, Any] = {}

        for key, item in value.items():

            name = f"{prefix}{separator}{key}" if prefix else str(key)

            if isinstance(item, Mapping) and item: flat.update(self.flatten(item, name, separator))
            else: flat[name] = item

        return flat

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

    def paths ( self, value: Mapping[str, Any], separator: str = "." ) -> list[str]:

        return list(self.flatten(value, "", separator))

    def rename ( self, value: Any, change: Callable[[str], str], deep: bool = True ) -> Any:

        if isinstance(value, Mapping):

            items = ((change(str(key)), item) for key, item in value.items())

            return { key: self.rename(item, change, deep) if deep else item for key, item in items }

        if isinstance(value, list) and deep: return [self.rename(item, change, deep) for item in value]

        return value

    def walk ( self, value: Any, change: Callable[[Any], Any] ) -> Any:

        if isinstance(value, Mapping): return { key: self.walk(item, change) for key, item in value.items() }
        if isinstance(value, list): return [self.walk(item, change) for item in value]

        return change(value)

    def prune ( self, value: Any, empty: tuple[Any, ...] = (None, "", [], {}) ) -> Any:

        if isinstance(value, Mapping):

            kept = { key: self.prune(item, empty) for key, item in value.items() }

            return { key: item for key, item in kept.items() if not self._empty_(item, empty) }

        if isinstance(value, list):

            pruned = (self.prune(item, empty) for item in value)

            return [item for item in pruned if not self._empty_(item, empty)]

        return value

    def kind ( self, value: Any ) -> str:

        for name, kinds in KINDS:

            if isinstance(value, kinds): return name

        return "null" if value is None else type(value).__name__

    def diff ( self, left: Any, right: Any, pointer: str = "" ) -> list[dict[str, Any]]:

        if isinstance(left, Mapping) and isinstance(right, Mapping):

            ops: list[dict[str, Any]] = []

            for key in left:

                if key not in right: ops.append({ "op": "remove", "path": f"{pointer}/{self._escape_(key)}" })
                else: ops.extend(self.diff(left[key], right[key], f"{pointer}/{self._escape_(key)}"))

            added = [key for key in right if key not in left]

            ops.extend({ "op": "add", "path": f"{pointer}/{self._escape_(key)}", "value": right[key] } for key in added)

            return ops

        if isinstance(left, list) and isinstance(right, list):

            ops = []

            shared = range(min(len(left), len(right)))

            for index in shared: ops.extend(self.diff(left[index], right[index], f"{pointer}/{index}"))

            gone = reversed(range(len(right), len(left)))
            new  = range(len(left), len(right))

            ops.extend({ "op": "remove", "path": f"{pointer}/{index}" } for index in gone)
            ops.extend({ "op": "add", "path": f"{pointer}/-", "value": right[index] } for index in new)

            return ops

        if left == right and type(left) is type(right): return []

        return [{ "op": "replace", "path": pointer or "/", "value": right }]

    def patch ( self, value: Any, ops: Sequence[Mapping[str, Any]] ) -> Any:

        current = deepcopy(value)

        for op in ops:

            parts  = [self._unescape_(part) for part in str(op["path"]).split("/")[1:]]
            action = op["op"]

            if not parts or parts == [""]:

                current = op.get("value") if action in ("add", "replace") else current

                continue

            parent = self._pointer_(current, parts[:-1])
            last   = parts[-1]

            if isinstance(parent, list):

                index = len(parent) if last == "-" else int(last)

                if action == "add": parent.insert(index, op["value"])
                elif action == "remove": parent.pop(index)
                elif action == "replace": parent[index] = op["value"]

            elif isinstance(parent, dict):

                if action == "remove": parent.pop(last, None)
                else: parent[last] = op["value"]

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

        for part in path.split(separator) if path else []:

            if isinstance(current, Mapping) and part in current: current = current[part]
            elif self._indexable_(current, part): current = current[int(part)]
            else: return MISSING

        return current

    def _pointer_ ( self, value: Any, parts: Sequence[str] ) -> Any:

        current = value

        for part in parts: current = current[int(part)] if isinstance(current, list) else current[part]

        return current

    def _escape_ ( self, key: Any ) -> str:

        return str(key).replace("~", "~0").replace("/", "~1")

    def _unescape_ ( self, part: str ) -> str:

        return part.replace("~1", "/").replace("~0", "~")

    def _indexable_ ( self, current: Any, part: str ) -> bool:

        if not isinstance(current, Sequence) or isinstance(current, str) or not part.isdigit(): return False

        return int(part) < len(current)

    def _empty_ ( self, value: Any, empty: tuple[Any, ...] ) -> bool:

        return any(value is item or (type(value) is type(item) and value == item) for item in empty)
