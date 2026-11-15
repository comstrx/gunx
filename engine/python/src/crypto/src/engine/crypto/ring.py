from collections.abc import Mapping
from dataclasses import dataclass, field
from .arch import Binding
from .key import Key

@dataclass(frozen=True, slots=True)
class Ring:

    current : str
    keys    : Mapping[str, Key]
    ciphers : Mapping[tuple[str, str], Binding] = field(repr=False)
