from collections.abc import Mapping, Sequence
from typing import Any, override

from engine.error import Code, Fault
from engine.json import json
from engine.net import Egress, Net, Remote
from .arch import Document, Hit, NDJSON, Query, Result, Schema
from .engine import Engine
import time

class Elastic(Engine):

    name         = "elasticsearch"
    capabilities = frozenset({ "index", "query", "filters", "sort", "facets", "highlight", "create" })

    def __init__ (
        self, net: Net, base: str, key: str | None = None, headers: Mapping[str, str] | None = None,
        egress: Egress | None = None, refresh: bool = False,
    ) -> None:

        sent = { **({ "Authorization": f"ApiKey {key}" } if key else {}), **(headers or {}) }

        self._remote  = Remote(net, base, sent, egress, self.name)
        self._refresh = refresh
        self._schemas: dict[str, Schema] = {}

    @override
    async def prepare ( self, index: str, schema: Schema ) -> None:

        self._schemas[index] = schema

        try: await self._remote.call("HEAD", f"/{index}")
        except Fault as fault:

            if not self._missing_(fault): raise

            properties: dict[str, Any] = { name: { "type": "text" } for name in schema.searchable }

            for name in (*schema.filterable, *schema.sortable):

                properties.setdefault(name, { "type": "keyword" })

                if name in schema.searchable: properties[name]["fields"] = { "keyword": { "type": "keyword" } }

            await self._remote.call("PUT", f"/{index}", data={ "mappings": { "properties": properties } })

    @override
    async def index ( self, index: str, documents: Sequence[Document] ) -> int:

        if not documents: return 0

        lines = []

        for document in documents:

            lines.append(json.dumps({ "index": { "_index": index, "_id": document.id } }))
            lines.append(json.dumps(document.fields))

        query = { "refresh": "wait_for" } if self._refresh else None
        reply = await self._remote.call(
            "POST", "/_bulk", body="\n".join(lines) + "\n", headers={ "Content-Type": NDJSON }, query=query,
        )
        body  = reply.json() or {}

        if body.get("errors"):

            failed = [item for item in body.get("items", []) if "error" in next(iter(item.values()), {})]

            raise Fault(Code.INTERNAL, reason="search.index", errors={ "failed": [str(len(failed))] })

        return len(documents)

    @override
    async def get ( self, index: str, id_: str ) -> Document | None:

        try: body = await self._remote.get(f"/{index}/_doc/{id_}")
        except Fault as fault:

            if self._missing_(fault): return None

            raise

        return Document(str(body.get("_id", id_)), dict(body.get("_source") or {}))

    @override
    async def query ( self, index: str, query: Query ) -> Result:

        started = time.perf_counter()
        schema  = self._schema_(index)
        body    = self._body_(schema, query)
        found   = await self._remote.post(f"/{index}/_search", data=body)
        hits    = found.get("hits", {})
        total   = hits.get("total", {})
        rows    = hits.get("hits", [])
        facets  = {
            name: { str(bucket["key"]): int(bucket["doc_count"]) for bucket in facet.get("buckets", []) }
            for name, facet in (found.get("aggregations") or {}).items()
        }
        made    = [
            Hit(
                str(row["_id"]), float(row.get("_score") or 0.0), dict(row.get("_source") or {}),
                { name: " ".join(parts) for name, parts in (row.get("highlight") or {}).items() },
            )
            for row in rows
        ]
        took    = float(found.get("took", 0)) / 1000 or time.perf_counter() - started

        return Result(made, int(total.get("value", len(made)) if isinstance(total, dict) else total), took, facets)

    @override
    async def delete ( self, index: str, ids: Sequence[str] ) -> int:

        if not ids: return 0

        body: dict[str, Any] = { "query": { "ids": { "values": list(ids) } } }
        found = await self._remote.post(f"/{index}/_delete_by_query", data=body, query={ "refresh": "true" })

        return int(found.get("deleted", 0))

    @override
    async def clear ( self, index: str ) -> int:

        body: dict[str, Any] = { "query": { "match_all": {} } }
        found = await self._remote.post(f"/{index}/_delete_by_query", data=body, query={ "refresh": "true" })

        return int(found.get("deleted", 0))

    @override
    async def drop ( self, index: str ) -> bool:

        self._schemas.pop(index, None)

        try: await self._remote.call("DELETE", f"/{index}")
        except Fault as fault:

            if self._missing_(fault): return False

            raise

        return True

    @override
    async def count ( self, index: str ) -> int:

        return int((await self._remote.get(f"/{index}/_count")).get("count", 0))

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

        must: list[dict[str, Any]] = []
        filters: list[dict[str, Any]] = []

        if query.text.strip():

            fields = list(query.fields or schema.searchable) or ["*"]

            must.append({ "multi_match": { "query": query.text, "fields": fields, "fuzziness": "AUTO" } })

        for name, wanted in query.filters.items():

            schema.check("filter", name)

            if isinstance(wanted, list | tuple | set | frozenset): filters.append({ "terms": { name: list(wanted) } })
            else: filters.append({ "term": { name: wanted } })

        body: dict[str, Any] = {
            "query"           : { "bool": { "must": must or [{ "match_all": {} }], "filter": filters } },
            "from"            : query.offset(),
            "size"            : query.limit,
            "track_total_hits": True,
        }

        if query.sort:

            orders = []

            for name, descending in query.orders():

                schema.check("sort", name)

                orders.append({ name: { "order": "desc" if descending else "asc" } })

            body["sort"] = orders

        if query.facets:

            for name in query.facets:

                schema.check("facet", name)

            body["aggs"] = { name: { "terms": { "field": name, "size": 50 } } for name in query.facets }

        if query.highlight:

            lit: dict[str, dict[str, Any]] = { name: {} for name in schema.searchable }

            body["highlight"] = { "pre_tags": ["<em>"], "post_tags": ["</em>"], "fields": lit }

        if query.fields: body["_source"] = list(query.fields)

        return body
