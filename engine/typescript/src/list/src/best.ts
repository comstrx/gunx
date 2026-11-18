import type { Ranked } from "./arch.ts";

export function best<T> ( items: Iterable<T>, compare: ( a: T, b: T ) => number, limit = 10 ): T[] {

    const size = Number.isNaN(limit) ? 10 : Math.max(0, Math.trunc(limit));

    if ( size === 0 ) return [];
    if ( size === Number.POSITIVE_INFINITY || (Array.isArray(items) && size >= items.length) ) return Array.from(items).sort(compare);

    const heap: Ranked<T>[] = [];
    const order = ( a: Ranked<T>, b: Ranked<T> ): number => compare(a.item, b.item) || a.index - b.index;
    let index = 0;

    for ( const item of items ) {

        const position = index++;

        if ( heap.length < size ) {

            const row = { item, index: position };
            let at = heap.length;

            heap.push(row);

            while ( at > 0 ) {

                const parent = Math.floor((at - 1) / 2);
                const above = heap[parent] as Ranked<T>;

                if ( order(above, row) >= 0 ) break;

                heap[at] = above;
                at = parent;

            }

            heap[at] = row;

        } else {

            const row = heap[0] as Ranked<T>;

            if ( (compare(item, row.item) || 0) >= 0 ) continue;

            row.item = item;
            row.index = position;

            let at = 0;

            while ( at * 2 + 1 < heap.length ) {

                let child = at * 2 + 1;

                if ( child + 1 < heap.length && order(heap[child + 1] as Ranked<T>, heap[child] as Ranked<T>) > 0 ) child += 1;
                if ( order(row, heap[child] as Ranked<T>) >= 0 ) break;

                heap[at] = heap[child] as Ranked<T>;
                at = child;

            }

            heap[at] = row;

        }

    }

    return heap.sort(order).map(( row ) => row.item);

}
