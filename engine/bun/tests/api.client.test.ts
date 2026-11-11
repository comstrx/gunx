import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";
import * as validate from "engine/validate";

const user = validate.object({ id: validate.number(), name: validate.string() });
const users = api.feature("users", {
    list: api.get("/users", validate.object({ page: validate.optional(validate.number()), tags: validate.optional(validate.array(validate.string())), since: validate.optional(validate.date()), filter: validate.optional(validate.object({ a: validate.number() })), nothing: validate.optional(validate.null()) }), api.many(user), { cache: 60 }),
    show: api.get("/users/{id}", validate.object({ id: validate.string() }), user),
    file: api.get("/files/{path*}", validate.object({ path: validate.string() }), user),
    make: api.post("/users", validate.object({ name: validate.string() }), user),
});
const reasonOf = ( work: () => unknown ): string => { try { work(); return "ok"; } catch ( caught ) { return error.isFault(caught) ? caught.reason ?? "?" : "?"; } };
const server = (): api.Stub => api.stub({ "GET /users": () => [{ id: 1, name: "a" }], "GET /users/{id}": ({ params }) => ({ id: 1, name: params.id ?? "" }), "GET /files/{path*}": ({ params }) => ({ id: 1, name: params.path ?? "" }), "POST /users": () => ({ id: 2, name: "b" }) });
const signal = (): AbortSignal => new AbortController().signal;

describe("api.client", () => {

    it("contracts refuse malformed paths, names and caches; find walks only real features", () => {

        expect([() => api.get("/a/{}", validate.object({}), user), () => api.get("/a/{id}/{id}", validate.object({ id: validate.string() }), user), () => api.get("/a?x=1", validate.object({}), user), () => api.get("/a//b", validate.object({}), user), () => api.get("/a/../b", validate.object({}), user), () => api.get("/a/{__proto__}", validate.object({}), user), () => api.get(`/${"a".repeat(600)}`, validate.object({}), user), () => api.get("/a/{id", validate.object({}), user), () => api.get("/a/id}", validate.object({}), user), () => api.get("/a", null as never, user)].map(reasonOf)).toEqual(["api.path", "api.path", "api.path", "api.path", "api.path", "api.path", "api.path", "api.path", "api.path", "api.schema"]);
        expect([() => api.feature("x", { "bad-name": api.get("/a", validate.object({}), user) }), () => api.feature("x", { constructor: api.get("/a", validate.object({}), user) }), () => api.feature("x y", {}), () => api.feature("x", {}, { cache: -1 }), () => api.feature("x", { a: { ...api.get("/a", validate.object({}), user), method: "FETCH" as never } }), () => api.feature("x", { a: api.get("/a", validate.object({}), user, { cache: Number.NaN }) })].map(reasonOf)).toEqual(["api.name", "api.name", "api.name", "api.cache", "api.method", "api.cache"]);
        expect([api.find({ users }, "users.list")?.name, api.find({ users }, "__proto__.constructor"), api.find({ users }, "users"), api.find({ users }, "users.nope"), api.find({ users }, ".list"), api.idOf(users.list), api.paramsOf(users.file), api.partsOf(users.show).map(( part ) => `${part.text}|${part.name}|${part.rest}`)]).toEqual(["list", undefined, undefined, undefined, undefined, "users.list", ["path"], ["/users/|id|false"]]);
        expect(api.endpoints({ users }).map(( endpoint ) => endpoint.name)).toEqual(["list", "show", "file", "make"]);

        const rest = api.get("/files/{path*}", validate.object({ path: validate.string() }), user);

        expect([rest.idempotent, rest.cache, rest.auth, rest.name, api.facts({})]).toEqual([true, 0, true, "", { permissions: [], auth: true, cache: 0 }]);

    });
    it("a client is rooted at a bare url or an absolute path, builds urls from every input kind and refuses unbound or dotted parameters", () => {

        expect(["javascript:alert(1)", "https://a.io?x=1", "", "ftp://a.io", "//a.io", "/api?x", "/api#x", "/a b", "https://u:p@a.io", "https://a.io/v1/", "/api/"].map(( baseUrl ) => reasonOf(() => api.create({ baseUrl })))).toEqual(["api.address", "api.address", "api.address", "api.address", "api.address", "api.address", "api.address", "api.address", "api.address", "ok", "ok"]);
        expect(api.create({ baseUrl: "/api/" }).url(users.show, { id: "x y/z" })).toBe("/api/users/x%20y%2Fz");
        expect(api.create({ baseUrl: "https://a.io/v1/" }).url(users.list, { page: 2, tags: ["a", "b c", 1, null, undefined, { x: 1 }], since: new Date(0), filter: { a: 1 }, nothing: null, junk: undefined })).toBe("https://a.io/v1/users?filter=%7B%22a%22%3A1%7D&page=2&since=1970-01-01T00%3A00%3A00.000Z&tags=a&tags=b%20c&tags=1&tags=%7B%22x%22%3A1%7D");
        expect(api.create({ baseUrl: "https://a.io" }).url(users.file, { path: "a/b c/d" })).toBe("https://a.io/files/a/b%20c/d");
        expect([() => api.create({ baseUrl: "https://a.io" }).url(users.file, { path: "a//b" }), () => api.create({ baseUrl: "https://a.io" }).url(users.show, { id: "" }), () => api.create({ baseUrl: "https://a.io" }).url(users.show, { id: ".." }), () => api.create({ baseUrl: "https://a.io" }).url(users.show, {}), () => api.create({ baseUrl: "https://a.io" }).url(users.show, { id: "\ud800" })].map(reasonOf)).toEqual(["api.param", "api.param", "api.param", "api.param", "api.param"]);
        expect(api.create({ baseUrl: "https://a.io" }).url(users.show, { id: 7, extra: "q" })).toBe("https://a.io/users/7?extra=q");

    });
    it("replies are frozen, cached replies share nothing mutable, forget clears by feature or endpoint, a new token wipes the cache", async () => {

        const stub = server();
        const client = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, token: () => "t" });
        const first = await client.call(users.list, { page: 1 });

        expect(() => { (first.data[0] as { name: string }).name = "x"; }).toThrow(TypeError);
        expect(() => { (first.data as { id: number; name: string }[]).push({ id: 9, name: "z" }); }).toThrow(TypeError);
        expect((await client.call(users.list, { page: 1 })).cached).toBe(true);
        expect(stub.calls()).toHaveLength(1);
        client.forget("other");
        expect(client.cached(users.list, { page: 1 })).toEqual([{ id: 1, name: "a" }]);
        client.forget("users");
        expect(client.cached(users.list, { page: 1 })).toBeUndefined();
        await client.call(users.list, { page: 1 });
        client.forget(users.show);
        expect(client.cached(users.list, { page: 1 })).toBeDefined();
        client.forget(users.list);
        expect(client.cached(users.list, { page: 1 })).toBeUndefined();
        await client.call(users.list, { page: 1 });
        client.forget();
        expect(client.cached(users.list, { page: 1 })).toBeUndefined();
        expect(client.cached(users.make, { name: "x" })).toBeUndefined();
        expect(client.cached(users.list, { page: "x" as never })).toBeUndefined();

        let token = "t1";
        const turning = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, token: () => token });

        await turning.call(users.list, {});
        expect(turning.cached(users.list, {})).toBeDefined();
        token = "t2";
        expect(turning.cached(users.list, {})).toBeUndefined();
        expect((await turning.call(users.list, {})).cached).toBe(false);
        expect(stub.calls().at(-1)?.headers.authorization).toBe("Bearer t2");

    });
    it("in-flight reads are shared only when nothing distinguishes them, and a write wipes every cached read", async () => {

        const stub = server();

        stub.latency(5);

        const client = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher });
        const [a, b, c, d] = await Promise.all([client.call(users.list, {}), client.call(users.list, {}), client.call(users.list, {}, { fresh: true }), client.call(users.list, {}, { headers: { "x-a": "1" } })]);

        expect([a === b, a === c, a === d, stub.calls().length]).toEqual([true, false, false, 3]);
        expect(client.cached(users.list, {})).toBeDefined();
        await client.call(users.make, { name: "n" });
        expect(client.cached(users.list, {})).toBeUndefined();

    });
    it("faults carry the endpoint, output misfits are 502s, codes inside a 200 refuse, the token provider's failures are named, keys are checked", async () => {

        const stub = server();
        const faults: string[] = [];
        const client = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, token: () => "t", onFault: ( fault, endpoint ) => { faults.push(`${api.idOf(endpoint)}:${fault.reason ?? fault.code}`); } });

        await expect(api.create({ baseUrl: "https://a.io", fetcher: api.stub({ "GET /users": () => ({ id: 1, name: "a" }) }).fetcher }).call(users.list, {})).rejects.toMatchObject({ code: "validation", reason: "users.list.output", status: 502 });
        await expect(api.create({ baseUrl: "https://a.io", fetcher: api.stub({ "GET /users": () => ({ data: null, code: "forbidden", message: "no", errors: null, reason: "x.y", meta: {} }) }).fetcher }).call(users.list, {})).rejects.toMatchObject({ code: "forbidden", reason: "x.y", message: "no" });
        expect((await api.create({ baseUrl: "https://a.io", fetcher: api.stub({ "GET /users": () => ({ data: [], code: "weird", message: "m", errors: null, reason: null, meta: {} }) }).fetcher }).call(users.list, {})).message).toBe("m");
        await expect(api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, token: async () => { throw new Error("boom"); } }).call(users.list, {})).rejects.toMatchObject({ code: "internal", reason: "api.token" });
        await expect(api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, token: () => { throw new Error("boom"); } }).call(users.list, {})).rejects.toMatchObject({ code: "internal", reason: "api.token" });
        await expect(api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, token: async () => { throw error.fault("unauthorized", "auth.expired"); } }).call(users.list, {})).rejects.toMatchObject({ code: "unauthorized", reason: "auth.expired" });
        await expect(api.create({ baseUrl: "https://a.io", fetcher: async () => { throw new TypeError("net down"); }, retries: 0 }).call(users.list, {})).rejects.toMatchObject({ code: "network" });
        await expect(client.call(users.make, { name: "x" }, { idempotencyKey: "bad key" })).rejects.toMatchObject({ reason: "api.idempotency" });
        await expect(client.call(users.make, { name: "x" }, { idempotencyKey: "k".repeat(256) })).rejects.toMatchObject({ reason: "api.idempotency" });
        await client.call(users.make, { name: "x" }, { idempotencyKey: "k".repeat(255) });
        expect(stub.calls().at(-1)?.headers["idempotency-key"]).toBe("k".repeat(255));
        await client.call(users.show, { id: "1" }, { headers: { Authorization: "Bearer hacked", "X-Extra": "1" } });
        expect(stub.calls().at(-1)?.headers).toMatchObject({ authorization: "Bearer t", "x-extra": "1" });
        expect(faults).toEqual(["users.make:api.idempotency", "users.make:api.idempotency"]);

        const quiet = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, onReply: () => { throw new Error("listener"); }, fail: ( cause ) => { faults.push(String((cause as Error).message)); } });

        expect((await quiet.call(users.show, { id: "2" })).data.name).toBe("2");
        expect(faults.at(-1)).toBe("listener");

    });
    it("stubs key routes by method and path, rank exact over bound over rest, plan refusals and pass responses through", async () => {

        expect(["get /x", "/x", "GET x", "GET /x y", "FETCH /x", "", "GET /{a*}/b"].map(( key ) => reasonOf(() => api.stub({ [key]: () => 1 })))).toEqual(["ok", "ok", "api.route", "api.route", "api.route", "api.route", "ok"]);
        expect(reasonOf(() => api.stub({ "GET /x": 1 as never }))).toBe("api.route");

        const made = api.stub({ "GET /a/{x*}": () => "rest", "GET /a/{x}": () => "one", "GET /a/b": () => "exact", "/a/b": () => "any", "GET /raw": () => new Response("raw", { status: 201 }) });
        const read = async ( path: string, method = "GET" ): Promise<unknown> => api.unwrap(await (await made.fetcher(`https://x${path}`, { method, headers: {}, signal: signal() })).json()).data;

        expect([await read("/a/b"), await read("/a/c"), await read("/a/c/d"), await read("/a/b", "POST"), (await made.fetcher("https://x/zzz", { method: "GET", headers: {}, signal: signal() })).status, (await made.fetcher("https://x/raw", { method: "GET", headers: {}, signal: signal() })).status, (await made.fetcher("/a/c?q=1#f", { method: "get", headers: {}, signal: signal() })).status]).toEqual(["exact", "one", "rest", "any", 404, 201, 200]);
        expect(made.calls().at(-1)).toMatchObject({ method: "GET", path: "/a/c", query: { q: "1" } });
        made.route("GET /a/b", () => "replaced");
        expect(await read("/a/b")).toBe("replaced");
        made.refuse("GET /a/{x}", "too_many_requests", 2);

        const statuses: number[] = [];

        for ( let turn = 0; turn < 3; turn += 1 ) statuses.push((await made.fetcher("https://x/a/c", { method: "GET", headers: { "x-request-id": "r1" }, signal: signal() })).status);

        expect(statuses).toEqual([429, 429, 200]);
        made.refuse("GET /a/c", error.fault("conflict", "x.taken", { retryAfter: 2.2 }));

        const refused = await made.fetcher("https://x/a/c", { method: "GET", headers: { "x-request-id": "r9" }, signal: signal() });

        expect([refused.status, refused.headers.get("retry-after"), api.unwrap(await refused.json())]).toEqual([409, "3", { data: null, message: expect.any(String), errors: null, code: "conflict", reason: "x.taken", meta: { request_id: "r9", retry_after: 2.2 }, requestId: "r9" }]);
        made.refuse("GET /a/c", "conflict", 0);
        expect((await made.fetcher("https://x/a/c", { method: "GET", headers: {}, signal: signal() })).status).toBe(200);
        made.latency(Number.NaN);
        made.reset();
        expect(made.calls()).toEqual([]);

        const slow = api.stub({ "GET /x": () => 1 });
        const controller = new AbortController();

        slow.latency(1000);
        setTimeout(() => controller.abort(), 1);
        await expect(slow.fetcher("https://x/x", { method: "GET", headers: {}, signal: controller.signal })).rejects.toBeDefined();

    });
    it("patches keep foreign rows, compare versions as numbers or text, never touch a row without the key and refuse a deleted single", () => {

        expect(api.applyPatch([{ id: 1 }, 7, null, { id: 2 }], true, "updated", { id: 2, x: 1 })).toEqual({ value: [{ id: 1 }, 7, null, { id: 2, x: 1 }], applied: true });
        expect(api.applyPatch([{ id: 1 }, 7, { id: 2 }], true, "deleted", { id: 1 })).toEqual({ value: [7, { id: 2 }], applied: true });
        expect(api.applyPatch([{ id: "1" }], true, "updated", { id: 1, x: 1 })).toEqual({ value: [{ id: "1", x: 1 }], applied: true });
        expect([api.applyPatch([{ id: 1, v: "2026-01-02" }], true, "updated", { id: 1, v: "2026-01-01" }, { version: "v" }).applied, api.applyPatch([{ id: 1, v: "9" }], true, "updated", { id: 1, v: "10" }, { version: "v" }).applied, api.applyPatch([{ id: 1, v: 2 }], true, "updated", { id: 1 }, { version: "v" }).applied, api.applyPatch([{ id: 1 }], true, "updated", { id: 1, id2: 2 }, { key: "__proto__" }).applied, api.applyPatch([{ id: 1 }], true, "updated", { id: null }).applied, api.applyPatch("rows", true, "created", { id: 1 }).value]).toEqual([false, true, true, false, false, [{ id: 1 }]]);
        expect(api.applyPatch([{ id: 1 }], true, "created", { id: 2 }, { at: "end" }).value).toEqual([{ id: 1 }, { id: 2 }]);
        expect(api.applyPatch({ id: 1 }, false, "other", { id: 1, x: 2 })).toEqual({ value: { id: 1, x: 2 }, applied: true });
        expect(api.applyPatch({ id: 1 }, false, "deleted", { id: 1 }).applied).toBe(false);
        expect(api.applyPatch(null, false, "updated", { id: 1 }).applied).toBe(false);

    });
    it("fakes page, search, sort, nest tables under their parents, keep writes, number new rows and refuse taken keys", async () => {

        const order = validate.object({ id: validate.int().check(validate.gte(1)), total: validate.int().check(validate.gte(0)), code: validate.string().check(validate.minLength(3)) });
        const line = validate.object({ id: validate.int().check(validate.gte(1)), sku: validate.string(), qty: validate.int().check(validate.gte(1)) });
        const orders = api.feature("orders", {
            list: api.get("/orders", validate.object({ page: validate.optional(validate.number()), limit: validate.optional(validate.number()), q: validate.optional(validate.string()), sort: validate.optional(validate.string()) }), api.many(order)),
            one: api.get("/orders/{id}", validate.object({ id: validate.number() }), order),
            make: api.post("/orders", validate.object({ total: validate.number(), code: validate.optional(validate.string()), id: validate.optional(validate.number()) }), order),
            pay: api.post("/orders/{id}/pay", validate.object({ id: validate.number() }), order),
            lines: api.get("/orders/{id}/lines", validate.object({ id: validate.number(), limit: validate.optional(validate.number()) }), api.many(line)),
            addLine: api.post("/orders/{id}/lines", validate.object({ id: validate.number(), sku: validate.string(), qty: validate.number() }), line),
            line: api.get("/orders/{id}/lines/{lid}", validate.object({ id: validate.number(), lid: validate.number() }), line),
            version: api.get("/version", validate.object({}), validate.string()),
            ping: api.post("/ping", validate.object({ x: validate.number() }), validate.object({ ok: validate.boolean() })),
        });
        const fakes = api.fakes({ orders }, { seed: 5, rows: 6 });
        const client = api.create({ baseUrl: "https://f.test", fetcher: fakes.fetcher });
        const held = fakes.rows(orders.list);
        const first = held[0] as { id: number; code: string };

        expect([(await client.call(orders.list, { page: 0, limit: 1000 })).page, (await client.call(orders.list, { q: first.code.slice(0, 3).toLowerCase(), sort: "-total,nope,+id" })).data.length >= 1]).toEqual([{ page: 1, limit: 100, total: 6, pages: 1 }, true]);
        expect([(await client.call(orders.pay, { id: first.id })).data.id, (await client.call(orders.one, { id: first.id })).data.id]).toEqual([first.id, first.id]);
        await expect(client.call(orders.make, { total: 5, id: first.id })).rejects.toMatchObject({ code: "conflict", reason: "fakes.taken" });
        await expect(client.call(orders.make, { total: -5 })).rejects.toMatchObject({ code: "validation", reason: "fakes.row" });

        const a = await client.call(orders.make, { total: 1, code: "abc" });
        const b = await client.call(orders.make, { total: 2 });

        expect([a.data.code, b.data.id > a.data.id, held.length, held.at(-1)?.id]).toEqual(["abc", true, 8, b.data.id]);

        const lines = await client.call(orders.lines, { id: first.id, limit: 3 });

        expect(lines.data).toHaveLength(3);
        expect((await client.call(orders.line, { id: first.id, lid: Number(lines.data[0]?.id) })).data).toEqual(lines.data[0] as never);
        expect((await client.call(orders.addLine, { id: first.id, sku: "S", qty: 2 })).data.sku).toBe("S");
        expect([fakes.rows(orders.lines, { id: first.id }).length, (await client.call(orders.lines, { id: first.id, limit: 100 })).data.length, fakes.rows(orders.lines, { id: 777 }).length]).toEqual([7, 7, 6]);
        expect(typeof (await client.call(orders.version, {})).data).toBe("string");
        expect((await client.call(orders.ping, { x: 1 })).data).toEqual({ ok: expect.any(Boolean) });
        await expect(client.call(orders.one, { id: Number.NaN })).rejects.toMatchObject({ reason: "orders.one.input" });

        const empty = api.fakes({ orders }, { rows: 0 });
        const bare = api.create({ baseUrl: "https://f.test", fetcher: empty.fetcher });

        expect([(await bare.call(orders.list, {})).data.length, (await bare.call(orders.one, { id: 3 })).data.id, api.fakes({ orders }, { rows: 1e9 }).rows(orders.list).length, api.fakes({ orders }, { rows: Number.NaN }).rows(orders.list).length]).toEqual([0, 3, 10_000, 25]);
        fakes.reset();
        expect([fakes.calls().length, fakes.rows(orders.list).length, fakes.rows(orders.list)[0]]).toEqual([0, 6, first]);

    });
    it("openapi lifts a rest parameter, sends nested query objects as json content and lints transport shapes", () => {

        const spec = api.openapi({ users }, { title: "t", version: "1", description: "d" });
        const paths = spec.paths as Record<string, Record<string, { parameters: { name: string; in: string; content?: unknown; schema?: unknown }[]; security: unknown }>>;

        expect(Object.keys(paths)).toEqual(["/users", "/users/{id}", "/files/{path}"]);
        expect<unknown>(paths["/files/{path}"]?.get?.parameters).toEqual([{ name: "path", in: "path", required: true, schema: { type: "string" } }]);
        expect(paths["/users"]?.get?.parameters.map(( param ) => `${param.name}:${param.content ? "json" : "plain"}`)).toEqual(["page:plain", "tags:plain", "since:plain", "filter:json", "nothing:plain"]);
        expect<unknown>(paths["/users"]?.post?.parameters).toEqual([{ name: "idempotency-key", in: "header", required: false, schema: { type: "string", minLength: 1, maxLength: 255 } }]);
        expect(paths["/users"]?.get?.security).toEqual([{ bearer: [] }]);
        expect((spec.components as { securitySchemes: unknown }).securitySchemes).toEqual({ bearer: { type: "http", scheme: "bearer" } });
        expect((api.openapi({ users }, { title: "t", version: "1", wire: api.wire({ headers: { auth: { name: "X-Key" } } }) }).components as { securitySchemes: unknown }).securitySchemes).toEqual({ key: { type: "apiKey", in: "header", name: "x-key" } });
        expect(api.transportIssues({ users, other: api.feature("other", { show: api.get("/users/{uid}", validate.object({ uid: validate.optional(validate.string()) }), user), up: api.post("/up", validate.object({ file: validate.file() }), user), q: api.get("/q", validate.object({ file: validate.file() }), user) }) }).map(( issue ) => `${issue.name}:${issue.rule}`)).toEqual(["show:route.ambiguous", "show:param.optional", "up:body.shape", "q:query.shape"]);
        expect(api.paged([1, 2, 3], { page: Number.NaN, limit: 0, total: -4 })).toMatchObject({ meta: { page: 1, limit: 0, total: 0, pages: 1 } });
        expect(api.unwrap(api.refuse(new Error("x")))).toMatchObject({ code: "internal", message: expect.any(String) });

    });

});
