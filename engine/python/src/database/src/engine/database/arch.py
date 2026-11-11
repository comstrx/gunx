from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, TYPE_CHECKING

import apsw, asyncpg, re

if TYPE_CHECKING:

    from .sql import Sql

type Statement = str | Sql

type Record = Mapping[str, Any]
type Isolation = Literal["read_committed", "read_uncommitted", "serializable", "repeatable_read"]
type Live = dict[str, dict[str, dict[str, Any]]]

type Opener = Callable[[], Awaitable[Any]]
type Closer = Callable[[Any], Awaitable[None]]

type Handler = Callable[[Mapping[str, Any]], Awaitable[None]]

type Mode = Literal["disable", "prefer", "allow", "require", "verify-ca", "verify-full"]
type Connection = asyncpg.Connection[Any] | asyncpg.pool.PoolConnectionProxy[Any]

CODE    = re.compile(r"Code: (\d+)")
CLICKHOUSE_SQL     = frozenset({ 16, 47, 60, 62 })
TIMEOUT = frozenset({ 159, 209 })
BUSY    = frozenset({ 202, 203, 241 })
CLICKHOUSE_COLUMNS = (
    "SELECT table, name, type, default_expression FROM system.columns "
    "WHERE database = currentDatabase() ORDER BY table, position"
)

SCHEMES = {
    "postgresql" : "postgres", "postgres": "postgres", "sqlite": "sqlite", "mysql": "mysql", "mariadb": "mysql",
    "clickhouse" : "clickhouse", "clickhouses": "clickhouse",
}

IDENT = re.compile(r"^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$")
KEY   = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
TOKEN = re.compile("\x1f(\\d+)\x1f")
NOW   = "now()"
UUID  = "gen_random_uuid()"
EMPTY = "'{}'::jsonb"

LEVELS = {
    "read_committed"  : "READ COMMITTED",
    "read_uncommitted": "READ UNCOMMITTED",
    "serializable"    : "SERIALIZABLE",
    "repeatable_read" : "REPEATABLE READ",
}

LANE_RECYCLE = 900.0

INSTANT    = "instant"
CONCURRENT = "concurrent"
BACKFILL   = "backfill"
REWRITE    = "rewrite"
CONTRACT   = "contract"
LOCK_MS    = 3000
REWRITES   = "a NOT NULL column without a default cannot be added online: add it nullable, backfill, then SET NOT NULL"
RETYPES    = "rewrites the table: add a new column, backfill in batches, swap"
OFFLINE    = "this dialect rewrites the table for that change: add a new column, backfill, swap"

VALIDATION = 121

JSON     = 245
MYSQL_UNIQUE   = (1062, 1586)
MYSQL_FOREIGN  = (1451, 1452)
MYSQL_CHECK    = (3819,)
REQUIRED = (1048, 1364)
MYSQL_LOCKED   = (1205,)
MYSQL_SERIAL   = (1213,)
MYSQL_SQL      = (1054, 1064, 1146)
MODE     = "STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
MYSQL_COLUMNS  = (
    "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS "
    "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION"
)
MYSQL_INDEXES  = (
    "SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()"
)

TRIES   = 8
BACKOFF = 2.0
LEASE   = 60.0

MODES    = frozenset({ "disable", "prefer", "allow", "require", "verify-ca", "verify-full" })
LOOPBACK = frozenset({ "localhost", "127.0.0.1", "::1" })

POSTGRES_FAILURES  = (asyncpg.PostgresError, asyncpg.InterfaceError, OSError, TimeoutError)
STALE     = (asyncpg.exceptions.InvalidCachedStatementError, asyncpg.exceptions.OutdatedSchemaCacheError)
POSTGRES_RECYCLE   = 900.0
HANDLES   = 256
POSTGRES_UNIQUE    = "23505"
POSTGRES_FOREIGN   = "23503"
POSTGRES_CHECK     = "23514"
NOT_NULL  = "23502"
POSTGRES_SERIAL    = ("40001", "40P01")
POSTGRES_LOCKED    = ("55P03",)
CANCELLED = ("57014",)
DENIED    = ("42501",)
POSTGRES_COLUMNS   = (
    "SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default "
    "FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position"
)
POSTGRES_INDEXES   = "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema()"

NAME  = re.compile("\x1e([a-z0-9_.*]+)\x1e")
OPER  = re.compile("\x1d([A-Z @<>!=&]+)\x1d")
OPS   = frozenset({
    "=", "!=", "<>", "<", "<=", ">", ">=", "LIKE", "ILIKE", "IN", "NOT IN", "IS", "IS NOT", "@>", "<@", "&&", "@@",
})

SQLITE_FAILURES = (apsw.Error, OSError, TimeoutError)
WRITES   = ("INSERT", "UPDATE", "DELETE", "REPLACE")
MEMORY   = ":memory:"
TABLES   = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
SQLITE_INDEXES  = "SELECT tbl_name, name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'"
SQLITE_UNIQUE   = ("SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY")

KINDS    = frozenset({
    "uuid", "text", "integer", "bigint", "boolean", "numeric", "timestamp", "date", "jsonb", "bytes", "vector",
    "tsvector",
})
WIDENING = { ("integer", "bigint"), ("integer", "numeric"), ("bigint", "numeric") }

@dataclass(frozen=True, slots=True)
class Operation:

    table  : str
    kind   : str
    safety : str
    sql    : str
    note   : str = ""

    def dump ( self ) -> dict[str, str]:

        return { "table": self.table, "kind": self.kind, "safety": self.safety, "sql": self.sql, "note": self.note }

@dataclass(frozen=True, slots=True)
class Provision:

    host       : str
    port       : int
    admin      : str
    password   : str
    role       : str
    secret     : str
    database   : str
    extensions : tuple[str, ...] = ("pgcrypto",)
    maintenance: str = "postgres"
