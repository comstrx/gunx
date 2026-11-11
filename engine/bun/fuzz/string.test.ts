import { describe, expect, test as it } from "bun:test";
import * as string from "engine/string";
import * as fc from "fast-check";

const runs = 20_000;

describe("fuzz string", () => {

    it("base64 and hex round trip any bytes", () => {

        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 256 }), ( data ) => {

                expect([...string.fromBase64(string.base64(data))]).toEqual([...data]);
                expect([...string.fromBase64(string.base64url(data))]).toEqual([...data]);
                expect([...string.fromHex(string.hex(data))]).toEqual([...data]);

            }),
            { numRuns: runs },
        );

    });
    it("folding is idempotent and slugs stay slugs", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 40, unit: "grapheme" }), ( text ) => {

                const folded = string.fold(text);
                const slug = string.slug(text);

                expect(string.fold(folded)).toBe(folded);
                expect(slug === "" || /^[^\s-][^\s]*$/u.test(slug)).toBe(true);
                expect(slug.includes("--")).toBe(false);
                expect(string.length(string.truncate(text, 10)) <= 10).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("graphemes, chunks and html escapes lose nothing", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 40, unit: "grapheme" }), fc.integer({ min: 1, max: 8 }), ( text, size ) => {

                const parts = string.chunk(text, size);

                expect(string.graphemes(text).join("")).toBe(text);
                expect(parts.join("")).toBe(text);
                expect(parts.every(( part ) => string.length(part) <= size)).toBe(true);
                expect(string.unescapeHtml(string.escapeHtml(text))).toBe(text);
                expect(string.length(string.take(text, size)) <= size).toBe(true);
                expect(string.excerpt(text, text.slice(0, 3), 4).isWellFormed() || !text.isWellFormed()).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("distance is a metric", () => {

        const word = fc.string({ maxLength: 12 });

        fc.assert(
            fc.property(word, word, word, ( a, b, c ) => {

                expect(string.distance(a, b)).toBe(string.distance(b, a));
                expect(string.distance(a, a)).toBe(0);
                expect(string.distance(a, c) <= string.distance(a, b) + string.distance(b, c)).toBe(true);

            }),
            { numRuns: runs },
        );

    });

});
