from dataclasses import dataclass, field

from engine.error import Code, Fault
from engine.string import string
import base64, binascii, re

KEY_BYTES    = 32
NONCE_BYTES  = 12
TAG_BYTES    = 16
VERSION      = 1
HEAD         = f"v{VERSION}"
MAGIC        = b"E1"
NAME         = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
PLAIN        = bytes.maketrans(b"-_", b"+/")
SAFE         = str.maketrans("+/", "-_")
HKDF_BYTES   = 8160
FRAME_BYTES  = 4
TOTP_STEP    = 30
TOTP_DIGITS  = 6
TOTP_HASH    = "sha1"
TOTP_BYTES   = 20
TOTP_FLOOR   = 10
TOTP_CEILING = 128
TOTP_TEXT    = 512
TOTP_LEAST   = 6
TOTP_MOST    = 8
TOTP_PACE    = 3600
TOTP_WINDOW  = 10
COUNTER      = 2 ** 63 - 1
OFFSET_MASK  = 0x0F
TRUNCATE     = 0x7FFFFFFF

MIN_LENGTH     = 8
MAX_LENGTH     = 512
HASHED         = 512
TIME_COST      = 3
MEMORY_COST    = 65536
LANES          = 2
LANE_MEMORY    = 8
TIME_CEILING   = 16
MEMORY_CEILING = 1 << 20
LANES_CEILING  = 16

class Wire:

    @staticmethod
    def pack ( raw: bytes ) -> str:

        return string.base64(raw, url=True)

    @staticmethod
    def unpack ( text: str ) -> bytes | None:

        try:

            data = text.encode("ascii")
            raw  = binascii.a2b_base64(data.translate(PLAIN) + b"=" * (-len(data) % 4), strict_mode=True)

        except ValueError: return None

        return raw if base64.urlsafe_b64encode(raw).rstrip(b"=") == data else None

@dataclass(frozen=True, slots=True)
class Key:

    id     : str
    secret : bytes = field(repr=False)

    def __post_init__ ( self ) -> None:

        named = type(self.id) is str and NAME.fullmatch(self.id) is not None
        sized = type(self.secret) is bytes and len(self.secret) == KEY_BYTES

        if not named or not sized: raise Fault(Code.INTERNAL, reason="crypto.key")

@dataclass(frozen=True, slots=True)
class Sealed:

    key   : str
    nonce : bytes
    body  : bytes

    def encode ( self ) -> str:

        return f"{HEAD}.{self.key}.{Wire.pack(self.nonce + self.body)}"

    @classmethod
    def decode ( cls, text: str ) -> Sealed:

        version, _, rest = text.partition(".")
        key, _, raw      = rest.rpartition(".")
        blob             = Wire.unpack(raw) if version == HEAD and NAME.fullmatch(key) else None

        if blob is None or len(blob) < NONCE_BYTES + TAG_BYTES: raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        return cls(key, blob[:NONCE_BYTES], blob[NONCE_BYTES:])

@dataclass(frozen=True, slots=True)
class Pair:

    public  : bytes
    private : bytes = field(repr=False)

    def dump ( self ) -> dict[str, str]:

        return { "public": Wire.pack(self.public) }
