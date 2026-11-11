import type * as error from "engine-error";
import * as json from "engine-json";
import { house, type Paths } from "./wire.ts";

export type Meta = json.Dictionary;
export type Envelope<T = unknown> = { data: T; message: string | null; errors: Record<string, string[]> | null; code: string; reason: string | null; meta: Meta; requestId: string | undefined };
export type Page = { page: number; limit: number; total: number; pages: number };

type Routed = "page" | "limit" | "total" | "pages" | "requestId" | "retryAfter";

const routed: ReadonlySet<string> = new Set(["page", "limit", "total", "pages", "requestId", "retryAfter"]);
const digits = /^\d{1,15}$/;

function text ( body: unknown, path: string ): string | null {

    const found = json.pathGet(body, path);

    return typeof found === "string" ? found : null;

}
function count ( body: unknown, path: string ): number | undefined {

    const found = json.pathGet(body, path);
    const value = typeof found === "number" ? found : typeof found === "string" && digits.test(found) ? Number(found) : Number.NaN;

    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;

}
function lines ( found: unknown ): string[] {

    const made: string[] = [];

    for ( const line of Array.isArray(found) ? found : [found] ) {

        if ( typeof line === "string" ) made.push(line);
        else if ( typeof line === "number" || typeof line === "boolean" ) made.push(String(line));

    }

    return made;

}
function listed ( found: unknown ): Record<string, string[]> | null {

    if ( !json.isRecord(found) ) return null;

    const made: Record<string, string[]> = {};

    for ( const key of Object.keys(found) ) {

        if ( json.safeKey(key) ) made[key] = lines(found[key]);

    }

    return made;

}
function isRouted ( key: string ): key is Routed {

    return routed.has(key);

}

export function isEnvelope ( value: unknown, paths: Paths = house.envelope ): value is json.Dictionary {

    return json.isRecord(value) && json.has(value, paths.data) && typeof json.pathGet(value, paths.code) === "string";

}
export function unwrap<T = unknown> ( body: unknown, paths: Paths = house.envelope, ok = house.ok ): Envelope<T> {

    if ( !isEnvelope(body, paths) ) return { data: body as T, message: null, errors: null, code: ok, reason: null, meta: {}, requestId: undefined };

    return {
        data: json.pathGet(body, paths.data) as T,
        message: text(body, paths.message),
        errors: listed(json.pathGet(body, paths.errors)),
        code: text(body, paths.code) ?? ok,
        reason: text(body, paths.reason),
        meta: json.isRecord(body.meta) ? body.meta : {},
        requestId: text(body, paths.requestId) ?? undefined,
    };

}
export function pageOf ( body: unknown, paths: Paths = house.envelope ): Page | undefined {

    const page = count(body, paths.page);
    const limit = count(body, paths.limit);

    if ( page === undefined || limit === undefined ) return undefined;

    const total = count(body, paths.total) ?? 0;

    return { page, limit, total, pages: count(body, paths.pages) ?? (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1) };

}
export function envelope<T> ( data: T, meta: Meta = {}, paths: Paths = house.envelope, ok = house.ok ): json.Dictionary {

    const rest: Meta = {};
    const dot = paths.requestId.lastIndexOf(".");
    let made: json.Dictionary = {};

    made = json.pathSet(made, paths.data, data === undefined ? null : data);
    made = json.pathSet(made, paths.message, null);
    made = json.pathSet(made, paths.errors, null);
    made = json.pathSet(made, paths.code, ok);
    made = json.pathSet(made, paths.reason, null);

    if ( dot !== -1 ) made = json.pathSet(made, paths.requestId.slice(0, dot), {});

    for ( const key of Object.keys(meta) ) {

        const value = meta[key];

        if ( value === undefined || !json.safeKey(key) ) continue;

        if ( isRouted(key) ) made = json.pathSet(made, paths[key], value);
        else rest[key] = value;

    }

    if ( Object.keys(rest).length ) made.meta = { ...(json.isRecord(made.meta) ? made.meta : {}), ...rest };

    return made;

}
export function refusal ( fault: error.Fault, meta: Meta = {}, paths: Paths = house.envelope ): json.Dictionary {

    let made = envelope(null, { requestId: fault.requestId, retryAfter: fault.retryAfter, ...meta }, paths, fault.code);

    made = json.pathSet(made, paths.message, fault.message);
    made = json.pathSet(made, paths.errors, Object.keys(fault.errors).length ? fault.errors : null);

    return json.pathSet(made, paths.reason, fault.reason ?? null);

}
