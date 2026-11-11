import * as auth from "engine-auth";
import * as json from "engine-json";
import * as string from "engine-string";
import type { Reference, Scalar, Test, Value, When } from "./shapes.ts";

export type Context = {
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    signals: json.Dictionary;
    form: json.Dictionary;
    user: json.Dictionary | null;
    device: json.Dictionary;
    settings: json.Dictionary;
    locale: string;
    event: json.Dictionary;
    flow: Flow;
};
export type Flow = { step: string; index: number; first: boolean; last: boolean; done: boolean };
export type Translate = ( key: string ) => string;

type Cut = { at: number; mark: string };

const words: readonly string[] = [" in ", " has ", " like "];
const kinds: ReadonlySet<string> = new Set(["param", "query", "signal", "form", "user", "setting", "path", "text"]);
const before: ReadonlySet<string> = new Set([" ", "\t", "=", "<", ">", ",", "("]);
const numeric = /^-?\d+(?:\.\d+)?$/;
const deepest = 32;
const globs = new WeakMap<Test, readonly string[]>();

function opens ( text: string, at: number ): boolean {

    const mark = text[at];

    return (mark === "\"" || mark === "'") && (at === 0 || before.has(text[at - 1] as string)) && text.indexOf(mark, at + 1) !== -1;

}
function balanced ( text: string ): boolean {

    let quote = "";
    let depth = 0;

    if ( !text.includes("(") ) return false;

    for ( let at = 0; at < text.length; at += 1 ) {

        const char = text[at] as string;

        if ( quote !== "" ) {

            if ( char === quote ) quote = "";

        } else if ( opens(text, at) ) quote = char;
        else if ( char === "(" ) depth += 1;
        else if ( char === ")" ) {

            depth -= 1;

            if ( depth < 0 ) return false;

        }

    }

    return depth === 0;

}
function pieces ( text: string, mark: string, nested: boolean ): string[] {

    const made: string[] = [];
    let quote = "";
    let depth = 0;
    let from = 0;

    if ( !text.includes(mark) ) return text.trim() === "" ? [] : [text.trim()];

    for ( let at = 0; at < text.length; at += 1 ) {

        const char = text[at] as string;

        if ( quote !== "" ) {

            if ( char === quote ) quote = "";

        } else if ( opens(text, at) ) quote = char;
        else if ( nested && char === "(" ) depth += 1;
        else if ( nested && char === ")" ) depth -= 1;
        else if ( depth === 0 && text.startsWith(mark, at) ) {

            const part = text.slice(from, at).trim();

            if ( part !== "" ) made.push(part);

            from = at + mark.length;
            at = from - 1;

        }

    }

    const last = text.slice(from).trim();

    if ( last !== "" ) made.push(last);

    return made;

}
function wrapped ( text: string ): boolean {

    let quote = "";
    let depth = 0;

    if ( !text.startsWith("(") || !text.endsWith(")") ) return false;

    for ( let at = 0; at < text.length - 1; at += 1 ) {

        const char = text[at] as string;

        if ( quote !== "" ) {

            if ( char === quote ) quote = "";

        } else if ( opens(text, at) ) quote = char;
        else if ( char === "(" ) depth += 1;
        else if ( char === ")" ) {

            depth -= 1;

            if ( depth === 0 ) return false;

        }

    }

    return depth === 1;

}
function scalar ( text: string ): Scalar {

    const clean = text.trim();
    const first = clean[0];

    if ( clean.length > 1 && (first === "\"" || first === "'") && clean.endsWith(first) ) return clean.slice(1, -1);
    if ( clean === "null" ) return null;
    if ( clean === "true" ) return true;
    if ( clean === "false" ) return false;

    const amount = numeric.test(clean) ? Number(clean) : Number.NaN;

    return Number.isFinite(amount) ? amount : clean;

}
function cut ( text: string ): Cut | undefined {

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code === 32 ) {

            for ( const word of words ) {

                if ( text.startsWith(word, at) ) return { at, mark: word };

            }

        } else if ( code === 61 ) return { at, mark: "=" };
        else if ( code === 60 || code === 62 || code === 33 ) {

            const paired = text.charCodeAt(at + 1) === 61;

            if ( paired || code !== 33 ) return { at, mark: paired ? text.slice(at, at + 2) : text[at] as string };

        }

    }

    return undefined;

}
function tested ( text: string ): When {

    if ( text.startsWith("can:") ) return { is: "user.abilities", can: text.slice(4).trim() };

    const found = cut(text);

    if ( !found ) return { is: text, empty: false };

    const left = text.slice(0, found.at).trim();
    const rest = text.slice(found.at + found.mark.length);

    if ( found.mark === " in " ) {

        const options = pieces(rest, ",", false).map(scalar);

        return left.endsWith(" not") ? { not: { is: left.slice(0, -4).trim(), in: options } } : { is: left, in: options };

    }

    if ( found.mark === " has " ) return { is: left, has: scalar(rest) };

    const right = scalar(rest);

    if ( found.mark === " like " ) return { is: left, like: typeof right === "string" ? right : rest.trim() };
    if ( found.mark === "=" ) return { is: left, eq: right };
    if ( found.mark === "!=" ) return { is: left, ne: right };
    if ( typeof right !== "number" ) return false;
    if ( found.mark === ">" ) return { is: left, gt: right };
    if ( found.mark === ">=" ) return { is: left, gte: right };
    if ( found.mark === "<" ) return { is: left, lt: right };

    return { is: left, lte: right };

}
function unit ( text: string, nested: boolean, depth: number ): When {

    let negated = false;
    let from = 0;

    while ( from < text.length && (text[from] === "!" || text[from] === " ") && !text.startsWith("!=", from) ) {

        if ( text[from] === "!" ) negated = !negated;

        from += 1;

    }

    const body = text.slice(from);
    const made = body === "" ? true : nested && depth < deepest && wrapped(body) ? parsed(body.slice(1, -1), nested, depth + 1) : tested(body);

    if ( !negated ) return made;

    return typeof made === "boolean" ? !made : { not: made };

}
function parsed ( text: string, nested: boolean, depth: number ): When {

    const any = pieces(text, " | ", nested);

    if ( any.length > 1 ) return { any: any.map(( part ) => parsed(part, nested, depth)) };

    const all = pieces(any[0] ?? "", " & ", nested);

    if ( all.length > 1 ) return { all: all.map(( part ) => unit(part, nested, depth)) };

    return all.length === 0 ? true : unit(all[0] as string, nested, depth);

}
function isEmpty ( value: unknown ): boolean {

    return value === undefined || value === null || value === "" || value === false || (Array.isArray(value) && value.length === 0);

}
function amountOf ( value: unknown ): number {

    if ( typeof value === "number" ) return value;

    return typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;

}
function same ( actual: unknown, wanted: Scalar ): boolean {

    if ( actual === wanted ) return true;
    if ( wanted === null ) return actual === undefined;
    if ( typeof wanted === "number" ) return typeof actual === "string" && amountOf(actual) === wanted;
    if ( typeof wanted === "boolean" ) return actual === String(wanted);

    return (typeof actual === "number" || typeof actual === "boolean") && String(actual) === wanted;

}
function holds ( actual: unknown, wanted: Scalar ): boolean {

    if ( Array.isArray(actual) ) return actual.some(( item ) => same(item, wanted));

    return typeof actual === "string" && wanted !== null && actual.includes(String(wanted));

}
function alike ( actual: unknown, rule: Test, like: string ): boolean {

    if ( typeof actual !== "string" && typeof actual !== "number" ) return false;

    const text = string.fold(String(actual));
    const known = globs.get(rule);
    const parts = known ?? string.fold(like).split("*");
    const head = parts[0] as string;
    const tail = parts[parts.length - 1] as string;
    let from = head.length;

    if ( !known ) globs.set(rule, parts);
    if ( parts.length === 1 ) return text.includes(head);
    if ( text.length < head.length + tail.length || !text.startsWith(head) || !text.endsWith(tail) ) return false;

    for ( let at = 1; at < parts.length - 1; at += 1 ) {

        const part = parts[at] as string;
        const found = text.indexOf(part, from);

        if ( found === -1 || found + part.length > text.length - tail.length ) return false;

        from = found + part.length;

    }

    return true;

}
function passes ( rule: Test, context: Context ): boolean {

    const actual = read(context, rule.is);
    const sized = rule.gt !== undefined || rule.gte !== undefined || rule.lt !== undefined || rule.lte !== undefined;
    const amount = sized ? amountOf(actual) : 0;
    let judged = sized;

    if ( Number.isNaN(amount) ) return false;

    if ( rule.can !== undefined ) {

        if ( !auth.granted(Array.isArray(actual) ? actual.filter(( item ): item is string => typeof item === "string") : [], [rule.can]) ) return false;

        judged = true;

    }

    if ( rule.empty !== undefined ) {

        if ( isEmpty(actual) !== rule.empty ) return false;

        judged = true;

    }

    if ( rule.eq !== undefined ) {

        if ( !same(actual, rule.eq) ) return false;

        judged = true;

    }

    if ( rule.ne !== undefined ) {

        if ( same(actual, rule.ne) ) return false;

        judged = true;

    }

    if ( rule.in !== undefined ) {

        if ( !rule.in.some(( option ) => same(actual, option)) ) return false;

        judged = true;

    }

    if ( rule.has !== undefined ) {

        if ( !holds(actual, rule.has) ) return false;

        judged = true;

    }

    if ( rule.like !== undefined ) {

        if ( !alike(actual, rule, rule.like) ) return false;

        judged = true;

    }

    if ( rule.gt !== undefined && !(amount > rule.gt) ) return false;
    if ( rule.gte !== undefined && !(amount >= rule.gte) ) return false;
    if ( rule.lt !== undefined && !(amount < rule.lt) ) return false;
    if ( rule.lte !== undefined && !(amount <= rule.lte) ) return false;

    return judged || !isEmpty(actual);

}

export function empty (): Context {

    return { params: {}, query: {}, signals: {}, form: {}, user: null, device: {}, settings: {}, locale: "en", event: {}, flow: { step: "", index: -1, first: true, last: true, done: false } };

}
export function when ( text: string | When ): When {

    return typeof text === "string" ? parsed(text, balanced(text), 0) : text;

}
export function pathsOf ( given: When ): string[] {

    const made: string[] = [];
    const stack: When[] = [given];

    while ( stack.length > 0 ) {

        const next = stack.pop() as When;

        if ( typeof next === "boolean" ) continue;

        if ( "not" in next ) stack.push(next.not);
        else if ( "is" in next ) made.push(next.is);
        else {

            const parts = "all" in next ? next.all : next.any;

            for ( let at = parts.length - 1; at >= 0; at -= 1 ) stack.push(parts[at] as When);

        }

    }

    return made;

}
export function isReference ( value: unknown ): value is Reference {

    if ( !json.isRecord(value) ) return false;

    const keys = Object.keys(value);
    const key = keys[0];

    return keys.length === 1 && key !== undefined && kinds.has(key) && typeof value[key] === "string";

}
export function referencePath ( reference: Reference ): string {

    if ( "param" in reference ) return `params.${reference.param}`;
    if ( "query" in reference ) return `query.${reference.query}`;
    if ( "signal" in reference ) return `signals.${reference.signal}`;
    if ( "form" in reference ) return `form.${reference.form}`;
    if ( "user" in reference ) return `user.${reference.user}`;
    if ( "setting" in reference ) return `settings.${reference.setting}`;
    if ( "text" in reference ) return `texts.${reference.text}`;

    return reference.path;

}
export function read ( context: Context, path: string ): unknown {

    return typeof path === "string" ? json.pathGet(context, path) : undefined;

}
export function resolve ( value: Value, context: Context, translate?: Translate ): unknown {

    if ( Array.isArray(value) ) return [...value];
    if ( !isReference(value) ) return value;
    if ( "text" in value ) return translate ? translate(value.text) : value.text;

    return read(context, referencePath(value));

}
export function resolveAll ( values: Readonly<Record<string, Value>> | undefined, context: Context, translate?: Translate ): json.Dictionary {

    const out: json.Dictionary = {};

    for ( const key of Object.keys(values ?? {}) ) {

        if ( json.safeKey(key) ) out[key] = resolve(values?.[key] as Value, context, translate);

    }

    return out;

}
export function evaluate ( given: When | undefined, context: Context ): boolean {

    if ( given === undefined || given === true ) return true;
    if ( given === false ) return false;
    if ( "all" in given ) return given.all.every(( part ) => evaluate(part, context));
    if ( "any" in given ) return given.any.some(( part ) => evaluate(part, context));
    if ( "not" in given ) return !evaluate(given.not, context);

    return passes(given, context);

}
