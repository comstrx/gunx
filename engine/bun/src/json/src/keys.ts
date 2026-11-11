import * as string from "engine-string";
import { type Dictionary, isPlain, isRecord, poison, safeKey } from "./object.ts";

function recase ( value: unknown, convert: ( key: string ) => string ): unknown {

    if ( Array.isArray(value) ) return value.map(( item ) => recase(item, convert));
    if ( !isPlain(value) ) return value;

    const out: Dictionary = {};

    for ( const [key, item] of Object.entries(value) ) {

        const next = convert(key);

        if ( safeKey(next) ) out[next] = recase(item, convert);

    }

    return out;

}
export function camelKeys<T = unknown> ( value: unknown ): T {

    return recase(value, string.camel) as T;

}
export function snakeKeys<T = unknown> ( value: unknown ): T {

    return recase(value, string.snake) as T;

}
export function kebabKeys<T = unknown> ( value: unknown ): T {

    return recase(value, string.kebab) as T;

}
export function mapKeys<T> ( value: Readonly<Record<string, T>>, map: ( key: string, item: T ) => string ): Record<string, T> {

    const out: Record<string, T> = {};

    for ( const [key, item] of Object.entries(value) ) {

        const next = map(key, item);

        if ( safeKey(next) ) out[next] = item;

    }

    return out;

}
export function renameKeys<T> ( value: Readonly<Record<string, T>>, names: Readonly<Record<string, string>> ): Record<string, T> {

    return mapKeys(value, ( key ) => (Object.hasOwn(names, key) ? (names[key] ?? key) : key));

}
export function filterKeys<T> ( value: Readonly<Record<string, T>>, keep: ( key: string ) => boolean ): Record<string, T> {

    const out: Record<string, T> = {};

    for ( const [key, item] of Object.entries(value) ) if ( key !== poison && keep(key) ) out[key] = item;

    return out;

}
export function filterValues<T> ( value: Readonly<Record<string, T>>, keep: ( item: T, key: string ) => boolean ): Record<string, T> {

    const out: Record<string, T> = {};

    for ( const [key, item] of Object.entries(value) ) if ( key !== poison && keep(item, key) ) out[key] = item;

    return out;

}
export function defaults<T extends Dictionary> ( value: { [K in keyof T]?: T[K] | undefined }, fallback: T ): T {

    const out: Dictionary = { ...fallback };

    for ( const [key, item] of Object.entries(value) ) if ( item !== undefined && safeKey(key) ) out[key] = item;

    return out as T;

}
export function invert ( value: Readonly<Record<string, string | number>> ): Record<string, string> {

    const out: Record<string, string> = {};

    for ( const [key, item] of Object.entries(value) ) if ( safeKey(String(item)) ) out[String(item)] = key;

    return out;

}
export function keysDeep ( value: unknown, prefix = "" ): string[] {

    if ( !isRecord(value) ) return [];

    return Object.entries(value).flatMap(([key, item]) => {

        const path = prefix ? `${prefix}.${key}` : key;

        return isRecord(item) ? [path, ...keysDeep(item, path)] : [path];

    });

}
export function size ( value: unknown ): number {

    if ( Array.isArray(value) || typeof value === "string" ) return value.length;
    if ( value instanceof Map || value instanceof Set ) return value.size;
    if ( isRecord(value) ) return Object.keys(value).length;

    return 0;

}
