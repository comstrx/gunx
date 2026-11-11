import { fold } from "./fold.ts";

export type Closest<T> = { item: T; distance: number; similarity: number } | undefined;

const astral = /[\ud800-\udfff]/;

export function distance ( a: string, b: string, max = Number.POSITIVE_INFINITY ): number {

    if ( a === b ) return 0;

    const wide = astral.test(a) || astral.test(b);
    const left: ArrayLike<string> = wide ? [...a] : a;
    const right: ArrayLike<string> = wide ? [...b] : b;
    const limit = max >= 0 ? Math.trunc(max) : Number.POSITIVE_INFINITY;
    let head = 0;
    let rows = left.length;
    let columns = right.length;

    while ( head < rows && head < columns && left[head] === right[head] ) head += 1;

    while ( rows > head && columns > head && left[rows - 1] === right[columns - 1] ) {

        rows -= 1;
        columns -= 1;

    }

    rows -= head;
    columns -= head;

    if ( Math.abs(rows - columns) > limit ) return limit + 1;
    if ( rows === 0 || columns === 0 ) return rows + columns;

    let previous = Array.from({ length: columns + 1 }, ( _, index ) => index);
    let current = new Array<number>(columns + 1).fill(0);

    for ( let row = 1; row <= rows; row += 1 ) {

        const sign = left[head + row - 1];
        let least = row;

        current[0] = row;

        for ( let column = 1; column <= columns; column += 1 ) {

            const cost = sign === right[head + column - 1] ? 0 : 1;
            const cell = Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, (previous[column - 1] ?? 0) + cost);

            current[column] = cell;

            if ( cell < least ) least = cell;

        }

        if ( least > limit ) return limit + 1;

        [previous, current] = [current, previous];

    }

    return Math.min(previous[columns] ?? 0, limit + 1);

}
export function similarity ( a: string, b: string ): number {

    const longest = Math.max([...a].length, [...b].length);

    return longest === 0 ? 1 : 1 - distance(a, b) / longest;

}
function bigrams ( text: string ): Map<string, number> {

    const found = new Map<string, number>();
    const letters = [...text];

    for ( let index = 0; index < letters.length - 1; index += 1 ) {

        const pair = `${letters[index]}${letters[index + 1]}`;

        found.set(pair, (found.get(pair) ?? 0) + 1);

    }

    return found;

}
export function dice ( a: string, b: string ): number {

    if ( a === b ) return 1;
    if ( [...a].length < 2 || [...b].length < 2 ) return 0;

    const left = bigrams(a);
    const right = bigrams(b);
    let shared = 0;

    for ( const [pair, amount] of left ) shared += Math.min(amount, right.get(pair) ?? 0);

    const total = [...left.values()].reduce(( sum, amount ) => sum + amount, 0) + [...right.values()].reduce(( sum, amount ) => sum + amount, 0);

    return (2 * shared) / total;

}
export function isSimilar ( a: string, b: string, floor = 0.8 ): boolean {

    return similarity(fold(a), fold(b)) >= floor;

}
export function closest<T> ( items: readonly T[], query: string, read: ( item: T ) => string, floor = 0 ): Closest<T> {

    const needle = fold(query);
    const size = [...needle].length;
    let best: Closest<T>;

    for ( const item of items ) {

        const word = fold(read(item));
        const gap = distance(word, needle);
        const longest = Math.max([...word].length, size);
        const alike = longest === 0 ? 1 : 1 - gap / longest;

        if ( alike < floor ) continue;
        if ( best === undefined || gap < best.distance ) best = { item, distance: gap, similarity: alike };

    }

    return best;

}
