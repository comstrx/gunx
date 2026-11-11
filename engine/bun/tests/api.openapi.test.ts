import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";
import * as validate from "engine/validate";

describe("api.openapi", () => {

    it("edges answer, refuse and page in the house envelope; contracts are linted and documented", () => {

        expect(api.unwrap(api.answer({ id: 1 }, { requestId: "r1" })).data).toEqual({ id: 1 });
        expect(api.unwrap(api.refuse(error.fault("not_found", "orders.missing"))).code).toBe("not_found");
        expect(api.pageOf(api.paged([1, 2], { page: 2, limit: 2, total: 5 }))).toEqual({ page: 2, limit: 2, total: 5, pages: 3 });

        const row = validate.object({ id: validate.string(), total: validate.number() });
        const features = {
            orders: api.feature("orders", {
                list: api.get("/api/orders", validate.object({ page: validate.optional(validate.number()), status: validate.optional(validate.string()) }), api.many(row), { cache: 30 }),
                one: api.get("/api/orders/{id}", validate.object({ id: validate.string() }), row),
                create: api.post("/api/orders", validate.object({ total: validate.number() }), row),
            }),
            broken: api.feature("broken", {
                dupe: api.get("/api/orders", validate.object({}), row),
                posted: api.post("/api/broken", validate.object({}), api.many(row), { cache: 10 }),
            }),
        };
        const issues = api.transportIssues(features);

        expect(issues.map(( issue ) => `${issue.name}:${issue.rule}`).sort()).toEqual(["dupe:route.taken", "posted:cache.method", "posted:many.method"]);

        const spec = api.openapi({ orders: features.orders }, { title: "Acme", version: "1.0.0", servers: ["https://api.acme.example"] });
        const paths = spec.paths as Record<string, Record<string, { parameters: { name: string; in: string; required?: boolean; schema?: unknown }[]; requestBody?: unknown; responses: Record<string, unknown> }>>;

        expect(spec.openapi).toBe("3.1.0");
        expect(Object.keys(paths).sort()).toEqual(["/api/orders", "/api/orders/{id}"]);
        expect(paths["/api/orders"]?.get?.parameters.map(( param ) => `${param.in}:${param.name}`)).toEqual(["query:page", "query:status"]);
        expect(paths["/api/orders/{id}"]?.get?.parameters).toEqual([{ name: "id", in: "path", required: true, schema: { type: "string" } }]);
        expect(paths["/api/orders"]?.post?.requestBody).toBeDefined();
        expect(JSON.stringify(paths["/api/orders"]?.get?.responses)).toContain('"type":"array"');
        expect((spec.servers as { url: string }[])[0]?.url).toBe("https://api.acme.example");

    });

});
