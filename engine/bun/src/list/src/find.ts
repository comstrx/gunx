import * as number from "engine-number";
import * as string from "engine-string";
import { type Key, keyOf } from "./core.ts";

export type Where<T> = Partial<{ [K in keyof T]: T[K] | readonly T[K][] }>;

function matches<T> ( item: T, criteria: Where<T> ): boolean {

    for ( const name of Object.keys(criteria) as (keyof T)[] ) {

        const wanted = criteria[name];
        const actual = (item as Partial<T> | null | undefined)?.[name];

        if ( Array.isArray(wanted) ? !wanted.includes(actual) : actual !== wanted ) return false;

    }

    return true;

}
export function where<T> ( items: readonly T[], criteria: Where<T> ): T[] {

    return items.filter(( item ) => matches(item, criteria));

}
export function whereNot<T> ( items: readonly T[], criteria: Where<T> ): T[] {

    return items.filter(( item ) => !matches(item, criteria));

}
export function findBy<T> ( items: readonly T[], key: Key<T>, value: unknown ): T | undefined {

    return items.find(( item ) => keyOf(item, key) === value);

}
export function sole<T> ( items: readonly T[], test: ( item: T, index: number ) => boolean = () => true ): T | undefined {

    const found = items.filter(test);

    return found.length === 1 ? found[0] : undefined;

}
export function pluck<T, K extends keyof T> ( items: readonly T[], key: K ): T[K][] {

    return items.map(( item ) => item[key]);

}
export function countBy<T> ( items: readonly T[], key: Key<T> ): Record<string, number> {

    const out = new Map<string, number>();

    for ( const item of items ) {

        const name = String(keyOf(item, key));

        out.set(name, (out.get(name) ?? 0) + 1);

    }

    return Object.fromEntries(out);

}
export function minBy<T> ( items: readonly T[], key: Key<T> ): T | undefined {

    let best: T | undefined;
    let low = Number.POSITIVE_INFINITY;

    for ( const item of items ) {

        const value = number.finite(keyOf(item, key), Number.POSITIVE_INFINITY);

        if ( value < low ) [best, low] = [item, value];

    }

    return best;

}
export function maxBy<T> ( items: readonly T[], key: Key<T> ): T | undefined {

    let best: T | undefined;
    let high = Number.NEGATIVE_INFINITY;

    for ( const item of items ) {

        const value = number.finite(keyOf(item, key), Number.NEGATIVE_INFINITY);

        if ( value > high ) [best, high] = [item, value];

    }

    return best;

}
export function averageBy<T> ( items: readonly T[], key: Key<T> ): number {

    return number.mean(items.map(( item ) => number.finite(keyOf(item, key))));

}
export function search<T> ( items: readonly T[], query: string, read: ( item: T ) => string ): T[] {

    const needle = string.fold(query.trim());

    if ( needle === "" ) return [...items];

    return items.filter(( item ) => string.fold(read(item)).includes(needle));

}
