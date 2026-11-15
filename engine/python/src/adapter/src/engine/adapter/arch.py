from dataclasses import dataclass, field
from copy import deepcopy
from typing import Any
import re

FAMILY   = re.compile(r"[a-z][a-z0-9_]{0,31}")
NAME     = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}")
WORD     = 64
IDENT    = 256
ACCEPTED = frozenset({ "accepted", "sent", "queued", "delivered", "ok" })
EMPTY    = (bytes, bytearray, list, tuple, set, frozenset, dict)

@dataclass(frozen=True, slots=True)
class Receipt:

    id     : str
    status : str
    raw    : dict[str, Any] = field(default_factory=dict, hash=False, repr=False)

    def __post_init__ ( self ) -> None:

        object.__setattr__(self, "raw", deepcopy(self.raw) if self.raw else {})

    def accepted ( self ) -> bool:

        status: object = self.status

        if not isinstance(status, str): return False

        return status in ACCEPTED or (status.isascii() and status.strip().lower() in ACCEPTED)
