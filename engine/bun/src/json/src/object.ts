export type Dictionary = Record<string, unknown>;
export type Kind = "null" | "boolean" | "number" | "string" | "list" | "record" | "undefined" | "other";
export type StringifyOptions = { pretty?: boolean | number | undefined; stable?: boolean | undefined };

const unsafe = new Set(["__proto__", "constructor", "prototype"]);
const index = /^(?:0|[1-9]\d*)$/;
const poisoned = /__proto__|\\u00(?:5f|6f|7[024])/i;
const loop = "[Circular]";

export const poison = "__proto__";

export function isRecord ( value: unknown ): value is Dictionary {

    return typeof value === "object" && value !== null && !Array.isArray(value);

}
export function isPlain ( value: unknown ): value is Dictionary {

    if ( !isRecord(value) ) return false;

    const proto = Object.getPrototypeOf(value) as unknown;

    return proto === null || proto === Object.prototype;

}
export function isScalar ( value: unknown ): value is string | number | boolean | null {

    return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

}
function sound ( value: unknown, held: Set<object> ): boolean {

    if ( isScalar(value) ) return true;
    if ( !(Array.isArray(value) || isPlain(value)) || held.has(value) ) return false;

    held.add(value);

    const fine = Array.isArray(value) ? value.every(( item ) => sound(item, held)) : Object.values(value).every(( item ) => item === undefined || sound(item, held));

    held.delete(value);

    return fine;

}
export function isJson ( value: unknown ): boolean {

    return sound(value, new Set());

}
export function kindOf ( value: unknown ): Kind {

    if ( value === null ) return "null";
    if ( value === undefined ) return "undefined";
    if ( Array.isArray(value) ) return "list";
    if ( isRecord(value) ) return "record";
    if ( typeof value === "number" ) return Number.isFinite(value) ? "number" : "other";
    if ( typeof value === "string" || typeof value === "boolean" ) return typeof value as Kind;

    return "other";

}
export function safeKey ( key: string ): boolean {

    return !unsafe.has(key);

}
export function isIndex ( key: string ): boolean {

    return index.test(key);

}
export function parse ( text: string ): unknown {

    try {

        return poisoned.test(text) ? JSON.parse(text, ( key, value: unknown ) => (key === poison ? undefined : value)) : JSON.parse(text);

    } catch {

        return undefined;

    }

}
function told ( value: object ): unknown {

    const read = (value as { toJSON?: unknown }).toJSON;

    return typeof read === "function" ? (read.call(value) as unknown) : value;

}
function settled ( value: unknown, stable: boolean, held: Set<object> ): unknown {

    if ( typeof value === "bigint" ) return String(value);
    if ( typeof value !== "object" || value === null ) return value;
    if ( held.has(value) ) return loop;

    held.add(value);

    const plain = Array.isArray(value) ? value : told(value);
    const out = Array.isArray(plain) ? plain.map(( item: unknown ) => settled(item, stable, held)) : plain === value ? keyed(value, stable, held) : settled(plain, stable, held);

    held.delete(value);

    return out;

}
function keyed ( value: object, stable: boolean, held: Set<object> ): Dictionary {

    const out: Dictionary = {};
    const keys = stable ? Object.keys(value).sort() : Object.keys(value);

    for ( const key of keys ) if ( key !== poison ) out[key] = settled((value as Dictionary)[key], stable, held);

    return out;

}
function tolerant ( value: unknown, stable: boolean, space: number | undefined ): string {

    try {

        return JSON.stringify(settled(value, stable, new Set()), undefined, space) ?? "null";

    } catch {

        return "null";

    }

}
export function stringify ( value: unknown, options: StringifyOptions = {} ): string {

    const space = options.pretty === true ? 2 : typeof options.pretty === "number" ? options.pretty : undefined;

    if ( options.stable ) return tolerant(value, true, space);

    try {

        return JSON.stringify(value, undefined, space) ?? "null";

    } catch {

        return tolerant(value, false, space);

    }

}
function copied ( value: unknown, seen: Map<object, unknown> ): unknown {

    if ( typeof value !== "object" || value === null ) return value;
    if ( seen.has(value) ) return seen.get(value);
    if ( value instanceof Date ) return new Date(value.getTime());

    if ( Array.isArray(value) ) {

        const out: unknown[] = [];

        seen.set(value, out);

        for ( const item of value ) out.push(copied(item, seen));

        return out;

    }

    if ( value instanceof Map ) {

        const out = new Map<unknown, unknown>();

        seen.set(value, out);

        for ( const [key, item] of value ) out.set(copied(key, seen), copied(item, seen));

        return out;

    }

    if ( value instanceof Set ) {

        const out = new Set<unknown>();

        seen.set(value, out);

        for ( const item of value ) out.add(copied(item, seen));

        return out;

    }

    if ( !isPlain(value) ) return value;

    const out: Dictionary = {};

    seen.set(value, out);

    for ( const key of Object.keys(value) ) if ( key !== poison ) out[key] = copied(value[key], seen);

    return out;

}
export function clone<T> ( value: T ): T {

    if ( typeof value !== "object" || value === null ) return value;

    try {

        return structuredClone(value);

    } catch {

        return copied(value, new Map()) as T;

    }

}
export function pick<T extends object, K extends keyof T> ( value: T, keys: readonly K[] ): Pick<T, K> {

    const out = {} as Pick<T, K>;

    for ( const key of keys ) if ( key !== poison && Object.hasOwn(value, key) ) out[key] = value[key];

    return out;

}
export function omit<T extends object, K extends keyof T> ( value: T, keys: readonly K[] ): Omit<T, K> {

    const gone = new Set<PropertyKey>(keys);
    const out = {} as Record<PropertyKey, unknown>;

    for ( const key of Object.keys(value) ) if ( key !== poison && !gone.has(key) ) out[key] = (value as Record<string, unknown>)[key];

    return out as Omit<T, K>;

}
export function compact<T extends Dictionary> ( value: T ): Partial<T> {

    const out: Dictionary = {};

    for ( const [key, item] of Object.entries(value) ) if ( item !== undefined && key !== poison ) out[key] = item;

    return out as Partial<T>;

}
export function prune<T> ( value: T ): Partial<T> {

    if ( Array.isArray(value) ) return value.filter(( item ) => item !== undefined && item !== null).map(( item ) => prune(item)) as unknown as Partial<T>;
    if ( !isPlain(value) ) return value as Partial<T>;

    const out: Dictionary = {};

    for ( const [key, item] of Object.entries(value) ) {

        if ( item === undefined || item === null || item === "" || key === poison ) continue;

        const kept = prune(item);

        if ( isPlain(kept) && Object.keys(kept).length === 0 ) continue;
        if ( Array.isArray(kept) && kept.length === 0 ) continue;

        out[key] = kept;

    }

    return out as Partial<T>;

}
export function mapValues<T, R> ( value: Readonly<Record<string, T>>, map: ( item: T, key: string ) => R ): Record<string, R> {

    const out: Record<string, R> = {};

    for ( const [key, item] of Object.entries(value) ) if ( key !== poison ) out[key] = map(item, key);

    return out;

}
export function deepMerge<T extends Dictionary> ( base: T, ...patches: readonly Dictionary[] ): T & Dictionary {

    const out: Dictionary = { ...base };

    for ( const patch of patches ) {

        for ( const [key, item] of Object.entries(patch) ) {

            if ( !safeKey(key) ) continue;

            const current = out[key];

            out[key] = isPlain(current) && isPlain(item) ? deepMerge(current, item) : item === undefined ? current : item;

        }

    }

    return out as T & Dictionary;

}
export function pathKeys ( path: string | readonly string[] ): string[] {

    return typeof path === "string" ? path.split(".").filter(Boolean) : [...path];

}
export function pathGet ( value: unknown, path: string | readonly string[] ): unknown {

    let cursor: unknown = value;

    for ( const key of typeof path === "string" ? pathKeys(path) : path ) {

        if ( !safeKey(key) ) return undefined;
        if ( Array.isArray(cursor) ) cursor = isIndex(key) ? cursor[Number(key)] : undefined;
        else if ( isRecord(cursor) ) cursor = Object.hasOwn(cursor, key) ? cursor[key] : undefined;
        else return undefined;

    }

    return cursor;

}
export function pathSet<T extends Dictionary> ( value: T, path: string | readonly string[], item: unknown ): T {

    const keys = pathKeys(path);

    if ( keys.length === 0 || keys.some(( key ) => !safeKey(key)) ) return value;

    const out: Dictionary = { ...value };
    let cursor: Dictionary | unknown[] = out;

    for ( const [at, key] of keys.entries() ) {

        if ( Array.isArray(cursor) && (!isIndex(key) || Number(key) > cursor.length) ) return value;

        const holder = cursor as Dictionary;

        if ( at === keys.length - 1 ) {

            holder[key] = item;

            break;

        }

        const next = Object.hasOwn(holder, key) ? holder[key] : undefined;
        const copy: Dictionary | unknown[] = Array.isArray(next) ? [...next] : isRecord(next) ? { ...next } : keys[at + 1] === "0" ? [] : {};

        holder[key] = copy;
        cursor = copy;

    }

    return out as T;

}
export function pathUpdate<T extends Dictionary> ( value: T, path: string | readonly string[], map: ( item: unknown ) => unknown ): T {

    return pathSet(value, path, map(pathGet(value, path)));

}
