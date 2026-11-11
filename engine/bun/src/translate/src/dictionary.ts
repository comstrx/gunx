import * as json from "engine-json";
import * as number from "engine-number";
import { held, split } from "./locale.ts";

type Param = string | number | bigint | boolean | null | undefined | { readonly [key: string]: Param };
type Span = { low: number; high: number; text: string };
type Forms = { exact: Map<number, string>; ranged: Span[]; labeled: Map<string, string>; plain: string[]; last: string };
type Entry = string | Forms;
type Sheet = Map<string, Entry>;
type Slot = { name: string; whole: string; deep: boolean };
type Template = readonly (string | Slot)[];

export type Params = { readonly [key: string]: Param };
export type Messages = { [key: string]: string | Messages };
export type Dictionaries = Record<string, Messages>;
export type Translate = {
    readonly locale: string;
    readonly fallback: string;
    t: ( key: string, params?: Params, count?: number ) => string;
    find: ( key: string, params?: Params, count?: number ) => string | undefined;
    has: ( key: string, locale?: string ) => boolean;
    use: ( locale: string ) => Translate;
    missing: () => string[];
    locales: () => string[];
};

const placeholder = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}|:([a-zA-Z_][a-zA-Z0-9_]*)/g;
const exactPattern = /^(?:\[(-?\d+)\]|\{(-?\d+)\})\s*(.*)$/s;
const rangePattern = /^\[(\d+|\*),\s*(\d+|\*)\]\s*(.*)$/s;
const labelPattern = /^(zero|one|two|few|many|other):\s*(.*)$/s;
const categories: readonly number.Category[] = ["zero", "one", "two", "few", "many", "other"];
const labels = new Set<string>(categories);
const poison = "__proto__";
const deepest = 32;
const most = 1024;
const sheets = new WeakMap<object, Sheet>();
const parsed = new Map<string, Forms>();
const templates = new Map<string, Template>();

function edge ( text: string | undefined, open: number ): number {

    return text === undefined || text === "*" ? open : Number(text);

}
function formsOf ( message: string ): Forms {

    const cached = parsed.get(message);

    if ( cached ) return cached;

    const pieces = message.split("|");
    const made: Forms = { exact: new Map(), ranged: [], labeled: new Map(), plain: [], last: "" };

    for ( const piece of pieces ) {

        const form = piece.trim();
        const exact = exactPattern.exec(form);
        const range = exact ? null : rangePattern.exec(form);
        const label = exact || range ? null : labelPattern.exec(form);
        const text = exact?.[3] ?? range?.[3] ?? label?.[2] ?? (pieces.length === 1 ? message : form);

        if ( exact ) made.exact.set(Number(exact[1] ?? exact[2]), text);
        else if ( range ) made.ranged.push({ low: edge(range[1], Number.NEGATIVE_INFINITY), high: edge(range[2], Number.POSITIVE_INFINITY), text });
        else if ( label ) made.labeled.set(label[1] ?? "", text);
        else made.plain.push(text);

        made.last = text;

    }

    return held(parsed, message, made, most);

}
function templateOf ( message: string ): Template {

    const cached = templates.get(message);

    if ( cached ) return cached;

    const made: (string | Slot)[] = [];
    let at = 0;

    placeholder.lastIndex = 0;

    for ( let match = placeholder.exec(message); match !== null; match = placeholder.exec(message) ) {

        const name = match[1] ?? match[2] ?? "";

        if ( match.index > at ) made.push(message.slice(at, match.index));

        made.push({ name, whole: match[0], deep: name.includes(".") });
        at = match.index + match[0].length;

    }

    if ( at < message.length ) made.push(message.slice(at));

    return message.length > most ? made : held(templates, message, made, most);

}
function told ( slot: Slot, params: Params ): string {

    const found = slot.deep ? json.pathGet(params, slot.name) : json.safeKey(slot.name) && Object.hasOwn(params, slot.name) ? params[slot.name] : undefined;

    return typeof found === "string" ? found : typeof found === "number" || typeof found === "bigint" || typeof found === "boolean" ? String(found) : slot.whole;

}
function shaped ( branch: json.Dictionary ): Forms | undefined {

    const names = Object.keys(branch);
    const labeled = new Map<string, string>();

    if ( !Object.hasOwn(branch, "other") || names.length > categories.length ) return undefined;

    for ( const name of names ) {

        const text = branch[name];

        if ( !labels.has(name) || typeof text !== "string" ) return undefined;

        labeled.set(name, text);

    }

    return { exact: new Map(), ranged: [], labeled, plain: [], last: labeled.get("other") ?? "" };

}
function picked ( forms: Forms, count: number, locale: string ): string {

    const exact = forms.exact.get(count);

    if ( exact !== undefined ) return exact;

    for ( const span of forms.ranged ) if ( count >= span.low && count <= span.high ) return span.text;

    const category = number.category(count, locale);
    const plain = forms.plain;

    if ( forms.labeled.size ) return forms.labeled.get(category) ?? forms.labeled.get("other") ?? forms.last;
    if ( plain.length === 2 ) return (category === "one" ? plain[0] : plain[1]) ?? "";
    if ( plain.length === 3 ) return (count === 0 ? plain[0] : category === "one" ? plain[1] : plain[2]) ?? "";

    return plain[Math.min(categories.indexOf(category), plain.length - 1)] ?? forms.last;

}
function spread ( branch: json.Dictionary, prefix: string, depth: number, out: Sheet ): void {

    for ( const key of Object.keys(branch) ) {

        const value = branch[key];
        const path = prefix === "" ? key : `${prefix}.${key}`;

        if ( typeof value === "string" ) out.set(path, value);
        if ( !json.isRecord(value) || depth >= deepest ) continue;

        const forms = shaped(value);

        if ( forms ) out.set(path, forms);

        spread(value, path, depth + 1, out);

    }

}
function sheetOf ( messages: unknown ): Sheet | undefined {

    if ( !json.isRecord(messages) ) return undefined;

    const cached = sheets.get(messages);

    if ( cached ) return cached;

    const made: Sheet = new Map();

    spread(messages, "", 0, made);
    sheets.set(messages, made);

    return made;

}
function own ( dictionaries: Dictionaries, name: string ): Sheet | undefined {

    return Object.hasOwn(dictionaries, name) ? sheetOf(dictionaries[name]) : undefined;

}
function listed ( sheet: Sheet | undefined ): string[] {

    const out: string[] = [];

    for ( const [key, entry] of sheet ?? [] ) {

        const at = key.lastIndexOf(".");
        const parent = at === -1 ? undefined : sheet?.get(key.slice(0, at));

        if ( typeof entry !== "string" || parent === undefined || typeof parent === "string" ) out.push(key);

    }

    return out;

}
function fold ( name: string ): string {

    return (split(name)?.text ?? String(name)).toLowerCase();

}
function folded ( dictionaries: Dictionaries ): Map<string, string> {

    const out = new Map<string, string>();

    for ( const name of Object.keys(dictionaries) ) if ( !out.has(fold(name)) ) out.set(fold(name), name);

    return out;

}
function chain ( locale: string ): string[] {

    const found = split(locale);

    if ( !found ) return [locale];

    const { language, script, region } = found;

    return [found.text, script && region ? `${language}-${script}` : undefined, script && region ? `${language}-${region}` : undefined, script || region ? language : undefined].filter(( link ) => link !== undefined);

}
function voiced ( entry: Entry, locale: string, params: Params | undefined, count: number | undefined ): string {

    const given = params?.count;
    const amount = count ?? (typeof given === "number" ? given : undefined);

    if ( amount === undefined ) return interpolate(typeof entry === "string" ? entry : entry.last, params ?? {});

    return interpolate(picked(typeof entry === "string" ? formsOf(entry) : entry, amount, locale), count === undefined ? params ?? {} : { count, ...params });

}

export function flatten ( messages: Messages, prefix = "" ): Record<string, string> {

    const out: [string, string][] = [];

    for ( const [key, entry] of sheetOf(messages) ?? [] ) {

        const path = prefix === "" ? key : `${prefix}.${key}`;

        if ( typeof entry === "string" && path !== poison ) out.push([path, entry]);

    }

    return Object.fromEntries(out);

}
export function has ( dictionaries: Dictionaries, locale: string, key: string ): boolean {

    return own(dictionaries, locale)?.has(key) === true;

}
export function missing ( dictionaries: Dictionaries, reference: string ): Record<string, string[]> {

    const wanted = listed(own(dictionaries, reference));
    const out: [string, string[]][] = [];

    for ( const locale of Object.keys(dictionaries) ) {

        const sheet = locale === reference ? undefined : own(dictionaries, locale);
        const gone = sheet ? wanted.filter(( key ) => !sheet.has(key)) : [];

        if ( gone.length ) out.push([locale, gone]);

    }

    return Object.fromEntries(out);

}
export function plural ( message: string, count: number, locale = "en" ): string {

    return picked(formsOf(String(message)), count, locale);

}
export function interpolate ( message: string, params: Params ): string {

    if ( !message.includes("{") && !message.includes(":") ) return message;

    let out = "";

    for ( const part of templateOf(message) ) out += typeof part === "string" ? part : told(part, params);

    return out;

}
export function dictionary ( dictionaries: Dictionaries, locale: string, fallback = locale ): Translate {

    const lost = new Set<string>();
    const speak = ( current: string ): Translate => {

        const index = folded(dictionaries);
        const named = ( name: string ): string => index.get(fold(name)) ?? name;
        const names = [...new Set([...chain(current), ...chain(fallback)].map(named))];
        const find = ( key: string, params?: Params, count?: number ): string | undefined => {

            for ( const name of names ) {

                const entry = own(dictionaries, name)?.get(key);

                if ( entry !== undefined ) return voiced(entry, name, params, count);

            }

            return undefined;

        };

        return {
            locale: current,
            fallback,
            t: ( key, params, count ) => {

                const found = find(key, params, count);

                if ( found !== undefined ) return found;
                if ( lost.size < most ) lost.add(key);

                return key;

            },
            find,
            has: ( key, other ) => (other === undefined ? names : [named(other)]).some(( name ) => own(dictionaries, name)?.has(key) === true),
            use: speak,
            missing: () => [...lost].sort(),
            locales: () => Object.keys(dictionaries).sort(),
        };

    };

    return speak(locale);

}
export function translate ( messages: Messages, locale = "en" ): Translate {

    return dictionary({ [locale]: messages }, locale);

}
