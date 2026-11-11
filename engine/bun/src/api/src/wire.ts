import * as error from "engine-error";
import * as json from "engine-json";
import * as validate from "engine-validate";
import type { Method } from "./contract.ts";

export type Header = { name: string; prefix?: string | undefined };
export type Headers = { accept: string; contentType: string; language: string; currency: string; tenant: string; client: string; auth: Header; requestId: string; idempotency: string };
export type Paths = { data: string; message: string; errors: string; code: string; reason: string; requestId: string; retryAfter: string; page: string; limit: string; total: string; pages: string };
export type Wire = { headers: Headers; envelope: Paths; idempotent: readonly Method[]; retries: { read: number; write: number }; timeout: number; cache: number; ok: string };
export type Overrides = {
    headers?: Partial<Omit<Headers, "auth">> & { auth?: Header | string | undefined } | undefined;
    envelope?: Partial<Paths> | undefined;
    idempotent?: readonly Method[] | undefined;
    retries?: Partial<Wire["retries"]> | undefined;
    timeout?: number | undefined;
    cache?: number | undefined;
    ok?: string | undefined;
};

type Names = Omit<Headers, "auth">;

const headerName = validate.string().check(validate.maxLength(64), validate.regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/));
const path = validate.string().check(validate.maxLength(128), validate.regex(/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/), validate.refine(( value: string ) => value.split(".").every(json.safeKey)));
const prefix = validate.string().check(validate.maxLength(32), validate.regex(/^[ -~]*$/));
const method = validate.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function within ( low: number, high: number ) {

    return validate.int().check(validate.gte(low), validate.lte(high));

}
function refused ( field: string, message: string ): error.Fault {

    return error.fault("validation", "api.wire", { message: `wire: ${message}`, errors: { [field]: [message] } });

}
function lowered ( name: string ): string {

    return name.toLowerCase();

}
function distinct ( headers: Headers ): void {

    const taken = new Map<string, string>();
    const names: Record<string, string> = { ...json.omit(headers, ["auth"]), auth: headers.auth.name };

    for ( const role of Object.keys(names) ) {

        const name = names[role] ?? "";
        const other = taken.get(name);

        if ( other !== undefined ) throw refused(`headers.${role}`, `the header ${name} carries both ${other} and ${role}`);

        taken.set(name, role);

    }

}
function apart ( paths: Paths ): void {

    const places = Object.entries(paths);

    places.forEach(( [role, place], at ) => {

        for ( const [other, taken] of places.slice(at + 1) ) {

            if ( place === taken || place.startsWith(`${taken}.`) || taken.startsWith(`${place}.`) ) throw refused(`envelope.${other}`, `the path ${taken} of ${other} collides with ${place} of ${role}`);

        }

    });

}
function sealed ( made: Wire ): Wire {

    Object.freeze(made.headers.auth);
    Object.freeze(made.headers);
    Object.freeze(made.envelope);
    Object.freeze(made.idempotent);
    Object.freeze(made.retries);

    return Object.freeze(made);

}

export const house: Wire = sealed({
    headers: {
        accept: "accept",
        contentType: "content-type",
        language: "accept-language",
        currency: "x-currency",
        tenant: "x-tenant",
        client: "x-client",
        auth: { name: "authorization", prefix: "Bearer " },
        requestId: "x-request-id",
        idempotency: "idempotency-key",
    },
    envelope: { data: "data", message: "message", errors: "errors", code: "code", reason: "reason", requestId: "meta.request_id", retryAfter: "meta.retry_after", page: "meta.page", limit: "meta.limit", total: "meta.total", pages: "meta.pages" },
    idempotent: ["GET", "PUT", "DELETE"],
    retries: { read: 2, write: 0 },
    timeout: 10_000,
    cache: 0,
    ok: "ok",
});
export const wireShape = validate.partial(validate.strictObject({
    headers: validate.partial(validate.strictObject({
        accept: headerName,
        contentType: headerName,
        language: headerName,
        currency: headerName,
        tenant: headerName,
        client: headerName,
        auth: validate.union([headerName, validate.strictObject({ name: headerName, prefix: validate.optional(prefix) })]),
        requestId: headerName,
        idempotency: headerName,
    })),
    envelope: validate.partial(validate.strictObject({ data: path, message: path, errors: path, code: path, reason: path, requestId: path, retryAfter: path, page: path, limit: path, total: path, pages: path })),
    idempotent: validate.array(method),
    retries: validate.partial(validate.strictObject({ read: within(0, 10), write: within(0, 10) })),
    timeout: within(100, 120_000),
    cache: within(0, 86_400),
    ok: validate.string().check(validate.minLength(1), validate.maxLength(32), validate.regex(/^[!-~]+$/)),
}));

export function wire ( overrides: Overrides = {}, base: Wire = house ): Wire {

    const checked = validate.assert(wireShape, overrides, "api.wire");
    const auth = checked.headers?.auth;
    const names = json.defaults<Names>(json.omit(checked.headers ?? {}, ["auth"]), json.omit(base.headers, ["auth"]));
    const named: Header = auth === undefined ? base.headers.auth : typeof auth === "string" ? { name: auth, prefix: base.headers.auth.prefix } : { name: auth.name, prefix: auth.prefix ?? "" };
    const headers: Headers = { ...json.mapValues(names, lowered) as Names, auth: { name: named.name.toLowerCase(), prefix: named.prefix ?? "" } };
    const envelope = json.defaults<Paths>(checked.envelope ?? {}, base.envelope);

    distinct(headers);
    apart(envelope);

    return sealed({
        headers,
        envelope: { ...envelope },
        idempotent: checked.idempotent ? [...new Set(checked.idempotent)] : base.idempotent,
        retries: { ...json.defaults<Wire["retries"]>(checked.retries ?? {}, base.retries) },
        timeout: checked.timeout ?? base.timeout,
        cache: checked.cache ?? base.cache,
        ok: checked.ok ?? base.ok,
    });

}
