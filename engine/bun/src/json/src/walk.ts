import { type Dictionary, isIndex, isPlain, isRecord, pathGet, pathKeys, pathSet, poison, safeKey } from "./object.ts";

export type Visit = ( value: unknown, path: string[] ) => void;
export type Change = { path: string; kind: "added" | "removed" | "changed"; from: unknown; to: unknown };

type Pairs = Map<object, Set<object>>;

const deep = 32;

function stepped ( value: unknown, visit: Visit, path: string[], held: Set<object> ): void {

    visit(value, path);

    if ( typeof value !== "object" || value === null || held.has(value) ) return;

    held.add(value);

    if ( Array.isArray(value) ) for ( let index = 0; index < value.length; index += 1 ) stepped(value[index], visit, [...path, String(index)], held);
    else for ( const [key, item] of Object.entries(value) ) stepped(item, visit, [...path, key], held);

    held.delete(value);

}
export function walk ( value: unknown, visit: Visit, path: string[] = [] ): void {

    stepped(value, visit, path, new Set());

}
export function flatten ( value: unknown, separator = "." ): Record<string, unknown> {

    const out: Record<string, unknown> = {};

    walk(value, ( item, path ) => {

        if ( path.length === 0 ) return;
        if ( (isRecord(item) && Object.keys(item).length > 0) || (Array.isArray(item) && item.length > 0) ) return;

        const key = path.join(separator);

        if ( key !== poison ) out[key] = item;

    });

    return out;

}
function listed ( node: Dictionary, made: ReadonlySet<object> ): unknown {

    const keys = Object.keys(node);

    for ( const key of keys ) {

        const item = node[key];

        if ( isRecord(item) && made.has(item) ) node[key] = listed(item, made);

    }

    return keys.length > 0 && keys.every(( key, at ) => key === String(at)) ? keys.map(( key ) => node[key]) : node;

}
export function unflatten ( value: Readonly<Record<string, unknown>>, separator = "." ): Dictionary {

    const out: Dictionary = {};
    const made = new Set<object>();

    for ( const [flat, item] of Object.entries(value) ) {

        const keys = flat.split(separator).filter(Boolean);

        if ( keys.length === 0 || keys.some(( key ) => !safeKey(key)) ) continue;

        let cursor: Dictionary = out;

        for ( const key of keys.slice(0, -1) ) {

            const next = cursor[key];
            const inner: Dictionary = !isRecord(next) ? {} : made.has(next) ? next : { ...next };

            made.add(inner);
            cursor[key] = inner;
            cursor = inner;

        }

        cursor[keys[keys.length - 1] as string] = item;

    }

    for ( const [key, item] of Object.entries(out) ) if ( isRecord(item) && made.has(item) ) out[key] = listed(item, made);

    return out;

}
function paired ( left: object, right: object, held: Pairs ): boolean {

    const known = held.get(left);

    if ( known?.has(right) ) return true;
    if ( known ) known.add(right);
    else held.set(left, new Set([right]));

    return false;

}
function special ( left: object, right: object, depth: number, held: Pairs | undefined ): boolean {

    if ( left instanceof Date ) return right instanceof Date && Object.is(left.getTime(), right.getTime());
    if ( left instanceof RegExp ) return right instanceof RegExp && String(left) === String(right);
    if ( left instanceof Set ) return right instanceof Set && left.size === right.size && [...left].every(( item ) => right.has(item));

    if ( left instanceof Map ) {

        if ( !(right instanceof Map) || left.size !== right.size ) return false;

        for ( const [key, item] of left ) if ( !right.has(key) || !alike(item, right.get(key), depth + 1, held) ) return false;

        return true;

    }

    if ( left instanceof Uint8Array ) return right instanceof Uint8Array && left.length === right.length && left.every(( byte, at ) => byte === right[at]);

    return false;

}
function alike ( left: unknown, right: unknown, depth: number, held: Pairs | undefined ): boolean {

    if ( left === right ) return true;
    if ( typeof left !== "object" || typeof right !== "object" || left === null || right === null ) return Number.isNaN(left) && Number.isNaN(right);

    const pairs = depth < deep ? held : (held ?? new Map<object, Set<object>>());

    if ( pairs && paired(left, right, pairs) ) return true;

    if ( Array.isArray(left) ) {

        if ( !Array.isArray(right) || left.length !== right.length ) return false;

        for ( let index = 0; index < left.length; index += 1 ) if ( !alike(left[index], right[index], depth + 1, pairs) ) return false;

        return true;

    }

    if ( !isPlain(left) ) return special(left, right, depth, pairs);
    if ( !isPlain(right) ) return false;

    const keys = Object.keys(left);

    if ( keys.length !== Object.keys(right).length ) return false;

    for ( const key of keys ) if ( !Object.hasOwn(right, key) || !alike(left[key], right[key], depth + 1, pairs) ) return false;

    return true;

}
export function equal ( left: unknown, right: unknown ): boolean {

    return alike(left, right, 0, undefined);

}
export function diff ( left: unknown, right: unknown ): Change[] {

    const before = new Map(Object.entries(flatten(left)));
    const after = new Map(Object.entries(flatten(right)));
    const out: Change[] = [];

    for ( const path of [...new Set([...before.keys(), ...after.keys()])].sort() ) {

        const from = before.get(path);
        const to = after.get(path);

        if ( !before.has(path) ) out.push({ path, kind: "added", from, to });
        else if ( !after.has(path) ) out.push({ path, kind: "removed", from, to });
        else if ( !equal(from, to) ) out.push({ path, kind: "changed", from, to });

    }

    return out;

}
export function has ( value: unknown, path: string | readonly string[] ): boolean {

    const keys = pathKeys(path);

    if ( keys.length === 0 ) return false;

    const parent = pathGet(value, keys.slice(0, -1));
    const key = keys[keys.length - 1] as string;

    return Array.isArray(parent) ? isIndex(key) && Number(key) < parent.length : isRecord(parent) && safeKey(key) && Object.hasOwn(parent, key);

}
export function unset ( value: Dictionary, path: string | readonly string[] ): Dictionary {

    const keys = pathKeys(path);

    if ( !has(value, keys) ) return value;

    const out: Dictionary = { ...value };
    let cursor: Dictionary | unknown[] = out;

    for ( const key of keys.slice(0, -1) ) {

        const holder = cursor as Dictionary;
        const next = holder[key];
        const copy: Dictionary | unknown[] = Array.isArray(next) ? [...next] : { ...(next as Dictionary) };

        holder[key] = copy;
        cursor = copy;

    }

    const last = keys[keys.length - 1] as string;

    if ( Array.isArray(cursor) ) cursor.splice(Number(last), 1);
    else delete cursor[last];

    return out;

}
export function isEmpty ( value: unknown ): boolean {

    if ( value === null || value === undefined || value === "" ) return true;
    if ( Array.isArray(value) ) return value.length === 0;
    if ( value instanceof Map || value instanceof Set ) return value.size === 0;

    return isPlain(value) && Object.keys(value).length === 0;

}
function ordered ( left: string, right: string ): number {

    const a = pathKeys(left);
    const b = pathKeys(right);

    for ( let at = 0; at < Math.min(a.length, b.length); at += 1 ) {

        const x = a[at] as string;
        const y = b[at] as string;

        if ( x !== y ) return isIndex(x) && isIndex(y) ? Number(x) - Number(y) : x < y ? -1 : 1;

    }

    return a.length - b.length;

}
function hollow ( value: unknown ): boolean {

    return Array.isArray(value) ? value.length === 0 : isPlain(value) && Object.keys(value).length === 0;

}
function dropped ( value: Dictionary, keys: readonly string[] ): Dictionary {

    const parent = pathGet(value, keys.slice(0, -1));

    return Array.isArray(parent) && Number(keys[keys.length - 1]) < parent.length - 1 ? pathSet(value, keys, undefined) : unset(value, keys);

}
function cleared ( value: Dictionary, path: string ): Dictionary {

    const keys = pathKeys(path);

    if ( !has(value, keys) ) return value;

    let out = dropped(value, keys);

    for ( let depth = keys.length - 1; depth > 0 && hollow(pathGet(out, keys.slice(0, depth))); depth -= 1 ) out = dropped(out, keys.slice(0, depth));

    return out;

}
export function patch ( value: Dictionary, changes: readonly Change[] ): Dictionary {

    const gone = changes.filter(( change ) => change.kind === "removed").sort(( a, b ) => ordered(b.path, a.path));
    const kept = changes.filter(( change ) => change.kind !== "removed").sort(( a, b ) => ordered(a.path, b.path));
    let out: Dictionary = value;

    for ( const change of gone ) out = cleared(out, change.path);
    for ( const change of kept ) out = pathSet(out, change.path, change.to);

    return out;

}
