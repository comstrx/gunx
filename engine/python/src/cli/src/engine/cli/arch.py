from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from enum import Enum
from types import NoneType
from typing import Any

from engine.string import string
import re

type Action = Callable[..., Awaitable[int | None] | int | None]
type Kind   = Callable[[str], Any]
type Writer = Callable[[str], object]

NAME        = re.compile(r"[a-z][a-z0-9]*(?:[:._-][a-z0-9]+)*")
NUMERIC     = re.compile(r"-\.?[0-9]")
HELP        = frozenset({ "-h", "--help" })
VERSION     = frozenset({ "version", "--version", "-V" })
RESERVED    = frozenset({ "help", "version" })
BARRED      = frozenset({ list, tuple, dict, set, frozenset, bytes, bytearray, object, NoneType })
COMMANDS    = 512
EXAMPLES    = 16
WORD        = 64
LINE        = 200
NEAR        = 3
CLOSE       = 0.6
FAILED      = 1
USAGE       = 2
INTERRUPTED = 130
PIPE        = 141
BYTE        = 255

@dataclass(frozen=True, slots=True)
class Argument:

    name     : str
    kind     : Kind
    default  : Any = None
    summary  : str = ""
    required : bool = False
    flag     : bool = False
    only     : bool = False
    rest     : bool = False
    many     : bool = False
    short    : str = ""
    choices  : tuple[str, ...] = ()

    def label ( self ) -> str:

        return self.name.strip("_").replace("_", "-")

    def head ( self ) -> str:

        label = self.label()
        named = self.flag or self.only
        shown = f"--[no-]{label}" if self.flag and self.default else f"--{label}" if named else label

        return f"{shown}, -{self.short}" if self.short else shown

    def shape ( self ) -> str:

        label = self.label()
        blank = self.many or self.required or self.default is None
        named = f"--{label}=<{label}>" if blank else f"--{label}={self.shown(self.default)}"

        if self.flag: return f"[--no-{label}]" if self.default else f"[--{label}]"
        if self.rest: return f"[{label}...]"
        if self.only: return (named if self.required else f"[{named}]") + ("..." if self.many else "")
        if self.required: return f"<{label}>"

        return f"[{label}]" if self.default is None else f"[{label}={self.shown(self.default)}]"

    @staticmethod
    def shown ( value: object, limit: int = WORD ) -> str:

        text = str(value.value if isinstance(value, Enum) else value)[:limit]

        return text if text.isprintable() else "".join(letter if letter.isprintable() else "?" for letter in text)

def nearest ( name: str, choices: Iterable[str] ) -> list[str]:

    scored = ((string.ratio(name[:WORD], choice), choice) for choice in choices)
    ranked = sorted(scored, key=lambda pair: (-pair[0], pair[1]))

    return [choice for score, choice in ranked if score >= CLOSE][:NEAR]
