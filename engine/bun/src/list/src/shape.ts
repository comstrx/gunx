export type Page<T> = { items: T[]; page: number; limit: number; total: number; pages: number };

function inside ( items: readonly unknown[], index: number ): boolean {

    return Number.isInteger(index) && index >= 0 && index < items.length;

}

export function compact<T> ( items: readonly (T | null | undefined | false | "" | 0)[] ): T[] {

    return items.filter(( item ): item is T => Boolean(item));

}
export function isEmpty ( items: readonly unknown[] | null | undefined ): boolean {

    return !items || items.length === 0;

}
export function first<T> ( items: readonly T[] ): T | undefined {

    return items[0];

}
export function last<T> ( items: readonly T[] ): T | undefined {

    return items[items.length - 1];

}
export function nth<T> ( items: readonly T[], index: number ): T | undefined {

    return items.at(index);

}
export function take<T> ( items: readonly T[], count: number ): T[] {

    const size = Math.trunc(count);

    return size > 0 ? items.slice(0, size) : size < 0 ? items.slice(size) : [];

}
export function skip<T> ( items: readonly T[], count: number ): T[] {

    return items.slice(Math.max(0, count));

}
export function takeWhile<T> ( items: readonly T[], test: ( item: T ) => boolean ): T[] {

    const at = items.findIndex(( item ) => !test(item));

    return at === -1 ? [...items] : items.slice(0, at);

}
export function skipWhile<T> ( items: readonly T[], test: ( item: T ) => boolean ): T[] {

    const at = items.findIndex(( item ) => !test(item));

    return at === -1 ? [] : items.slice(at);

}
export function flatten<T> ( items: readonly (T | readonly T[])[] ): T[] {

    return items.flat() as T[];

}
export function difference<T> ( left: readonly T[], right: readonly T[] ): T[] {

    const gone = new Set(right);

    return left.filter(( item ) => !gone.has(item));

}
export function intersection<T> ( left: readonly T[], right: readonly T[] ): T[] {

    const kept = new Set(right);

    return [...new Set(left)].filter(( item ) => kept.has(item));

}
export function union<T> ( ...lists: readonly (readonly T[])[] ): T[] {

    return [...new Set(lists.flat() as T[])];

}
export function without<T> ( items: readonly T[], ...gone: readonly T[] ): T[] {

    return difference(items, gone);

}
export function toggle<T> ( items: readonly T[], item: T ): T[] {

    return items.includes(item) ? items.filter(( found ) => found !== item) : [...items, item];

}
export function equal<T> ( left: readonly T[], right: readonly T[] ): boolean {

    return left.length === right.length && left.every(( item, index ) => Object.is(item, right[index]));

}
export function fill<T> ( count: number, value: T ): T[] {

    return Array.from({ length: Math.max(0, Math.trunc(count)) }, () => value);

}
export function times<T> ( count: number, make: ( index: number ) => T ): T[] {

    return Array.from({ length: Math.max(0, Math.trunc(count)) }, ( _, index ) => make(index));

}
export function insertAt<T> ( items: readonly T[], index: number, ...values: readonly T[] ): T[] {

    const at = Math.min(Math.max(0, index), items.length);

    return [...items.slice(0, at), ...values, ...items.slice(at)];

}
export function removeAt<T> ( items: readonly T[], index: number ): T[] {

    return inside(items, index) ? [...items.slice(0, index), ...items.slice(index + 1)] : [...items];

}
export function replaceAt<T> ( items: readonly T[], index: number, value: T ): T[] {

    return inside(items, index) ? items.map(( item, at ) => (at === index ? value : item)) : [...items];

}
export function swap<T> ( items: readonly T[], a: number, b: number ): T[] {

    const out = [...items];

    if ( !inside(out, a) || !inside(out, b) ) return out;

    [out[a], out[b]] = [out[b] as T, out[a] as T];

    return out;

}
export function rotate<T> ( items: readonly T[], by: number ): T[] {

    if ( items.length === 0 ) return [];

    const shift = ((by % items.length) + items.length) % items.length;

    return [...items.slice(shift), ...items.slice(0, shift)];

}
export function splitAt<T> ( items: readonly T[], index: number ): [T[], T[]] {

    const at = Math.min(Math.max(0, index), items.length);

    return [items.slice(0, at), items.slice(at)];

}
export function windows<T> ( items: readonly T[], size: number, step = 1 ): T[][] {

    const width = size >= 1 ? Math.floor(size) : 1;
    const stride = step >= 1 ? Math.floor(step) : 1;
    const out: T[][] = [];

    for ( let index = 0; index + width <= items.length; index += stride ) out.push(items.slice(index, index + width));

    return out;

}
export function pairs<T> ( items: readonly T[] ): [T, T][] {

    const out: [T, T][] = [];

    for ( let index = 0; index < items.length; index += 1 ) {

        for ( let other = index + 1; other < items.length; other += 1 ) out.push([items[index] as T, items[other] as T]);

    }

    return out;

}
export function crossJoin<A, B> ( left: readonly A[], right: readonly B[] ): [A, B][] {

    return left.flatMap(( a ) => right.map(( b ): [A, B] => [a, b]));

}
export function transpose<T> ( rows: readonly (readonly T[])[] ): T[][] {

    const width = rows.reduce(( widest, row ) => Math.max(widest, row.length), 0);

    return Array.from({ length: width }, ( _, column ) => rows.map(( row ) => row[column] as T));

}
export function paginate<T> ( items: readonly T[], page: number, limit: number ): Page<T> {

    const size = limit >= 1 ? Math.min(Math.floor(limit), Number.MAX_SAFE_INTEGER) : 1;
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = page >= 1 ? Math.min(Math.floor(page), pages) : 1;
    const start = (current - 1) * size;

    return { items: items.slice(start, start + size), page: current, limit: size, total: items.length, pages };

}
