from collections.abc import Sequence
from typing import Any

from engine.ai import Ai, Message, ai as shared
from engine.database import Column, Index, Table
from engine.error import Code, Fault
from engine.log import log
from engine.search import Search
from engine.string import string
from .arch import Answer, Chunk, FUSION, Hit, LIMIT, PROMPT
from .memory import Memory
from .scores import Scores
from .store import Store

class Rag:

    def __init__ ( self ) -> None:

        self._ai: Ai = shared
        self._store: Store = Memory()
        self._search: Search | None = None
        self._index   = "rag"
        self._size    = 1200
        self._overlap = 150
        self._dims    = 1536

    @staticmethod
    def blueprint ( name: str, dimensions: int ) -> Table:

        return Table.define(
            name,
            Column.id(),
            Column.text("scope"),
            Column.text("source"),
            Column.integer("position"),
            Column.text("body", length=0),
            Column.jsonb("facts"),
            Column.vector("embedding", dimensions),
            indexes=[Index(("scope", "source", "position"), unique=True), Index(("scope",))],
        )

    def setup (
        self, ai: Ai | None = None, store: Store | None = None, size: int = 1200, overlap: int = 150,
        dimensions: int | None = None, search: Search | None = None, index: str = "rag",
    ) -> None:

        if overlap >= size: raise Fault(Code.INTERNAL, reason="rag.overlap")

        self._ai      = ai or shared
        self._store   = Memory() if store is None else store
        self._search  = search
        self._index   = index
        self._size    = size
        self._overlap = overlap
        self._dims    = dimensions or self._ai.dimensions()

    def store ( self ) -> Store:

        return self._store

    def chunk ( self, scope: str, source: str, text: str, **facts: Any ) -> list[Chunk]:

        pieces = [piece.strip() for piece in self.pieces(string.squish(text))]
        chunks: list[Chunk] = []
        held: list[str] = []
        size   = 0

        for piece in pieces:

            if held and size + 1 + len(piece) > self._size:

                chunks.append(Chunk(scope, source, len(chunks), " ".join(held), dict(facts)))

                kept: list[str] = []
                back = 0

                for earlier in reversed(held):

                    if back + len(earlier) > self._overlap: break

                    kept.insert(0, earlier)

                    back += len(earlier) + 1

                held = kept
                size = sum(len(item) + 1 for item in held)

            held.append(piece)

            size += len(piece) + 1

        if held: chunks.append(Chunk(scope, source, len(chunks), " ".join(held), dict(facts)))

        return chunks

    def pieces ( self, text: str ) -> list[str]:

        pieces: list[str] = []

        for sentence in string.sentences(text):

            words = sentence.split(" ")
            line  = ""

            for word in words:

                if line and len(line) + 1 + len(word) > self._size:

                    pieces.append(line)

                    line = ""

                rest = word

                while len(rest) > self._size:

                    pieces.append(rest[:self._size])

                    rest = rest[self._size:]

                line = f"{line} {rest}".strip() if line else rest

            if line: pieces.append(line)

        return [piece for piece in pieces if piece]

    async def index ( self, scope: str, source: str, text: str, **facts: Any ) -> int:

        chunks  = self.chunk(scope, source, text, **facts)
        vectors = await self._ai.embed([chunk.text for chunk in chunks])

        await self._store.drop(scope, source)
        await self._store.put(chunks, vectors)

        if self._search is not None:

            await self._search.prepare(self._index, ["body"], ["scope", "source"], ["position"])
            await self._search.index(self._index, *[self._document_(chunk) for chunk in chunks])

        log.info("rag.indexed", scope=scope, source=source, chunks=len(chunks), store=self._store.name)

        return len(chunks)

    async def forget ( self, scope: str, source: str | None = None ) -> int:

        gone = await self._store.drop(scope, source)

        if self._search is not None:

            filters = { "scope": scope, **({ "source": source } if source else {}) }
            found   = await self._search.query(self._index, "", filters=filters, limit=200)

            await self._search.delete(self._index, *found.ids())

        return gone

    async def search (
        self, scope: str, query: str, limit: int = 5, floor: float = 0.0, hybrid: bool = False,
    ) -> list[Hit]:

        if not query.strip(): raise Fault(Code.VALIDATION, reason="rag.query")

        wanted = max(1, min(limit, LIMIT))
        vector = (await self._ai.embed([query]))[0]
        hits   = await self._store.search(scope, vector, wanted if not hybrid else wanted * 2)

        if hybrid and self._search is not None: hits = await self._fuse_(scope, query, hits, wanted)

        return [hit for hit in hits if hit.score >= floor]

    async def answer (
        self, scope: str, question: str, limit: int = 5, system: str | None = None, hybrid: bool = False,
        **options: Any,
    ) -> Answer:

        hits     = await self.search(scope, question, limit, hybrid=hybrid)
        context  = self.cite(hits) or "(no sources)"
        guide    = Message("system", f"{system or PROMPT}\n\nSources:\n{context}")
        reply    = await self._ai.chat([guide, Message("user", question)], **options)

        return Answer(reply.text, tuple(hits), reply)

    async def rerank ( self, query: str, hits: Sequence[Hit], limit: int | None = None ) -> list[Hit]:

        if not hits: return []

        listed = "\n".join(f"[{n}] {hit.text}" for n, hit in enumerate(hits, 1))
        prompt = f"Question: {query}\n\nScore each passage 0-10 for how well it answers the question.\n\n{listed}"
        scored = await self._ai.extract([Message("user", prompt)], Scores)
        marks  = list(scored.scores) + [0] * (len(hits) - len(scored.scores))
        ranked = sorted(zip(hits, marks, strict=False), key=lambda pair: -pair[1])

        chosen = ranked[:limit or len(hits)]

        return [Hit(hit.source, hit.index, hit.text, score / 10, dict(hit.facts)) for hit, score in chosen]

    async def count ( self, scope: str ) -> int:

        return await self._store.count(scope)

    def cite ( self, hits: Sequence[Hit], limit: int = 4000 ) -> str:

        parts: list[str] = []
        used = 0

        for number, hit in enumerate(hits, 1):

            piece = f"[{number}] ({hit.source}#{hit.index}) {hit.text}"

            if used + len(piece) > limit: break

            parts.append(piece)
            used += len(piece)

        return "\n".join(parts)

    def describe ( self ) -> dict[str, Any]:

        hybrid = self._search is not None

        facts  = { "size": self._size, "overlap": self._overlap, "dimensions": self._dims, "hybrid": hybrid }

        return { **facts, **self._store.describe() }

    def _document_ ( self, chunk: Chunk ) -> dict[str, Any]:

        key = f"{chunk.scope}:{chunk.source}:{chunk.index}"

        return { "id": key, "scope": chunk.scope, "source": chunk.source, "position": chunk.index, "body": chunk.text }

    async def _fuse_ ( self, scope: str, query: str, hits: list[Hit], limit: int ) -> list[Hit]:

        if self._search is None: return hits[:limit]

        words  = await self._search.query(self._index, query, filters={ "scope": scope }, limit=min(limit * 2, 50))
        scores: dict[str, float] = {}
        known: dict[str, Hit] = {}

        for rank, hit in enumerate(hits, 1):

            key         = f"{hit.source}:{hit.index}"
            known[key]  = hit
            scores[key] = scores.get(key, 0.0) + 1 / (FUSION + rank)

        for rank, found in enumerate(words.hits, 1):

            key = f"{found.fields.get('source')}:{found.fields.get('position')}"

            scores[key] = scores.get(key, 0.0) + 1 / (FUSION + rank)

            if key not in known:

                fields     = found.fields
                position   = int(fields.get("position") or 0)
                known[key] = Hit(str(fields.get("source")), position, str(fields.get("body")), 0.0)

        top = sorted(scores.items(), key=lambda pair: -pair[1])[:limit]

        return [Hit(known[k].source, known[k].index, known[k].text, score, dict(known[k].facts)) for k, score in top]
