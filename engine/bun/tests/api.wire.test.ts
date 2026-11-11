import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";
import * as socket from "engine/socket";
import * as validate from "engine/validate";

const user = validate.object({ id: validate.int().check(validate.gte(1)), name: validate.string().check(validate.minLength(2)) });
const users = api.feature("users", {
    list: api.get("/users", validate.object({ page: validate.optional(validate.number()), limit: validate.optional(validate.number()) }), api.many(user)),
    show: api.get("/users/{id}", validate.object({ id: validate.number() }), user),
    make: api.post("/users", validate.object({ name: validate.string() }), user),
});

describe("api.wire", () => {

    it("the house wire is overridden by declaration and refuses what is not a header or a path", () => {

        expect(api.house.headers.auth).toEqual({ name: "authorization", prefix: "Bearer " });

        const custom = api.wire({ headers: { language: "X-Lang", auth: "X-Token" }, envelope: { data: "result", code: "status", page: "paging.current" }, retries: { read: 0 }, timeout: 500, ok: "success", idempotent: ["GET"] });

        expect(custom.headers.language).toBe("x-lang");
        expect(custom.headers.auth).toEqual({ name: "x-token", prefix: "Bearer " });
        expect(custom.headers.currency).toBe("x-currency");
        expect(custom.envelope.data).toBe("result");
        expect(custom.envelope.message).toBe("message");
        expect(custom.retries).toEqual({ read: 0, write: 0 });
        expect(custom.timeout).toBe(500);
        expect(api.wire({ headers: { auth: { name: "X-Key" } } }).headers.auth).toEqual({ name: "x-key", prefix: "" });
        expect(() => api.wire({ headers: { language: "bad header" } })).toThrow(error.Fault);
        expect(() => api.wire({ envelope: { data: "1bad" } })).toThrow(error.Fault);
        expect(() => api.wire({ timeout: 1 })).toThrow(error.Fault);
        expect(validate.check(api.wireShape, {}).ok).toBe(true);

    });
    it("envelopes unwrap and build along any paths", () => {

        const paths = api.wire({ envelope: { data: "result", code: "status", requestId: "trace", page: "paging.page", limit: "paging.size", total: "paging.count", pages: "paging.pages" }, ok: "success" }).envelope;
        const body = { result: [1], status: "success", message: "m", trace: "t1", paging: { page: "2", size: 10, count: 40, pages: 4 } };

        expect(api.isEnvelope(body, paths) && !api.isEnvelope(body)).toBe(true);
        expect(api.unwrap(body, paths, "success")).toEqual({ data: [1], message: "m", errors: null, code: "success", reason: null, meta: {}, requestId: "t1" });
        expect(api.pageOf(body, paths)).toEqual({ page: 2, limit: 10, total: 40, pages: 4 });
        expect(api.pageOf({ meta: { page: 1 } })).toBeUndefined();
        expect(api.pageOf({ meta: { page: 1, limit: 5 } })).toEqual({ page: 1, limit: 5, total: 0, pages: 1 });
        expect(api.envelope([1], { page: 1 })).toEqual({ data: [1], message: null, errors: null, code: "ok", reason: null, meta: { page: 1 } });
        expect(api.envelope({ a: 1 }, {}, paths, "success")).toEqual({ result: { a: 1 }, message: null, errors: null, status: "success", reason: null });
        expect(api.unwrap(5).data).toBe(5);

    });
    it("a client speaks a foreign wire: header names, envelope paths, pagination and idempotency", async () => {

        const wire = api.wire({ headers: { language: "x-lang", auth: "x-token", requestId: "x-trace", idempotency: "x-once", tenant: "x-shop", client: "x-app" }, envelope: { data: "result", code: "status", page: "paging.page", limit: "paging.size", total: "paging.count", pages: "paging.pages" }, ok: "success", idempotent: ["GET"] });
        const server = api.stub({
            "GET /users": ({ query }) => ({ result: [{ id: 1, name: "Ann" }], status: "success", paging: { page: Number(query.page ?? 1), size: 1, count: 1, pages: 1 } }),
            "GET /users/{id}": ({ params }) => ({ id: Number(params.id), name: "Bob" }),
            "POST /users": ({ body }) => ({ id: 2, name: (body as { name: string }).name }),
        }, wire);
        const client = api.create({ baseUrl: "https://api.test", wire, fetcher: server.fetcher, token: () => "t0k", locale: () => "ar", tenant: () => "shop-1", client: "web" });
        const listed = await client.call(users.list, { page: 1 });

        expect(listed.data).toEqual([{ id: 1, name: "Ann" }]);
        expect(listed.page).toEqual({ page: 1, limit: 1, total: 1, pages: 1 });
        expect(listed.requestId.length).toBeGreaterThan(0);
        expect(server.calls()[0]?.headers).toMatchObject({ "x-token": "Bearer t0k", "x-lang": "ar", "x-shop": "shop-1", "x-app": "web" });
        expect(server.calls()[0]?.headers["x-trace"]).toBe(listed.requestId);
        expect(server.calls()[0]?.headers.authorization).toBeUndefined();
        expect((await client.call(users.show, { id: 7 })).data.name).toBe("Bob");
        expect((await client.call(users.make, { name: "Cy" })).data).toEqual({ id: 2, name: "Cy" });
        expect(server.calls().at(-1)?.headers["x-once"]).toBeDefined();
        expect(client.wire).toBe(wire);

        const plain = api.create({ baseUrl: "https://api.test", fetcher: api.stub({ "GET /users/{id}": () => ({ id: 1, name: "Ann" }) }).fetcher });

        expect((await plain.call(users.show, { id: 1 })).data.id).toBe(1);

    });
    it("fakes answer every endpoint of a catalogue from its schemas", async () => {

        const fakes = api.fakes({ users }, { seed: 7, rows: 30 });
        const client = api.create({ baseUrl: "https://fake.test", fetcher: fakes.fetcher });
        const first = await client.call(users.list, { page: 1, limit: 10 });
        const second = await client.call(users.list, { page: 2, limit: 10 });

        expect(first.data).toHaveLength(10);
        expect(first.page).toEqual({ page: 1, limit: 10, total: 30, pages: 3 });
        expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
        expect(fakes.rows(users.list)).toHaveLength(30);

        const known = fakes.rows(users.list)[3] as { id: number; name: string };
        const shown = await client.call(users.show, { id: known.id });

        expect(shown.data).toEqual(known);
        expect((await client.call(users.show, { id: 999_999 })).data.id).toBeGreaterThan(0);
        expect((await client.call(users.make, { name: "Zed" })).data.name).toBe("Zed");
        expect(Object.keys(fakes.routes).sort()).toEqual(["GET /users", "GET /users/{id}", "POST /users"]);
        expect(fakes.calls()).toHaveLength(5);
        expect(api.fakes({ users }, { seed: 7 }).rows(users.list)[0]).toEqual(fakes.rows(users.list)[0]);
        expect(api.sample(user, 1)).toEqual(api.sample(user, 1));
        expect(api.catalogue({ users })).toEqual({
            "users.list": { many: true, write: false, input: ["page", "limit"], output: ["id", "name"], permissions: [], auth: true },
            "users.show": { many: false, write: false, input: ["id"], output: ["id", "name"], permissions: [], auth: true },
            "users.make": { many: false, write: true, input: ["name"], output: ["id", "name"], permissions: [], auth: true },
        });

        const slow = api.stub({ "GET /x": () => 1 });

        slow.latency(5);

        const started = performance.now();

        await slow.fetcher("https://a.io/x", { method: "GET", headers: {}, signal: new AbortController().signal });
        expect(performance.now() - started).toBeGreaterThanOrEqual(4);

    });
    it("fakes sort and filter a listing and keep what is written", async () => {

        const order = validate.object({ id: validate.int().check(validate.gte(1)), total: validate.int().check(validate.gte(0), validate.lte(999)), status: validate.enum(["open", "paid"]) });
        const orders = api.feature("orders", {
            remove: api.del("/orders/{id}", validate.object({ id: validate.number() }), validate.object({ id: validate.number() })),
            list: api.get("/orders", validate.object({ sort: validate.optional(validate.string()), status: validate.optional(validate.string()), limit: validate.optional(validate.number()), shade: validate.optional(validate.string()) }), api.many(order)),
            edit: api.patch("/orders/{id}", validate.object({ id: validate.number(), status: validate.string() }), order),
            make: api.post("/orders", validate.object({ total: validate.number() }), order),
        });
        const fakes = api.fakes({ orders }, { seed: 3, rows: 20 });
        const client = api.create({ baseUrl: "https://fake.test", fetcher: fakes.fetcher });
        const held = fakes.rows(orders.remove);
        const first = { ...held[0] } as { id: number; total: number; status: string };
        const flipped = first.status === "open" ? "paid" : "open";

        expect(Object.keys(first)).toEqual(["id", "total", "status"]);
        expect(fakes.rows(orders.list)).toBe(held);

        const sorted = await client.call(orders.list, { sort: "-total,id", limit: 5 });

        expect(sorted.data.map(( row ) => row.total)).toEqual(held.map(( row ) => Number(row.total)).sort(( a, b ) => b - a).slice(0, 5));

        const open = await client.call(orders.list, { status: "open", shade: "any", limit: 100 });

        expect(open.data).toEqual(held.filter(( row ) => row.status === "open") as typeof open.data);
        expect(open.page?.total).toBe(open.data.length);
        expect((await client.call(orders.list, { status: "void" })).data).toEqual([]);
        expect((await client.call(orders.edit, { id: first.id, status: flipped })).data).toEqual({ ...first, status: flipped });
        expect(held[0]?.status).toBe(flipped);
        expect((await client.call(orders.remove, { id: first.id })).data).toEqual({ id: first.id });
        expect(held).toHaveLength(19);
        expect((await client.call(orders.remove, { id: 999_999_999 })).data.id).toBe(999_999_999);
        expect(held).toHaveLength(19);

        const made = await client.call(orders.make, { total: 5 });

        expect(made.data.total).toBe(5);
        expect(held.at(-1)).toEqual(made.data);
        expect(held).toHaveLength(20);

    });
    it("the realtime contract names channels and events, patches rows and rides the socket", async () => {

        expect(api.liveHouse.channel).toBe("{feature}");
        expect(api.changeOf("orders.created", "orders")).toBe("created");
        expect(api.changeOf("orders.deleted", "orders")).toBe("deleted");
        expect(api.changeOf("orders.shipped", "orders")).toBe("other");
        expect(api.changeOf("order:upd", "orders", { created: "{feature}:new", updated: "{feature}:upd", deleted: "{feature}:gone" })).toBe("other");
        expect(api.changeOf("orders:upd", "orders", { created: "{feature}:new", updated: "{feature}:upd", deleted: "{feature}:gone" })).toBe("updated");

        const rows = [{ id: 1, v: 1, name: "a" }, { id: 2, v: 1, name: "b" }];

        expect(api.applyPatch(rows, true, "updated", { id: 2, name: "B" }, {})).toEqual({ value: [{ id: 1, v: 1, name: "a" }, { id: 2, v: 1, name: "B" }], applied: true });
        expect(api.applyPatch(rows, true, "updated", { id: 2, v: 0, name: "old" }, { version: "v" }).applied).toBe(false);
        expect(api.applyPatch(rows, true, "deleted", { id: 1 }).value).toEqual([{ id: 2, v: 1, name: "b" }]);
        expect(api.applyPatch(rows, true, "created", { id: 3, v: 1, name: "c" }).value).toHaveLength(3);
        expect(api.applyPatch(rows, true, "created", { id: 1, name: "A" }).value).toEqual([{ id: 1, v: 1, name: "A" }, { id: 2, v: 1, name: "b" }]);
        expect(api.applyPatch(rows, true, "updated", { nope: 1 }).applied).toBe(false);
        expect(api.applyPatch({ id: 1, name: "a" }, false, "updated", { id: 1, name: "A" })).toEqual({ value: { id: 1, name: "A" }, applied: true });
        expect(api.applyPatch({ id: 1, name: "a" }, false, "updated", { id: 2, name: "A" }).applied).toBe(false);
        expect(api.applyPatch({ id: 1 }, false, "deleted", { id: 1 }).applied).toBe(false);

        const sent: socket.Frame[] = [];
        let side: socket.Socket | undefined;
        const factory: socket.SocketFactory = () => {

            const made: socket.Socket = {
                readyState: 0,
                onopen: null,
                onclose: null,
                onerror: null,
                onmessage: null,
                send: ( text ) => {

                    const frame = socket.decode(text);

                    if ( !frame ) return;

                    sent.push(frame);

                    if ( frame.id ) made.onmessage?.({ data: socket.encode({ event: "ack", id: frame.id, data: {} }) });

                },
                close: () => { made.readyState = 3; made.onclose?.({ code: 1000, reason: "" }); },
            };

            side = made;
            setTimeout(() => { made.readyState = 1; made.onopen?.(); }, 0);

            return made;

        };
        const realtime = api.live({ url: () => "wss://live.test", token: () => "tok", factory, heartbeat: 0, reconnect: false });
        const seen: api.Delivery[] = [];

        expect(realtime.channelOf("orders")).toBe("orders");
        expect(realtime.channelOf("orders", 7)).toBe("orders.7");
        expect(realtime.status()).toBe("idle");

        const stop = realtime.subscribe("orders", ( delivery ) => { seen.push(delivery); });

        await realtime.open();
        await new Promise(( resolve ) => setTimeout(resolve, 2));
        expect(realtime.status()).toBe("open");
        expect(sent.map(( frame ) => frame.event)).toEqual(["auth", "join"]);
        side?.onmessage?.({ data: socket.encode({ event: "orders.updated", channel: "orders", data: { id: 1 } }) });
        side?.onmessage?.({ data: socket.encode({ event: "orders.updated", channel: "users", data: { id: 2 } }) });
        side?.onmessage?.({ data: socket.encode({ event: "pong", channel: "orders" }) });
        expect(seen).toEqual([{ change: "updated", event: "orders.updated", data: { id: 1 }, channel: "orders" }]);
        expect(await realtime.request("echo", { a: 1 }, "orders")).toEqual({});
        stop();
        await new Promise(( resolve ) => setTimeout(resolve, 1));
        expect(sent.at(-1)?.event).toBe("leave");
        realtime.close();
        expect(realtime.status()).toBe("idle");

    });

});
