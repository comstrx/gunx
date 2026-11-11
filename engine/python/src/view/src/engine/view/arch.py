from collections.abc import Callable, Mapping
from contextvars import ContextVar
from pathlib import Path
from types import BuiltinMethodType, MethodType, NoneType
from typing import Any
import re

from engine.json import json
from engine.string import string

type Filter    = Callable[..., Any]
type Folder    = Path | str
type Templates = Mapping[str, str]
type Check     = Callable[[tuple[Any, ...], dict[str, Any]], int]

WORD     = re.compile(r"[a-z][a-z0-9_]{0,63}")
RESERVED = frozenset({ "range", "dict", "lipsum", "cycler", "joiner", "namespace" })
PLAIN    = ("txt",)
BARRED   = frozenset({ "translate", "maketrans" })
PADS     = frozenset({ "ljust", "rjust", "center", "zfill" })
GROWS    = PADS | frozenset({ "replace", "join", "expandtabs", "format", "format_map" })
TEXT     = (str, bytes)
BAGS     = (list, tuple, dict, set, frozenset)
LIGHT    = frozenset({ int, float, bool, NoneType })
METHODS  = (BuiltinMethodType, MethodType)
SPEC     = re.compile(r"%(?:\([^)]*\))?[-#0 +]*(\*|[0-9]+)?(?:\.(\*|[0-9]+))?")
DIGITS   = re.compile(r"[0-9]+")
TICK     = "view.tick"
SIZED    = "view.sized"
CONCAT   = "view.concat"
CACHE    = 512
TEXTS    = 256
SMALL    = 16_384
NAME     = 200
SOURCE   = 262_144
OUTPUT   = 8_388_608
STEPS    = 100_000
BITS     = 4_096
UNIT     = 1_024
ELEMENT  = 64
TABS     = 64
RUN      = 9
SHORT    = 256
SPECS    = 512
VERDICTS = 4_096
MOST     = 1 << 31
LEFT     : ContextVar[list[int] | None] = ContextVar("view", default=None)
FILTERS  : dict[str, Filter] = {
    "json": json.dumps, "slug": string.slug, "mask": string.mask, "squish": string.squish,
}

class Spent(Exception):

    def __init__ ( self, what: str ) -> None:

        super().__init__(what)

        self.what = what
