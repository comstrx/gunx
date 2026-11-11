import * as list from "engine-list";
import { type Dictionary, stringify } from "./object.ts";

export type CsvOptions = {
    separator?: string | undefined;
    header?: boolean | undefined;
    columns?: readonly string[] | undefined;
    guard?: boolean | undefined;
};

const formula = /^[=+\-@\t\r]/;
const quotable = /["\r\n]/;

function shown ( value: unknown ): string {

    if ( value === null || value === undefined || typeof value === "function" ) return "";
    if ( value instanceof Date ) return Number.isNaN(value.getTime()) ? "" : value.toISOString();

    return typeof value === "object" ? stringify(value) : String(value);

}
function cell ( value: unknown, separator: string, guard: boolean ): string {

    const raw = shown(value);
    const text = guard && typeof value === "string" && formula.test(raw) ? `'${raw}` : raw;

    return text.includes(separator) || quotable.test(text) ? `"${text.replaceAll('"', '""')}"` : text;

}
export function toCsv ( rows: readonly Dictionary[], options: CsvOptions = {} ): string {

    const separator = options.separator || ",";
    const guard = options.guard === true;
    const columns = options.columns ?? list.unique(rows.flatMap(( row ) => Object.keys(row)));
    const lines = rows.map(( row ) => columns.map(( column ) => cell(Object.hasOwn(row, column) ? row[column] : undefined, separator, guard)).join(separator));

    if ( options.header !== false ) lines.unshift(columns.map(( column ) => cell(column, separator, guard)).join(separator));

    return lines.join("\r\n");

}
function quoted ( text: string, from: number ): [string, number] {

    let field = "";
    let index = from;

    while ( index < text.length ) {

        const close = text.indexOf('"', index);

        if ( close === -1 ) return [field + text.slice(index), text.length];

        field += text.slice(index, close);

        if ( text.charCodeAt(close + 1) !== 34 ) return [field, close + 1];

        field += '"';
        index = close + 2;

    }

    return [field, index];

}
function plain ( text: string, from: number, lead: number ): number {

    let index = from + 1;

    while ( index < text.length ) {

        const code = text.charCodeAt(index);

        if ( code === lead || code === 10 || code === 13 ) break;

        index += 1;

    }

    return index;

}
function split ( text: string, separator: string ): string[][] {

    const rows: string[][] = [];
    const lead = separator.charCodeAt(0);
    let row: string[] = [];
    let field = "";
    let fresh = true;
    let index = 0;

    while ( index < text.length ) {

        const code = text.charCodeAt(index);

        if ( code === 34 && fresh ) {

            [field, index] = quoted(text, index + 1);
            fresh = false;

        } else if ( code === lead && text.startsWith(separator, index) ) {

            row.push(field);
            field = "";
            fresh = true;
            index += separator.length;

        } else if ( code === 10 || code === 13 ) {

            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            fresh = true;
            index += code === 13 && text.charCodeAt(index + 1) === 10 ? 2 : 1;

        } else {

            const end = plain(text, index, lead);

            field += text.slice(index, end);
            fresh = false;
            index = end;

        }

    }

    if ( !fresh || row.length > 0 ) {

        row.push(field);
        rows.push(row);

    }

    return rows;

}
export function fromCsv ( text: string, options: CsvOptions = {} ): Dictionary[] {

    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = split(body, options.separator || ",").filter(( row ) => row.some(( value ) => value !== ""));
    const head = options.header === false ? undefined : rows.shift();
    const columns = options.columns ?? head ?? [];

    return rows.map(( row ) => Object.fromEntries(row.map(( value, index ) => [columns[index] ?? String(index), value])));

}
