import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as fc from "fast-check";

const runs = 5_000;
const names = Object.keys(error.codes) as error.Code[];

describe("fuzz error", () => {

    it("any status finds a code of the closed set, and a code's own status finds the code back", () => {

        fc.assert(fc.property(fc.integer({ min: -1000, max: 1000 }), ( status ) => {

            const code = error.codeOf(status);

            expect(error.isCode(code)).toBe(true);
            expect(status >= 400 && status < 500 ? error.codes[code] >= 400 || error.codes[code] === 0 : true).toBe(true);
            expect(status >= 500 ? error.codes[code] >= 500 : true).toBe(true);

        }), { numRuns: runs });

        for ( const code of names ) expect(error.codeOf(error.codes[code])).toBe(code);

    });
    it("no text outside the set is ever taken for a code", () => {

        fc.assert(fc.property(fc.string({ maxLength: 24 }), ( text ) => {

            expect(error.isCode(text)).toBe(names.includes(text as error.Code));

        }), { numRuns: runs });

    });

});
