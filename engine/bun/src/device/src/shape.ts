import * as exception from "engine-exception";
import type { Members } from "./arch.ts";

function named ( adapter: Members ): string[] {

    const found = new Set<string>();

    for ( let cursor: object | null = adapter; cursor !== null && cursor !== Object.prototype; cursor = Object.getPrototypeOf(cursor) as object | null ) for ( const key of Object.getOwnPropertyNames(cursor) ) found.add(key);

    return [...found];

}
function can ( adapter: Members, capability: string ): boolean {

    if ( capability in Object.prototype && !Object.hasOwn(adapter, capability) ) return false;

    const value = exception.probe(() => adapter[capability]);

    return value !== undefined && value !== null;

}
export function capabilities ( adapter: Members ): string[] {

    return named(adapter).filter(( key ) => can(adapter, key)).sort();

}
export function fill<T extends object> ( given: { [K in keyof T]?: T[K] | undefined }, defaults: T ): T {

    const out = { ...defaults };

    for ( const key of named(given as Members) ) {

        if ( key === "__proto__" || (key in Object.prototype && !Object.hasOwn(given, key)) ) continue;

        const value = (given as Members)[key];

        if ( value !== undefined ) (out as Members)[key] = typeof value === "function" ? value.bind(given) : value;

    }

    return out;

}
