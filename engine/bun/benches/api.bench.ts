import * as api from "engine/api";
import * as validate from "engine/validate";
import { bench, do_not_optimize, run } from "mitata";

const user = validate.object({ id: validate.number(), name: validate.string() });
const users = api.feature("users", {
    show: api.get("/users/{id}", validate.object({ id: validate.number() }), user, { cache: 60 }),
    list: api.get("/users", validate.object({ page: validate.optional(validate.number()), q: validate.optional(validate.string()) }), api.many(user)),
    make: api.post("/users", validate.object({ name: validate.string() }), user),
});
const server = api.stub({ "GET /users/{id}": ({ params }) => ({ id: Number(params.id), name: "Ann" }), "GET /users": () => [{ id: 1, name: "Ann" }, { id: 2, name: "Bob" }], "POST /users": () => ({ id: 3, name: "Cy" }) });
const client = api.create({ baseUrl: "https://api.test", fetcher: server.fetcher, token: () => "t" });
const cold = api.create({ baseUrl: "https://api.test", fetcher: server.fetcher, token: () => "t" });
const fakes = api.fakes({ users }, { seed: 1, rows: 50 });
const faked = api.create({ baseUrl: "https://fake.test", fetcher: fakes.fetcher });
const rows = Array.from({ length: 50 }, ( _, index ) => ({ id: index, name: `n${index}` }));
const wired = api.wire({ envelope: { data: "result", code: "status" } }).envelope;
const body = { data: [1, 2], code: "ok", message: null, meta: { page: 1, limit: 10, total: 2 } };

await client.call(users.show, { id: 1 });

bench("api.feature", () => do_not_optimize(api.feature("f", { show: api.get("/f/{id}", validate.object({ id: validate.number() }), user) })));
bench("api.call.cached", async () => do_not_optimize(await client.call(users.show, { id: 1 })));
bench("api.call.stub one", async () => do_not_optimize(await cold.call(users.show, { id: 2 }, { fresh: true })));
bench("api.call.stub list", async () => do_not_optimize(await cold.call(users.list, {})));
bench("api.call.stub write", async () => do_not_optimize(await cold.call(users.make, { name: "x" })));
bench("api.call.fakes list", async () => do_not_optimize(await faked.call(users.list, { page: 1 })));
bench("api.url", () => do_not_optimize(client.url(users.show, { id: 7 })));
bench("api.url query", () => do_not_optimize(client.url(users.list, { page: 2, q: "a b" })));
bench("api.cached", () => do_not_optimize(client.cached(users.show, { id: 1 })));
bench("api.unwrap", () => do_not_optimize(api.unwrap(body)));
bench("api.unwrap foreign", () => do_not_optimize(api.unwrap({ result: [1, 2], status: "ok" }, wired)));
bench("api.envelope", () => do_not_optimize(api.envelope([1, 2], { page: 1, limit: 10, total: 2 })));
bench("api.pageOf", () => do_not_optimize(api.pageOf(body)));
bench("api.paged", () => do_not_optimize(api.paged(rows, { page: 1, limit: 50, total: 50 })));
bench("api.wire", () => do_not_optimize(api.wire({ headers: { language: "x-lang" }, timeout: 500 })));
bench("api.address", () => do_not_optimize(api.address("https://api.example.com/v1/", { release: true })));
bench("api.applyPatch.50", () => do_not_optimize(api.applyPatch(rows, true, "updated", { id: 25, name: "x" })));
bench("api.applyPatch.delete", () => do_not_optimize(api.applyPatch(rows, true, "deleted", { id: 25 })));
bench("api.changeOf", () => do_not_optimize(api.changeOf("users.updated", "users")));
bench("api.openapi", () => do_not_optimize(api.openapi({ users }, { title: "t", version: "1" })));
bench("api.transportIssues", () => do_not_optimize(api.transportIssues({ users })));
bench("api.catalogue", () => do_not_optimize(api.catalogue({ users })));
bench("api.stub.fetch", async () => do_not_optimize(await server.fetcher("https://api.test/users/1", { method: "GET", headers: {}, signal: new AbortController().signal })));
bench("api.sample", () => do_not_optimize(api.sample(user, 1)));

await run();
