from engine.ai import Ai, Mock
from engine.search import Memory as MemorySearch, Search
from engine.database import Migrator, database
from engine.error import Code, Fault
from engine.rag import Database, Hit, Memory as MemoryRag, Rag, Store
import os, pytest

URL = os.environ.get("ENGINE_DATABASE_URL", "postgresql://engine:engine@127.0.0.1:5432/engine_test")

@pytest.fixture
async def brain () -> Ai:

    made = Ai()

    made.use(Mock(), default=True, tasks=["embed"])

    if not database.ready(): await database.connect(URL, min_size=1, max_size=4, application="engine-tests", ssl="disable")

    return made

def test_chunking_packs_sentences_and_overlaps () -> None:

    rag = Rag()

    rag.setup(Ai(), MemoryRag(), size=20, overlap=5, dimensions=8)

    chunks = rag.chunk("docs", "a.txt", "the quick brown fox jumps over the lazy dog again and again", kind="note")

    assert [c.index for c in chunks] == list(range(len(chunks))) and all(len(c.text) <= 20 for c in chunks) and chunks[0].facts == { "kind": "note" }
    assert " ".join(c.text for c in chunks).count("fox") >= 1 and rag.describe()["dimensions"] == 8 and rag.describe()["name"] == "memory"

    wide = Rag()

    wide.setup(Ai(), MemoryRag(), size=40, overlap=12, dimensions=8)

    sentences = wide.chunk("docs", "b.txt", "First point here. Second point follows! Third one? Fourth closes it.")

    assert sentences[0].text == "First point here. Second point follows!" and sentences[1].text.startswith("Third one?")
    assert wide.chunk("d", "c", "x" * 90)[0].text == "x" * 40 and len(wide.chunk("d", "c", "x" * 90)) == 3

    with pytest.raises(Fault): Rag().setup(Ai(), MemoryRag(), size=10, overlap=10, dimensions=8)

async def walk ( brain: Ai, store: Store ) -> list[object]:

    rag = Rag()

    rag.setup(brain, store, size=60, overlap=10)

    cats = await rag.index("kb", "cats.txt", "Cats purr softly and love warm places. Cats sleep most of the day.")
    dogs = await rag.index("kb", "dogs.txt", "Dogs bark loudly and love long walks. Dogs guard the house.")
    hits = await rag.search("kb", "Cats purr softly and love warm places.", limit=3)

    with pytest.raises(Fault) as blank: await rag.search("kb", "   ")

    return [
        cats, dogs, await rag.count("kb"), [hit.source for hit in hits][:1], 0 <= hits[0].score <= 1.0001, hits[0].dump()["source"],
        "[1] (cats.txt#" in rag.cite(hits), rag.cite(hits, limit=5), await rag.search("kb", "x", floor=2.0),
        await rag.search("other", "cats"), blank.value.code, await rag.forget("kb", "dogs.txt") >= 1, await rag.forget("kb") >= 1,
        await rag.count("kb"), rag.store().name,
    ]

async def test_memory_and_database_stores_answer_alike ( brain: Ai ) -> None:

    table    = Rag.blueprint("test_chunks", brain.dimensions())
    migrator = Migrator(database, [table])

    await migrator.drop("test_chunks")
    await migrator.apply()

    held = await walk(brain, MemoryRag())
    real = await walk(brain, Database(database, table))

    assert held[:-1] == real[:-1] and held[-1] == "memory" and real[-1] == "database"
    assert real[3] == ["cats.txt"] and real[4] is True and real[8] == [] and real[9] == [] and real[10] is Code.VALIDATION and real[13] == 0

async def test_hybrid_search_answers_and_reranks ( brain: Ai ) -> None:

    finder = Search()

    finder.setup(MemorySearch())

    rag = Rag()

    rag.setup(brain, MemoryRag(), size=60, overlap=10, search=finder, index="test_rag")

    await rag.index("kb", "cats.txt", "Cats purr softly and love warm places. Cats sleep most of the day.")
    await rag.index("kb", "dogs.txt", "Dogs bark loudly and love long walks. Dogs guard the house.")

    assert await finder.count("test_rag") == 3 and rag.describe()["hybrid"] is True

    fused = await rag.search("kb", "dogs guard the house", limit=2, hybrid=True)

    assert fused and fused[0].source == "dogs.txt" and 0 < fused[0].score <= 1 and len(fused) <= 2

    answer = await rag.answer("kb", "Who guards the house?", limit=2, hybrid=True)

    assert answer.text.startswith("echo: Who guards") and answer.hits and answer.dump()["model"] == "mock"
    assert "[1]" in brain.model().seen[-1][0].content and "Sources:" in brain.model().seen[-1][0].content  # type: ignore[attr-defined]

    judge = Ai()

    judge.use(Mock(answer='{"scores": [2, 9]}'), default=True)

    picker = Rag()

    picker.setup(judge, MemoryRag(), dimensions=8)

    hits   = [Hit("a", 0, "first", 0.5), Hit("b", 1, "second", 0.4)]
    sorted_ = await picker.rerank("question", hits, limit=1)

    assert [hit.source for hit in sorted_] == ["b"] and sorted_[0].score == 0.9 and await picker.rerank("q", []) == []

    assert await rag.forget("kb", "dogs.txt") >= 1 and await finder.count("test_rag") == 2
    assert await rag.forget("kb") >= 1 and await finder.count("test_rag") == 0
