from collections.abc import Mapping, Sequence


type JsonValue = bool | int | float | str | Sequence["JsonValue"] | Mapping[str, "JsonValue"] | None

UNSAFE = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" }

MISSING = object()
KINDS   = (("boolean", bool), ("number", int | float), ("string", str), ("object", Mapping), ("array", Sequence))
