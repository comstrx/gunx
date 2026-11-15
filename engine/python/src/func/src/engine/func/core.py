from dataclasses import dataclass
from .arch import Loader

@dataclass(frozen=True, slots=True)
class Core:

    name   : str
    module : str
    native : Loader
    pure   : Loader
    chosen : str

    def available ( self ) -> bool:

        return self.chosen == "native"
