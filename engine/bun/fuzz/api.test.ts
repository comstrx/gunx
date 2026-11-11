import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as error from "engine/error";
import * as validate from "engine/validate";
import * as fc from "fast-check";

const runs = 3_000;
const user = validate.object({ id: validate.number(), name: validate.string() });
const users = api.feature("users", {
    show: api.get("/users/{id}", validate.object({ id: validate.string() }), user),
    file: api.get("/files/{path*}", validate.object({ path: validate.string(), q: validate.optional(validate.string()) }), user),
});
const row = fc.record({ id: fc.oneof(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }).map(String)), v: fc.integer({ min: 0, max: 5 }), name: fc.string({ maxLength: 4 }) });
const foreign = fc.oneof(fc.constant(null), fc.integer(), fc.string({ maxLength: 3 }), fc.constant({ v: 1 }));
const change = fc.constantFrom("created", "updated", "deleted", "other") as fc.Arbitrary<api.Change>;
const segment = fc.string({ minLength: 1, maxLength: 8 }).filter(( text ) => text !== "." && text !== ".." && !text.includes("/"));

function same ( a: unknown, b: unknown ): boolean {

    return String(a) === String(b);

}
function model ( rows: readonly unknown[], change: api.Change, data: { id: number | string; v: number; name: string }, versioned: boolean ): { value: unknown; applied: boolean } {

    const at = rows.findIndex(( item ) => typeof item === "object" && item !== null && !Array.isArray(item) && same((item as { id?: unknown }).id, data.id));
    const held = at === -1 ? undefined : (rows[at] as { id: unknown; v?: unknown });

    if ( change === "deleted" ) return held ? { value: rows.filter(( _, index ) => index !== at), applied: true } : { value: rows, applied: false };
    if ( !held ) return change === "created" ? { value: [data, ...rows], applied: true } : { value: rows, applied: false };
    if ( versioned && typeof held.v === "number" && data.v < held.v ) return { value: rows, applied: false };

    return { value: rows.map(( item, index ) => (index === at ? { ...held, ...data, id: held.id } : item)), applied: true };

}

describe("fuzz api", () => {

    it("any body unwraps without throwing and an envelope round trips its data along any paths", () => {

        const paths = api.wire({ envelope: { data: "result.body", code: "status", message: "info.text", errors: "info.errors", reason: "info.why", requestId: "trace.id", retryAfter: "trace.wait", page: "paging.page", limit: "paging.size", total: "paging.count", pages: "paging.pages" } }).envelope;

        fc.assert(
            fc.property(fc.jsonValue(), fc.option(fc.integer({ min: 0, max: 1e6 }), { nil: undefined }), ( body, page ) => {

                const opened = api.unwrap(body);

                expect(typeof opened.code).toBe("string");
                expect(typeof api.isEnvelope(body)).toBe("boolean");
                api.pageOf(body);
                expect(api.unwrap(api.envelope(body)).data).toEqual(body);
                expect(api.unwrap(api.envelope(body, { page, limit: 10, extra: "x" }, paths, "fine"), paths, "fine")).toMatchObject({ data: body, code: "fine", meta: { extra: "x" } });

                if ( page !== undefined ) expect(api.pageOf(api.envelope(body, { page, limit: 10, total: page * 10 }, paths), paths)).toEqual({ page, limit: 10, total: page * 10, pages: Math.max(1, page) });

            }),
            { numRuns: runs },
        );

    });
    it("a wire override is either accepted whole or refused as a fault", () => {

        fc.assert(
            fc.property(fc.dictionary(fc.string({ maxLength: 12 }), fc.jsonValue(), { maxKeys: 4 }), ( overrides ) => {

                const outcome = (() => {

                    try {

                        return typeof api.wire(overrides as api.Overrides).timeout === "number" ? "wire" : "odd";

                    } catch ( caught ) {

                        return caught instanceof error.Fault ? "fault" : "throw";

                    }

                })();

                expect(["wire", "fault"]).toContain(outcome);

            }),
            { numRuns: runs },
        );

    });
    it("applyPatch agrees with a plain model on any rows, keeps foreign items and never loses a row it did not delete", () => {

        fc.assert(
            fc.property(fc.array(fc.oneof(row, foreign), { maxLength: 8 }), change, row, fc.boolean(), ( rows, kind, data, versioned ) => {

                const made = api.applyPatch(rows, true, kind, data, versioned ? { version: "v" } : {});
                const expected = model(rows, kind, data, versioned);

                expect(made.applied).toBe(expected.applied);
                expect(made.value).toEqual(expected.value);
                expect((made.value as unknown[]).length >= rows.length - 1).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("every path parameter survives the trip from a client url to a stub route, whatever text it holds", async () => {

        const stub = api.stub({ "GET /users/{id}": ({ params }) => ({ id: 1, name: params.id ?? "" }), "GET /files/{path*}": ({ params, query }) => ({ id: 1, name: `${params.path ?? ""}|${String(query.q ?? "")}` }) });
        const client = api.create({ baseUrl: "https://a.io", fetcher: stub.fetcher });

        await fc.assert(
            fc.asyncProperty(segment, fc.array(segment, { minLength: 1, maxLength: 3 }), fc.string({ maxLength: 6 }), async ( id, pieces, q ) => {

                const path = pieces.join("/");
                const shown = await client.call(users.show, { id });
                const filed = await client.call(users.file, { path, q });

                expect(shown.data.name).toBe(id);
                expect(filed.data.name).toBe(`${path}|${q}`);
                expect(client.url(users.show, { id }).startsWith("https://a.io/users/")).toBe(true);

            }),
            { numRuns: 400 },
        );

    });

});
