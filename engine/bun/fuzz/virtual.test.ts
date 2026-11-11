import { describe, expect, test as it } from "bun:test";
import * as virtual from "engine/virtual";
import * as fc from "fast-check";

type Shape = { sizes: number[]; gap: number; start: number; end: number; overscan: number; fixed: boolean };
type Model = { offsets: number[]; sizes: number[]; total: number; count: number };

const runs = 3000;
const px = fc.oneof(fc.integer({ min: 0, max: 120 }), fc.double({ min: 0, max: 120, noNaN: true }).map(( value ) => Math.round(value * 4) / 4), fc.double({ min: 0, max: 120, noNaN: true }), fc.constantFrom(0.1, 1 / 3, 7.3, 33.333));
const shape: fc.Arbitrary<Shape> = fc.record({
    sizes: fc.array(px, { maxLength: 40 }),
    gap: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 30 })),
    start: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 60 })),
    end: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 60 })),
    overscan: fc.integer({ min: 0, max: 4 }),
    fixed: fc.boolean(),
});
const position = fc.oneof(fc.integer({ min: -200, max: 6000 }), fc.double({ min: -50, max: 5000, noNaN: true }), fc.constant(Number.NaN), fc.constant(Number.POSITIVE_INFINITY), fc.constant(Number.NEGATIVE_INFINITY));
const room = fc.oneof(fc.integer({ min: 0, max: 900 }), fc.double({ min: 0, max: 900, noNaN: true }), fc.constant(Number.NaN), fc.constant(Number.POSITIVE_INFINITY));

function build ( given: Shape ): { made: virtual.Layout; model: Model; sizes: number[] } {

    const sizes = given.fixed ? given.sizes.map(() => given.sizes[0] ?? 0) : given.sizes;
    const count = sizes.length;
    const offsets: number[] = [];
    let cursor = given.start;

    for ( let index = 0; index < count; index += 1 ) {

        offsets.push(given.fixed ? given.start + index * ((sizes[0] ?? 0) + given.gap) : cursor);
        cursor += (sizes[index] ?? 0) + (index < count - 1 ? given.gap : 0);

    }

    const total = given.fixed ? given.start + count * (sizes[0] ?? 0) + Math.max(0, count - 1) * given.gap + given.end : cursor + given.end;
    const model: Model = { offsets, sizes, total, count };
    const made = virtual.layout({ count, size: given.fixed ? (sizes[0] ?? 0) : ( index ) => sizes[index] ?? 0, gap: given.gap, paddingStart: given.start, paddingEnd: given.end, overscan: given.overscan });

    return { made, model, sizes };

}
function close ( a: number, b: number ): boolean {

    return a === b || Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

}
function extent ( value: number ): number {

    return Number.isNaN(value) ? 0 : Math.max(0, value);

}
function topOf ( model: Model, scroll: number, viewport: number ): number {

    const space = extent(viewport);

    return model.total > space && scroll > 0 ? Math.min(scroll, model.total - space) : 0;

}
function first ( model: Model, top: number ): number {

    for ( let index = 0; index < model.count; index += 1 ) if ( (model.offsets[index] ?? 0) + (model.sizes[index] ?? 0) > top ) return index;

    return model.count - 1;

}
function last ( model: Model, from: number, bottom: number ): number {

    let found = from;

    for ( let index = from; index < model.count; index += 1 ) if ( (model.offsets[index] ?? 0) < bottom ) found = index;

    return found;

}
function window ( model: Model, scroll: number, viewport: number ): { first: number; last: number } {

    const top = topOf(model, scroll, viewport);
    const head = first(model, top);

    return { first: head, last: last(model, head, top + extent(viewport)) };

}

describe("fuzz virtual", () => {

    it("a layout's offsets, sizes and total equal a linear walk, fixed or varied", () => {

        fc.assert(fc.property(shape, ( given ) => {

            const { made, model } = build(given);

            expect(made.count).toBe(model.count);
            expect(close(made.total, model.total)).toBe(true);
            expect(made.offsets.length).toBe(model.count);
            expect(made.sizes.length).toBe(model.count);

            for ( let index = 0; index < model.count; index += 1 ) {

                expect(close(made.offsets[index] ?? -1, model.offsets[index] ?? -2)).toBe(true);
                expect(made.sizes[index]).toBe(model.sizes[index]);
                expect(virtual.item(made, index)).toEqual({ index, offset: made.offsets[index] ?? 0, size: made.sizes[index] ?? 0 });

            }

            expect([virtual.item(made, -1), virtual.item(made, model.count), virtual.item(made, 0.5), virtual.item(made, Number.NaN)]).toEqual([undefined, undefined, undefined, undefined]);
            expect(made.offsets).toBe(made.offsets);

        }), { numRuns: runs });

    });
    it("range, visible, indexAt and reached agree with a linear scan of the rows crossing the open span", () => {

        fc.assert(fc.property(shape, position, room, fc.integer({ min: 0, max: 200 }), ( given, scroll, viewport, margin ) => {

            const { made, model } = build(given);

            if ( model.count === 0 ) {

                expect(virtual.range(made, scroll, viewport)).toEqual({ first: 0, last: -1 });
                expect(virtual.visible(made, scroll, viewport)).toEqual({ start: 0, end: -1, items: [], total: made.total, before: 0, after: 0 });
                expect(virtual.indexAt(made, scroll)).toBe(-1);

                return;

            }

            const expected = window(model, scroll, viewport);
            const seen = virtual.visible(made, scroll, viewport);
            const start = Math.max(0, expected.first - given.overscan);
            const end = Math.min(model.count - 1, expected.last + given.overscan);

            expect(virtual.range(made, scroll, viewport)).toEqual(expected);
            expect([seen.start, seen.end, seen.items.length]).toEqual([start, end, end - start + 1]);
            expect(seen.items.map(( item ) => item.index)).toEqual(Array.from({ length: end - start + 1 }, ( _, at ) => start + at));
            expect(close(seen.before, model.offsets[start] ?? 0)).toBe(true);
            expect(close(seen.after, Math.max(0, model.total - ((model.offsets[end] ?? 0) + (model.sizes[end] ?? 0))))).toBe(true);
            expect(virtual.indexAt(made, scroll)).toBe(first(model, Number.isNaN(scroll) ? 0 : scroll));

            const top = topOf(model, scroll, viewport);

            expect(virtual.reached(made, scroll, viewport, margin)).toEqual({ start: top <= margin, end: top + extent(viewport) >= model.total - margin });

        }), { numRuns: runs });

    });
    it("offsetFor lands the row where the alignment says, clamps into the scrollable span and leaves a row already in view alone", () => {

        fc.assert(fc.property(shape, fc.integer({ min: -3, max: 45 }), room, position, fc.constantFrom<virtual.Align>("start", "center", "end", "auto"), ( given, index, viewport, current, align ) => {

            const { made, model } = build(given);
            const space = extent(viewport);
            const max = model.total > space ? model.total - space : 0;
            const here = Math.min(Math.max(Number.isNaN(current) ? 0 : current, 0), max);
            const answer = virtual.offsetFor(made, index, viewport, align, current);

            if ( model.count === 0 ) {

                expect(answer).toBe(here);

                return;

            }

            const at = Math.min(Math.max(Math.trunc(index) || 0, 0), model.count - 1);
            const offset = model.offsets[at] ?? 0;
            const size = model.sizes[at] ?? 0;
            const clamp = ( value: number ): number => Math.min(Math.max(value, 0), max);

            expect(answer >= 0 && answer <= max).toBe(true);

            if ( align === "start" ) expect(close(answer, clamp(offset))).toBe(true);
            else if ( align === "end" ) expect(close(answer, clamp(offset + size - space))).toBe(true);
            else if ( align === "center" ) expect(close(answer, clamp(offset + size / 2 - space / 2))).toBe(true);
            else if ( (offset >= here && offset + size <= here + space) || (offset <= here && offset + size >= here + space) ) expect(answer).toBe(here);
            else if ( size <= space ) expect(close(answer, clamp(offset < here ? offset : offset + size - space))).toBe(true);
            else expect(close(answer, clamp(offset < here ? offset + size - space : offset))).toBe(true);

        }), { numRuns: runs });

    });
    it("stuck finds the last header at or above the top and shifts it by the next header, anchor keeps a row still", () => {

        fc.assert(fc.property(shape, shape, fc.array(fc.integer({ min: 0, max: 45 }), { maxLength: 8 }), position, fc.integer({ min: -2, max: 45 }), ( given, other, picked, scroll, index ) => {

            const { made, model } = build(given);
            const after = build(other);
            const headers = [...new Set(picked)].sort(( a, b ) => a - b);
            const top = Number.isNaN(scroll) ? 0 : scroll;
            const inside = ( at: number | undefined, count: number ): at is number => at !== undefined && Number.isInteger(at) && at >= 0 && at < count;
            let found = -1;

            for ( let at = 0; at < headers.length; at += 1 ) {

                const header = headers[at] as number;

                if ( inside(header, model.count) && (model.offsets[header] ?? 0) <= top ) found = at;

            }

            const got = virtual.stuck(made, headers, scroll);

            if ( found === -1 ) expect(got).toBeUndefined();
            else {

                const header = headers[found] as number;
                const next = headers[found + 1];
                const shift = inside(next, model.count) ? Math.min(0, (model.offsets[next] ?? 0) - top - (model.sizes[header] ?? 0)) : 0;

                expect(got?.index).toBe(header);
                expect(close(got?.shift ?? Number.NaN, shift)).toBe(true);
                expect(virtual.sticky(made, headers, scroll)).toBe(header);

            }

            const from = Number.isNaN(scroll) ? 0 : scroll;
            const kept = inside(index, model.count) && inside(index, after.model.count) ? from + ((after.model.offsets[index] ?? 0) - (model.offsets[index] ?? 0)) : from;

            expect(close(virtual.anchor(made, after.made, scroll, index), Math.max(0, kept))).toBe(true);

        }), { numRuns: runs });

    });
    it("grids place every index once in row-major order, rows clamp, and fit never exceeds the width", () => {

        fc.assert(fc.property(fc.integer({ min: 0, max: 60 }), fc.oneof(fc.integer({ min: 1, max: 8 }), fc.constant(0), fc.constant(-2), fc.constant(2.7)), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 20 }), fc.array(fc.integer({ min: -1, max: 70 }), { maxLength: 6 }), ( count, columns, width, gap, picked ) => {

            const made = virtual.grid(count, columns, width, gap);
            const across = Math.max(1, Math.trunc(columns));
            const rows = Math.ceil(count / across);

            expect([made.columns, made.rows]).toEqual([across, rows]);

            for ( const index of [...picked, Number.NaN, 1e9] ) expect(made.row(index)).toBe(Math.min(Math.max(0, rows - 1), Math.floor(Math.max(0, Math.trunc(index) || 0) / across)));

            const shown = picked.map(( row ) => ({ index: row, offset: row * 10, size: 10 }));
            const cells = made.cells(shown);

            for ( const cell of cells ) {

                expect([cell.index >= 0 && cell.index < count, cell.row * across + cell.column, cell.offset]).toEqual([true, cell.index, cell.column * (width + gap)]);

            }

            const everything = made.cells(Array.from({ length: rows }, ( _, row ) => ({ index: row, offset: 0, size: 1 })));

            expect(everything.map(( cell ) => cell.index)).toEqual(Array.from({ length: count }, ( _, at ) => at));

        }), { numRuns: runs });
        fc.assert(fc.property(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 600 }), fc.integer({ min: 0, max: 40 }), ( width, least, gap ) => {

            const made = virtual.fit(width, least, gap);

            expect([made.columns >= 1, Number.isInteger(made.columns), made.width >= 0]).toEqual([true, true, true]);
            expect(made.width * made.columns + gap * (made.columns - 1) <= width + 1e-6 || made.columns === 1).toBe(true);

            if ( least > 0 && width >= least ) expect(made.width + 1e-6 >= least || made.columns === 1).toBe(true);

        }), { numRuns: runs });

    });
    it("measures answer like a map keyed by the item key, with a running mean", () => {

        const act = fc.oneof(
            fc.record({ kind: fc.constant("set" as const), index: fc.integer({ min: -1, max: 6 }), size: fc.oneof(fc.integer({ min: -5, max: 100 }), fc.constant(Number.NaN), fc.constant(Number.POSITIVE_INFINITY), fc.constant(2.5)) }),
            fc.record({ kind: fc.constant("drop" as const), index: fc.integer({ min: -1, max: 6 }) }),
            fc.constant({ kind: "clear" as const }),
        );

        fc.assert(fc.property(fc.array(act, { maxLength: 20 }), fc.boolean(), ( acts, keyed ) => {

            const key = keyed ? ( index: number ): string => `k${index % 3}` : ( index: number ): number => index;
            const made = virtual.measures(key);
            const model = new Map<unknown, number>();
            let version = 0;

            for ( const step of acts ) {

                if ( step.kind === "set" ) {

                    const sound = Number.isInteger(step.index) && step.index >= 0 && Number.isFinite(step.size) && step.size >= 0;
                    const changed = sound && model.get(key(step.index)) !== step.size;

                    expect(made.set(step.index, step.size)).toBe(changed);

                    if ( changed ) {

                        model.set(key(step.index), step.size);
                        version += 1;

                    }

                } else if ( step.kind === "drop" ) {

                    const had = model.has(key(step.index));

                    expect(made.drop(step.index)).toBe(had);

                    if ( had ) {

                        model.delete(key(step.index));
                        version += 1;

                    }

                } else {

                    made.clear();

                    if ( model.size > 0 ) version += 1;

                    model.clear();

                }

                const sum = [...model.values()].reduce(( total, size ) => total + size, 0);

                expect([made.count(), made.version()]).toEqual([model.size, version]);
                expect(close(made.estimate(42), model.size > 0 ? sum / model.size : 42)).toBe(true);

                for ( let index = 0; index < 7; index += 1 ) expect([made.get(index), made.sizer(9)(index)]).toEqual([model.get(key(index)), model.get(key(index)) ?? 9]);

            }

        }), { numRuns: runs });

    });

});
