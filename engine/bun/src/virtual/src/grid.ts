import { type Item, length, whole } from "./layout.ts";

export type Cell = { index: number; row: number; column: number; offset: number; size: number };
export type Fit = { columns: number; width: number };
export type Grid = { columns: number; rows: number; row: ( index: number ) => number; cells: ( rows: readonly Item[] ) => Cell[] };

export function fit ( width: number, least: number, gap = 0 ): Fit {

    const room = length(width);
    const space = length(gap);
    const track = length(least) + space;
    const columns = track > 0 ? Math.max(1, Math.floor((room + space) / track)) : 1;

    return { columns, width: Math.max(0, (room - space * (columns - 1)) / columns) };

}
export function grid ( count: number, columns: number, columnWidth: number, gap = 0 ): Grid {

    const total = whole(count);
    const width = Math.max(1, whole(columns));
    const step = length(columnWidth) + length(gap);
    const rows = Math.ceil(total / width);

    return {
        columns: width,
        rows,
        row: ( index ) => Math.min(Math.max(0, rows - 1), Math.floor(Math.max(0, Math.trunc(index) || 0) / width)),
        cells: ( shown ) => {

            const cells: Cell[] = [];

            for ( const row of shown ) {

                const from = Number.isInteger(row.index) && row.index >= 0 ? row.index * width : total;
                const to = Math.min(total, from + width);

                for ( let index = from; index < to; index += 1 ) cells.push({ index, row: row.index, column: index - from, offset: (index - from) * step, size: row.size });

            }

            return cells;

        },
    };

}
