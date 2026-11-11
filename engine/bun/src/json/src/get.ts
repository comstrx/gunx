import * as number from "engine-number";
import { type Dictionary, isRecord, pathGet } from "./object.ts";

export function getAt<T = unknown> ( value: unknown, path: string, fallback: T ): T {

    const found = pathGet(value, path);

    return found === undefined ? fallback : (found as T);

}
export function getText ( value: unknown, path: string, fallback = "" ): string {

    const found = pathGet(value, path);

    if ( typeof found === "string" ) return found;
    if ( typeof found === "number" ) return Number.isFinite(found) ? String(found) : fallback;

    return typeof found === "boolean" || typeof found === "bigint" ? String(found) : fallback;

}
export function getNumber ( value: unknown, path: string, fallback = 0 ): number {

    const found = pathGet(value, path);

    if ( typeof found === "number" && Number.isFinite(found) ) return found;
    if ( typeof found === "string" && number.isNumeric(found) ) return Number(found);

    return fallback;

}
export function getBoolean ( value: unknown, path: string, fallback = false ): boolean {

    const found = pathGet(value, path);

    if ( typeof found === "boolean" ) return found;
    if ( found === "true" || found === 1 || found === "1" ) return true;
    if ( found === "false" || found === 0 || found === "0" ) return false;

    return fallback;

}
export function getList<T = unknown> ( value: unknown, path: string, fallback: T[] = [] ): T[] {

    const found = pathGet(value, path);

    return Array.isArray(found) ? (found as T[]) : fallback;

}
export function getRecord ( value: unknown, path: string, fallback: Dictionary = {} ): Dictionary {

    const found = pathGet(value, path);

    return isRecord(found) ? found : fallback;

}
