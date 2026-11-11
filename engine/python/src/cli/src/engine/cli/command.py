from collections.abc import Mapping, Sequence
from dataclasses import replace
from enum import Enum
from types import NoneType, UnionType
from typing import Any, Literal, get_args, get_origin

from engine.error import Code, Fault
from engine.parse import parse
from .arch import Action, Argument, BARRED, EXAMPLES, Kind, LINE, NAME, nearest, NUMERIC, WORD
import inspect

class Command:

    __slots__ = ("_index", "_named", "action", "args", "examples", "group", "name", "summary")

    def __init__ ( self, name: str, action: Action, summary: str = "", group: str = "general" ) -> None:

        given: object = action

        if inspect.iscoroutine(given): given.close()

        if type(name) is not str or len(name) > WORD or NAME.fullmatch(name) is None: raise self._wrong_("name", name)
        if not callable(given): raise self._wrong_("action", name)
        if not self._line_(summary): raise self._wrong_("summary", name)
        if not self._line_(group) or not 0 < len(group) <= WORD: raise self._wrong_("group", name)

        self.name     = name
        self.action   = action
        self.summary  = summary
        self.group    = group
        self.examples: list[str] = []
        self.args: list[Argument] = []
        self._named: frozenset[str] = frozenset()
        self._index: dict[str, Argument] = {}

        self._derive_()

    def argument ( self, name: str, summary: str = "", kind: Any = None, short: str = "" ) -> Command:

        at = next((index for index, argument in enumerate(self.args) if argument.name == name), -1)

        if at < 0: raise self._wrong_("unknown", self.name)

        found = self.args[at]

        if not self._line_(summary): raise self._wrong_("summary", self.name)
        if short and not self._brief_(found, short): raise self._wrong_("short", self.name)

        made = replace(found, summary=summary or found.summary, short=short or found.short)

        if kind is not None:

            wanted, choices, many = self._kind_(kind)

            if found.flag or many: raise self._wrong_("kind", self.name)

            made = replace(made, kind=wanted, choices=choices)

        self.args[at] = made

        self._reindex_()

        return self

    def example ( self, *lines: str ) -> Command:

        if len(self.examples) + len(lines) > EXAMPLES or not all(self._line_(line) and line for line in lines):

            raise self._wrong_("example", self.name)

        self.examples.extend(lines)

        return self

    def usage ( self ) -> str:

        return " ".join([self.name, *[argument.shape() for argument in self.args]])

    def manual ( self, program: str ) -> str:

        lines = [f"Usage: {program} {self.usage()}"]
        plain = [argument for argument in self.args if not (argument.flag or argument.only)]
        named = [argument for argument in self.args if argument.flag or argument.only]

        if self.summary: lines += ["", self.summary]
        if plain: lines += ["", "Arguments", *self._rows_(plain)]
        if named: lines += ["", "Options", *self._rows_(named)]
        if self.examples: lines += ["", "Examples", *[f"  $ {example}" for example in self.examples]]

        return "\n".join(lines)

    def parse ( self, tokens: Sequence[str] ) -> dict[str, Any]:

        values: dict[str, Any] = {}
        extra: list[Any] = []
        plain = [argument for argument in self.args if not (argument.flag or argument.only or argument.rest)]
        tail  = next((argument for argument in self.args if argument.rest), None)
        at, slot, open_ = 0, 0, True

        if not all(type(token) is str for token in tokens): raise self._wrong_("tokens", self.name)

        while at < len(tokens):

            raw = tokens[at]
            at += 1

            while slot < len(plain) and plain[slot].name in values: slot += 1

            if open_ and raw == "--": open_ = False
            elif open_ and raw.startswith("--"): at = self._long_(raw, tokens, at, values)
            elif open_ and len(raw) > 1 and raw[0] == "-" and NUMERIC.match(raw) is None:

                at = self._short_(raw, tokens, at, values)

            elif slot < len(plain):

                self._put_(values, plain[slot], self._made_(plain[slot], raw))

                slot += 1

            elif tail is not None: extra.append(self._made_(tail, raw))
            else: raise self._extra_(raw)

        return self._filled_(values, extra)

    def invoke ( self, values: Mapping[str, Any] ) -> Any:

        ahead  = [values[item.name] for item in self.args if not item.rest and item.name not in self._named]
        spread = next((values[item.name] for item in self.args if item.rest), ())
        named  = { name: values[name] for name in self._named }

        return self.action(*ahead, *spread, **named)

    def describe ( self ) -> dict[str, Any]:

        return {
            "name"      : self.name,
            "group"     : self.group,
            "usage"     : self.usage(),
            "summary"   : self.summary,
            "arguments" : [
                {
                    "name"     : argument.label(),
                    "kind"     : getattr(argument.kind, "__name__", "value"),
                    "required" : argument.required,
                    "summary"  : argument.summary,
                }
                for argument in self.args
            ],
        }

    def _derive_ ( self ) -> None:

        try: found = list(inspect.signature(self.action, eval_str=True).parameters.values())
        except Exception as error: raise self._wrong_("action", self.name) from error

        for parameter in found:

            name = parameter.name

            if parameter.kind is parameter.VAR_KEYWORD or not name.isascii() or name.startswith("_"):

                raise self._wrong_("action", self.name)

            self.args.append(self._argument_(parameter))

        labels = [argument.label() for argument in self.args]
        flags  = [argument.label() for argument in self.args if argument.flag]

        if len(set(labels)) != len(labels) or "help" in labels or any(f"no-{label}" in labels for label in flags):

            raise self._wrong_("action", self.name)

        self._named = frozenset(parameter.name for parameter in found if parameter.kind is parameter.KEYWORD_ONLY)

        self._reindex_()

    def _argument_ ( self, parameter: inspect.Parameter ) -> Argument:

        name, style, empty  = parameter.name, parameter.kind, parameter.default is parameter.empty
        default = None if empty else parameter.default
        loose   = parameter.annotation is parameter.empty and type(default) in (bool, int, float)
        kind, choices, many = self._kind_(type(default) if loose else parameter.annotation)

        if style is parameter.VAR_POSITIONAL:

            if many: raise self._wrong_("kind", self.name)

            return Argument(name, kind, (), rest=True, choices=choices)

        if kind is bool and not many:

            if type(default) is not bool and not empty: raise self._wrong_("default", self.name)

            return Argument(name, kind, bool(default), flag=True)

        if many and default is not None and type(default) is not list: raise self._wrong_("default", self.name)

        only = many or style is parameter.KEYWORD_ONLY

        return Argument(name, kind, default, required=empty, only=only, many=many, choices=choices)

    def _kind_ ( self, hint: Any, many: bool = False ) -> tuple[Kind, tuple[str, ...], bool]:

        origin, inner = get_origin(hint), get_args(hint)
        loose  = tuple(item for item in inner if item is not NoneType)
        listed = isinstance(hint, type) and issubclass(hint, Enum)
        barred = isinstance(hint, type) and hint in BARRED

        if hint is inspect.Parameter.empty or hint is Any: return str, (), many
        if origin is UnionType and len(loose) == 1: return self._kind_(loose[0], many)
        if origin is list and len(inner) == 1 and not many: return self._kind_(inner[0], many=True)
        if origin is Literal and inner and all(type(item) is str for item in inner): return str, inner, many
        if listed and len(hint): return hint, tuple(str(member.value) for member in hint), many
        if origin is None and callable(hint) and not (listed or barred): return hint, (), many

        raise self._wrong_("kind", self.name)

    def _brief_ ( self, found: Argument, short: str ) -> bool:

        if type(short) is not str or len(short) != 1 or not (short.isascii() and short.isalpha()): return False

        taken = any(other.short == short for other in self.args if other is not found)

        return short != "h" and not (found.rest or taken)

    def _reindex_ ( self ) -> None:

        self._index = { f"--{argument.label()}": argument for argument in self.args if not argument.rest }

        self._index.update({ f"-{argument.short}": argument for argument in self.args if argument.short })

    def _long_ ( self, raw: str, tokens: Sequence[str], at: int, values: dict[str, Any] ) -> int:

        label, joined, text = raw[2:].partition("=")
        key   = "--" + label.replace("_", "-")
        found = self._index.get(key)
        on    = True

        if found is None and key.startswith("--no-"):

            found, on = self._index.get("--" + key[5:]), False

            if found is not None and not found.flag: found = None

        if found is None: raise self._stranger_("--" + label)

        if found.flag:

            if joined and not on: raise self._refused_(found, "negated")

            self._put_(values, found, self._made_(found, text) if joined else on)

            return at

        if not joined:

            if at >= len(tokens): raise self._refused_(found, "missing")

            text, at = tokens[at], at + 1

        self._put_(values, found, self._made_(found, text))

        return at

    def _short_ ( self, raw: str, tokens: Sequence[str], at: int, values: dict[str, Any] ) -> int:

        body = raw[1:]

        for place, letter in enumerate(body):

            found = self._index.get("-" + letter)
            after = body[place + 1:]

            if found is None: raise self._stranger_("-" + letter)

            if found.flag and not after.startswith("="):

                self._put_(values, found, made=True)

                continue

            if after.startswith("="): text = after[1:]
            elif after: text = after
            elif at < len(tokens): text, at = tokens[at], at + 1
            else: raise self._refused_(found, "missing")

            self._put_(values, found, self._made_(found, text))

            break

        return at

    def _put_ ( self, values: dict[str, Any], argument: Argument, made: Any ) -> None:

        if argument.many: values.setdefault(argument.name, []).append(made)
        elif argument.name not in values: values[argument.name] = made
        else: raise Fault(Code.BAD_REQUEST, "Repeated option", "cli.repeated", { argument.label(): ["repeated"] })

    def _made_ ( self, argument: Argument, text: str ) -> Any:

        kind = argument.kind
        listed: object = kind

        if argument.choices and text not in argument.choices: raise self._refused_(argument, "choice")

        try:

            if kind is str: return text
            if kind is int: return parse.integer(text)
            if kind is float: return parse.number(text)
            if kind is bool: return parse.boolean(text)

            if isinstance(listed, type) and issubclass(listed, Enum):

                return next(member for member in listed if str(member.value) == text)

            return kind(text)

        except Fault as fault: raise self._refused_(argument, fault.reason or "invalid") from fault
        except (ArithmeticError, LookupError, TypeError, ValueError) as error:

            raise self._refused_(argument, "invalid") from error

    def _filled_ ( self, values: dict[str, Any], extra: list[Any] ) -> dict[str, Any]:

        absent  = [argument.label() for argument in self.args if argument.required and argument.name not in values]
        missing = { label: ["required"] for label in absent }

        if missing: raise Fault(Code.BAD_REQUEST, "Missing argument", "cli.missing", missing)

        made: dict[str, Any] = {}

        for argument in self.args:

            default = argument.default

            if argument.rest: made[argument.name] = tuple(extra)
            elif argument.name in values: made[argument.name] = values[argument.name]
            else: made[argument.name] = list(default) if type(default) is list else default

        return made

    def _rows_ ( self, arguments: Sequence[Argument] ) -> list[str]:

        width = max(len(argument.head()) for argument in arguments)

        return [f"  {argument.head():<{width}}  {self._noted_(argument)}".rstrip() for argument in arguments]

    def _noted_ ( self, argument: Argument ) -> str:

        notes: list[str] = []
        plain = not (argument.flag or argument.rest or argument.required)

        if argument.choices: notes.append("one of " + ", ".join(argument.choices))
        if argument.many: notes.append("repeatable")
        if argument.only and argument.required: notes.append("required")
        if plain and argument.default is not None: notes.append(f"default {Argument.shown(argument.default)}")

        return f"{argument.summary} [{'; '.join(notes)}]".strip() if notes else argument.summary

    def _stranger_ ( self, name: str ) -> Fault:

        near   = nearest(name, self._index)
        errors = { "flag": [Argument.shown(name)], **({ "nearest": near } if near else {}) }

        return Fault(Code.BAD_REQUEST, "Unknown option", "cli.flag", errors)

    def _extra_ ( self, raw: str ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Unexpected argument", "cli.argument", { "extra": [Argument.shown(raw)] })

    def _refused_ ( self, argument: Argument, why: str ) -> Fault:

        errors = { argument.label(): [why] }

        if why == "choice": errors["choices"] = list(argument.choices)

        return Fault(Code.BAD_REQUEST, "Invalid value", "cli.value", errors)

    @staticmethod
    def _line_ ( text: object ) -> bool:

        return type(text) is str and len(text) <= LINE and text.isprintable()

    @staticmethod
    def _wrong_ ( what: str, name: object ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"cli.{what}", errors={ "command": [Argument.shown(name)] })
