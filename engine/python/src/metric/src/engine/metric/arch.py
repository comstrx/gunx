import re, sys

type Key  = tuple[tuple[str, str], ...]
type Cell = list[float]

NAME     = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]*")
BUCKETS  = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
MEDIA    = "text/plain; version=0.0.4; charset=utf-8"
TOTAL    = "_total"
RESERVED = "__"
LIMIT    = "+Inf"
SERIES   = 2000
CEILING  = 1_000_000
LABELS   = 32
BOUNDS   = 64
WORD     = 100
VALUE    = 256
HELP     = 512
MOST     = sys.float_info.max
EXACT    = 2.0 ** 53
QUOTED   = { 92: "\\\\", 34: '\\"', 10: "\\n" }
HELPED   = { 92: "\\\\", 10: "\\n" }
