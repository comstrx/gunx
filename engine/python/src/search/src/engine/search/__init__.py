lazy from .arch import Document, Hit, Query, Result, Schema
lazy from .database import Database
lazy from .elastic import Elastic
lazy from .engine import Engine
lazy from .meili import Meili
lazy from .memory import Memory
from .search import Search
lazy from .vespa import Vespa

search = Search()

__all__ = [
    "Database", "Document", "Elastic", "Engine", "Hit", "Meili", "Memory", "Query", "Result",
    "Schema", "Search", "Vespa", "search",
]
