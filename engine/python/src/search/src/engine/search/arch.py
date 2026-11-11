from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
import re

SAMPLE = 50

WORD  = re.compile(r"[\w]+", re.UNICODE)
LIMIT = 200
K1    = 1.2
B     = 0.75

NDJSON = "application/x-ndjson"
DONE   = frozenset({ "succeeded", "failed", "canceled" })
BOLD   = re.compile(r"</?hi>")
EXISTS = frozenset({ "index_already_exists" })

@dataclass(frozen=True, slots=True)
class Document:

    id     : str
    fields : dict[str, Any] = field(default_factory=dict)

    def dump ( self ) -> dict[str, Any]:

        return { "id": self.id, **self.fields }

@dataclass(frozen=True, slots=True)
class Hit:

    id         : str
    score      : float
    fields     : dict[str, Any] = field(default_factory=dict)
    highlights : dict[str, str] = field(default_factory=dict)

    def dump ( self ) -> dict[str, Any]:

        return { "id": self.id, "score": round(self.score, 4), "fields": self.fields, "highlights": self.highlights }

@dataclass(frozen=True, slots=True)
class Query:

    text    : str = ""
    filters : dict[str, Any] = field(default_factory=dict)
    limit   : int = 10
    page    : int = 1
    sort    : tuple[str, ...] = ()
    fields  : tuple[str, ...] = ()
    facets  : tuple[str, ...] = ()
    highlight: bool = False

    def __post_init__ ( self ) -> None:

        if not 1 <= self.limit <= LIMIT:

            raise Fault(Code.VALIDATION, reason="search.limit", errors={ "limit": [str(self.limit)] })

        if self.page < 1: raise Fault(Code.VALIDATION, reason="search.page", errors={ "page": [str(self.page)] })

    def offset ( self ) -> int:

        return (self.page - 1) * self.limit

    def orders ( self ) -> list[tuple[str, bool]]:

        return [(name.removeprefix("-"), name.startswith("-")) for name in self.sort]

@dataclass(frozen=True, slots=True)
class Result:

    hits   : list[Hit]
    total  : int
    took   : float
    facets : dict[str, dict[str, int]] = field(default_factory=dict)

    def ids ( self ) -> list[str]:

        return [hit.id for hit in self.hits]

    def dump ( self ) -> dict[str, Any]:

        hits = [hit.dump() for hit in self.hits]

        return { "hits": hits, "total": self.total, "took": round(self.took, 4), "facets": self.facets }

@dataclass(frozen=True, slots=True)
class Schema:

    searchable : tuple[str, ...]
    filterable : tuple[str, ...] = ()
    sortable   : tuple[str, ...] = ()

    def names ( self ) -> tuple[str, ...]:

        return tuple(dict.fromkeys((*self.searchable, *self.filterable, *self.sortable)))

    def check ( self, kind: str, name: str ) -> str:

        allowed = self.sortable if kind == "sort" else self.filterable

        if name not in allowed: raise Fault(Code.VALIDATION, reason=f"search.{kind}", errors={ kind: [name] })

        return name
