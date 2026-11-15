from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Page:

    page  : int
    limit : int
    total : int

    def pages ( self ) -> int:

        return max(1, (self.total + self.limit - 1) // self.limit) if self.limit else 1

    def offset ( self ) -> int:

        return (self.page - 1) * self.limit

    def dump ( self ) -> dict[str, int]:

        return { "page": self.page, "limit": self.limit, "total": self.total, "pages": self.pages() }
