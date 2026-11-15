from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Url:

    scheme : str
    host   : str
    port   : int | None
    path   : str
    query  : str
    user   : str | None
    password : str | None = field(default=None, repr=False)

    def origin ( self ) -> str:

        host = f"[{self.host}]" if ":" in self.host else self.host

        return f"{self.scheme}://{host}{f':{self.port}' if self.port else ''}"
