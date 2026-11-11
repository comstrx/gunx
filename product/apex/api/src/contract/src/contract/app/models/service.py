from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class Service:

    name  : str
    layer : int
    port  : int
    owns  : tuple[str, ...] = ()
