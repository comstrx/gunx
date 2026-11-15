from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Email:

    local  : str
    domain : str

    def text ( self ) -> str:

        return f"{self.local}@{self.domain}"
