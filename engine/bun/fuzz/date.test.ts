import { describe, expect, test as it } from "bun:test";
import * as date from "engine/date";
import * as fc from "fast-check";

const runs = 20_000;

describe("fuzz date", () => {

    it("from never throws and plain dates round trip", () => {

        fc.assert(fc.property(fc.string({ maxLength: 32 }), ( text ) => { date.from(text); date.format(text, "date"); }), { numRuns: runs });
        fc.assert(
            fc.property(fc.date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z"), noInvalidDate: true }), ( when ) => {

                const plain = date.plain(when);

                expect(date.plain(date.from(plain))).toBe(plain);
                expect(date.parts(date.fromParts(date.parts(when) ?? {}))).toEqual(date.parts(when));

            }),
            { numRuns: runs },
        );

    });
    it("adding then subtracting days is identity and diff agrees", () => {

        fc.assert(
            fc.property(fc.date({ min: new Date("1970-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z"), noInvalidDate: true }), fc.integer({ min: -5000, max: 5000 }), ( when, days ) => {

                const moved = date.add(when, { days });

                expect(date.subtract(moved, { days })?.getTime()).toBe(when.getTime());
                expect(date.diff(moved, when)).toBe(days);

            }),
            { numRuns: runs },
        );

    });

});
