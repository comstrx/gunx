import * as string from "engine-string";
import type { Catalog, Indexed, Scored } from "./arch.ts";
import { best } from "./best.ts";

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

        if ( most < 1 ) return [];
        if ( query.trim() === "" ) return items.slice(0, most);

        const needle = string.bare(query);
        const { texts, weights } = read();
        function* candidates (): Generator<Scored<T>> {

            for ( let index = 0; index < items.length; index += 1 ) {

                if ( !(index in items) ) continue;

                const value = string.grade(texts[index] ?? "", needle);

                if ( value >= 0.3 ) yield { item: items[index] as T, index, value, weight: weights[index] ?? 0 };

            }

        }

        return best(candidates(), ( a, b ) => b.value - a.value || b.weight - a.weight || a.index - b.index, most).map(( entry ) => entry.item);

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
