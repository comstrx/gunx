from collections.abc import Mapping

import re

type Pairs  = Mapping[str, str]
type Draft  = tuple[str, re.Pattern[str] | None, str, int]
type Drafts = dict[str, Draft]

STAGE   = "ENGINE_ENV"
RELEASE = "production"
DEFAULT = "local"
STAGES  = re.compile(r"[A-Za-z0-9_-]{1,32}")
MARKED  = re.compile(
    r"secret|password|passwd|passphrase|token|key|dsn|url|credential|salt|pepper|webhook"
    r"|(?<![a-z])(?:uri|pwd)(?![a-z])",
)
ADDRESS = re.compile(r"dsn|url|(?<![a-z])uri(?![a-z])")
MISSING = re.compile(r"missing required field `(\w+)`")
LISTS   = (list, tuple, set, frozenset)
BAKED   = "must come from the environment in production"
HIDDEN  = "is invalid"
BROKEN  = "is not valid text"
LONE    = re.compile(r"[\ud800-\udfff]")
PAIR    = 2
LIMIT   = 1 << 20
DEPTH   = 16
BLANK   = re.compile(r"[ \t]*+(?:#[^\r\n]*+)?(?:\r?\n|\Z)")
HEAD    = re.compile(r"[ \t]*+(?:export[ \t]++)?(?P<key>_*+[A-Z][A-Z0-9_]*+)[ \t]*+=")
DOUBLE  = re.compile(r'[ \t]*+"(?P<body>(?:[^"\\]++|\\.)*+)"', re.DOTALL)
SINGLE  = re.compile(r"[ \t]*+'(?P<body>[^']*+)'")
NOTE    = re.compile(r"[ \t]#.*+")
OPEN    = re.compile(r"[ \t]*+[\"']")
ESCAPED = re.compile(r"\\(?P<escape>.)|\$\{(?P<name>[A-Za-z_][A-Za-z0-9_]*+)\}", re.DOTALL)
NAMED   = re.compile(r"\$\{(?P<name>[A-Za-z_][A-Za-z0-9_]*+)\}")
ESCAPES = { "n": "\n", "r": "\r", "t": "\t", "\\": "\\", '"': '"', "'": "'", "$": "$" }
