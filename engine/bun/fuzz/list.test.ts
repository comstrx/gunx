import { describe, expect, test as it } from "bun:test";
import * as list from "engine/list";
import * as fc from "fast-check";

describe("fuzz list", () => {

    it("best matches stable full sorting for arrays and iterators at every bound", () => {

        fc.assert(fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 350 }), fc.integer({ min: -2, max: 400 }), fc.boolean(), ( values, limit, descending ) => {

            const rows = values.map(( value, index ) => ({ value, index }));
            const compare = ( a: typeof rows[number], b: typeof rows[number] ): number => (descending ? -1 : 1) * (a.value - b.value);
            const expected = rows.toSorted(compare).slice(0, Math.max(0, limit));

            expect(list.best(rows, compare, limit)).toEqual(expected);
            expect(list.best(rows.values(), compare, limit)).toEqual(expected);
            expect(rows.map(( row ) => row.value)).toEqual(values);

        }), { numRuns: 5000 });

    });
    it("catalog matching preserves stable relevance and weight order", () => {

        fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 100 }), fc.nat({ max: 110 }), ( weights, limit ) => {

            const rows = weights.map(( weight, index ) => ({ id: String(index), label: "matching", weight }));
            const made = list.catalog(rows, ( row ) => row.id, ( row ) => [row.label], ( row ) => row.weight);
            const expected = rows.toSorted(( a, b ) => b.weight - a.weight).slice(0, limit);

            expect(made.search("matching", limit)).toEqual(expected);
            expect(made.search("", limit)).toEqual(rows.slice(0, limit));

        }), { numRuns: 1500 });

    });
});
