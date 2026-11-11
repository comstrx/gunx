from collections.abc import Mapping, Sequence
from typing import Any, override

from engine.error import Code, Fault
from engine.json import json
from engine.net import Egress, Net, Remote
from .arch import BOLD, Document, Hit, Query, Result, Schema
from .engine import Engine
import time

class Vespa(Engine):

    name         = "vespa"
    capabilities = frozenset({ "index", "query", "filters", "sort", "highlight" })

    def __init__ (
        self, net: Net, base: str, namespace: str = "default", cluster: str = "default",
        headers: Mapping[str, str] | None = None, egress: Egress | None = None, ranking: str = "bm25",
    ) -> None:

        self._remote    = Remote(net, base, headers, egress, self.name)
        self._namespace = namespace
        self._cluster   = cluster
        self._ranking   = ranking
        self._schemas: dict[str, Schema] = {}

    @override
    async def prepare ( self, index: str, schema: Schema ) -> None:

        self._schemas[index] = schema

    @override
    async def index ( self, index: str, documents: Sequence[Document] ) -> int:

        for document in documents:

            await self._remote.post(self._path_(index, document.id), data={ "fields": document.fields })

        return len(documents)

    @override
    async def get ( self, index: str, id_: str ) -> Document | None:

        try: body = await self._remote.get(self._path_(index, id_))
        except Fault as fault:

            if self._missing_(fault): return None

            raise

        return Document(id_, dict(body.get("fields") or {}))

    @override
    async def query ( self, index: str, query: Query ) -> Result:

        started = time.perf_counter()
        schema  = self._schema_(index)
        body    = self._body_(index, schema, query)
        found   = await self._remote.post("/search/", data=body)
        root    = found.get("root") or {}
        hits    = []

        for child in root.get("children") or []:

            fields = dict(child.get("fields") or {})
            id_    = str(fields.pop("documentid", child.get("id", ""))).rsplit("::", 1)[-1]
            marks  = {
                name: BOLD.sub(lambda m: "<em>" if m.group(0) == "<hi>" else "</em>", str(fields[name]))
                for name in schema.searchable if name in fields
            } if query.highlight else {}

            if query.highlight:

                fields = { k: BOLD.sub("", v) if isinstance(v, str) else v for k, v in fields.items() }

            hits.append(Hit(id_, float(child.get("relevance") or 0.0), fields, marks))

        total = int((root.get("fields") or {}).get("totalCount", len(hits)))
        took  = float((found.get("timing") or {}).get("querytime", 0.0)) or time.perf_counter() - started

        return Result(hits, total, took, {})

    @override
    async def delete ( self, index: str, ids: Sequence[str] ) -> int:

        done = 0

        for id_ in ids:

            try: await self._remote.call("DELETE", self._path_(index, id_))
            except Fault as fault:

                if not self._missing_(fault): raise

                continue

            done += 1

        return done

    @override
    async def clear ( self, index: str ) -> int:

        before = await self.count(index)
        path   = f"/document/v1/{self._namespace}/{index}/docid"

        await self._remote.call("DELETE", path, query={ "selection": "true", "cluster": self._cluster })

        return before

    @override
    async def drop ( self, index: str ) -> bool:

        await self.clear(index)

        return self._schemas.pop(index, None) is not None

    @override
    async def count ( self, index: str ) -> int:

        body: dict[str, Any] = { "yql": f"select * from {index} where true", "hits": 0 }
        found = await self._remote.post("/search/", data=body)

        return int(((found.get("root") or {}).get("fields") or {}).get("totalCount", 0))

    @override
    async def close ( self ) -> None:

        return None

    @override
    def describe ( self ) -> dict[str, object]:

        facts = { "namespace": self._namespace, "indexes": sorted(self._schemas) }

        return { **super().describe(), **self._remote.describe(), **facts }

    def _schema_ ( self, index: str ) -> Schema:

        found = self._schemas.get(index)

        if found is None: raise Fault(Code.NOT_FOUND, reason="search.index", errors={ "index": [index] })

        return found

    def _path_ ( self, index: str, id_: str ) -> str:

        return f"/document/v1/{self._namespace}/{index}/docid/{id_}"

    def _body_ ( self, index: str, schema: Schema, query: Query ) -> dict[str, Any]:

        clauses = ["userQuery()"] if query.text.strip() else ["true"]

        for name, wanted in query.filters.items():

            schema.check("filter", name)

            values = list(wanted) if isinstance(wanted, list | tuple | set | frozenset) else [wanted]
            parts  = [f"{name} contains {self._literal_(value)}" for value in values]

            clauses.append(f"({' or '.join(parts)})" if len(parts) > 1 else parts[0])

        yql = f"select * from {index} where {' and '.join(clauses)}"

        if query.sort:

            orders = []

            for name, descending in query.orders():

                schema.check("sort", name)

                orders.append(f"{name} {'desc' if descending else 'asc'}")

            yql += f" order by {', '.join(orders)}"

        if query.facets: self.ensure("facets")

        body: dict[str, Any] = {
            "yql": yql, "hits": query.limit, "offset": query.offset(), "ranking": self._ranking,
            "presentation.bolding": bool(query.highlight),
        }

        if query.text.strip(): body["query"] = query.text
        if query.fields: body["presentation.summaryFields"] = ", ".join(query.fields)

        return body

    def _literal_ ( self, value: Any ) -> str:

        if isinstance(value, bool): return "true" if value else "false"
        if isinstance(value, int | float): return str(value)

        return json.dumps(str(value))
