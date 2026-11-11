import * as number from "engine-number";

export type Shape = { count: number; size: number | (( index: number ) => number); gap?: number | undefined; paddingStart?: number | undefined; paddingEnd?: number | undefined; overscan?: number | undefined };
export type Layout = { readonly count: number; readonly offsets: readonly number[]; readonly sizes: readonly number[]; readonly total: number; readonly overscan: number };
export type Item = { index: number; offset: number; size: number };
export type Range = { first: number; last: number };
export type Visible = { start: number; end: number; items: Item[]; total: number; before: number; after: number };
export type Reached = { start: boolean; end: boolean };
export type Align = "start" | "center" | "end" | "auto";
export type Measures = {
    get: ( index: number ) => number | undefined;
    set: ( index: number, size: number ) => boolean;
    drop: ( index: number ) => boolean;
    sizer: ( fallback: number ) => ( index: number ) => number;
    estimate: ( fallback: number ) => number;
    count: () => number;
    version: () => number;
    clear: () => void;
};

type Flat = { start: number; size: number; step: number };

const flats = new WeakMap<Layout, Flat>();

export function whole ( value: number ): number {

    if ( !Number.isFinite(value) ) throw new RangeError("not a count");

    return Math.max(0, Math.trunc(value));

}
export function length ( value: number ): number {

    return Math.max(0, number.finite(value));

}
export function extent ( value: number ): number {

    return Number.isNaN(value) ? 0 : Math.max(0, value);

}
function spare ( value: number | undefined ): number {

    return value === undefined || Number.isNaN(value) ? 3 : Math.max(0, Math.trunc(value));

}
function offsetAt ( made: Layout, flat: Flat | undefined, index: number ): number {

    return flat ? flat.start + index * flat.step : (made.offsets[index] ?? 0);

}
function sizeAt ( made: Layout, flat: Flat | undefined, index: number ): number {

    return flat ? flat.size : (made.sizes[index] ?? 0);

}
function even ( count: number, flat: Flat, total: number, overscan: number ): Layout {

    let offsets: number[] | undefined;
    let sizes: number[] | undefined;
    const made: Layout = {
        count,
        total,
        overscan,
        get offsets (): readonly number[] {

            if ( offsets ) return offsets;

            const filled: number[] = new Array(count);

            for ( let index = 0; index < count; index += 1 ) filled[index] = flat.start + index * flat.step;

            offsets = filled;

            return filled;

        },
        get sizes (): readonly number[] {

            if ( sizes ) return sizes;

            const filled: number[] = new Array(count);

            for ( let index = 0; index < count; index += 1 ) filled[index] = flat.size;

            sizes = filled;

            return filled;

        },
    };

    flats.set(made, flat);

    return made;

}
function firstAt ( made: Layout, flat: Flat | undefined, position: number ): number {

    const edge = made.count - 1;

    if ( flat ) {

        if ( flat.step === 0 ) return flat.start > position ? 0 : edge;

        let index = number.clamp(Math.floor((position - flat.start - flat.size) / flat.step) + 1, 0, edge);

        while ( index > 0 && flat.start + (index - 1) * flat.step + flat.size > position ) index -= 1;
        while ( index < edge && flat.start + index * flat.step + flat.size <= position ) index += 1;

        return index;

    }

    let low = 0;
    let high = edge;

    while ( low < high ) {

        const middle = Math.floor((low + high) / 2);

        if ( (made.offsets[middle] ?? 0) + (made.sizes[middle] ?? 0) <= position ) low = middle + 1;
        else high = middle;

    }

    return low;

}
function lastAt ( made: Layout, flat: Flat | undefined, from: number, bottom: number ): number {

    const edge = made.count - 1;

    if ( flat ) {

        if ( flat.step === 0 ) return flat.start < bottom ? edge : from;

        let index = number.clamp(Math.ceil((bottom - flat.start) / flat.step) - 1, from, edge);

        while ( index > from && flat.start + index * flat.step >= bottom ) index -= 1;
        while ( index < edge && flat.start + (index + 1) * flat.step < bottom ) index += 1;

        return index;

    }

    let low = from;
    let high = edge;

    while ( low < high ) {

        const middle = Math.floor((low + high + 1) / 2);

        if ( (made.offsets[middle] ?? 0) < bottom ) low = middle;
        else high = middle - 1;

    }

    return low;

}
function topOf ( made: Layout, scroll: number, room: number ): number {

    return made.total > room && scroll > 0 ? Math.min(scroll, made.total - room) : 0;

}
function shown ( made: Layout, flat: Flat | undefined, scroll: number, viewport: number ): Range {

    const room = extent(viewport);
    const top = topOf(made, scroll, room);
    const first = firstAt(made, flat, top);

    return { first, last: lastAt(made, flat, first, top + room) };

}

export function offsetOf ( made: Layout, index: number ): number {

    return offsetAt(made, flats.get(made), index);

}
export function sizeOf ( made: Layout, index: number ): number {

    return sizeAt(made, flats.get(made), index);

}
export function layout ( shape: Shape ): Layout {

    const { size } = shape;
    const count = whole(shape.count);
    const gap = length(shape.gap ?? 0);
    const start = length(shape.paddingStart ?? 0);
    const end = length(shape.paddingEnd ?? 0);
    const overscan = spare(shape.overscan);

    if ( typeof size === "number" ) {

        const each = length(size);

        return even(count, { start, size: each, step: each + gap }, start + count * each + Math.max(0, count - 1) * gap + end, overscan);

    }

    const edge = count - 1;
    const sizes: number[] = new Array(count);
    const offsets: number[] = new Array(count);
    let cursor = start;

    for ( let index = 0; index < count; index += 1 ) {

        const each = length(size(index));

        offsets[index] = cursor;
        sizes[index] = each;
        cursor += index < edge ? each + gap : each;

    }

    return { count, offsets, sizes, total: cursor + end, overscan };

}
export function item ( made: Layout, index: number ): Item | undefined {

    if ( !Number.isInteger(index) || index < 0 || index >= made.count ) return undefined;

    const flat = flats.get(made);

    return { index, offset: offsetAt(made, flat, index), size: sizeAt(made, flat, index) };

}
export function indexAt ( made: Layout, position: number ): number {

    return made.count === 0 ? -1 : firstAt(made, flats.get(made), Number.isNaN(position) ? 0 : position);

}
export function range ( made: Layout, scroll: number, viewport: number ): Range {

    return made.count === 0 ? { first: 0, last: -1 } : shown(made, flats.get(made), scroll, viewport);

}
export function visible ( made: Layout, scroll: number, viewport: number ): Visible {

    if ( made.count === 0 ) return { start: 0, end: -1, items: [], total: made.total, before: 0, after: 0 };

    const flat = flats.get(made);
    const { first, last } = shown(made, flat, scroll, viewport);
    const start = Math.max(0, first - made.overscan);
    const end = Math.min(made.count - 1, last + made.overscan);
    const items: Item[] = [];

    for ( let index = start; index <= end; index += 1 ) items.push({ index, offset: offsetAt(made, flat, index), size: sizeAt(made, flat, index) });

    return { start, end, items, total: made.total, before: offsetAt(made, flat, start), after: Math.max(0, made.total - (offsetAt(made, flat, end) + sizeAt(made, flat, end))) };

}
export function reached ( made: Layout, scroll: number, viewport: number, margin = 0 ): Reached {

    const room = extent(viewport);
    const near = length(margin);
    const top = topOf(made, scroll, room);

    return { start: top <= near, end: top + room >= made.total - near };

}
export function offsetFor ( made: Layout, index: number, viewport: number, align: Align = "auto", current = 0 ): number {

    const room = extent(viewport);
    const max = made.total > room ? made.total - room : 0;
    const here = number.clamp(current || 0, 0, max);

    if ( made.count === 0 ) return here;

    const flat = flats.get(made);
    const at = number.clamp(Math.trunc(index) || 0, 0, made.count - 1);
    const offset = offsetAt(made, flat, at);
    const size = sizeAt(made, flat, at);
    const end = offset + size;
    const bottom = here + room;

    if ( align === "start" ) return number.clamp(offset, 0, max);
    if ( align === "end" ) return number.clamp(end - room, 0, max);
    if ( align === "center" ) return number.clamp(offset + size / 2 - room / 2, 0, max);
    if ( (offset >= here && end <= bottom) || (offset <= here && end >= bottom) ) return here;

    return number.clamp((offset < here) === (size <= room) ? offset : end - room, 0, max);

}
export function measures ( key: ( index: number ) => unknown = ( index ) => index ): Measures {

    const known = new Map<unknown, number>();
    let version = 0;
    let sum = 0;

    return {
        get: ( index ) => known.get(key(index)),
        set: ( index, size ) => {

            if ( !Number.isInteger(index) || index < 0 || !Number.isFinite(size) || size < 0 ) return false;

            const name = key(index);
            const had = known.get(name);

            if ( had === size ) return false;

            known.set(name, size);
            sum += size - (had ?? 0);
            version += 1;

            return true;

        },
        drop: ( index ) => {

            const name = key(index);
            const had = known.get(name);

            if ( had === undefined ) return false;

            known.delete(name);
            sum -= had;
            version += 1;

            return true;

        },
        sizer: ( fallback ) => ( index ) => known.get(key(index)) ?? fallback,
        estimate: ( fallback ) => (known.size > 0 ? sum / known.size : fallback),
        count: () => known.size,
        version: () => version,
        clear: () => {

            if ( known.size === 0 ) return;

            known.clear();
            sum = 0;
            version += 1;

        },
    };

}
