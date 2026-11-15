from typing import Any
import re

type Rows = list[Any]
type Fields = dict[str, Any]
type Buffer = bytes | bytearray | memoryview

INPUT = 4096
ITEMS = 100_000
PAIR = 2
INTEGER = re.compile(r"[-+]?\d+")
REAL = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
TRUE = frozenset({"1", "true", "yes", "y", "on", "نعم", "ايوه", "أيوه"})
FALSE = frozenset({"0", "false", "no", "n", "off", "", "لا"})
