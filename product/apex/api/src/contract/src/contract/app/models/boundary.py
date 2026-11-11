from dataclasses import dataclass, field

@dataclass(frozen=True, slots=True)
class Boundary:

    caller      : str
    callee      : str
    method      : str
    path        : str
    actor       : str
    scope       : str
    input       : str
    output      : str
    revision    : int = 1
    idempotency : str = "none"
    failure     : tuple[str, ...] = field(default_factory=tuple)
