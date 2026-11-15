import * as date from "engine-date";
import * as json from "engine-json";
import type { Envelope } from "./arch.ts";

export function unpack ( text: string ): Envelope | undefined {

    const found = json.parse(text);

    if ( !json.isRecord(found) || !Object.hasOwn(found, "v") ) return undefined;
    if ( found.e !== undefined && (typeof found.e !== "number" || !Number.isFinite(found.e)) ) return undefined;

    return found as Envelope;

}
export function peek<T = unknown> ( text: string | null | undefined ): T | undefined {

    const found = typeof text === "string" ? unpack(text) : undefined;

    return found === undefined || (found.e !== undefined && found.e <= date.now()) ? undefined : found.v as T;

}
