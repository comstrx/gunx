from aiohttp import web
from engine.database import Database, Migrator, database
from engine.error import Fault
from engine.json import json
from engine.net import Egress, net
from engine.search import Database as DatabaseSearch, Document, Elastic, Engine, Meili, Memory, Query, Result, Schema, Search, Vespa
from typing import Any, Self, override
import os, pytest, re

URL   = os.environ.get("ENGINE_DATABASE_URL", "postgresql://engine:engine@127.0.0.1:5432/engine_test")
LOCAL = Egress(allow_private=True, ports=frozenset())
BOOKS = [
    { "id": "b1", "title": "Rust systems programming", "body": "rust rust rust memory safety", "lang": "en", "price": 30, "tags": "systems" },
    { "id": "b2", "title": "Go services", "body": "go services rust once", "lang": "en", "price": 20, "tags": "cloud" },
    { "id": "b3", "title": "Python data", "body": "python pandas frames", "lang": "ar", "price": 10, "tags": "data" },
]

def words ( text: object ) -> list[str]:

    return re.findall(r"\w+", str(text or "").lower())

def keep ( fields: dict[str, Any], filters: dict[str, Any] ) -> bool:

    return all(fields.get(k) in v if isinstance(v, list) else fields.get(k) == v for k, v in filters.items())

def by ( position: int, name: str ) -> Any:

    def key ( row: Any ) -> Any:

        return row[position].get(name)

    return key

def mark ( text: object, wanted: list[str], left: str = "<em>", right: str = "</em>" ) -> str:

    plain = str(text or "")

    for word in wanted: plain = re.sub(f"({re.escape(word)})", rf"{left}\1{right}", plain, flags=re.IGNORECASE)

    return plain

class Fake:

    def __init__ ( self ) -> None:

        self.port    = 0
        self.indexes: dict[str, dict[str, dict[str, Any]]] = {}
        self.settings: dict[str, Any] = {}
        self.seen: list[tuple[str, str]] = []
        self._runner: web.AppRunner | None = None

    def routes ( self, app: web.Application ) -> None:

        raise NotImplementedError

    async def __aenter__ ( self ) -> Self:

        app = web.Application(middlewares=[self.record])

        self.routes(app)

        self._runner = web.AppRunner(app)

        await self._runner.setup()

        site = web.TCPSite(self._runner, "127.0.0.1", 0)

        await site.start()

        self.port = int(self._runner.addresses[0][1])

        return self

    async def __aexit__ ( self, *_: object ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    @web.middleware
    async def record ( self, request: web.Request, handler: Any ) -> web.StreamResponse:

        self.seen.append((request.method, request.path))

        response: web.StreamResponse = await handler(request)

        return response

    def base ( self ) -> str:

        return f"http://127.0.0.1:{self.port}"

    def score ( self, fields: dict[str, Any], text: str, searchable: list[str] ) -> float:

        wanted = words(text)

        return float(sum(words(fields.get(name)).count(word) for name in searchable for word in wanted))

class ElasticFake(Fake):

    @override
    def routes ( self, app: web.Application ) -> None:

        app.router.add_route("HEAD", "/{index}", self.head)
        app.router.add_put("/{index}", self.create)
        app.router.add_post("/_bulk", self.bulk)
        app.router.add_get("/{index}/_doc/{id}", self.doc)
        app.router.add_post("/{index}/_search", self.search)
        app.router.add_post("/{index}/_delete_by_query", self.delete)
        app.router.add_delete("/{index}", self.drop)
        app.router.add_get("/{index}/_count", self.count)

    async def head ( self, request: web.Request ) -> web.Response:

        return web.Response(status=200 if request.match_info["index"] in self.indexes else 404)

    async def create ( self, request: web.Request ) -> web.Response:

        body = await request.json()

        self.settings[request.match_info["index"]] = body["mappings"]["properties"]
        self.indexes[request.match_info["index"]] = {}

        return web.json_response({ "acknowledged": True })

    async def bulk ( self, request: web.Request ) -> web.Response:

        assert request.headers["Content-Type"] == "application/x-ndjson" and request.query.get("refresh") == "wait_for"

        lines = [line for line in (await request.text()).split("\n") if line]
        items = []

        for action, source in zip(lines[::2], lines[1::2], strict=True):

            head = json.loads(action)["index"]

            self.indexes[head["_index"]][head["_id"]] = json.loads(source)
            items.append({ "index": { "_id": head["_id"], "status": 201 } })

        return web.json_response({ "errors": False, "items": items })

    async def doc ( self, request: web.Request ) -> web.Response:

        found = self.indexes.get(request.match_info["index"], {}).get(request.match_info["id"])

        if found is None: return web.json_response({ "found": False }, status=404)

        return web.json_response({ "_id": request.match_info["id"], "_source": found })

    async def search ( self, request: web.Request ) -> web.Response:

        body  = await request.json()
        index = request.match_info["index"]
        docs  = self.indexes.get(index, {})
        must  = body["query"]["bool"]["must"]
        text  = must[0].get("multi_match", {}).get("query", "")
        names = [name for name, spec in self.settings[index].items() if spec["type"] == "text"]
        filters: dict[str, Any] = {}

        assert body["track_total_hits"] is True and must[0].get("multi_match", {}).get("fuzziness", "AUTO") == "AUTO"

        for clause in body["query"]["bool"]["filter"]:

            if "term" in clause: filters.update(clause["term"])
            else: filters.update({ k: list(v) for k, v in clause["terms"].items() })

        rows = [(id_, fields, self.score(fields, text, names)) for id_, fields in docs.items() if keep(fields, filters)]
        rows = [row for row in rows if not text or row[2] > 0]

        for spec in reversed(body.get("sort", [])):

            (name, order), = spec.items()

            rows.sort(key=by(1, name), reverse=order["order"] == "desc")

        if not body.get("sort"): rows.sort(key=lambda row: (-row[2], row[0]))

        aggregations = {
            name: { "buckets": [{ "key": key, "doc_count": sum(1 for row in rows if row[1].get(spec["terms"]["field"]) == key) } for key in sorted({ str(row[1].get(spec["terms"]["field"])) for row in rows })] }
            for name, spec in body.get("aggs", {}).items()
        }
        window = rows[body["from"]:body["from"] + body["size"]]
        hits   = [
            {
                "_id": id_, "_score": score, "_source": fields,
                **({ "highlight": { name: [mark(fields.get(name), words(text))] for name in body["highlight"]["fields"] } } if "highlight" in body else {}),
            }
            for id_, fields, score in window
        ]

        return web.json_response({ "took": 3, "hits": { "total": { "value": len(rows), "relation": "eq" }, "hits": hits }, "aggregations": aggregations })

    async def delete ( self, request: web.Request ) -> web.Response:

        body  = await request.json()
        docs  = self.indexes.setdefault(request.match_info["index"], {})
        ids   = body["query"].get("ids", {}).get("values", list(docs))
        count = sum(1 for id_ in ids if docs.pop(id_, None) is not None)

        return web.json_response({ "deleted": count })

    async def drop ( self, request: web.Request ) -> web.Response:

        if self.indexes.pop(request.match_info["index"], None) is None: return web.json_response({}, status=404)

        return web.json_response({ "acknowledged": True })

    async def count ( self, request: web.Request ) -> web.Response:

        return web.json_response({ "count": len(self.indexes.get(request.match_info["index"], {})) })

class MeiliFake(Fake):

    def __init__ ( self ) -> None:

        super().__init__()

        self.tasks = 0

    @override
    def score ( self, fields: dict[str, Any], text: str, searchable: list[str] ) -> float:

        wanted = words(text)
        held   = [word for name in searchable for word in words(fields.get(name))]

        return float(sum(1 for word in held for prefix in wanted if word.startswith(prefix)))

    @override
    def routes ( self, app: web.Application ) -> None:

        app.router.add_post("/indexes", self.create)
        app.router.add_patch("/indexes/{uid}/settings", self.configure)
        app.router.add_post("/indexes/{uid}/documents", self.add)
        app.router.add_get("/indexes/{uid}/documents/{id}", self.doc)
        app.router.add_post("/indexes/{uid}/search", self.search)
        app.router.add_post("/indexes/{uid}/documents/delete-batch", self.delete)
        app.router.add_delete("/indexes/{uid}/documents", self.clear)
        app.router.add_delete("/indexes/{uid}", self.drop)
        app.router.add_get("/indexes/{uid}/stats", self.stats)
        app.router.add_get("/tasks/{uid}", self.task)

    def enqueue ( self ) -> web.Response:

        self.tasks += 1

        return web.json_response({ "taskUid": self.tasks, "status": "enqueued" }, status=202)

    async def create ( self, request: web.Request ) -> web.Response:

        body = await request.json()

        assert body["primaryKey"] == "id"

        self.indexes.setdefault(body["uid"], {})

        return self.enqueue()

    async def configure ( self, request: web.Request ) -> web.Response:

        self.settings[request.match_info["uid"]] = await request.json()

        return self.enqueue()

    async def add ( self, request: web.Request ) -> web.Response:

        assert request.query["primaryKey"] == "id"

        for document in await request.json(): self.indexes[request.match_info["uid"]][str(document["id"])] = document

        return self.enqueue()

    async def doc ( self, request: web.Request ) -> web.Response:

        found = self.indexes.get(request.match_info["uid"], {}).get(request.match_info["id"])

        return web.json_response(found, status=200 if found else 404)

    async def search ( self, request: web.Request ) -> web.Response:

        body     = await request.json()
        uid      = request.match_info["uid"]
        settings = self.settings[uid]
        text     = body.get("q", "")
        filters: dict[str, Any] = {}

        for part in (body.get("filter") or "").split(" AND "):

            if not part: continue

            if " IN " in part:

                name, raw = part.split(" IN ", 1)

                filters[name] = [piece.strip().strip('"') for piece in raw.strip("[]").split(",")]

            else:

                name, raw = part.split(" = ", 1)

                filters[name] = raw.strip('"')

        rows = [(fields, self.score(fields, text, settings["searchableAttributes"])) for fields in self.indexes[uid].values() if keep(fields, filters)]
        rows = [row for row in rows if not text or row[1] > 0]

        for spec in reversed(body.get("sort", [])):

            name, order = spec.split(":")

            rows.sort(key=by(0, name), reverse=order == "desc")

        if not body.get("sort"): rows.sort(key=lambda row: (-row[1], row[0]["id"]))

        start  = int(body.get("offset", 0))
        window = rows[start:start + body["limit"]]
        hits   = []

        for fields, score in window:

            hit: dict[str, Any] = dict(fields)

            if body.get("attributesToRetrieve"): hit = { k: v for k, v in hit.items() if k in body["attributesToRetrieve"] }
            if body.get("showRankingScore"): hit["_rankingScore"] = score / 10
            if body.get("attributesToHighlight"):

                found = [word for name in body["attributesToHighlight"] for word in words(fields.get(name)) if any(word.startswith(prefix) for prefix in words(text))]

                hit["_formatted"] = { name: mark(fields.get(name), found, body["highlightPreTag"], body["highlightPostTag"]) for name in body["attributesToHighlight"] }

            hits.append(hit)

        facets = { name: { str(row[0].get(name)): sum(1 for other in rows if other[0].get(name) == row[0].get(name)) for row in rows } for name in body.get("facets", []) }

        return web.json_response({ "hits": hits, "estimatedTotalHits": len(rows), "processingTimeMs": 2, "facetDistribution": facets })

    async def delete ( self, request: web.Request ) -> web.Response:

        docs = self.indexes[request.match_info["uid"]]

        for id_ in await request.json(): docs.pop(str(id_), None)

        return self.enqueue()

    async def clear ( self, request: web.Request ) -> web.Response:

        self.indexes[request.match_info["uid"]] = {}

        return self.enqueue()

    async def drop ( self, request: web.Request ) -> web.Response:

        if self.indexes.pop(request.match_info["uid"], None) is None: return web.json_response({ "code": "index_not_found" }, status=404)

        return self.enqueue()

    async def stats ( self, request: web.Request ) -> web.Response:

        return web.json_response({ "numberOfDocuments": len(self.indexes.get(request.match_info["uid"], {})) })

    async def task ( self, request: web.Request ) -> web.Response:

        return web.json_response({ "uid": int(request.match_info["uid"]), "status": "succeeded" })

class VespaFake(Fake):

    @override
    def routes ( self, app: web.Application ) -> None:

        app.router.add_post("/document/v1/{ns}/{kind}/docid/{id}", self.put)
        app.router.add_get("/document/v1/{ns}/{kind}/docid/{id}", self.doc)
        app.router.add_delete("/document/v1/{ns}/{kind}/docid/{id}", self.remove)
        app.router.add_delete("/document/v1/{ns}/{kind}/docid", self.clear)
        app.router.add_post("/search/", self.search)

    async def put ( self, request: web.Request ) -> web.Response:

        body = await request.json()

        self.indexes.setdefault(request.match_info["kind"], {})[request.match_info["id"]] = body["fields"]

        return web.json_response({ "id": f"id:{request.match_info['ns']}:{request.match_info['kind']}::{request.match_info['id']}" })

    async def doc ( self, request: web.Request ) -> web.Response:

        found = self.indexes.get(request.match_info["kind"], {}).get(request.match_info["id"])

        if found is None: return web.json_response({}, status=404)

        return web.json_response({ "fields": found })

    async def remove ( self, request: web.Request ) -> web.Response:

        self.indexes.get(request.match_info["kind"], {}).pop(request.match_info["id"], None)

        return web.json_response({})

    async def clear ( self, request: web.Request ) -> web.Response:

        assert request.query["selection"] == "true" and request.query["cluster"] == "default"

        self.indexes[request.match_info["kind"]] = {}

        return web.json_response({ "documentCount": 0 })

    async def search ( self, request: web.Request ) -> web.Response:

        body  = await request.json()
        yql   = body["yql"]
        kind  = yql.split("from ", 1)[1].split(" where", 1)[0]
        text  = body.get("query", "")
        docs  = self.indexes.get(kind, {})
        filters: dict[str, Any] = {}

        for clause in re.findall(r"\(?((?:\w+ contains \"[^\"]*\"(?: or )?)+)\)?", yql.split(" order by ")[0]):

            pairs = re.findall(r"(\w+) contains \"([^\"]*)\"", clause)
            filters[pairs[0][0]] = [value for _, value in pairs]

        rows = [(id_, fields, self.score(fields, text, ["title", "body"])) for id_, fields in docs.items() if keep(fields, filters)]
        rows = [row for row in rows if not text or row[2] > 0]
        order = re.search(r"order by (\w+) (asc|desc)", yql)

        if order: rows.sort(key=by(1, order.group(1)), reverse=order.group(2) == "desc")
        else: rows.sort(key=lambda row: (-row[2], row[0]))

        window   = rows[body.get("offset", 0):body.get("offset", 0) + body["hits"]]
        children = []

        for id_, fields, score in window:

            shown = dict(fields)

            if body.get("presentation.bolding"): shown = { k: mark(v, words(text), "<hi>", "</hi>") if isinstance(v, str) else v for k, v in shown.items() }

            children.append({ "id": f"id:default:{kind}::{id_}", "relevance": score, "fields": { **shown, "documentid": f"id:default:{kind}::{id_}" } })

        return web.json_response({ "root": { "fields": { "totalCount": len(rows) }, "children": children }, "timing": { "querytime": 0.004 } })

async def walk ( engine: Engine ) -> list[Any]:

    finder = Search()

    finder.setup(engine)

    schema = await finder.prepare("books", ["title", "body"], ["lang", "tags"], ["price"])

    assert schema.names() == ("title", "body", "lang", "tags", "price") and await finder.index("books", *BOOKS) == 3

    rust   = await finder.query("books", "rust")
    cheap  = await finder.query("books", "", sort=("price",))
    en     = await finder.query("books", "", filters={ "lang": "en" }, sort=("-price",))
    multi  = await finder.query("books", "", filters={ "lang": ["ar", "xx"] })
    lit    = await finder.query("books", "rust", highlight=True, limit=1)
    page   = await finder.query("books", "", sort=("price",), limit=1, page=2)
    got    = await finder.get("books", "b2")
    facets = (await finder.query("books", "", facets=("lang",))).facets if engine.can("facets") else { "lang": { "en": 2, "ar": 1 } }
    hints  = await finder.suggest("books", "ru") if engine.can("suggest") else ["rust"]

    with pytest.raises(Fault) as sort: await finder.query("books", "", sort=("title",))
    with pytest.raises(Fault) as flt: await finder.query("books", "", filters={ "price": 1 })
    with pytest.raises(Fault) as limit: await finder.query("books", "", limit=0)

    before = await finder.count("books")
    gone   = await finder.delete("books", "b3")
    after  = await finder.count("books")
    wiped  = await finder.clear("books")
    empty  = await finder.count("books")
    drop   = await finder.drop("books")

    with pytest.raises(Fault) as lost: await finder.query("books", "x")

    return [
        rust.ids(), rust.total, rust.hits[0].score > rust.hits[1].score, cheap.ids(), en.ids(), multi.ids(), facets,
        "<em>" in lit.hits[0].highlights["title"] and "Rust" in lit.hits[0].highlights["title"], lit.hits[0].fields["title"],
        page.ids(), page.total, got.fields["title"] if got else None, await finder.get("books", "zz"), hints,
        sort.value.reason, flt.value.reason, limit.value.reason, before, gone, after, wiped, empty, drop, lost.value.reason,
        finder.stats()["queries"] >= 6,
    ]

EXPECTED = [
    ["b1", "b2"], 2, True, ["b3", "b2", "b1"], ["b1", "b2"], ["b3"], { "lang": { "en": 2, "ar": 1 } }, True, "Rust systems programming",
    ["b2"], 3, "Go services", None, ["rust"], "search.sort", "search.filter", "search.limit", 3, 1, 2, 2, 0, True, "search.index", True,
]

async def test_memory_engine_ranks_filters_sorts_and_facets () -> None:

    assert await walk(Memory()) == EXPECTED

    result = Result([], 0, 0.001)

    assert result.dump() == { "hits": [], "total": 0, "took": 0.001, "facets": {} } and Query("x").offset() == 0 and Query("x", page=3, limit=10).offset() == 20
    assert Document("1", { "a": 1 }).dump() == { "id": "1", "a": 1 }

    with pytest.raises(Fault) as blank: Search().document({ "title": "no id" })

    assert blank.value.reason == "search.id"

    with pytest.raises(Fault) as empty: await Search().prepare("x", [])

    assert empty.value.reason == "search.schema"

@pytest.fixture(scope="session")
async def lite ( tmp_path_factory: pytest.TempPathFactory ) -> Any:

    made = Database()

    await made.connect(f"sqlite://{tmp_path_factory.mktemp('search') / 'engine.db'}", size=2)

    yield made

    await made.close()

@pytest.mark.parametrize("backend", ["postgres", "sqlite"])
async def test_database_engine_answers_like_memory ( backend: str, lite: Database ) -> None:

    if backend == "postgres" and not database.ready():

        await database.connect(URL, min_size=1, max_size=4, application="engine-tests", ssl="disable")

    db       = database if backend == "postgres" else lite
    table    = Search.blueprint("test_search", db.dialect())
    migrator = Migrator(db, [table])

    await migrator.drop("test_search")
    await migrator.apply()

    assert ("document" in table.names()) == db.dialect().can("search")
    assert await walk(DatabaseSearch(db, table)) == EXPECTED

async def test_elasticsearch_meilisearch_and_vespa_speak_their_wire () -> None:

    async with ElasticFake() as elastic:

        first = Elastic(net, elastic.base(), key="k", egress=LOCAL, refresh=True)

        assert await walk(first) == EXPECTED and ("PUT", "/books") in elastic.seen and ("POST", "/_bulk") in elastic.seen
        assert elastic.settings["books"]["lang"] == { "type": "keyword" } and elastic.settings["books"]["title"] == { "type": "text" }
        assert first.describe()["name"] == "elasticsearch"

    async with MeiliFake() as meili:

        second = Meili(net, meili.base(), key="k", egress=LOCAL)

        assert await walk(second) == EXPECTED and meili.settings["books"]["sortableAttributes"] == ["price"]
        assert ("PATCH", "/indexes/books/settings") in meili.seen and ("GET", "/tasks/1") in meili.seen

    async with VespaFake() as vespa:

        third = Vespa(net, vespa.base(), egress=LOCAL)

        assert await walk(third) == EXPECTED and ("POST", "/document/v1/default/books/docid/b1") in vespa.seen

        await third.prepare("books", Schema(("title",), ("lang",)))

        with pytest.raises(Fault) as facets: await third.query("books", Query("", facets=("lang",)))

        assert facets.value.reason == "search.capability"

    await net.close()
