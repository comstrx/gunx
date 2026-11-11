import * as number from "engine-number";

export type Scalar = string | number | bigint | boolean | null | undefined;
export type Key<T> = keyof T | (( item: T ) => Scalar);
export type Direction = "asc" | "desc";
export type Order<T> = { by: Key<T>; direction?: Direction | undefined };
export type Changes<T> = { added: T[]; removed: T[]; kept: T[] };

const settings: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };
const collators = new Map<string, Intl.Collator>();
const longest = 10_000_000;

function collator ( locale: string ): Intl.Collator {

    const found = collators.get(locale);

    if ( found ) return found;
    if ( collators.size >= 64 ) collators.clear();

    let crafted: Intl.Collator;

    try {

        crafted = new Intl.Collator(locale.replace(/_/g, "-"), settings);

    } catch {

        crafted = new Intl.Collator("en", settings);

    }

    collators.set(locale, crafted);

    return crafted;

}
function told ( value: unknown ): string {

    try {

        return String(value);

    } catch {

        return Object.prototype.toString.call(value);

    }

}
function packed ( value: unknown ): string {

    try {

        return JSON.stringify(value) ?? told(value);

    } catch {

        return told(value);

    }

}
function measured ( value: unknown ): number | bigint | undefined {

    if ( typeof value === "number" || typeof value === "bigint" ) return value;

    return value instanceof Date ? value.getTime() : undefined;

}
function absent ( value: Scalar ): boolean {

    return value === null || value === undefined || Number.isNaN(value);

}
function inside ( items: readonly unknown[], index: number ): boolean {

    return Number.isInteger(index) && index >= 0 && index < items.length;

}

export function keyOf<T> ( item: T, key: Key<T> ): Scalar {

    if ( typeof key === "function" ) return key(item);
    if ( item === null || item === undefined ) return undefined;

    const value: unknown = (item as Record<PropertyKey, unknown>)[key];

    if ( value === null || value === undefined ) return value;
    if ( typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" ) return value;

    return value instanceof Date ? value.getTime() : packed(value);

}
export function compare ( a: unknown, b: unknown, locale = "en" ): number {

    if ( a === b ) return 0;
    if ( a === undefined || a === null ) return 1;
    if ( b === undefined || b === null ) return -1;
    if ( typeof a === "boolean" && typeof b === "boolean" ) return Number(a) - Number(b);

    const left = measured(a);
    const right = measured(b);

    if ( left === undefined || right === undefined ) return collator(locale).compare(told(a), told(b));

    const leftLost = Number.isNaN(left);
    const rightLost = Number.isNaN(right);

    if ( leftLost || rightLost ) return leftLost === rightLost ? 0 : leftLost ? 1 : -1;

    return left < right ? -1 : left > right ? 1 : 0;

}
export function chunk<T> ( items: readonly T[], size: number ): T[][] {

    const width = size >= 1 ? Math.floor(size) : 1;
    const out: T[][] = [];

    for ( let index = 0; index < items.length; index += width ) out.push(items.slice(index, index + width));

    return out;

}
export function unique<T> ( items: readonly T[] ): T[] {

    return [...new Set(items)];

}
export function uniqueBy<T> ( items: readonly T[], key: Key<T> ): T[] {

    const seen = new Set<unknown>();
    const out: T[] = [];

    for ( const item of items ) {

        const found = keyOf(item, key);

        if ( seen.has(found) ) continue;

        seen.add(found);
        out.push(item);

    }

    return out;

}
export function duplicates<T> ( items: readonly T[], key?: Key<T> ): T[] {

    const seen = new Set<unknown>();
    const out: T[] = [];

    for ( const item of items ) {

        const found = key === undefined ? item : keyOf(item, key);

        if ( seen.has(found) ) out.push(item);
        else seen.add(found);

    }

    return out;

}
export function groupBy<T> ( items: readonly T[], key: Key<T> ): Record<string, T[]> {

    const out = new Map<string, T[]>();

    for ( const item of items ) {

        const name = String(keyOf(item, key));
        const bucket = out.get(name);

        if ( bucket ) bucket.push(item);
        else out.set(name, [item]);

    }

    return Object.fromEntries(out);

}
export function indexBy<T> ( items: readonly T[], key: Key<T> ): Record<string, T> {

    return Object.fromEntries(items.map(( item ) => [String(keyOf(item, key)), item]));

}
export function partition<T> ( items: readonly T[], test: ( item: T, index: number ) => boolean ): [T[], T[]] {

    const yes: T[] = [];
    const no: T[] = [];

    items.forEach(( item, index ) => {

        (test(item, index) ? yes : no).push(item);

    });

    return [yes, no];

}
export function sortBy<T> ( items: readonly T[], key: Key<T>, direction: Direction = "asc", locale = "en" ): T[] {

    return sortByMany(items, [{ by: key, direction }], locale);

}
export function sortByMany<T> ( items: readonly T[], orders: readonly Order<T>[], locale = "en" ): T[] {

    const turns = orders.map(( order ) => (order.direction === "desc" ? -1 : 1));
    const rows = items.map(( item, index ) => ({ item, index, keys: orders.map(( order ) => keyOf(item, order.by)) }));

    return rows.sort(( a, b ) => {

        for ( let at = 0; at < turns.length; at += 1 ) {

            const left = a.keys[at];
            const right = b.keys[at];
            const leftMissing = absent(left);
            const rightMissing = absent(right);

            if ( leftMissing && rightMissing ) continue;
            if ( leftMissing || rightMissing ) return leftMissing ? 1 : -1;

            const result = compare(left, right, locale);

            if ( result !== 0 ) return result * (turns[at] ?? 1);

        }

        return a.index - b.index;

    }).map(( row ) => row.item);

}
export function sortNatural ( items: readonly string[], locale = "en" ): string[] {

    return [...items].sort(collator(locale).compare);

}
export function range ( from: number, to: number, step = 1 ): number[] {

    if ( !Number.isFinite(from) || !Number.isFinite(to) ) return [];

    const stride = Math.abs(step) || 1;
    const steps = Math.abs(to - from) / stride;
    const count = number.near(steps, Math.round(steps)) ? Math.round(steps) : Math.floor(steps);

    if ( count === 0 ) return [from];
    if ( count >= longest ) throw new RangeError(`a range too long to hold: ${count + 1}`);

    const turn = from <= to ? stride : 0 - stride;
    const whole = Number.isInteger(from) && Number.isInteger(stride);

    return Array.from({ length: count + 1 }, ( _, index ) => (whole ? from + index * turn : number.snap(from + index * turn, stride, from)));

}
export function zip<A, B> ( left: readonly A[], right: readonly B[] ): [A, B][] {

    const count = Math.min(left.length, right.length);
    const out: [A, B][] = [];

    for ( let index = 0; index < count; index += 1 ) out.push([left[index] as A, right[index] as B]);

    return out;

}
export function move<T> ( items: readonly T[], from: number, to: number ): T[] {

    const out = [...items];

    if ( !inside(out, from) || !inside(out, to) ) return out;

    const [moved] = out.splice(from, 1);

    out.splice(to, 0, moved as T);

    return out;

}
export function upsertBy<T> ( items: readonly T[], item: T, key: Key<T> ): T[] {

    const wanted = keyOf(item, key);
    const at = items.findIndex(( found ) => keyOf(found, key) === wanted);

    return at === -1 ? [...items, item] : items.map(( found, index ) => (index === at ? item : found));

}
export function mergeBy<T> ( items: readonly T[], incoming: readonly T[], key: Key<T> ): T[] {

    const out = [...items];
    const seats = new Map<unknown, number>();

    out.forEach(( item, index ) => {

        const name = keyOf(item, key);

        if ( !seats.has(name) ) seats.set(name, index);

    });

    for ( const item of incoming ) {

        const name = keyOf(item, key);
        const at = seats.get(name);

        if ( at === undefined ) seats.set(name, out.push(item) - 1);
        else out[at] = item;

    }

    return out;

}
export function removeBy<T> ( items: readonly T[], key: Key<T>, value: unknown ): T[] {

    return items.filter(( item ) => keyOf(item, key) !== value);

}
export function differenceBy<T> ( left: readonly T[], right: readonly T[], key: Key<T> ): T[] {

    const gone = new Set(right.map(( item ) => keyOf(item, key)));

    return left.filter(( item ) => !gone.has(keyOf(item, key)));

}
export function intersectionBy<T> ( left: readonly T[], right: readonly T[], key: Key<T> ): T[] {

    const kept = new Set(right.map(( item ) => keyOf(item, key)));

    return uniqueBy(left, key).filter(( item ) => kept.has(keyOf(item, key)));

}
export function unionBy<T> ( left: readonly T[], right: readonly T[], key: Key<T> ): T[] {

    return uniqueBy([...left, ...right], key);

}
export function changes<T> ( before: readonly T[], after: readonly T[], key?: Key<T> ): Changes<T> {

    const read = ( item: T ): unknown => (key === undefined ? item : keyOf(item, key));
    const old = new Set(before.map(read));
    const fresh = new Set(after.map(read));

    return {
        added: after.filter(( item ) => !old.has(read(item))),
        removed: before.filter(( item ) => !fresh.has(read(item))),
        kept: after.filter(( item ) => old.has(read(item))),
    };

}
export function sumBy<T> ( items: readonly T[], key: Key<T> ): number {

    return number.sum(items.map(( item ) => number.finite(keyOf(item, key))));

}
