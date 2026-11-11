from collections.abc import Mapping, MutableMapping
from types import NoneType

import logging, re

type Fields = MutableMapping[str, object]

LEVELS   = ("debug", "info", "warning", "error", "critical")
NUMBERS  = { name: logging.getLevelNamesMapping()[name.upper()] for name in LEVELS }
OPAQUE   = re.compile(
    r"(?i:pass(?:word|wd|phrase|code)|pwd)|(?<![A-Za-z])(?i:otp|pin|cvv|cvc|pass)(?![A-Za-z])"
    r"|(?<=[a-z])(?:Otp|OTP|Pin|PIN|Cvv|CVV|Cvc|CVC|Pass)(?![a-z])",
)
SECRETS  = re.compile(
    rf"(?P<opaque>{OPAQUE.pattern})"
    r"|(?i:secret|token|authorization|bearer|jwt|credential|cookie|session|signature|csrf|xsrf)"
    r"|(?i:(?:api|private|access|signing|encryption|master|app|license)[_-]?key)"
    r"|(?<![A-Za-z])(?i:sig)(?![A-Za-z])|(?<=[a-z])Sig(?![a-z])",
)
STEMS    = re.compile(
    r"pass|pwd|otp|pin|cvv|cvc|secret|token|authorization|bearer|jwt|credential|cookie|session|sig|csrf|xsrf|key|code",
)
URL_AUTH = re.compile(r"(?<![A-Za-z0-9+.-])(?P<scheme>[A-Za-z][A-Za-z0-9+.-]{0,31}://)(?P<info>[^/?#\s]*)@")
HOST     = re.compile(r"[A-Za-z0-9._:-]{1,253}")
PAIR     = re.compile(r"""(?<![A-Za-z0-9_.-])(?P<name>[A-Za-z0-9_.-]++)[\]\\"']{0,3}\s{0,8}[=:]{1,3}>?\s{0,8}""")
SCHEME   = re.compile(r"(?:(?:bearer|basic|digest|token)\s++)++", re.IGNORECASE)
QUOTE    = re.compile(r"""[bBrRuU]{0,2}(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')""")
BARE     = re.compile(r"[^\s&]+")
REST     = re.compile(r"[^\r\n]+")
WHOLE    = re.compile(r"authorization|cookie", re.IGNORECASE)
BEARER   = re.compile(r"(?<![A-Za-z])(?P<scheme>[Bb]earer)\s+[A-Za-z0-9._~+/=-]{16,}")
PEM      = re.compile(
    r"-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----.*?(?:-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----|\Z)", re.DOTALL,
)
JWT      = re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]{5,}){2,4}")
QUERY    = frozenset({ "key", "code" })
PLAIN    = (int, float, bool, NoneType)
NESTED   = (Mapping, list, tuple, set, frozenset)
MASK     = "***"
MASKED   = f"{MASK}@"
QUOTED   = { '"': f'"{MASK}"', "'": f"'{MASK}'" }
SHORT    = 15
DEPTH    = 8
LONG     = 256
KNOWN    = 2048
