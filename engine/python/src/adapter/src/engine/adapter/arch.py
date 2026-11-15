import re

FAMILY   = re.compile(r"[a-z][a-z0-9_]{0,31}")
NAME     = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}")
WORD     = 64
IDENT    = 256
ACCEPTED = frozenset({ "accepted", "sent", "queued", "delivered", "ok" })
EMPTY    = (bytes, bytearray, list, tuple, set, frozenset, dict)
