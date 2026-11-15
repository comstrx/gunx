from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Mime:

    type    : str
    subtype : str
    params  : dict[str, str] = field(default_factory=dict)

    def text ( self ) -> str:

        return f"{self.type}/{self.subtype}"

    def matches ( self, pattern: str ) -> bool:

        kind, _, sub = pattern.partition("/")

        return kind in ("*", self.type) and sub in ("*", "", self.subtype)
