import { describe, expect, test as it } from "bun:test";
import * as virtual from "engine/virtual";

describe("virtual", () => {

    it("layouts, windows and offsets are exact", () => {

        const made = virtual.layout({ count: 100, size: 40, gap: 10, paddingStart: 20, paddingEnd: 30, overscan: 1 });

        expect(made.total).toBe(20 + 100 * 40 + 99 * 10 + 30);
        expect(made.offsets[0]).toBe(20);
        expect(made.offsets[2]).toBe(120);

        const shown = virtual.visible(made, 500, 200);

        expect(shown.start).toBe(8);
        expect(shown.end).toBe(14);
        expect(shown.items[0]).toEqual({ index: 8, offset: 420, size: 40 });
        expect(shown.before).toBe(420);
        expect(shown.after).toBe(made.total - (made.offsets[14] ?? 0) - 40);
        expect(virtual.visible(made, -50, 200).start).toBe(0);
        expect(virtual.visible(made, 99_999, 200).end).toBe(99);
        expect(virtual.visible(virtual.layout({ count: 0, size: 10 }), 0, 100)).toEqual({ start: 0, end: -1, items: [], total: 0, before: 0, after: 0 });

        const varied = virtual.layout({ count: 3, size: ( index ) => [10, 50, 20][index] ?? 0 });

        expect(varied.offsets).toEqual([0, 10, 60]);
        expect(varied.total).toBe(80);
        expect(virtual.offsetFor(made, 50, 200, "start")).toBe(made.offsets[50] ?? 0);
        expect(virtual.offsetFor(made, 50, 200, "end")).toBe((made.offsets[50] ?? 0) + 40 - 200);
        expect(virtual.offsetFor(made, 50, 200, "center")).toBe((made.offsets[50] ?? 0) + 20 - 100);
        expect(virtual.offsetFor(made, 10, 200, "auto", 500)).toBe(500);
        expect(virtual.offsetFor(made, 2, 200, "auto", 500)).toBe(120);
        expect(virtual.offsetFor(made, 30, 200, "auto", 500)).toBe((made.offsets[30] ?? 0) + 40 - 200);
        expect(virtual.offsetFor(made, 999, 200, "start")).toBe(made.total - 200);

        const sizes = virtual.measures();

        expect(sizes.set(1, 70)).toBe(true);
        expect(sizes.set(1, 70)).toBe(false);
        expect(sizes.get(1)).toBe(70);
        expect(sizes.sizer(40)(1)).toBe(70);
        expect(sizes.sizer(40)(2)).toBe(40);
        expect(sizes.version()).toBe(1);
        sizes.clear();
        expect(sizes.get(1)).toBeUndefined();

        const cells = virtual.grid(10, 3, 100, 10);

        expect(cells.rows).toBe(4);
        expect(cells.cells([{ index: 3, offset: 300, size: 100 }])).toEqual([{ index: 9, row: 3, column: 0, offset: 0, size: 100 }]);
        expect(cells.cells([{ index: 0, offset: 0, size: 100 }]).map(( cell ) => cell.offset)).toEqual([0, 110, 220]);

    });
    it("anchors keep an item still across relayout, headers stick, and a table windows both axes", () => {

        const before = virtual.layout({ count: 10, size: 20 });
        const after = virtual.layout({ count: 12, size: 20 });

        expect(virtual.anchor(before, after, 100, 5)).toBe(100);
        expect(virtual.anchor(before, virtual.layout({ count: 12, size: ( index ) => (index < 2 ? 30 : 20) }), 100, 5)).toBe(120);
        expect(virtual.sticky(before, [0, 4, 8], 95)).toBe(4);
        expect(virtual.sticky(before, [0, 4, 8], 160)).toBe(8);
        expect(virtual.sticky(before, [4], 10)).toBeUndefined();

        const grid = virtual.table(virtual.layout({ count: 100, size: 30 }), virtual.layout({ count: 20, size: 120 }), 300, 240, { width: 480, height: 150 });

        expect(grid.rows.start).toBeLessThanOrEqual(10);
        expect(grid.rows.items.some(( item ) => item.index === 10)).toBe(true);
        expect(grid.columns.items.some(( item ) => item.index === 2)).toBe(true);
        expect(grid.columns.items.some(( item ) => item.index === 5)).toBe(true);

    });
    it("items, indexes, ranges and edges answer for fixed and varied layouts, and host junk reads as zero", () => {

        const fixed = virtual.layout({ count: 100, size: 40, gap: 10, paddingStart: 20, overscan: 2 });
        const varied = virtual.layout({ count: 4, size: ( index ) => [10, 0, 50, 20][index] ?? 0, gap: 5 });

        expect([virtual.item(fixed, 2), virtual.item(fixed, -1), virtual.item(fixed, 100), virtual.item(fixed, 1.5), virtual.item(varied, 1)]).toEqual([{ index: 2, offset: 120, size: 40 }, undefined, undefined, undefined, { index: 1, offset: 15, size: 0 }]);
        expect([virtual.indexAt(fixed, 0), virtual.indexAt(fixed, 465), virtual.indexAt(fixed, 1e9), virtual.indexAt(fixed, -5), virtual.indexAt(fixed, Number.NaN), virtual.indexAt(virtual.layout({ count: 0, size: 10 }), 5)]).toEqual([0, 9, 99, 0, 0, -1]);
        expect([virtual.indexAt(varied, 10), virtual.indexAt(varied, 15), virtual.indexAt(varied, 69), virtual.indexAt(varied, 70)]).toEqual([1, 2, 2, 3]);
        expect([virtual.range(fixed, 500, 200), virtual.range(fixed, -50, 200), virtual.range(fixed, 99_999, 200), virtual.range(varied, 0, 1000), virtual.range(virtual.layout({ count: 0, size: 10 }), 0, 100)]).toEqual([{ first: 9, last: 13 }, { first: 0, last: 3 }, { first: 96, last: 99 }, { first: 0, last: 3 }, { first: 0, last: -1 }]);
        expect([virtual.reached(fixed, 0, 200), virtual.reached(fixed, 4700, 200), virtual.reached(fixed, 4700, 200, 150), virtual.reached(fixed, 100, 200, 150), virtual.reached(varied, 0, 1000)]).toEqual([{ start: true, end: false }, { start: false, end: false }, { start: false, end: true }, { start: true, end: false }, { start: true, end: true }]);

        const junk = virtual.layout({ count: 3, size: ( index ) => [10, Number.NaN, 20][index] ?? 0, gap: -5, paddingStart: Number.NaN, paddingEnd: -1, overscan: Number.NaN });

        expect([junk.offsets, junk.sizes, junk.total, junk.overscan]).toEqual([[0, 10, 10], [10, 0, 20], 30, 3]);
        expect([virtual.visible(fixed, Number.NaN, 200).start, virtual.visible(fixed, 500, Number.NaN).items.map(( item ) => item.index), virtual.visible(fixed, Number.POSITIVE_INFINITY, 200).end, virtual.visible(fixed, 500, Number.POSITIVE_INFINITY).end]).toEqual([0, [7, 8, 9, 10, 11], 99, 99]);
        expect(virtual.layout({ count: 2.9, size: 10 }).count).toBe(2);
        expect(virtual.layout({ count: -3, size: 10 }).count).toBe(0);
        expect(virtual.layout({ count: 3, size: 1.5, gap: 0.25 }).total).toBe(5);
        expect(virtual.layout({ count: 3, size: Number.NaN }).total).toBe(0);
        expect(virtual.layout({ count: 3, size: -40 }).total).toBe(0);
        expect(virtual.layout({ count: 3, size: Number.POSITIVE_INFINITY }).total).toBe(0);

        for ( const count of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] ) expect(() => virtual.layout({ count, size: 10 })).toThrow(new RangeError("not a count"));

        const lazy = virtual.layout({ count: 5, size: 10 });

        const offsets = lazy.offsets;

        expect([offsets, lazy.sizes, offsets === lazy.offsets, { ...lazy }.offsets]).toEqual([[0, 10, 20, 30, 40], [10, 10, 10, 10, 10], true, [0, 10, 20, 30, 40]]);

        const halves = virtual.layout({ count: 20, size: 10, overscan: 1.5 });

        expect([halves.overscan, virtual.visible(halves, 50, 20).items.map(( item ) => item.index), virtual.layout({ count: 2, size: 1, overscan: -3 }).overscan]).toEqual([1, [4, 5, 6, 7], 0]);

        for ( const size of [0.1, 0.3, 1 / 3, 0.7, 2.5, 7.3] ) {

            const made = virtual.layout({ count: 50, size, gap: size / 7 });
            const step = size + size / 7;

            for ( let bottom = 0; bottom <= 24; bottom += 0.5 ) {

                for ( const top of [0, bottom / 2, bottom - size, bottom] ) {

                    const room = Math.max(0, bottom - top);
                    const start = made.total > room && top > 0 ? Math.min(top, made.total - room) : 0;
                    let first = 49;
                    let last = 0;

                    for ( let index = 0; index < 50; index += 1 ) if ( index * step + size > start ) { first = index; break; }
                    for ( let index = first; index < 50; index += 1 ) if ( index * step < start + room ) last = index; else break;

                    expect([size, bottom, top, virtual.range(made, top, room)]).toEqual([size, bottom, top, { first, last: Math.max(first, last) }]);

                }

            }

        }

        const zeros = virtual.layout({ count: 4, size: 0 });

        expect([virtual.range(zeros, 0, 100), virtual.visible(zeros, 0, 100).items.length, zeros.total, virtual.indexAt(zeros, 0)]).toEqual([{ first: 3, last: 3 }, 4, 0, 3]);

    });
    it("offsetFor follows the nearest rule for tall rows, keeps a row already in view, and clamps the current scroll", () => {

        const made = virtual.layout({ count: 10, size: ( index ) => (index === 5 ? 500 : 100) });

        expect([virtual.offsetFor(made, 5, 200, "auto", 0), virtual.offsetFor(made, 5, 200, "auto", 2000), virtual.offsetFor(made, 5, 200, "auto", 600), virtual.offsetFor(made, 5, 200, "auto", 800)]).toEqual([500, 800, 600, 800]);
        expect([virtual.offsetFor(made, 2, 200, "auto", -50), virtual.offsetFor(made, 2, 200, "auto", Number.NaN), virtual.offsetFor(made, 2, 200, "auto", 1e9), virtual.offsetFor(made, 7, 200, "auto", 2000), virtual.offsetFor(made, 2, 200, "auto", Number.POSITIVE_INFINITY)]).toEqual([100, 100, 200, 1100, 200]);
        expect([virtual.offsetFor(made, Number.NaN, 200, "start"), virtual.offsetFor(made, -4, 200, "start"), virtual.offsetFor(made, 99, 200, "start"), virtual.offsetFor(made, 1.9, 200, "start")]).toEqual([0, 0, 1200, 100]);
        expect([virtual.offsetFor(made, 5, 200, "center"), virtual.offsetFor(made, 5, 200, "end"), virtual.offsetFor(made, 0, 200, "end"), virtual.offsetFor(made, 9, 2000, "end")]).toEqual([650, 800, 0, 0]);
        expect([virtual.offsetFor(virtual.layout({ count: 0, size: 10 }), 3, 200, "start", 50), virtual.offsetFor(virtual.layout({ count: 0, size: 10 }), 3, 200, "auto", -5)]).toEqual([0, 0]);
        expect(virtual.offsetFor(made, 5, Number.NaN, "auto", 300)).toBe(500);
        expect(virtual.offsetFor(made, 3, 200, "start", 0)).toBe(300);

    });
    it("stuck headers shift under the next header, anchors survive relayout and missing rows, tables window both axes", () => {

        const made = virtual.layout({ count: 10, size: 20 });

        expect([virtual.stuck(made, [0, 4, 8], 70), virtual.stuck(made, [0, 4, 8], 95), virtual.stuck(made, [0, 4, 8], 160), virtual.stuck(made, [4], 10), virtual.stuck(made, [], 50), virtual.stuck(made, [0, 4, 999], 95), virtual.stuck(made, [0, 4, 8], Number.NaN)]).toEqual([{ index: 0, shift: -10 }, { index: 4, shift: 0 }, { index: 8, shift: 0 }, undefined, undefined, { index: 4, shift: 0 }, { index: 0, shift: 0 }]);
        expect([virtual.sticky(made, [0, 4, 8], 95), virtual.sticky(made, [4, 999, 1000], 95), virtual.sticky(made, [4, 8], 79)]).toEqual([4, 4, undefined]);

        const taller = virtual.layout({ count: 12, size: ( index ) => (index < 2 ? 30 : 20) });

        expect([virtual.anchor(made, taller, 100, 5), virtual.anchor(made, taller, 100, 11), virtual.anchor(made, taller, 100, -1), virtual.anchor(made, taller, Number.NaN, 5), virtual.anchor(taller, made, 10, 5), virtual.anchor(made, virtual.layout({ count: 0, size: 1 }), 100, 5), virtual.anchor(made, taller, 100, 2.5)]).toEqual([120, 100, 100, 20, 0, 100, 100]);
        expect([virtual.stuck(made, [2.5], 95), virtual.stuck(made, [Number.NaN], 95)]).toEqual([undefined, undefined]);

        const grid = virtual.table(virtual.layout({ count: 100, size: 30 }), virtual.layout({ count: 20, size: 120 }), 300, 240, { width: 480, height: 150 });

        expect([grid.rows.start, grid.rows.end, grid.columns.start, grid.columns.end]).toEqual([7, 17, 0, 8]);

    });
    it("grids place indexes row-major with clamped rows, fit packs columns into a width, and measures keep sizes by key", () => {

        const cells = virtual.grid(10, 3, 100, 10);

        expect([cells.columns, cells.rows, cells.row(0), cells.row(5), cells.row(9), cells.row(40), cells.row(-1), cells.row(Number.NaN), cells.row(2.9)]).toEqual([3, 4, 0, 1, 3, 3, 0, 0, 0]);
        expect(cells.cells([{ index: 3, offset: 300, size: 100 }, { index: -1, offset: 0, size: 1 }, { index: 1.5, offset: 0, size: 1 }, { index: 9, offset: 0, size: 1 }])).toEqual([{ index: 9, row: 3, column: 0, offset: 0, size: 100 }]);
        expect(cells.cells([{ index: 1, offset: 110, size: 100 }]).map(( cell ) => [cell.index, cell.column, cell.offset])).toEqual([[3, 0, 0], [4, 1, 110], [5, 2, 220]]);
        expect([virtual.grid(0, 3, 10).rows, virtual.grid(9.5, 3, 10).rows, virtual.grid(10, 0, 10).columns, virtual.grid(10, -2, 10).columns, virtual.grid(10, 2.9, 10).columns, virtual.grid(5, 3, Number.NaN, -4).cells([{ index: 0, offset: 0, size: 1 }]).map(( cell ) => cell.offset)]).toEqual([0, 3, 1, 1, 2, [0, 0, 0]]);

        for ( const count of [Number.NaN, Number.POSITIVE_INFINITY] ) expect(() => virtual.grid(count, 3, 10)).toThrow(new RangeError("not a count"));

        expect(() => virtual.grid(10, Number.NaN, 10)).toThrow(new RangeError("not a count"));
        expect([virtual.fit(1000, 200, 10), virtual.fit(1000, 200), virtual.fit(100, 200), virtual.fit(0, 200), virtual.fit(1000, 0), virtual.fit(1000, 0, 10), virtual.fit(Number.NaN, 200, 10), virtual.fit(1000, Number.NaN), virtual.fit(1000, 300, Number.POSITIVE_INFINITY)]).toEqual([{ columns: 4, width: 242.5 }, { columns: 5, width: 200 }, { columns: 1, width: 100 }, { columns: 1, width: 0 }, { columns: 1, width: 1000 }, { columns: 101, width: 0 }, { columns: 1, width: 0 }, { columns: 1, width: 1000 }, { columns: 3, width: 1000 / 3 }]);

        const sizes = virtual.measures(( index ) => `row-${index % 2}`);

        expect([sizes.set(0, 30), sizes.set(2, 30), sizes.set(2, 50), sizes.get(0), sizes.get(4), sizes.count(), sizes.version()]).toEqual([true, false, true, 50, 50, 1, 2]);
        expect([sizes.set(1, 10), sizes.estimate(99), sizes.sizer(7)(3), sizes.sizer(7)(0), sizes.count()]).toEqual([true, 30, 10, 50, 2]);
        expect([sizes.drop(5), sizes.drop(5), sizes.count(), sizes.estimate(99), sizes.version()]).toEqual([true, false, 1, 50, 4]);
        expect([sizes.set(-1, 10), sizes.set(1.5, 10), sizes.set(1, Number.NaN), sizes.set(1, -1), sizes.set(1, Number.POSITIVE_INFINITY), sizes.version()]).toEqual([false, false, false, false, false, 4]);
        sizes.clear();
        sizes.clear();
        expect([sizes.count(), sizes.version(), sizes.estimate(99), sizes.get(0)]).toEqual([0, 5, 99, undefined]);
        expect(virtual.measures().set(0, 0)).toBe(true);

    });
});
