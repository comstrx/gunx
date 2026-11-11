from collections.abc import Mapping, Sequence
from typing import Any, override

from engine.error import Code, Fault
from engine.log import log
from engine.net import Egress, Net, Remote
from .arch import Document, DONE, EXISTS, Hit, Query, Result, Schema
from .engine import Engine
import asyncio, re, time

class Meili(Engine):

    name         = "meilisearch"
    capabilities = frozenset({ "index", "query", "filters", "sort", "facets", "highlight", "suggest", "create" })

    def __init__ (
        self, net: Net, base: str, key: str | None = None, headers: Mapping[str, str] | None = None,
        egress: Egress | None = None, wait: float = 10.0, poll: float = 0.05,
    ) -> None:

        sent = { **({ "Authorization": f"Bearer {key}" } if key else {}), **(headers or {}) }

        self._remote = Remote(net, base, sent, egress, self.name)
        self._wait   = wait
        self._poll   = poll
        self._schemas: dict[str, Schema] = {}

    @override
    async def prepare ( self, index: str, schema: Schema ) -> None:

        self._schemas[index] = schema

        await self._task_(await self._remote.post("/indexes", data={ "uid": index, "primaryKey": "id" }), EXISTS)

        settings = {
            "searchableAttributes": list(schema.searchable),
            "filterableAttributes": list(schema.filterable),
            "sortableAttributes"  : list(schema.sortable),
        }

        await self._task_((await self._remote.call("PATCH", f"/indexes/{index}/settings", data=settings)).json())

    @override
    async def index ( self, index: str, documents: Sequence[Document] ) -> int:

        if not documents: return 0

        payload = [document.dump() for document in documents]

        started = await self._remote.post(f"/indexes/{index}/documents", data=payload, query={ "primaryKey": "id" })

        await self._task_(started)

        return len(documents)

    @override
    async def get ( self, index: str, id_: str ) -> Document | None:

        try: body = await self._remote.get(f"/indexes/{index}/documents/{id_}")
        except Fault as fault:

            if self._missing_(fault): return None

            raise

        fields = dict(body or {})

        return Document(str(fields.pop("id", id_)), fields)

    @override
    async def query ( self, index: str, query: Query ) -> Result:

        started = time.perf_counter()
        schema  = self._schema_(index)
        found   = await self._remote.post(f"/indexes/{index}/search", data=self._body_(schema, query))
        hits    = []

        for row in found.get("hits", []):

            fields    = { key: value for key, value in row.items() if not key.startswith("_") }
            formatted = row.get("_formatted") or {}
            marks     = { name: str(formatted[name]) for name in schema.searchable if name in formatted }

            if not query.highlight: marks = {}

            hits.append(Hit(str(fields.pop("id", "")), float(row.get("_rankingScore") or 0.0), fields, marks))

        facets = { name: self._facet_(values) for name, values in (found.get("facetDistribution") or {}).items() }
        took   = float(found.get("processingTimeMs", 0)) / 1000 or time.perf_counter() - started

        return Result(hits, int(found.get("estimatedTotalHits", len(hits))), took, facets)

    @override
    async def suggest ( self, index: str, prefix: str, limit: int = 5 ) -> list[str]:

        if not prefix.strip(): return []

        schema = self._schema_(index)
        body   = {
            "q": prefix, "limit": max(limit * 4, 20), "offset": 0, "attributesToHighlight": list(schema.searchable),
            "highlightPreTag": "<em>", "highlightPostTag": "</em>", "attributesToRetrieve": ["id"],
        }
        found  = await self._remote.post(f"/indexes/{index}/search", data=body)
        words: dict[str, int] = {}

        for row in found.get("hits", []):

            for text in (row.get("_formatted") or {}).values():

                for word in re.findall(r"<em>([^<]+)</em>", str(text)):

                    words[word.lower()] = words.get(word.lower(), 0) + 1

        return [word for word, _ in sorted(words.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]]

    @override
    async def delete ( self, index: str, ids: Sequence[str] ) -> int:

        if not ids: return 0

        await self._task_(await self._remote.post(f"/indexes/{index}/documents/delete-batch", data=list(ids)))

        return len(ids)

    @override
    async def clear ( self, index: str ) -> int:

        before = await self.count(index)

        await self._task_((await self._remote.call("DELETE", f"/indexes/{index}/documents")).json())

        return before

    @override
    async def drop ( self, index: str ) -> bool:

        self._schemas.pop(index, None)

        try:

            started = (await self._remote.call("DELETE", f"/indexes/{index}")).json()

            await self._task_(started, frozenset({ "index_not_found" }))

        except Fault as fault:

            if self._missing_(fault): return False

            raise

        return True

    @override
    async def count ( self, index: str ) -> int:

        return int((await self._remote.get(f"/indexes/{index}/stats")).get("numberOfDocuments", 0))

    @override
    async def close ( self ) -> None:

        return None

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), **self._remote.describe(), "indexes": sorted(self._schemas) }

    def _schema_ ( self, index: str ) -> Schema:

        found = self._schemas.get(index)

        if found is None: raise Fault(Code.NOT_FOUND, reason="search.index", errors={ "index": [index] })

        return found

    def _body_ ( self, schema: Schema, query: Query ) -> dict[str, Any]:

        body: dict[str, Any] = {
            "q": query.text, "limit": query.limit, "offset": query.offset(), "showRankingScore": True,
        }
        parts: list[str] = []

        for name, wanted in query.filters.items():

            schema.check("filter", name)

            if isinstance(wanted, list | tuple | set | frozenset):

                parts.append(f"{name} IN [{', '.join(self._literal_(value) for value in wanted)}]")

            else: parts.append(f"{name} = {self._literal_(wanted)}")

        if parts: body["filter"] = " AND ".join(parts)

        if query.sort:

            orders = []

            for name, descending in query.orders():

                schema.check("sort", name)

                orders.append(f"{name}:{'desc' if descending else 'asc'}")

            body["sort"] = orders

        if query.facets:

            for name in query.facets:

                schema.check("facet", name)

            body["facets"] = list(query.facets)

        if query.highlight:

            body["attributesToHighlight"] = list(schema.searchable)
            body["highlightPreTag"]       = "<em>"
            body["highlightPostTag"]      = "</em>"

        if query.fields: body["attributesToRetrieve"] = ["id", *query.fields]

        return body

    def _literal_ ( self, value: Any ) -> str:

        if isinstance(value, bool): return "true" if value else "false"
        if isinstance(value, int | float): return str(value)

        text = str(value).replace("\\", "\\\\").replace('"', '\\"')

        return f'"{text}"'

    def _facet_ ( self, values: Mapping[str, Any] ) -> dict[str, int]:

        ordered = sorted(values.items(), key=lambda pair: (-int(pair[1]), str(pair[0])))

        return { str(key): int(count) for key, count in ordered }

    async def _task_ ( self, started: Any, allowed: frozenset[str] = frozenset() ) -> None:

        uid = (started or {}).get("taskUid")

        if uid is None: return

        deadline = asyncio.get_running_loop().time() + self._wait

        while True:

            task   = await self._remote.get(f"/tasks/{uid}")
            status = str(task.get("status", ""))

            if status in DONE:

                error = task.get("error") or {}
                code  = str(error.get("code", ""))

                if status == "succeeded" or code in allowed: return

                log.warning("search.task", engine=self.name, code=code)

                detail = { code or status: [str(error.get("message", ""))[:200]] }

                raise Fault(Code.INTERNAL, reason="search.task", errors=detail)

            if asyncio.get_running_loop().time() >= deadline:

                raise Fault(Code.TIMEOUT, reason="search.task", unknown=True)

            await asyncio.sleep(self._poll)
