from dataclasses import dataclass, field

import re

EMAIL    = re.compile(r"^[^@\s]{1,64}@[^@\s.]{1,63}(?:\.[^@\s.]{1,63})+$")
PHONE    = re.compile(r"^\+[1-9]\d{6,14}$")
SLUG     = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UUID     = re.compile(r"^[0-9a-f]{8}-?[0-9a-f]{4}-?[1-8][0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$", re.IGNORECASE)
ULID     = re.compile(r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$", re.IGNORECASE)
MAC      = re.compile(r"^" + r"[:-]?".join([r"([0-9a-f]{2})"] * 6) + r"$", re.IGNORECASE)
LABEL    = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
HEX      = re.compile(r"^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$", re.IGNORECASE)
RGB      = re.compile(
    r"^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$", re.IGNORECASE,
)
NOISE    = re.compile(r"[\s().-]")
HOST_MAX = 253
PORT_MAX = 65535
LAT_MAX  = 90.0
LNG_MAX  = 180.0
SHORT    = 4
BYTE     = 255
PAIR     = 2

TRUE      = frozenset({"1", "true", "yes", "y", "on", "نعم", "ايوه", "أيوه"})
FALSE     = frozenset({"0", "false", "no", "n", "off", "", "لا"})
DURATION  = re.compile(r"(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?", re.IGNORECASE)
SPELLED   = re.compile(r"(?:\d+(?:\.\d+)?(?:ms|s|m|h|d|w)\s*)+", re.IGNORECASE)
SIZE      = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([kmgt]i?b?|b)?\s*$", re.IGNORECASE)
SEMVER    = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$")
TEMPLATE  = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_.]*)\}")
UNITS     = { "ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0, "d": 86400.0, "w": 604800.0 }
SIZES     = {
    "b": 1, "k": 1000, "kb": 1000, "kib": 1024, "m": 10**6, "mb": 10**6, "mib": 1024**2,
    "g": 10**9, "gb": 10**9, "gib": 1024**3, "t": 10**12, "tb": 10**12, "tib": 1024**4,
}
MAX_QUERY = 1024
INTEGER   = re.compile(r"^[-+]?\d+$")
FLOAT     = re.compile(r"^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$")
NOTHING   = frozenset({"", "null", "none", "nil"})
MAX_TEXT  = 65536
MAX_INT   = 32
MAX_FLOAT = 64
MAX_URL   = 2048
MAX_TOML  = 4 * MAX_TEXT

@dataclass(frozen=True, slots=True)
class Mime:

    type    : str
    subtype : str
    params  : dict[str, str] = field(default_factory=dict)

    def text ( self ) -> str:

        return f"{self.type}/{self.subtype}"

    def matches ( self, pattern: str ) -> bool:

        kind, _, sub = pattern.partition("/")

        return kind in ("*", self.type) and sub in ("*", "", self.subtype)

@dataclass(frozen=True, slots=True)
class Email:

    local  : str
    domain : str

    def text ( self ) -> str:

        return f"{self.local}@{self.domain}"

@dataclass(frozen=True, slots=True)
class Url:

    scheme : str
    host   : str
    port   : int | None
    path   : str
    query  : str
    user   : str | None
    password : str | None = field(default=None, repr=False)

    def origin ( self ) -> str:

        return f"{self.scheme}://{self.host}{f':{self.port}' if self.port else ''}"
