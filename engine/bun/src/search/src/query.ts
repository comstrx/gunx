import * as json from "engine-json";
import * as list from "engine-list";
import * as string from "engine-string";
import { count, ordered } from "./index_.ts";

export type Operator = ":" | "=" | "!=" | ">" | ">=" | "<" | "<=";
export type Filter = { field: string; operator: Operator; value: string; negated: boolean };
export type Parsed = { terms: string[]; filters: Filter[]; text: string };
export type Scope = { fields?: readonly string[] | undefined };
export type Segment = { text: string; hit: boolean };
export type Facet = { value: string; count: number };

type Piece = { text: string; head: string; literal: boolean };
type Wanted = { text: string; number: number | undefined };
type Scalar = number | string;
type Folded = { text: string; from: number[]; to: number[] };

const filterPattern = /^(-?)([a-zA-Z_][a-zA-Z0-9_.]*)(>=|<=|!=|:|=|>|<)/;
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const plain = /^[\t\n\r\x20-\x7e]*$/;
const lows = new Map<string, string>();

function pieces ( text: string ): Piece[] {

    if ( !text.includes('"') ) return text.split(/\s+/).filter(Boolean).map(( part ) => ({ text: part, head: part, literal: false }));

    const out: Piece[] = [];
    let body = "";
    let head: string | undefined;
    let open = false;
    let quoted = false;
    let literal = false;
    let run = 0;

    for ( let at = 0; at <= text.length; at += 1 ) {

        const code = at < text.length ? text.charCodeAt(at) : 32;
        const quote = code === 34;
        const blank = code === 32 || (code >= 9 && code <= 13) || (code > 127 && (text[at] ?? "").trim() === "");

        if ( !quote && at < text.length && (open || !blank) ) continue;

        body += text.slice(run, at);
        run = at + 1;

        if ( quote ) {

            literal = literal || (body === "" && !quoted);
            head = head ?? body;
            quoted = true;
            open = !open;

            continue;

        }

        if ( body !== "" ) out.push({ text: body, head: head ?? body, literal });

        body = "";
        head = undefined;
        quoted = false;
        literal = false;

    }

    return out;

}
function numeric ( text: string ): number | undefined {

    const trimmed = string.asciiDigits(text.trim());

    if ( !decimal.test(trimmed) ) return undefined;

    const read = Number(trimmed);

    return Number.isFinite(read) ? read : undefined;

}
function scalar ( value: unknown ): Scalar | undefined {

    if ( typeof value === "string" ) return value;
    if ( typeof value === "number" ) return Number.isFinite(value) ? value : undefined;
    if ( typeof value === "boolean" ) return value ? "true" : "false";
    if ( typeof value === "bigint" ) return String(value);
    if ( value instanceof Date ) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();

    return undefined;

}
function order ( actual: Scalar, wanted: Wanted ): number | undefined {

    if ( typeof actual === "number" ) return wanted.number === undefined ? undefined : Math.sign(actual - wanted.number);

    const read = wanted.number === undefined ? undefined : numeric(actual);

    return read !== undefined && wanted.number !== undefined ? Math.sign(read - wanted.number) : ordered(string.fold(actual), wanted.text);

}
function judge ( operator: Operator, wanted: Wanted ): ( actual: Scalar ) => boolean {

    switch ( operator ) {
        case ":": return ( actual ) => wanted.text !== "" && string.fold(String(actual)).includes(wanted.text);
        case "=":
        case "!=": return ( actual ) => order(actual, wanted) === 0;
        case ">": return ( actual ) => order(actual, wanted) === 1;
        case "<": return ( actual ) => order(actual, wanted) === -1;
        case ">=": return ( actual ) => (order(actual, wanted) ?? -1) >= 0;
        case "<=": return ( actual ) => (order(actual, wanted) ?? 1) <= 0;
        default: return () => false;
    }

}
function compile ( given: Filter ): ( row: unknown ) => boolean {

    const one = judge(given.operator, { text: string.fold(given.value), number: numeric(given.value) });
    const flip = (given.operator === "!=") !== given.negated;
    const keys = json.pathKeys(given.field);
    const any = ( actual: unknown, depth: number ): boolean => {

        if ( Array.isArray(actual) ) return depth < 4 && actual.some(( item ) => any(item, depth + 1));

        const read = scalar(actual);

        return read !== undefined && one(read);

    };

    return ( row ) => any(json.pathGet(row, keys), 0) !== flip;

}
function sigma ( text: string ): string {

    return text.replace(/ς/g, "σ");

}
function lowered ( sign: string ): string {

    if ( sign.charCodeAt(0) < 128 ) return sign.toLowerCase();

    const known = lows.get(sign);

    if ( known !== undefined ) return known;

    const low = sigma(string.fold(sign));

    if ( lows.size >= 4096 ) lows.clear();

    lows.set(sign, low);

    return low;

}
function folded ( text: string ): Folded {

    const from: number[] = [];
    const to: number[] = [];
    let out = "";
    let at = 0;

    for ( const sign of text ) {

        const next = at + sign.length;
        const low = lowered(sign);

        for ( let back = to.length - 1; low === "" && back >= 0 && to[back] === at; back -= 1 ) to[back] = next;

        for ( let unit = 0; unit < low.length; unit += 1 ) {

            from.push(at);
            to.push(next);

        }

        out += low;
        at = next;

    }

    return { text: out, from, to };

}

export function parse ( text: string, scope: Scope = {} ): Parsed {

    const allowed = scope.fields ? new Set(scope.fields) : undefined;
    const terms: string[] = [];
    const filters: Filter[] = [];

    for ( const piece of pieces(text) ) {

        const found = piece.literal ? null : filterPattern.exec(piece.head);
        const field = found?.[2] ?? "";
        const operator = (found?.[3] ?? ":") as Operator;
        const value = found ? piece.text.slice(found[0].length) : "";
        const link = operator === ":" && value.startsWith("//");

        if ( found && value !== "" && !link && (!allowed || allowed.has(field)) ) filters.push({ field, operator, value, negated: found[1] === "-" });
        else if ( piece.text.trim() ) terms.push(piece.text);

    }

    return { terms, filters, text: terms.join(" ") };

}
export function matcher<T = unknown> ( filters: readonly Filter[] ): ( row: T ) => boolean {

    const tests = filters.map(compile);

    return ( row ) => tests.every(( test ) => test(row));

}
export function filter<T> ( rows: readonly T[], filters: readonly Filter[] ): T[] {

    const keep = matcher<T>(filters);

    return rows.filter(( row ) => keep(row));

}
export function highlight ( text: string, query: string ): Segment[] {

    const needles = [...new Set(string.tokens(query).map(sigma))].sort(( a, b ) => b.length - a.length);

    if ( needles.length === 0 || text === "" ) return [{ text, hit: false }];

    const hay = plain.test(text) ? undefined : folded(text);
    const low = hay ? hay.text : text.toLowerCase();
    const next = needles.map(( needle ) => low.indexOf(needle));
    const out: Segment[] = [];
    let cursor = 0;
    let at = 0;

    for ( ; ; ) {

        let pick = -1;

        for ( let turn = 0; turn < needles.length; turn += 1 ) {

            let where = next[turn] ?? -1;

            if ( where !== -1 && where < at ) {

                where = low.indexOf(needles[turn] ?? "", at);
                next[turn] = where;

            }

            if ( where !== -1 && (pick === -1 || where < (next[pick] ?? -1)) ) pick = turn;

        }

        if ( pick === -1 ) break;

        const needle = needles[pick] ?? "";

        at = next[pick] ?? 0;

        const start = hay ? (hay.from[at] ?? 0) : at;
        const end = hay ? (hay.to[at + needle.length - 1] ?? text.length) : at + needle.length;

        if ( start > cursor ) out.push({ text: text.slice(cursor, start), hit: false });

        const last = out[out.length - 1];

        if ( last?.hit ) last.text += text.slice(cursor, end);
        else if ( end > cursor ) out.push({ text: text.slice(Math.max(start, cursor), end), hit: true });

        cursor = Math.max(cursor, end);
        at += needle.length;

    }

    if ( cursor < text.length ) out.push({ text: text.slice(cursor), hit: false });

    return out;

}
export function facets<T> ( rows: readonly T[], field: string, limit = 50 ): Facet[] {

    const counts = new Map<string, number>();
    const keys = json.pathKeys(field);
    const seen: string[] = [];

    for ( const row of rows ) {

        const value: unknown = json.pathGet(row, keys);
        const many = Array.isArray(value);

        seen.length = 0;

        for ( let at = 0; at < (many ? value.length : 1); at += 1 ) {

            const read = scalar(many ? value[at] : value);
            const text = read === undefined ? "" : String(read);

            if ( text === "" || (many && seen.includes(text)) ) continue;

            seen.push(text);
            counts.set(text, (counts.get(text) ?? 0) + 1);

        }

    }

    return list.take([...counts].map(([value, total]) => ({ value, count: total })).sort(( a, b ) => b.count - a.count || ordered(a.value, b.value)), count(limit, 50));

}
