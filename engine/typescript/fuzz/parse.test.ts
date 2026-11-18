import { describe, expect, test as it } from "bun:test";
import * as parse from "engine/parse";
import * as fc from "fast-check";

const runs = 20_000;

describe("fuzz parse", () => {

    it("scalar parsers never throw on any text", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 48 }), ( text ) => {

                parse.duration(text);
                parse.bytes(text);
                parse.keyValue(text);
                parse.env(text);
                parse.range(text);
                parse.semver(text);
                parse.when(text);
                parse.query(text);

                expect(parse.match("/a/{b}", text) === undefined || typeof parse.match("/a/{b}", text)?.b === "string").toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("query strings round trip", () => {

        const key = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}$/);
        const value = fc.string({ maxLength: 12 }).filter(( text ) => text !== "");

        fc.assert(
            fc.property(fc.dictionary(key, fc.oneof(value, fc.array(value, { minLength: 1, maxLength: 3 })), { maxKeys: 5 }), ( input ) => {

                const parsed = parse.query(parse.queryString(input));

                for ( const [name, given] of Object.entries(input) ) {

                    const found = parsed[name];

                    expect(Array.isArray(given) ? found : [found].flat()).toEqual(Array.isArray(given) ? given : [given]);

                }

            }),
            { numRuns: runs },
        );

    });
    it("semver accepts exactly what it prints", () => {

        const part = fc.integer({ min: 0, max: 9999 });

        fc.assert(
            fc.property(part, part, part, ( major, minor, patch ) => {

                expect(parse.semver(`${major}.${minor}.${patch}`)).toEqual({ major, minor, patch, prerelease: "", build: "" });

            }),
            { numRuns: runs },
        );

    });

});
