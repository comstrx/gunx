import { type Layout, offsetOf, sizeOf, type Visible, visible } from "./layout.ts";

export type Table = { rows: Visible; columns: Visible };
export type Stuck = { index: number; shift: number };

function inside ( made: Layout, index: number | undefined ): index is number {

    return index !== undefined && Number.isInteger(index) && index >= 0 && index < made.count;

}

export function anchor ( before: Layout, after: Layout, scroll: number, index: number ): number {

    const from = Number.isNaN(scroll) ? 0 : scroll;

    return Math.max(0, inside(before, index) && inside(after, index) ? from + (offsetOf(after, index) - offsetOf(before, index)) : from);

}
export function stuck ( made: Layout, headers: readonly number[], scroll: number ): Stuck | undefined {

    const top = Number.isNaN(scroll) ? 0 : scroll;
    let low = 0;
    let high = headers.length - 1;
    let found = -1;

    while ( low <= high ) {

        const middle = Math.floor((low + high) / 2);
        const index = headers[middle];

        if ( inside(made, index) && offsetOf(made, index) <= top ) {

            found = middle;
            low = middle + 1;

        } else high = middle - 1;

    }

    const index = headers[found];
    const next = headers[found + 1];

    if ( index === undefined ) return undefined;

    return { index, shift: inside(made, next) ? Math.min(0, offsetOf(made, next) - top - sizeOf(made, index)) : 0 };

}
export function sticky ( made: Layout, headers: readonly number[], scroll: number ): number | undefined {

    return stuck(made, headers, scroll)?.index;

}
export function table ( rows: Layout, columns: Layout, scrollTop: number, scrollLeft: number, viewport: { width: number; height: number } ): Table {

    return { rows: visible(rows, scrollTop, viewport.height), columns: visible(columns, scrollLeft, viewport.width) };

}
