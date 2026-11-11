from engine.error import Code, Fault
from engine.search import Document, Memory, Query, Schema, Search
from engine.search.arch import LIMIT, WORD
from engine.string import string
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any
import asyncio

EXAMPLES = 500
WORDS    = st.sampled_from(["rust", "go", "python", "data", "cloud", "systems", "Rust", "x", "ü", ""])
TEXTS    = st.lists(WORDS, max_size=5).map(" ".join)
DOCS     = st.lists(st.fixed_dictionaries({ "id": st.from_regex(r"d[0-9]", fullmatch=True), "title": TEXTS, "body": TEXTS, "lang": st.sampled_from(["en", "ar", None]), "price": st.one_of(st.integers(0, 50), st.none()) }), max_size=8)
FILTERS  = st.dictionaries(st.sampled_from(["lang", "price", "title"]), st.one_of(st.sampled_from(["en", "ar"]), st.integers(0, 50), st.lists(st.sampled_from(["en", "ar"]), max_size=2)), max_size=2)
SORTS    = st.lists(st.sampled_from(["price", "-price", "lang", "-lang", "title"]), max_size=2).map(tuple)

loop   = asyncio.new_event_loop()
schema = Schema(("title", "body"), ("lang", "price"), ("price", "lang"))

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

def run ( work: Any ) -> Any:

    try: return loop.run_until_complete(work)
    except Fault as fault: return fault

def tokens ( text: object ) -> list[str]:

    return [string.fold(word) for word in WORD.findall(str(text or "").lower())]

def matches ( fields: dict[str, Any], filters: dict[str, Any] ) -> bool:

    return all(fields.get(k) in v if isinstance(v, list) else fields.get(k) == v for k, v in filters.items())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(DOCS, TEXTS, FILTERS, SORTS, st.integers(1, 12), st.integers(1, 3))
def queried ( docs: list[dict[str, Any]], text: str, filters: dict[str, Any], sort: tuple[str, ...], limit: int, page: int ) -> None:

    engine = Memory()
    held   = { doc["id"]: doc for doc in docs }

    run(engine.prepare("books", schema))
    run(engine.index("books", [Document(doc["id"], { k: v for k, v in doc.items() if k != "id" }) for doc in docs]))

    assert run(engine.count("books")) == len(held)

    result = run(engine.query("books", Query(text, filters, limit, page, sort)))

    if isinstance(result, Fault):

        assert result.code is Code.VALIDATION and result.reason in ("search.filter", "search.sort")
        assert "title" in filters or "title" in [name.removeprefix("-") for name in sort]

        return

    words    = tokens(text)
    expected = [doc for doc in held.values() if matches(doc, filters) and (not words or any(word in tokens(doc["title"]) + tokens(doc["body"]) for word in words))]

    assert result.total == len(expected)
    assert len(result.hits) == max(0, min(limit, len(expected) - (page - 1) * limit))
    assert all(hit.id in held for hit in result.hits) and len({ hit.id for hit in result.hits }) == len(result.hits)

    if not sort: assert [hit.score for hit in result.hits] == sorted((hit.score for hit in result.hits), reverse=True)
    if not words: assert all(hit.score == 0.0 for hit in result.hits)

    for prefix in words[:1]:

        suggested = run(engine.suggest("books", prefix, 5))

        assert all(word.startswith(prefix) for word in suggested) and len(suggested) <= 5

    gone = run(engine.delete("books", list(held)[:2]))

    assert gone == min(2, len(held)) and run(engine.count("books")) == len(held) - gone
    assert run(engine.clear("books")) == len(held) - gone and run(engine.count("books")) == 0
    assert run(engine.drop("books")) and not run(engine.drop("books"))
    assert isinstance(run(engine.query("books", Query("x"))), Fault)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(-5, LIMIT + 5), st.integers(-2, 5), st.text(max_size=12))
def shaped ( limit: int, page: int, text: str ) -> None:

    query = tried(lambda: Query(text, limit=limit, page=page))

    if isinstance(query, Fault):

        assert query.code is Code.VALIDATION and query.reason in ("search.limit", "search.page")
        assert not 1 <= limit <= LIMIT or page < 1

        return

    assert query.offset() == (page - 1) * limit and query.orders() == []

    made = tried(lambda: Search().document({ "id": text, "title": "t" }))

    if isinstance(made, Fault): assert made.reason == "search.id" and text == ""
    else: assert made.id == text and made.fields == { "title": "t" }

queried()
shaped()

loop.close()

print(f"fuzz search  examples={EXAMPLES * 2}  ok")
