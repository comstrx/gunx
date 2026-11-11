import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";
import * as validate from "engine/validate";

const user = validate.object({ id: validate.number(), name: validate.string() });
const users = api.feature("users", {
    list: api.get("/users", validate.object({ page: validate.optional(validate.number()) }), api.many(user), { cache: 60 }),
    show: api.get("/users/{id}", validate.object({ id: validate.number() }), user, { cache: 60 }),
    brief: api.get("/users/{id}/brief", validate.object({ id: validate.number() }), user, { cache: 0.01 }),
    deep: api.get("/deep", validate.object({}), validate.object({ deep: validate.object({ x: validate.number() }), list: validate.array(validate.object({ y: validate.number() })) }), { cache: 60 }),
    make: api.post("/users", validate.object({ name: validate.string() }), user),
});
const server = (): api.Stub => api.stub({ "GET /users": () => [{ id: 1, name: "a" }], "GET /users/{id}": ({ params }) => ({ id: Number(params.id), name: "n" }), "GET /users/{id}/brief": ({ params }) => ({ id: Number(params.id), name: "b" }), "GET /deep": () => ({ deep: { x: 1 }, list: [{ y: 1 }] }), "POST /users": () => ({ id: 2, name: "b" }) });
const reasonOf = ( work: () => unknown ): string => { try { work(); return "ok"; } catch ( caught ) { return error.isFault(caught) ? caught.reason ?? "?" : "?"; } };

describe("api.edges", () => {

    it("feature defaults cache only GETs, fold permissions, find needs a feature name, wires refuse shared headers and nested paths, dedupe methods", () => {

        const made = api.feature("f", { read: api.get("/f", validate.object({}), user, { permissions: ["x", "y"] }), write: api.post("/f", validate.object({}), user) }, { cache: 30, permissions: ["x"] });

        expect([made.read.cache, made.write.cache, made.read.permissions, made.write.permissions]).toEqual([30, 0, ["x", "y"], ["x"]]);
        const listed = api.fieldsOf(user);

        expect([listed.map(( field ) => `${field.name}:${field.kind}:${field.required}`), listed === api.fieldsOf(user), api.fieldsOf(users.list.input).map(( field ) => field.name)]).toEqual([["id:number:true", "name:string:true"], true, ["page"]]);
        expect([api.find({ "": users } as never, ".list"), api.find({ users }, "users.list")?.name]).toEqual([undefined, "list"]);
        expect([reasonOf(() => api.wire({ headers: { language: "x-token", auth: "x-token" } })), reasonOf(() => api.wire({ envelope: { data: "meta", page: "meta.page" } })), reasonOf(() => api.wire({ envelope: { data: "meta.page", page: "meta" } })), api.wire({ idempotent: ["GET", "GET", "PUT"] }).idempotent]).toEqual(["api.wire", "api.wire", "api.wire", ["GET", "PUT"]]);
        expect([api.pageOf({ meta: { page: 1.7, limit: 2.2, total: "9" } }), api.pageOf({ meta: { page: -1, limit: 2 } }), api.pageOf({ meta: { page: 1, limit: 3, total: 10 } })?.pages]).toEqual([{ page: 1, limit: 2, total: 9, pages: 5 }, undefined, 4]);
        const errors = api.unwrap({ data: 1, code: "x", errors: JSON.parse('{"__proto__": ["a"], "name": ["b", 2, true, null]}') }).errors;

        expect([errors, Object.getPrototypeOf(errors) === Object.prototype]).toEqual([{ name: ["b", "2", "true"] }, true]);

    });
    it("urls skip prototype keys, replies are deeply frozen, the cache is bounded, keyed by ambient context and expires", async () => {

        const stub = server();
        let locale = "ar";
        const client = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher, locale: () => locale });

        expect(client.url(users.list, JSON.parse('{"__proto__": {"a": 1}, "page": 2}'))).toBe("https://a.io/users?page=2");

        const deep = await client.call(users.deep, {});

        expect(() => { deep.data.deep.x = 2; }).toThrow(TypeError);
        expect(() => { (deep.data.list[0] as { y: number }).y = 2; }).toThrow(TypeError);
        await client.call(users.list, { page: 1 });
        locale = "en";
        expect(client.cached(users.list, { page: 1 })).toBeUndefined();
        expect((await client.call(users.list, { page: 1 })).cached).toBe(false);
        locale = "ar";
        expect(client.cached(users.list, { page: 1 })).toEqual([{ id: 1, name: "a" }]);

        for ( let id = 1; id <= 300; id += 1 ) await client.call(users.show, { id });

        expect([client.cached(users.show, { id: 1 }), (client.cached(users.show, { id: 300 }) as { id: number } | undefined)?.id]).toEqual([undefined, 300]);
        await client.call(users.brief, { id: 1 });
        expect((await client.call(users.brief, { id: 1 })).cached).toBe(true);
        await new Promise(( resolve ) => setTimeout(resolve, 30));
        expect([client.cached(users.brief, { id: 1 }), (await client.call(users.brief, { id: 1 })).cached]).toEqual([undefined, false]);

    });
    it("a read in flight when a write lands is not cached, a stub refuses an impossible status, fakes number new rows one past the highest", async () => {

        const stub = server();

        stub.latency(40);

        const client = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher });
        const reading = client.call(users.list, {});

        stub.latency(1);
        await client.call(users.make, { name: "n" });
        expect(stub.calls()).toHaveLength(2);
        await reading;
        expect(client.cached(users.list, {})).toBeUndefined();

        const made = api.stub({ "GET /a": () => 1 });

        made.refuse("GET /a", error.fault("internal", "x.odd", { status: 42 } as never));
        await expect(made.fetcher("https://x/a", { method: "GET", headers: {}, signal: new AbortController().signal })).rejects.toMatchObject({ reason: "x.odd" });

        const order = validate.object({ id: validate.int().check(validate.gte(1)), total: validate.int().check(validate.gte(0)) });
        const orders = api.feature("orders", { list: api.get("/orders", validate.object({}), api.many(order)), make: api.post("/orders", validate.object({ total: validate.number() }), order) });
        const fakes = api.fakes({ orders }, { seed: 2, rows: 5 });
        const faked = api.create({ baseUrl: "https://f.test", fetcher: fakes.fetcher });
        const top = Math.max(...fakes.rows(orders.list).map(( row ) => Number(row.id)));
        const a = await faked.call(orders.make, { total: 1 });
        const b = await faked.call(orders.make, { total: 2 });

        expect([a.data.id, b.data.id]).toEqual([top + 1, top + 2]);

    });

});
