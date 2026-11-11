import * as string from "engine-string";

export type Catalog<T> = {
    readonly all: readonly T[];
    readonly size: number;
    get: ( key: string ) => T | undefined;
    has: ( key: string ) => boolean;
    keys: () => string[];
    search: ( query: string, limit?: number ) => T[];
    pick: ( keys: readonly string[] ) => T[];
    where: ( test: ( item: T ) => boolean ) => T[];
};

type Indexed = { texts: readonly string[]; weights: readonly number[] };
type Scored<T> = { item: T; index: number; value: number; weight: number };

function named ( key: string ): string {

    return key.trim().toLowerCase();

}

export function catalog<T> ( items: readonly T[], keyOf: ( item: T ) => string, fields: ( item: T ) => readonly string[], weight: ( item: T ) => number = () => 0 ): Catalog<T> {

    let seats: Map<string, T> | undefined;
    let indexed: Indexed | undefined;

    const seated = (): Map<string, T> => {

        seats ??= new Map(items.map(( item ) => [named(keyOf(item)), item]));

        return seats;

    };
    const read = (): Indexed => {

        indexed ??= { texts: items.map(( item ) => string.bare(fields(item).filter(Boolean).join(" "))), weights: items.map(weight) };

        return indexed;

    };
    const search = ( query: string, limit = 10 ): T[] => {

        const most = Number.isNaN(limit) ? 10 : Math.max(0, limit);

        if ( query.trim() === "" ) return items.slice(0, most);

        const needle = string.bare(query);
        const { texts, weights } = read();
        const found: Scored<T>[] = [];

        items.forEach(( item, index ) => {

            const value = string.grade(texts[index] ?? "", needle);

            if ( value >= 0.3 ) found.push({ item, index, value, weight: weights[index] ?? 0 });

        });

        return found.sort(( a, b ) => b.value - a.value || b.weight - a.weight || a.index - b.index).slice(0, most).map(( entry ) => entry.item);

    };

    return {
        all: items,
        size: items.length,
        get: ( key ) => seated().get(named(key)),
        has: ( key ) => seated().has(named(key)),
        keys: () => items.map(keyOf),
        search,
        pick: ( keys ) => keys.flatMap(( key ) => {

            const found = seated().get(named(key));

            return found === undefined ? [] : [found];

        }),
        where: ( test ) => items.filter(test),
    };

}
