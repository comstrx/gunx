import { describe, expect, test as it } from "bun:test";
import * as list from "engine/list";

describe("list.best", () => {

    it("selects a stable prefix without changing input, including ties and NaN comparisons", () => {

        const rows = Array.from({ length: 180 }, (_, index ) => ({ index, score: (index * 37) % 11 }));
        const before = [...rows];
        const compare = ( a: typeof rows[number], b: typeof rows[number] ): number => a.score - b.score;

        for ( const limit of [0, 1, 10, 65, 90, 180, 200, Number.POSITIVE_INFINITY] ) expect(list.best(rows, compare, limit)).toEqual(rows.toSorted(compare).slice(0, limit));

        expect(rows).toEqual(before);
        expect(list.best(rows, () => Number.NaN, 12)).toEqual(rows.slice(0, 12));
        expect(list.best(rows, compare, Number.NaN)).toEqual(rows.toSorted(compare).slice(0, 10));
        expect(list.best(rows, compare, 2.9)).toEqual(rows.toSorted(compare).slice(0, 2));

    });
    it("consumes a lazy iterator once, closes it on failure and does no work for a zero limit", () => {

        let reads = 0;
        let closed = 0;
        function* values (): Generator<number> {

            try {

                for ( let value = 100; value > 0; value -= 1 ) { reads += 1; yield value; }

            } finally {

                closed += 1;

            }

        }

        expect(list.best(values(), ( a, b ) => a - b, 0)).toEqual([]);
        expect(reads).toBe(0);
        expect(list.best(values(), ( a, b ) => a - b, 3)).toEqual([1, 2, 3]);
        expect(reads).toBe(100);
        expect(closed).toBe(1);
        expect(() => list.best(values(), () => { throw new Error("compare"); }, 2)).toThrow("compare");
        expect(closed).toBe(2);
        expect(list.best([], ( a: number, b: number ) => a - b)).toEqual([]);

    });
});
