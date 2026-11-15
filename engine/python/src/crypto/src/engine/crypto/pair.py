from dataclasses import dataclass, field
lazy from .wire import Wire


@dataclass(frozen=True, slots=True)
class Pair:

    public  : bytes
    private : bytes = field(repr=False)

    def dump ( self ) -> dict[str, str]:

        return { "public": Wire.pack(self.public) }
