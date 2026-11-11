import { describe, expect, test as it } from "bun:test";
import * as json from "engine/json";
import * as fc from "fast-check";

const runs = 20_000;

describe("fuzz json", () => {

    it("parse never throws and stable stringify round trips plain data", () => {

        fc.assert(fc.property(fc.string({ maxLength: 64 }), ( text ) => { json.parse(text); }), { numRuns: runs });
        fc.assert(
            fc.property(fc.jsonValue({ maxDepth: 4 }), ( value ) => {

                fc.pre(!JSON.stringify(value).includes("__proto__"));

                const text = json.stringify(value, { stable: true });

                expect(json.equal(json.parse(text), value)).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("flatten and unflatten are inverses for records without empty leaves", { timeout: 60_000 }, () => {

        const leaf = fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.boolean());
        const key = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);

        fc.assert(
            fc.property(fc.dictionary(key, fc.oneof(leaf, fc.dictionary(key, leaf, { minKeys: 1, maxKeys: 4 })), { maxKeys: 6 }), ( value ) => {

                expect(json.equal(json.unflatten(json.flatten(value)), value)).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("patch replays a diff: patching the left side with diff(left, right) gives the right side, for records without empty containers", () => {

        const key = fc.stringMatching(/^[a-z]{1,3}$/);
        const leaf = fc.oneof(fc.string({ maxLength: 6 }), fc.integer({ min: -9, max: 9 }), fc.boolean(), fc.constant(null));
        const value: fc.Arbitrary<unknown> = fc.letrec<{ node: unknown }>(( tie ) => ({ node: fc.oneof({ depthSize: "small", maxDepth: 3 }, leaf, fc.dictionary(key, tie("node"), { minKeys: 1, maxKeys: 3 })) })).node;
        const record = fc.dictionary(key, value, { maxKeys: 4 }) as fc.Arbitrary<json.Dictionary>;

        fc.assert(
            fc.property(record, record, ( left, right ) => {

                const changes = json.diff(left, right);

                expect(json.patch(left, changes)).toEqual(right);
                expect(json.diff(right, json.patch(left, changes))).toEqual([]);
                expect(changes.every(( change ) => (change.kind === "added") === !Object.hasOwn(json.flatten(left), change.path) && (change.kind === "removed") === !Object.hasOwn(json.flatten(right), change.path))).toBe(true);

            }),
            { numRuns: 5000 },
        );

    });
    it("lines round trip any json rows, line separators inside strings included, and skip blank lines", () => {

        const odd = fc.constantFrom(String.fromCharCode(0x2028), String.fromCharCode(0x2029), "\r", "\n", "\r\n", "\u0000");
        const row = fc.oneof(fc.jsonValue({ maxDepth: 3 }), fc.array(odd, { maxLength: 4 }).map(( parts ) => parts.join("x")));

        fc.assert(
            fc.property(fc.array(row, { maxLength: 8 }), ( rows ) => {

                fc.pre(!JSON.stringify(rows).includes("__proto__"));

                const plain = JSON.parse(JSON.stringify(rows)) as unknown[];

                expect(json.fromLines(json.toLines(rows))).toEqual(plain);
                expect(json.fromLines(`\n${json.toLines(rows)}\n\n   \n`)).toEqual(plain);

            }),
            { numRuns: 5000 },
        );

    });
    it("pathSet then pathGet reads back, has agrees, and unset removes exactly that path", () => {

        const key = fc.stringMatching(/^[a-z]{1,3}$/);

        fc.assert(
            fc.property(fc.dictionary(key, fc.jsonValue({ maxDepth: 2 }), { maxKeys: 4 }), fc.array(key, { minLength: 1, maxLength: 4 }), fc.jsonValue({ maxDepth: 2 }), ( base, keys, item ) => {

                fc.pre(!JSON.stringify([base, item]).includes("__proto__"));

                const placed = json.pathSet(base as json.Dictionary, keys, item);
                const gone = json.unset(placed, keys);
                let cursor: unknown = base;
                let crossed = false;

                for ( const step of keys ) {

                    crossed ||= Array.isArray(cursor);
                    cursor = typeof cursor === "object" && cursor !== null && Object.hasOwn(cursor, step) ? (cursor as Record<string, unknown>)[step] : undefined;

                }

                if ( crossed ) {

                    expect(placed).toBe(base);

                    return;

                }

                expect(json.pathGet(placed, keys)).toEqual(item);
                expect(json.has(placed, keys)).toBe(true);
                expect(json.has(gone, keys)).toBe(false);
                expect(json.pathGet(gone, keys.slice(0, -1))).toBeDefined();

            }),
            { numRuns: 5000 },
        );

    });
    it("csv round trips any cell", () => {

        const cell = fc.string({ maxLength: 16 });

        fc.assert(
            fc.property(fc.array(fc.tuple(cell, cell), { minLength: 1, maxLength: 6 }), ( pairs ) => {

                const rows = pairs.map(([a, b]) => ({ a, b }));
                const kept = rows.filter(( row ) => row.a !== "" || row.b !== "");

                expect(json.fromCsv(json.toCsv(rows, { columns: ["a", "b"] }), { columns: ["a", "b"], header: false }).slice(1)).toEqual(kept);

            }),
            { numRuns: runs },
        );

    });

});
