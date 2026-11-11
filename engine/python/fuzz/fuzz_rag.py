from engine.ai import Ai, Mock
from engine.error import Code, Fault
from engine.rag import Chunk, Hit, Memory, Rag
from engine.string import string
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any
import asyncio, re

EXAMPLES = 600
WORDS    = re.compile(r"\S+")
TEXTS    = st.text(st.characters(codec="utf-8"), max_size=400)
SIZES    = st.integers(min_value=4, max_value=200)

loop  = asyncio.new_event_loop()
brain = Ai()

brain.use(Mock(dimensions=8), default=True, tasks=["embed"])

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

def run ( work: Any ) -> Any:

    try: return loop.run_until_complete(work)
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(TEXTS, SIZES, st.integers(min_value=0, max_value=199))
def chunked ( text: str, size: int, overlap: int ) -> None:

    rag  = Rag()
    made = tried(lambda: rag.setup(brain, Memory(), size=size, overlap=overlap, dimensions=8))

    if isinstance(made, Fault):

        assert made.reason == "rag.overlap" and overlap >= size

        return

    chunks = rag.chunk("scope", "source", text, kind="fuzz")
    words  = WORDS.findall(string.squish(text))

    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert all(chunk.scope == "scope" and chunk.source == "source" and chunk.facts == { "kind": "fuzz" } for chunk in chunks)
    assert all(0 < len(chunk.text) <= size for chunk in chunks)
    assert bool(chunks) == bool(words)

    joined = " ".join(chunk.text for chunk in chunks)

    for word in words[:50]:

        for piece in (word[at:at + size] for at in range(0, len(word), size)): assert piece in joined

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.tuples(st.text(min_size=1, max_size=12), st.lists(st.floats(min_value=-1, max_value=1), min_size=8, max_size=8)), max_size=12), st.lists(st.floats(min_value=-1, max_value=1), min_size=8, max_size=8), st.integers(1, 6))
def stored ( rows: list[tuple[str, list[float]]], probe: list[float], limit: int ) -> None:

    store  = Memory()
    chunks = [Chunk("s", f"src-{at}", 0, text) for at, (text, _) in enumerate(rows)]

    assert run(store.put(chunks, [vector for _, vector in rows])) == len(rows)
    assert run(store.count("s")) == len(rows) and run(store.count("other")) == 0

    hits = run(store.search("s", probe, limit))

    assert isinstance(hits, list) and len(hits) == min(limit, len(rows))
    assert all(isinstance(hit, Hit) and -1.0001 <= hit.score <= 1.0001 for hit in hits)
    assert [hit.score for hit in hits] == sorted((hit.score for hit in hits), reverse=True)
    assert run(store.search("other", probe, limit)) == []

    if rows:

        assert run(store.drop("s", "src-0")) == 1 and run(store.count("s")) == len(rows) - 1

    assert run(store.drop("s")) == max(0, len(rows) - 1) and run(store.count("s")) == 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.builds(Hit, st.text(min_size=1, max_size=8), st.integers(0, 9), st.text(max_size=60), st.floats(0, 1)), max_size=8), st.integers(0, 300))
def cited ( hits: list[Hit], limit: int ) -> None:

    rag  = Rag()
    text = rag.cite(hits, limit)

    assert len(text) <= limit + len(hits)
    assert text.count("] (") <= len(hits)
    assert not text or text.startswith("[1] (")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=20), st.integers(-5, 80), st.floats(min_value=-1, max_value=2))
def searched ( query: str, limit: int, floor: float ) -> None:

    rag = Rag()

    rag.setup(brain, Memory(), size=50, overlap=5, dimensions=8)
    run(rag.index("s", "a", "cats purr softly and love warm places"))

    made = run(rag.search("s", query, limit, floor))

    if isinstance(made, Fault):

        assert (made.code, made.reason) == (Code.VALIDATION, "rag.query")
        assert not query.strip()

        return

    assert isinstance(made, list) and len(made) <= max(1, min(limit, 50))
    assert all(hit.score >= floor for hit in made)

chunked()
stored()
cited()
searched()

loop.close()

print(f"fuzz rag  examples={EXAMPLES * 4}  ok")
