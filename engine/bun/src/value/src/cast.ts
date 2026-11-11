import * as calendar from "engine-date";
import * as json from "engine-json";
import * as string from "engine-string";
import { ungrouped } from "./exact.ts";

export type Scalar = string | number | boolean | null;
export type Kind = "null" | "boolean" | "integer" | "number" | "date" | "text" | "list" | "record";
export type Kinds = { null: null; boolean: boolean; integer: number; number: number; date: Date; text: string; list: string[]; record: json.Dictionary };

const truthy = new Set(["true", "1", "yes", "y", "on", "نعم"]);
const falsy = new Set(["false", "0", "no", "n", "off", "لا"]);
const wholeShape = /^[+-]?\d+$/;
const numberShape = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const dateShape = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const separators = /[,،\n]/;
const longest = 256;
const casts: { [K in Kind]: ( value: unknown ) => Kinds[K] | undefined } = {
    null: ( value ) => (scalar(value) === null ? null : undefined),
    boolean: judged,
    integer: counted,
    number: measured,
    date: dated,
    text: worded,
    list: ( value ) => list(value),
    record: keyed,
};

function clean ( value: unknown ): string {

    if ( typeof value !== "string" ) return typeof value === "number" || typeof value === "bigint" || typeof value === "boolean" ? String(value) : "";

    const word = value.trim();

    return word.length > longest ? "" : string.asciiDigits(word);

}
function worded ( value: unknown ): string | undefined {

    if ( typeof value === "string" ) return value.trim() || undefined;
    if ( typeof value === "number" ) return Number.isFinite(value) ? String(value) : undefined;
    if ( typeof value === "boolean" || typeof value === "bigint" ) return String(value);

    return calendar.valid(value) ? value.toISOString() : undefined;

}
function judged ( value: unknown ): boolean | undefined {

    if ( typeof value === "boolean" ) return value;
    if ( typeof value === "number" ) return value === 1 ? true : value === 0 ? false : undefined;

    const word = clean(value).toLowerCase();

    return truthy.has(word) ? true : falsy.has(word) ? false : undefined;

}
function counted ( value: unknown ): number | undefined {

    const word = typeof value === "number" ? "" : ungrouped(clean(value)) ?? "";
    const found = typeof value === "number" ? Math.trunc(value) : wholeShape.test(word) ? Number(word) : Number.NaN;

    return Number.isSafeInteger(found) ? found || 0 : undefined;

}
function measured ( value: unknown ): number | undefined {

    const word = typeof value === "number" ? "" : ungrouped(clean(value)) ?? "";
    const found = typeof value === "number" ? value : numberShape.test(word) ? Number(word) : Number.NaN;

    return Number.isFinite(found) ? found || 0 : undefined;

}
function dated ( value: unknown ): Date | undefined {

    if ( value instanceof Date || typeof value === "number" ) return calendar.from(value);

    return typeof value === "string" ? calendar.from(clean(value)) : undefined;

}
function keyed ( value: unknown ): json.Dictionary | undefined {

    if ( json.isPlain(value) ) return value;

    const word = typeof value === "string" ? value.trim() : "";
    const found = word.startsWith("{") ? json.parse(word) : undefined;

    return json.isPlain(found) ? found : undefined;

}
function each ( values: readonly unknown[] ): string[] {

    return values.flatMap(( value ) => worded(value) ?? []);

}
export function text<F extends string | undefined = undefined> ( value: unknown, fallback?: F ): string | F {

    return worded(value) ?? (fallback as F);

}
export function boolean<F extends boolean | undefined = undefined> ( value: unknown, fallback?: F ): boolean | F {

    return judged(value) ?? (fallback as F);

}
export function integer<F extends number | undefined = undefined> ( value: unknown, fallback?: F ): number | F {

    return counted(value) ?? (fallback as F);

}
export function number<F extends number | undefined = undefined> ( value: unknown, fallback?: F ): number | F {

    return measured(value) ?? (fallback as F);

}
export function date<F extends Date | undefined = undefined> ( value: unknown, fallback?: F ): Date | F {

    return dated(value) ?? (fallback as F);

}
export function record<F extends json.Dictionary | undefined = undefined> ( value: unknown, fallback?: F ): json.Dictionary | F {

    return keyed(value) ?? (fallback as F);

}
export function list ( value: unknown, separator: string | RegExp = separators ): string[] {

    if ( Array.isArray(value) ) return each(value);
    if ( value instanceof Set ) return each([...value]);
    if ( typeof value !== "string" ) return each([value]);

    const word = value.trim();
    const found = word.startsWith("[") ? json.parse(word) : undefined;

    return Array.isArray(found) ? each(found) : word.split(separator).map(( item ) => item.trim()).filter(Boolean);

}
export function listOf<T> ( value: unknown, item: ( word: string ) => T | undefined, separator?: string | RegExp ): T[] {

    return list(value, separator).flatMap(( word ) => {

        const found = item(word);

        return found === undefined ? [] : [found];

    });

}
export function oneOf<const T extends string, F extends T | undefined = undefined> ( value: unknown, options: readonly T[], fallback?: F ): T | F {

    const word = worded(value);
    const folded = word?.toLowerCase();

    return options.find(( option ) => option === word) ?? options.find(( option ) => option.toLowerCase() === folded) ?? (fallback as F);

}
export function scalar ( value: unknown ): Scalar {

    if ( typeof value === "boolean" ) return value;
    if ( typeof value === "number" ) return Number.isFinite(value) ? value : null;

    const word = worded(value);

    if ( word === undefined || word === "null" ) return null;
    if ( word === "true" || word === "false" ) return word === "true";

    const found = Number(word);

    return Number.isFinite(found) && String(found) === word ? found : word;

}
export function kind ( value: unknown ): Kind {

    if ( Array.isArray(value) || value instanceof Set ) return "list";
    if ( json.isPlain(value) ) return "record";

    const found = scalar(value);

    if ( found === null ) return "null";
    if ( typeof found === "boolean" ) return "boolean";
    if ( typeof found === "number" ) return Number.isInteger(found) ? "integer" : "number";

    return dateShape.test(found) && calendar.from(found) !== undefined ? "date" : "text";

}
export function cast<K extends Kind> ( wanted: K, value: unknown ): Kinds[K] | undefined {

    return casts[wanted](value);

}
