from collections.abc import Callable
from pathlib import Path

from engine.error import Bag, Code, Fault
from engine.parse import parse
from .arch import (
    BLANK, DEFAULT, DEPTH, DOUBLE, Draft, Drafts, ESCAPED, ESCAPES, HEAD, LIMIT, NAMED, NOTE, OPEN, Pairs, SINGLE,
    STAGE, STAGES,
)
import os, re

class Env:

    def __init__ ( self ) -> None:

        self._loaded: list[str] = []

    def stage ( self ) -> str:

        found = os.environ.get(STAGE) or DEFAULT

        if STAGES.fullmatch(found) is None: raise self._refuse_("env.stage", STAGE, "is not a stage name")

        return found

    def load ( self, root: Path, names: tuple[str, ...] = (), override: bool = False ) -> list[str]:

        found: list[str] = []
        drafts: Drafts = {}

        for name in reversed(names or (f".env.{self.stage()}", ".env")):

            path = root / name

            if not path.is_file(): continue

            drafts.update(self._scan_(path))
            found.insert(0, str(path))

        for key, value in self._settle_(drafts, override).items():

            if override or key not in os.environ: os.environ[key] = value

        self._loaded = list(dict.fromkeys((*self._loaded, *found)))

        return found

    def read ( self, path: Path, override: bool = False ) -> dict[str, str]:

        return self._settle_(self._scan_(path), override)

    def loaded ( self ) -> tuple[str, ...]:

        return tuple(self._loaded)

    def describe ( self ) -> dict[str, object]:

        return { "stage": self.stage(), "files": [Path(path).name for path in self._loaded] }

    def set ( self, key: str, value: str ) -> None:

        fine = bool(key) and "=" not in key and "\x00" not in key and "\x00" not in value

        try:

            if fine: os.environ[key] = value

        except ValueError: fine = False

        if not fine: raise self._refuse_("env.name", "key", "cannot be set as an environment variable")

    def forget ( self, key: str ) -> None:

        if self._found_(key) is not None: del os.environ[key]

    def has ( self, key: str ) -> bool:

        return self._found_(key) is not None

    def text ( self, key: str, default: str = "" ) -> str:

        found = self._found_(key)

        return default if found is None else found

    def need ( self, key: str ) -> str:

        found = self._found_(key)

        if not found: raise Fault(Code.INTERNAL, f"{key} is required", "env.missing", { "key": [key] })

        return found

    def integer ( self, key: str, default: int = 0 ) -> int:

        return self._typed_(key, default, parse.integer)

    def number ( self, key: str, default: float = 0.0 ) -> float:

        return self._typed_(key, default, parse.number)

    def boolean ( self, key: str, default: bool = False ) -> bool:

        return self._typed_(key, default, parse.boolean)

    def all ( self, prefix: str ) -> Pairs:

        return { key: value for key, value in os.environ.items() if key.startswith(prefix) }

    def list ( self, key: str, default: tuple[str, ...] = () ) -> list[str]:

        found = self._found_(key)

        return list(default) if found in (None, "") else parse.list(found)

    def _found_ ( self, key: str ) -> str | None:

        try: return os.environ.get(key)
        except ValueError: return None

    def _typed_ [T] ( self, key: str, default: T, reader: Callable[[str], T] ) -> T:

        found = self._found_(key)

        if found is None or found == "": return default

        try: return reader(found)
        except Fault as fault: refused = self._refuse_("env.value", key, fault.message)

        raise refused

    def _text_ ( self, path: Path ) -> str:

        where = str(path)
        text  = ""

        try:

            if not path.is_file(): raise FileNotFoundError

            with path.open("rb") as handle: raw = handle.read(LIMIT + 1)

            text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")

        except (OSError, UnicodeDecodeError) as error: refused = f"cannot be read, {type(error).__name__}"
        else: refused = "is too large" if len(raw) > LIMIT else ""

        null = text.find("\x00")

        if refused: raise self._refuse_("env.file", where, refused)
        if null >= 0: raise self._refuse_("env.line", where, self._line_(text.count("\n", 0, null) + 1))

        return text

    def _scan_ ( self, path: Path ) -> Drafts:

        text  = self._text_(path)
        where = str(path)
        drafts: Drafts = {}
        at    = 0
        line  = 1

        while at < len(text):

            blank = BLANK.match(text, at)
            head  = None if blank else HEAD.match(text, at)

            if blank: stop = blank.end()
            elif head is None: raise self._refuse_("env.line", where, self._line_(line))
            else: stop, drafts[head.group("key")] = self._value_(text, head.end(), where, line)

            line += text.count("\n", at, stop)
            at    = stop

        return drafts

    def _value_ ( self, text: str, at: int, where: str, line: int ) -> tuple[int, Draft]:

        if OPEN.match(text, at) is None:

            found = text.find("\n", at)
            end   = len(text) if found < 0 else found

            return min(end + 1, len(text)), (NOTE.sub("", text[at:end]).strip(), NAMED, where, line)

        held = DOUBLE.match(text, at) or SINGLE.match(text, at)
        tail = BLANK.match(text, held.end()) if held else None

        if held is None or tail is None: raise self._refuse_("env.line", where, self._line_(line))

        return tail.end(), (held.group("body"), ESCAPED if text[held.end() - 1] == '"' else None, where, line)

    def _settle_ ( self, drafts: Drafts, override: bool ) -> dict[str, str]:

        done: dict[str, str] = {}
        held: list[str] = []
        room = LIMIT

        def expand ( found: re.Match[str] ) -> str:

            nonlocal room

            name = found.group(found.lastgroup or 0)
            free = name in drafts and name not in held and len(held) < DEPTH

            if found.lastgroup == "escape": return ESCAPES.get(name, found.group())

            value = settle(name) if free and (override or name not in os.environ) else os.environ.get(name)
            room -= len(value or "")

            if value is not None and room >= 0: return value

            _, _, where, line = drafts[held[-1]]
            why = "is not set" if name not in drafts else "loops or nests too deep"

            if value is not None: why = "grows too large"

            raise self._refuse_("env.reference", where, f"line {line} refers to {name}, which {why}")

        def settle ( key: str ) -> str:

            if key in done: return done[key]

            body, pattern, _, _ = drafts[key]

            held.append(key)

            done[key] = body if pattern is None else pattern.sub(expand, body)

            held.pop()

            return done[key]

        return { key: settle(key) for key in drafts }

    def _line_ ( self, line: int ) -> str:

        return f"line {line} is malformed"

    def _refuse_ ( self, reason: str, where: str, what: str ) -> Fault:

        return Bag().add(where, what).fault(Code.INTERNAL, reason)
