from collections import Counter
from collections.abc import Callable, Hashable, Iterable, Iterator, Mapping, Sequence
from itertools import dropwhile, product, takewhile
from typing import Any, cast

from engine.error import Code, Fault
from engine.func import func
from engine.json import json
from .arch import Check, MAX_LIMIT, MISSING, NULLABLE, Page, PAIR, Pick, TESTS

class Array:

    def __init__ ( self ) -> None:

        self._bitmap = func.pick("array.bitmap", "pyroaring", self._native_bitmap_, lambda: self._pure_bitmap_)

    def wrap ( self, value: Any ) -> list[Any]:

        if value is None: return []
        if isinstance(value, list): return value
        if isinstance(value, tuple | set | frozenset): return list(value)

        return [value]

    def chunk [T] ( self, items: Sequence[T], size: int ) -> Iterator[Sequence[T]]:

        if size < 1: raise Fault(Code.INTERNAL, reason="array.chunk")

        for start in range(0, len(items), size): yield items[start:start + size]

    def chunk_by [T] ( self, items: Iterable[T], key: Pick[T] ) -> list[list[T]]:

        pick = self.getter(key)
        runs: list[list[T]] = []
        last: Any = MISSING

        for item in items:

            mark = pick(item)

            if mark != last or not runs: runs.append([])

            runs[-1].append(item)

            last = mark

        return runs

    def split [T] ( self, items: Sequence[T], parts: int ) -> list[Sequence[T]]:

        if parts < 1: raise Fault(Code.INTERNAL, reason="array.split")

        size, rest = divmod(len(items), parts)
        found: list[Sequence[T]] = []
        at = 0

        for index in range(parts):

            width = size + (1 if index < rest else 0)

            found.append(items[at:at + width])

            at += width

        return found

    def unique [T] ( self, items: Iterable[T], key: Pick[T] | None = None ) -> list[T]:

        pick = self.getter(key) if key is not None else None
        seen: set[Hashable] = set()
        kept: list[T] = []

        for item in items:

            mark = pick(item) if pick else item

            if mark in seen: continue

            seen.add(mark)
            kept.append(item)

        return kept

    def duplicates [T] ( self, items: Iterable[T], key: Pick[T] | None = None ) -> list[T]:

        pick  = self.getter(key) if key is not None else None
        seen: set[Hashable] = set()
        twice: list[T] = []

        for item in items:

            mark = pick(item) if pick else item

            if mark in seen: twice.append(item)

            seen.add(mark)

        return twice

    def group [T] ( self, items: Iterable[T], key: Pick[T] ) -> dict[Hashable, list[T]]:

        pick = self.getter(key)
        grouped: dict[Hashable, list[T]] = {}

        for item in items: grouped.setdefault(pick(item), []).append(item)

        return grouped

    def index [T] ( self, items: Iterable[T], key: Pick[T] ) -> dict[Hashable, T]:

        pick = self.getter(key)

        return { pick(item): item for item in items }

    def count_by [T] ( self, items: Iterable[T], key: Pick[T] | None = None ) -> dict[Hashable, int]:

        pick = self.getter(key) if key is not None else None

        return dict(Counter(pick(item) if pick else item for item in items))

    def flatten ( self, items: Iterable[Any], depth: int = 1 ) -> list[Any]:

        flat: list[Any] = []

        for item in items:

            nested = depth != 0 and isinstance(item, list | tuple | set | frozenset)

            if nested: flat.extend(self.flatten(item, depth - 1))
            else: flat.append(item)

        return flat

    def compact [T] ( self, items: Iterable[T | None] ) -> list[T]:

        return [item for item in items if item is not None]

    def pluck ( self, items: Iterable[Any], name: str, key: str | None = None ) -> Any:

        pick = self.getter(name)

        if key is None: return [pick(item) for item in items]

        by = self.getter(key)

        return { by(item): pick(item) for item in items }

    def first [T] ( self, items: Iterable[T], default: T | None = None, check: Check[T] | None = None ) -> T | None:

        return next(iter(items) if check is None else (item for item in items if check(item)), default)

    def last [T] ( self, items: Sequence[T], default: T | None = None, check: Check[T] | None = None ) -> T | None:

        if check is not None: return next((item for item in reversed(items) if check(item)), default)

        return items[-1] if items else default

    def get [T] ( self, items: Sequence[T], index: int, default: T | None = None ) -> T | None:

        return items[index] if -len(items) <= index < len(items) else default

    def take [T] ( self, items: Sequence[T], count: int ) -> Sequence[T]:

        return items[:count] if count >= 0 else items[count:]

    def skip [T] ( self, items: Sequence[T], count: int ) -> Sequence[T]:

        return items[count:]

    def nth [T] ( self, items: Sequence[T], step: int, offset: int = 0 ) -> Sequence[T]:

        if step < 1: raise Fault(Code.INTERNAL, reason="array.nth")

        return items[offset::step]

    def pad [T] ( self, items: Sequence[T], size: int, value: T | None = None ) -> list[T | None]:

        missing = abs(size) - len(items)

        if missing <= 0: return list(items)

        return [*items, *([value] * missing)] if size > 0 else [*([value] * missing), *items]

    def prepend [T] ( self, items: Iterable[T], *values: T ) -> list[T]:

        return [*values, *items]

    def rotate [T] ( self, items: Sequence[T], steps: int ) -> list[T]:

        if not items: return []

        at = steps % len(items)

        return [*items[at:], *items[:at]]

    def interleave [T] ( self, *lists: Sequence[T] ) -> list[T]:

        longest = max((len(items) for items in lists), default=0)

        return [items[at] for at in range(longest) for items in lists if at < len(items)]

    def cross ( self, *lists: Iterable[Any] ) -> list[tuple[Any, ...]]:

        return list(product(*lists))

    def transpose [T] ( self, rows: Sequence[Sequence[T]] ) -> list[list[T]]:

        return [list(column) for column in zip(*rows, strict=True)]

    def partition [T] ( self, items: Iterable[T], keep: Check[T] ) -> tuple[list[T], list[T]]:

        yes: list[T] = []
        no: list[T] = []

        for item in items: (yes if keep(item) else no).append(item)

        return yes, no

    def keep [T] ( self, items: Iterable[T], check: Check[T] ) -> list[T]:

        return [item for item in items if check(item)]

    def reject [T] ( self, items: Iterable[T], check: Check[T] ) -> list[T]:

        return [item for item in items if not check(item)]

    def every [T] ( self, items: Iterable[T], check: Check[T] ) -> bool:

        return all(check(item) for item in items)

    def some [T] ( self, items: Iterable[T], check: Check[T] ) -> bool:

        return any(check(item) for item in items)

    def search [T] ( self, items: Iterable[T], check: Check[T] ) -> int:

        return next((index for index, item in enumerate(items) if check(item)), -1)

    def sole [T] ( self, items: Iterable[T], check: Check[T] | None = None ) -> T:

        found = [item for item in items if check is None or check(item)]

        if not found: raise Fault(Code.NOT_FOUND, reason="array.sole")
        if len(found) > 1:

            raise Fault(Code.CONFLICT, reason="array.sole", errors={ "count": [str(len(found))] })

        return found[0]

    def where ( self, items: Iterable[Any], name: str, operator: Any = MISSING, value: Any = MISSING ) -> list[Any]:

        if value is MISSING: operator, value = "=", operator

        if operator not in TESTS:

            raise Fault(Code.INTERNAL, reason="array.operator", errors={ "operator": [str(operator)] })

        pick = self.getter(name)

        return [item for item in items if self.compare(pick(item), operator, value)]

    def where_in ( self, items: Iterable[Any], name: str, values: Iterable[Any] ) -> list[Any]:

        return self.where(items, name, "in", list(values))

    def where_not_in ( self, items: Iterable[Any], name: str, values: Iterable[Any] ) -> list[Any]:

        return self.where(items, name, "not_in", list(values))

    def first_where ( self, items: Iterable[Any], name: str, operator: Any = MISSING, value: Any = MISSING ) -> Any:

        return self.first(self.where(items, name, operator, value))

    def sort [T] ( self, items: Iterable[T], key: Pick[T] | None = None, reverse: bool = False ) -> list[T]:

        pick = self.getter(key) if key is not None else None

        if pick: return sorted(items, key=pick, reverse=reverse)

        return sorted(cast("Iterable[Any]", items), reverse=reverse)

    def min_by [T] ( self, items: Iterable[T], key: Pick[T] ) -> T | None:

        return min(items, key=self.getter(key), default=None)

    def max_by [T] ( self, items: Iterable[T], key: Pick[T] ) -> T | None:

        return max(items, key=self.getter(key), default=None)

    def sum ( self, items: Iterable[Any], key: str | None = None ) -> Any:

        return sum(self.numbers(items, key))

    def avg ( self, items: Iterable[Any], key: str | None = None ) -> Any:

        found = self.numbers(items, key)

        return sum(found) / len(found) if found else None

    def min ( self, items: Iterable[Any], key: str | None = None ) -> Any:

        return min(self.numbers(items, key), default=None)

    def max ( self, items: Iterable[Any], key: str | None = None ) -> Any:

        return max(self.numbers(items, key), default=None)

    def median ( self, items: Iterable[Any], key: str | None = None ) -> Any:

        found = sorted(self.numbers(items, key))

        if not found: return None

        middle = len(found) // 2

        return found[middle] if len(found) % 2 else (found[middle - 1] + found[middle]) / 2

    def mode ( self, items: Iterable[Any], key: str | None = None ) -> Any:

        found = Counter(self.numbers(items, key)).most_common(1)

        return found[0][0] if found else None

    def numbers ( self, items: Iterable[Any], key: str | None = None ) -> list[Any]:

        pick = self.getter(key) if key is not None else None

        return [value for value in (pick(item) if pick else item for item in items) if value is not None]

    def after [T] ( self, items: Sequence[T], value: T ) -> T | None:

        try: index = list(items).index(value)
        except ValueError: return None

        return items[index + 1] if index + 1 < len(items) else None

    def before [T] ( self, items: Sequence[T], value: T ) -> T | None:

        try: index = list(items).index(value)
        except ValueError: return None

        return items[index - 1] if index > 0 else None

    def divide ( self, mapping: Mapping[Any, Any] ) -> tuple[list[Any], list[Any]]:

        return list(mapping.keys()), list(mapping.values())

    def flat_map [T, R] ( self, items: Iterable[T], make: Callable[[T], Iterable[R]] ) -> list[R]:

        return [made for item in items for made in make(item)]

    def percentage [T] ( self, items: Sequence[T], check: Check[T], places: int = 2 ) -> float:

        if not items: return 0.0

        return round(100 * sum(1 for item in items if check(item)) / len(items), places)

    def skip_while [T] ( self, items: Iterable[T], check: Check[T] ) -> list[T]:

        return list(dropwhile(check, items))

    def skip_until [T] ( self, items: Iterable[T], check: Check[T] ) -> list[T]:

        return list(dropwhile(lambda item: not check(item), items))

    def take_while [T] ( self, items: Iterable[T], check: Check[T] ) -> list[T]:

        return list(takewhile(check, items))

    def take_until [T] ( self, items: Iterable[T], check: Check[T] ) -> list[T]:

        return list(takewhile(lambda item: not check(item), items))

    def splice [T] (
        self, items: Sequence[T], start: int, length: int | None = None, replacement: Iterable[T] = (),
    ) -> tuple[list[T], list[T]]:

        end     = len(items) if length is None else start + length
        removed = list(items[start:end])
        kept    = [*items[:start], *replacement, *items[end:]]

        return kept, removed

    def unwrap ( self, items: Any ) -> Any:

        return items[0] if isinstance(items, list | tuple) and len(items) == 1 else items

    def window [T] ( self, items: Sequence[T], size: int ) -> Iterator[Sequence[T]]:

        for start in range(max(0, len(items) - size + 1)): yield items[start:start + size]

    def times [T] ( self, count: int, make: Callable[[int], T] ) -> list[T]:

        return [make(index) for index in range(1, count + 1)]

    def join ( self, items: Iterable[Any], glue: str = ", ", final: str | None = None ) -> str:

        parts = [str(item) for item in items]

        if final is None or len(parts) < PAIR: return glue.join(parts)

        return glue.join(parts[:-1]) + final + parts[-1]

    def only ( self, mapping: Mapping[str, Any], *keys: str ) -> dict[str, Any]:

        return { key: mapping[key] for key in keys if key in mapping }

    def omit ( self, mapping: Mapping[str, Any], *keys: str ) -> dict[str, Any]:

        return { key: value for key, value in mapping.items() if key not in keys }

    def page ( self, total: int, page: int = 1, limit: int = 20, ceiling: int = MAX_LIMIT ) -> Page:

        if page < 1 or limit < 1 or limit > ceiling or total < 0: raise Fault(Code.BAD_REQUEST, reason="array.page")

        return Page(page, limit, total)

    def paginate [T] (
        self, items: Sequence[T], page: int = 1, limit: int = 20, ceiling: int = MAX_LIMIT,
    ) -> tuple[Sequence[T], Page]:

        made = self.page(len(items), page, limit, ceiling)

        return items[made.offset():made.offset() + limit], made

    def intersect ( self, left: Iterable[Hashable], right: Iterable[Hashable] ) -> list[Any]:

        return self.combine("and", left, right)

    def union ( self, left: Iterable[Hashable], right: Iterable[Hashable] ) -> list[Any]:

        return self.combine("or", left, right)

    def difference ( self, left: Iterable[Hashable], right: Iterable[Hashable] ) -> list[Any]:

        return self.combine("sub", left, right)

    def combine ( self, op: str, left: Iterable[Hashable], right: Iterable[Hashable] ) -> list[Any]:

        a, b = list(left), list(right)

        try: return cast("list[Any]", self._bitmap(op, a, b))
        except (TypeError, OverflowError, ValueError): return self._pure_bitmap_(op, a, b)

    def getter ( self, key: Any ) -> Callable[[Any], Any]:

        if callable(key): return cast("Callable[[Any], Any]", key)

        name = str(key)

        if "." in name: return lambda item: json.get(item, name)

        def pick ( item: Any ) -> Any:

            return item.get(name) if isinstance(item, Mapping) else getattr(item, name, None)

        return pick

    def compare ( self, found: Any, operator: str, value: Any ) -> bool:

        if found is None and operator not in NULLABLE: return False

        try: return bool(TESTS[operator](found, value))
        except TypeError: return False

    def _native_bitmap_ ( self ) -> Any:

        from pyroaring import BitMap64

        def combine ( op: str, left: Iterable[Any], right: Iterable[Any] ) -> list[int]:

            a, b = BitMap64(left), BitMap64(right)

            return list(a & b if op == "and" else a | b if op == "or" else a - b)

        return combine

    @staticmethod
    def _pure_bitmap_ ( op: str, left: Iterable[Any], right: Iterable[Any] ) -> list[Any]:

        a, b = list(left), set(right)

        if op == "and": found = [item for item in dict.fromkeys(a) if item in b]
        elif op == "sub": found = [item for item in dict.fromkeys(a) if item not in b]
        else: found = list(dict.fromkeys([*a, *right]))

        try: return sorted(found)
        except TypeError: return found
