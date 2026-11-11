import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";
import * as validate from "engine/validate";

const user = validate.object({ id: validate.number(), name: validate.string() });
const users = api.feature("users", {
    list: api.get("/users", validate.object({ page: validate.optional(validate.number()), q: validate.optional(validate.string()) }), api.many(user), { cache: 60 }),
    show: api.get("/users/{id}", validate.object({ id: validate.number() }), user, { auth: false }),
    make: api.post("/users", validate.object({ name: validate.string().check(validate.minLength(2)) }), user, { permissions: ["users.write"] }),
    rename: api.put("/users/{id}", validate.object({ id: validate.number(), name: validate.string() }), user),
    drop: api.del("/users/{id}", validate.object({ id: validate.number() }), validate.object({ ok: validate.boolean() })),
}, { permissions: ["users.read"] });

describe("api", () => {

    it("contracts carry method, path, facts and refuse unbound parameters", () => {

        expect(users.list.method).toBe("GET");
        expect(users.list.many).toBe(true);
        expect(users.show.many).toBe(false);
        expect(users.show.auth).toBe(false);
        expect(users.list.cache).toBe(60);
        expect(users.make.permissions).toEqual(["users.read", "users.write"]);
        expect(users.make.idempotent).toBe(false);
        expect(users.rename.idempotent).toBe(true);
        expect(users.make.name).toBe("make");
        expect(users.make.feature).toBe("users");
        expect(api.facts(users)).toEqual({ permissions: ["users.read"], auth: true, cache: 0 });
        expect(api.facts({})).toEqual({ permissions: [], auth: true, cache: 0 });
        expect(() => api.feature("bad", { one: api.get("/x/{id}", validate.object({}), user) })).toThrow(error.Fault);
        expect(() => api.get("x", validate.object({}), user)).toThrow(error.Fault);
        expect(api.patch("/p", validate.object({}), user).method).toBe("PATCH");
        expect(api.isEnvelope({ data: 1, code: "ok" }) && !api.isEnvelope({ data: 1 })).toBe(true);
        expect(api.unwrap({ data: [1], code: "ok", message: "m", meta: { page: 1 } })).toEqual({ data: [1], message: "m", errors: null, code: "ok", reason: null, meta: { page: 1 }, requestId: undefined });
        expect(api.unwrap([1]).data).toEqual([1]);

    });
    it("the client validates, routes, unwraps, pages, caches and translates faults", async () => {

        const rows = [{ id: 1, name: "Ann" }, { id: 2, name: "Bob" }];
        const server = api.stub({
            "GET /users": ({ query }) => ({ data: rows.filter(( row ) => !query.q || row.name.includes(String(query.q))), message: null, errors: null, code: "ok", reason: null, meta: { page: Number(query.page ?? 1), limit: 10, total: 2, pages: 1 } }),
            "GET /users/{id}": ({ params }) => rows.find(( row ) => row.id === Number(params.id)) ?? (() => { throw error.fault("not_found", "user.missing"); })(),
            "POST /users": ({ body }) => ({ id: 3, name: (body as { name: string }).name }),
            "PUT /users/{id}": () => ({ id: "not-a-number", name: "x" }),
            "DELETE /users/{id}": () => { throw error.fault("too_many_requests", "throttle", { retryAfter: 9 }); },
        });
        const faults: string[] = [];
        let token: string | undefined = "t0k";
        const client = api.create({ baseUrl: "https://api.test/", fetcher: server.fetcher, token: () => token, locale: () => "ar-EG", currency: () => "EGP", headers: () => ({ "x-client": "web" }), onFault: ( fault ) => { faults.push(fault.code); } });
        const listed = await client.call(users.list, { page: 1 });

        expect(listed.data).toEqual(rows);
        expect(listed.page).toEqual({ page: 1, limit: 10, total: 2, pages: 1 });
        expect(listed.status).toBe(200);
        expect(server.calls()[0]?.headers).toMatchObject({ authorization: "Bearer t0k", "accept-language": "ar-EG", "x-currency": "EGP", "x-client": "web" });
        expect(server.calls()[0]?.path).toBe("/users");
        expect(client.cached(users.list, { page: 1 })).toEqual(rows);
        expect(client.cached(users.list, { page: 2 })).toBeUndefined();
        await client.call(users.list, { page: 1 });
        expect(server.calls()).toHaveLength(1);
        expect((await client.call(users.list, { q: "Bo" })).data).toEqual([{ id: 2, name: "Bob" }]);

        const before = server.calls().length;

        await client.call(users.list, { page: 1 }, { fresh: true });
        expect(server.calls()).toHaveLength(before + 1);
        expect(client.cached(users.list, { page: 1 })).toEqual(rows);
        expect(client.url(users.show, { id: 7 })).toBe("https://api.test/users/7");
        expect(client.url(users.list, { q: "a b", page: 2 })).toBe("https://api.test/users?page=2&q=a%20b");

        token = undefined;

        const shown = await client.call(users.show, { id: 2 });

        expect(shown.data.name).toBe("Bob");
        expect(server.calls().at(-1)?.headers.authorization).toBeUndefined();
        await expect(client.call(users.show, { id: 9 })).rejects.toMatchObject({ code: "not_found", reason: "user.missing" });
        await expect(client.call(users.make, { name: "x" })).rejects.toMatchObject({ code: "validation", reason: "users.make.input" });

        const made = await client.call(users.make, { name: "Cleo" });

        expect(made.data).toEqual({ id: 3, name: "Cleo" });
        expect(server.calls().at(-1)?.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(server.calls().at(-1)?.body).toEqual({ name: "Cleo" });
        expect(client.cached(users.list, { page: 1 })).toBeUndefined();
        await expect(client.call(users.rename, { id: 1, name: "x" })).rejects.toMatchObject({ code: "validation", reason: "users.rename.output", status: 502 });

        const refused = await client.call(users.drop, { id: 1 }).catch(( caught: unknown ) => caught);

        expect(error.isFault(refused) && refused.code === "too_many_requests" && refused.retryAfter === 9).toBe(true);
        expect(faults).toEqual(["not_found", "validation", "validation", "too_many_requests"]);
        client.forget(users.list);
        server.reset();
        expect(server.calls()).toEqual([]);

        const missing = await api.stub({}).fetcher("https://x/none", { method: "GET", headers: {}, signal: new AbortController().signal });

        expect(missing.status).toBe(404);

    });

});
