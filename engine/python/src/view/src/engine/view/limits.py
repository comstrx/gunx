from collections.abc import Iterable, Mapping, Sized
from string import Formatter
from typing import Any
import functools

from .arch import Check, DIGITS, ELEMENT, MOST, PADS, RUN, SHORT, SPEC, SPECS, TABS

class Limits:

    @staticmethod
    def pick ( args: tuple[Any, ...], kwargs: dict[str, Any], at: int, name: str, default: Any ) -> Any:

        return args[at] if len(args) > at else kwargs.get(name, default)

    @staticmethod
    def whole ( value: object ) -> int:

        return abs(value) if type(value) is int else 0

    @staticmethod
    def run ( digits: str ) -> int:

        return int(digits) if len(digits) <= RUN else MOST

    @staticmethod
    def scanned ( text: str ) -> tuple[int, bool]:

        total, starred = len(text), False

        for parts in SPEC.findall(text):

            for part in parts:

                if part == "*": starred = True
                elif part: total += Limits.run(part)

        return total, starred

    @staticmethod
    def parsed ( text: str ) -> tuple[int, bool]:

        total, nested = len(text), False

        for _, _, spec, _ in Formatter().parse(text):

            if not spec: continue

            nested = nested or "{" in spec
            total += sum(Limits.run(digits) for digits in DIGITS.findall(spec))

        return total, nested

    @staticmethod
    def wide ( text: str, values: object ) -> int:

        total, starred = Limits.percent(text) if len(text) <= SHORT else Limits.scanned(text)

        if not starred: return total

        return total + sum(Limits.whole(value) for value in (values if isinstance(values, tuple) else (values,)))

    @staticmethod
    def fielded ( text: str, values: Iterable[object] ) -> int:

        total, nested = Limits.braces(text) if len(text) <= SHORT else Limits.parsed(text)

        return total + sum(Limits.whole(value) for value in values) if nested else total

    @staticmethod
    def swapped ( text: Any, old: Any, new: Any ) -> int:

        grown: int = len(text) + text.count(old) * max(len(new) - len(old), 0)

        return grown

    @staticmethod
    def method ( owner: str | bytes, name: str, args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        if name in PADS: return Limits.whole(args[0]) if args else 0
        if name == "replace": return Limits.swapped(owner, args[0], args[1])
        if name == "join": return len(owner) * len(args[0]) if isinstance(args[0], Sized) else 0
        if name == "expandtabs": return Limits.tabbed(owner, Limits.whole(Limits.pick(args, kwargs, 0, "tabsize", 8)))

        return Limits.styled(owner, name, args, kwargs) if isinstance(owner, str) else 0

    @staticmethod
    def tabbed ( owner: str | bytes, size: int ) -> int:

        return len(owner) + (owner.count("\t") if isinstance(owner, str) else owner.count(b"\t")) * size

    @staticmethod
    def styled ( owner: str, name: str, args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        if name == "format": return Limits.fielded(owner, (*args, *kwargs.values()))
        if name == "format_map" and args and isinstance(args[0], Mapping):

            return Limits.fielded(owner, args[0].values())

        return 0

    @staticmethod
    def padded ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        return Limits.whole(Limits.pick(args, kwargs, 1, "width", 80))

    @staticmethod
    def indented ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        text, width = str(args[0]), Limits.pick(args, kwargs, 1, "width", 4)

        return len(text) + (text.count("\n") + 1) * (len(width) if isinstance(width, str) else Limits.whole(width))

    @staticmethod
    def replaced ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        old, new = Limits.pick(args, kwargs, 1, "old", ""), Limits.pick(args, kwargs, 2, "new", "")

        return Limits.swapped(str(args[0]), str(old), str(new))

    @staticmethod
    def joined ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        return len(args[0]) * len(str(Limits.pick(args, kwargs, 1, "d", ""))) if isinstance(args[0], Sized) else 0

    @staticmethod
    def formatted ( args: tuple[Any, ...], _: dict[str, Any] ) -> int:

        return Limits.wide(str(args[0]), args[1:])

    @staticmethod
    def wrapped ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        text, width = str(args[0]), max(Limits.whole(Limits.pick(args, kwargs, 1, "width", 79)), 1)
        lines = 2 * len(text) // width + text.count("\n") + 1

        return len(text) + lines * len(str(Limits.pick(args, kwargs, 3, "wrapstring", None) or "\n"))

    @staticmethod
    def sliced ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        return Limits.whole(Limits.pick(args, kwargs, 1, "slices", 0)) * ELEMENT

    @staticmethod
    def batched ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        if Limits.pick(args, kwargs, 2, "fill_with", None) is None: return 0

        return Limits.whole(Limits.pick(args, kwargs, 1, "linecount", 0)) * ELEMENT

    @staticmethod
    def dumped ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        return MOST if Limits.whole(Limits.pick(args, kwargs, 1, "indent", None)) > TABS else 0

    @staticmethod
    def masked ( args: tuple[Any, ...], kwargs: dict[str, Any] ) -> int:

        return len(str(args[0])) * len(str(Limits.pick(args, kwargs, 2, "char", "*")))

    percent = staticmethod(functools.lru_cache(SPECS)(scanned))
    braces  = staticmethod(functools.lru_cache(SPECS)(parsed))

CHECKS: dict[str, Check] = {
    "center": Limits.padded, "indent": Limits.indented, "replace": Limits.replaced, "join": Limits.joined,
    "format": Limits.formatted, "wordwrap": Limits.wrapped, "slice": Limits.sliced, "batch": Limits.batched,
    "tojson": Limits.dumped, "mask": Limits.masked,
}
