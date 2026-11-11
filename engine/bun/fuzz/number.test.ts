import { describe, expect, test as it } from "bun:test";
import * as number from "engine/number";
import * as fc from "fast-check";

const runs = 10_000;
const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e15, max: 1e15 });

describe("fuzz number", () => {

    it("formatters accept any finite number", () => {

        fc.assert(
            fc.property(finite, fc.constantFrom("en", "ar"), ( value, locale ) => {

                expect(typeof number.format(value)).toBe("string");
                expect(typeof number.formatPercent(value)).toBe("string");
                expect(typeof number.abbreviate(value, 1, locale)).toBe("string");
                expect(typeof number.bytes(Math.abs(value))).toBe("string");
                expect(typeof number.ordinal(Math.trunc(value), locale)).toBe("string");
                expect(Number.isFinite(number.round(value, 2))).toBe(true);
                expect(Number.isFinite(number.precision(value, 3))).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("digits round trip through arabic numerals and clamp stays inside its bounds", () => {

        fc.assert(
            fc.property(fc.stringMatching(/^[0-9]{1,12}$/), fc.integer(), fc.integer(), fc.integer(), ( digits, value, a, b ) => {

                expect(number.numerals(number.numerals(digits, "arab"), "latn")).toBe(digits);

                const low = Math.min(a, b);
                const high = Math.max(a, b);
                const held = number.clamp(value, low, high);

                expect(held >= low && held <= high).toBe(true);
                expect(number.between(held, low, high)).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("words and roman numerals never throw inside their domains", () => {

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 999_999_999 }), fc.integer({ min: 1, max: 3999 }), ( value, small ) => {

                expect(number.words(value, "en").length).toBeGreaterThan(0);
                expect(number.words(value, "ar").length).toBeGreaterThan(0);
                expect(/^[MDCLXVI]+$/.test(number.roman(small))).toBe(true);

            }),
            { numRuns: runs },
        );

    });

});
