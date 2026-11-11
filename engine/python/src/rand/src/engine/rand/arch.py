from random import SystemRandom
import string

ALPHABET     = string.ascii_lowercase + string.digits
DIGITS       = string.digits
UNAMBIGUOUS  = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
SYMBOLS      = "!@#$%^&*-_=+?"
PASSWORD     = string.ascii_letters + string.digits + SYMBOLS
CLASSES      = tuple(frozenset(kind) for kind in (string.ascii_lowercase, string.ascii_uppercase, DIGITS, SYMBOLS))
MAX_BYTES    = 4096
MAX_LENGTH   = 4096
MIN_CODE     = 4
MAX_CODE     = 12
MIN_PASSWORD = 8
BYTE         = 256
WORD         = 1 << 64
MILLI        = 1_000_000
VERSION      = 7 << 76 | 2 << 62
HIGH         = (1 << 12) - 1
LOW          = (1 << 30) - 1
TAIL         = (1 << 32) - 1
CROCKFORD    = bytes.maketrans(b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", b"0123456789ABCDEFGHJKMNPQRSTVWXYZ")
SYSTEM       = SystemRandom()
