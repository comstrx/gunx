from dataclasses import dataclass, field
from typing import Protocol, Self

import re

KEY_BYTES    = 32
NONCE_BYTES  = 12
TAG_BYTES    = 16
VERSION      = 2
NAME         = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
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

LIMIT          = 64 << 20
MAX_BYTES      = (1 << 31) - 1
KEY_TEXT       = 109
KEY_COUNT      = 256
SIGNATURE_TEXT = 86
HASHED         = 512
TIME_COST      = 3
MEMORY_COST    = 65536
LANES          = 2
LANE_MEMORY    = 8
TIME_CEILING   = 16
MEMORY_CEILING = 1 << 20
LANES_CEILING  = 16
ALGORITHMS     = ("aes-gcm", "chacha20-poly1305", "aes-gcm-siv")
KEY_ENCODED    = 43
NAME_BYTES     = 64
LEGACY_HEADER  = 3
BINARY_EXTRA   = 100
TEXT_START     = 5
KDF_VERSION    = 19
SALT_MIN       = 8
KDF_MAX        = 64
HASH_MIN       = 16

class Digest(Protocol):

    def update ( self, data: bytes ) -> object: ...
    def digest ( self ) -> bytes: ...
    def hexdigest ( self ) -> str: ...
    def copy ( self ) -> Self: ...

class Aead(Protocol):

    def encrypt ( self, nonce: bytes, data: bytes, associated_data: bytes | None ) -> bytes: ...
    def decrypt ( self, nonce: bytes, data: bytes | memoryview, associated_data: bytes | None ) -> bytes: ...



@dataclass(frozen=True, slots=True)
class Binding:

    cipher : Aead = field(repr=False)
    header : bytes
    prefix : str
