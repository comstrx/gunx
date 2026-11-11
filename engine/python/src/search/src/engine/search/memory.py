from collections.abc import Callable, Mapping, Sequence
from typing import Any, override

from engine.error import Code, Fault
from .arch import B, Document, Hit, K1, Query, Result, Schema
from .engine import Engine
import math, time

class Memory(Engine):

    name = "memory"

    def __init__ ( self ) -> None:

        self._schemas: dict[str, Schema] = {}
        self._documents: dict[str, dict[str, Document]] = {}
        self._terms: dict[str, dict[str, dict[str, int]]] = {}
        self._lengths: dict[str, dict[str, int]] = {}

    @override
    async def prepare ( self, index: str, schema: Schema ) -> None:

        self._schemas[index] = schema
        self._documents.setdefault(index, {})
        self._terms.setdefault(index, {})
        self._lengths.setdefault(index, {})

    @override
    async def index ( self, index: str, documents: Sequence[Document] ) -> int:

        schema = self._schema_(index)

        for document in documents:

            self._forget_(index, document.id)

            words = [word for name in schema.searchable for word in self._tokens_(document.fields.get(name))]
            counts: dict[str, int] = {}

            for word in words: counts[word] = counts.get(word, 0) + 1

            self._documents[index][document.id] = document
            self._lengths[index][document.id]   = len(words)

            for word, count in counts.items(): self._terms[index].setdefault(word, {})[document.id] = count

        return len(documents)

    @override
    async def get ( self, index: str, id_: str ) -> Document | None:

        return self._documents.get(index, {}).get(id_)

    @override
    async def query ( self, index: str, query: Query ) -> Result:

        started   = time.perf_counter()
        schema    = self._schema_(index)
        documents = self._documents[index]
        words     = self._tokens_(query.text)

        for name in query.filters: schema.check("filter", name)

        scored    = self._score_(index, words) if words else dict.fromkeys(documents, 0.0)
        kept      = [(score, documents[id_]) for id_, score in scored.items()]
        kept      = [pair for pair in kept if self._matches_(pair[1].fields, query.filters)]

        for name, descending in reversed(query.orders()):

            schema.check("sort", name)

            kept.sort(key=self._key_(name), reverse=descending)

        if not query.sort: kept.sort(key=lambda pair: (-pair[0], pair[1].id))

        facets = self._facets_(schema, [document for _, document in kept], query.facets)
        window = kept[query.offset():query.offset() + query.limit]
        shown  = query.fields or tuple(schema.names())
        hits   = [self._hit_(document, score, shown, schema, words, query.highlight) for score, document in window]

        return Result(hits, len(kept), time.perf_counter() - started, facets)

    @override
    async def suggest ( self, index: str, prefix: str, limit: int = 5 ) -> list[str]:

        wanted = self._tokens_(prefix)

        if not wanted: return []

        head  = wanted[-1]
        terms = self._terms.get(index, {})
        found = sorted((word for word in terms if word.startswith(head)), key=lambda word: (-len(terms[word]), word))

        return found[:limit]

    @override
    async def delete ( self, index: str, ids: Sequence[str] ) -> int:

        return sum(1 for id_ in ids if self._forget_(index, id_))

    @override
    async def clear ( self, index: str ) -> int:

        count = len(self._documents.get(index, {}))

        self._documents[index] = {}
        self._terms[index]     = {}
        self._lengths[index]   = {}

        return count

    @override
    async def drop ( self, index: str ) -> bool:

        known = index in self._schemas

        for store in (self._schemas, self._documents, self._terms, self._lengths): store.pop(index, None)

        return known

    @override
    async def count ( self, index: str ) -> int:

        return len(self._documents.get(index, {}))

    def _schema_ ( self, index: str ) -> Schema:

        found = self._schemas.get(index)

        if found is None: raise Fault(Code.NOT_FOUND, reason="search.index", errors={ "index": [index] })

        return found

    def _forget_ ( self, index: str, id_: str ) -> bool:

        held = self._documents.get(index, {}).pop(id_, None)

        if held is None: return False

        self._lengths[index].pop(id_, None)

        for postings in self._terms[index].values(): postings.pop(id_, None)

        return True

    def _score_ ( self, index: str, words: Sequence[str] ) -> dict[str, float]:

        terms   = self._terms[index]
        lengths = self._lengths[index]
        total   = len(lengths)
        average = (sum(lengths.values()) / total) if total else 1.0
        scores: dict[str, float] = {}

        for word in words:

            postings = terms.get(word, {})

            if not postings: continue

            idf = math.log(1 + (total - len(postings) + 0.5) / (len(postings) + 0.5))

            for id_, count in postings.items():

                norm = count + K1 * (1 - B + B * lengths[id_] / average)

                scores[id_] = scores.get(id_, 0.0) + idf * (count * (K1 + 1)) / norm

        return scores

    def _hit_ (
        self, document: Document, score: float, shown: Sequence[str], schema: Schema, words: Sequence[str], lit: bool,
    ) -> Hit:

        fields = { name: document.fields.get(name) for name in shown if name in document.fields }
        marked = schema.searchable if lit else ()
        marks  = { name: self._highlight_(document.fields.get(name), words) for name in marked }

        return Hit(document.id, score, fields, marks)

    def _key_ ( self, name: str ) -> Callable[[tuple[float, Document]], tuple[bool, Any]]:

        def key ( pair: tuple[float, Document] ) -> tuple[bool, Any]:

            value = pair[1].fields.get(name)

            return value is None, value

        return key

    def _facets_ (
        self, schema: Schema, documents: Sequence[Document], names: Sequence[str],
    ) -> dict[str, dict[str, int]]:

        facets: dict[str, dict[str, int]] = {}

        for name in names:

            schema.check("facet", name)

            counts: dict[str, int] = {}

            for document in documents:

                value = document.fields.get(name)

                if value is None: continue

                counts[str(value)] = counts.get(str(value), 0) + 1

            facets[name] = dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))

        return facets

    def _matches_ ( self, fields: Mapping[str, Any], filters: Mapping[str, Any] ) -> bool:

        for name, wanted in filters.items():

            held = fields.get(name)

            if isinstance(wanted, list | tuple | set | frozenset):

                if held not in wanted: return False

            elif held != wanted: return False

        return True
