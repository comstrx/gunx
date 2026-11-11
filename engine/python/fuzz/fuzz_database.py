from engine.database import CLICKHOUSE, MYSQL, POSTGRES, SQLITE, Sql
from engine.error import Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 5000
DIALECTS = (POSTGRES, SQLITE, MYSQL, CLICKHOUSE)
MARKERS  = { "postgres": "$1", "sqlite": "?", "mysql": "%s", "clickhouse": "%s" }
names    = st.from_regex(r"[a-z_][a-z0-9_]{0,15}", fullmatch=True)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(names, names, st.text(max_size=20), st.integers(min_value=0, max_value=100), st.integers(min_value=1, max_value=50))
def every_statement_binds_its_values ( table: str, column: str, value: str, page: int, size: int ) -> None:

    sql = Sql.select(table, column).where(column, "=", value).order(column).page(page + 1, size)

    assert sql.params() == [value]

    for dialect in DIALECTS:

        text, params = sql.pair(dialect)

        assert text.count(MARKERS[dialect.name]) == 1
        assert params == [value]
        assert "'" not in text.replace('"', "").replace("`", "")
        assert all(mark not in text for mark in ("\x1f", "\x1e", "\x1d"))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=30))
def identifiers_are_quoted_or_refused ( name: str ) -> None:

    with suppress(Fault): assert Sql.select(name).text().startswith('SELECT * FROM "')
    with suppress(Fault): assert Sql.select(name).text(MYSQL).startswith("SELECT * FROM `")

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=40), st.integers())
def percent_signs_survive_positional_dialects ( fragment: str, value: int ) -> None:

    clean = fragment.replace("?", "").replace("\x1f", "").replace("\x1e", "").replace("\x1d", "")
    sql   = Sql.select("t").raw_where(clean + " = ?", value)

    for dialect in (MYSQL, CLICKHOUSE):

        text, params = sql.pair(dialect)

        assert params == [value]
        assert text.count("%s") == 1 + clean.count("%s")
        assert text.count("%") - 1 == 2 * clean.count("%")

every_statement_binds_its_values()
identifiers_are_quoted_or_refused()
percent_signs_survive_positional_dialects()

print(f"fuzz database  examples={EXAMPLES * 2 + EXAMPLES // 4}  ok")
