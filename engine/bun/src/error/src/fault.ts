import * as json from "engine-json";
import * as string from "engine-string";

export const codes = {
    ok: 200,
    created: 201,
    accepted: 202,
    bad_request: 400,
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    method_not_allowed: 405,
    conflict: 409,
    gone: 410,
    too_large: 413,
    validation: 422,
    locked: 423,
    too_many_requests: 429,
    internal: 500,
    unavailable: 503,
    timeout: 504,
    network: 0,
} as const;

export type Code = keyof typeof codes;
export type Errors = Record<string, string[]>;
export type Detail = {
    message?: string | undefined;
    reason?: string | undefined;
    errors?: Errors | undefined;
    status?: number | undefined;
    retryAfter?: number | undefined;
    requestId?: string | undefined;
    cause?: unknown;
};
export type Envelope = {
    data: unknown;
    message: string | null;
    errors: Errors | null;
    code: string;
    reason: string | null;
    meta: json.Dictionary;
};

const messages: Record<Code, string> = {
    ok: "OK",
    created: "Created",
    accepted: "Accepted",
    bad_request: "The request is malformed",
    unauthorized: "Authentication is required",
    forbidden: "This action is not allowed",
    not_found: "The resource was not found",
    method_not_allowed: "The method is not allowed",
    conflict: "The request conflicts with the current state",
    gone: "The resource is gone",
    too_large: "The payload is too large",
    validation: "The given data is invalid",
    locked: "The resource is locked",
    too_many_requests: "Too many requests",
    internal: "Something went wrong",
    unavailable: "The service is unavailable",
    timeout: "The request timed out",
    network: "The network is unreachable",
};
const aliases: readonly (readonly [number, Code])[] = [[408, "timeout"], [412, "conflict"], [502, "unavailable"]];
const byStatus = new Map<number, Code>([...Object.entries(codes).map(([code, status]) => [status, code as Code] as const), ...aliases]);
const cut = new Set(["AbortError", "TimeoutError"]);
const late = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT"]);
const lost = new Set(["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EPIPE"]);
const offline = /fetch|network|load failed|unable to connect/i;

export const poison = "__proto__";

export class Fault extends Error {
    readonly code: Code;
    readonly status: number;
    readonly reason: string | undefined;
    readonly errors: Errors;
    readonly retryAfter: number | undefined;
    readonly requestId: string | undefined;
    constructor ( code: Code, detail: Detail = {} ) {

        super(detail.message ?? messages[code], detail.cause === undefined ? undefined : { cause: detail.cause });

        this.name = "Fault";
        this.code = code;
        this.status = detail.status ?? codes[code];
        this.reason = detail.reason;
        this.errors = detail.errors ?? {};
        this.retryAfter = detail.retryAfter;
        this.requestId = detail.requestId;

    }
    is ( ...many: readonly Code[] ): boolean {

        return many.includes(this.code);

    }
    field ( name: string ): string | undefined {

        return Object.hasOwn(this.errors, name) ? this.errors[name]?.[0] : undefined;

    }
    with ( detail: Detail ): Fault {

        return new Fault(this.code, {
            message: detail.message ?? this.message,
            reason: detail.reason ?? this.reason,
            errors: detail.errors ?? this.errors,
            status: detail.status ?? this.status,
            retryAfter: detail.retryAfter ?? this.retryAfter,
            requestId: detail.requestId ?? this.requestId,
            cause: detail.cause ?? this.cause,
        });

    }
    toJSON (): json.Dictionary {

        return toJson(this);

    }
}

export function fault ( code: Code, reason?: string, detail: Detail = {} ): Fault {

    return new Fault(code, reason === undefined ? detail : { ...detail, reason });

}
export function raise ( code: Code, reason?: string, detail: Detail = {} ): never {

    throw fault(code, reason, detail);

}
export function isFault ( value: unknown ): value is Fault {

    return value instanceof Fault;

}
export function isCode ( value: unknown ): value is Code {

    return typeof value === "string" && Object.hasOwn(codes, value);

}
export function is ( value: unknown, ...many: readonly Code[] ): value is Fault {

    return isFault(value) && (many.length === 0 || many.includes(value.code));

}
export function messageOf ( value: unknown, fallback = messages.internal ): string {

    const found = value instanceof Error || json.isRecord(value) ? value.message : value;

    return typeof found === "string" && !string.isBlank(found) ? found : fallback;

}
function sensed ( value: unknown ): Code | undefined {

    if ( !(value instanceof Error) ) return undefined;

    const tag = (value as { code?: unknown }).code;

    if ( cut.has(value.name) || (typeof tag === "string" && late.has(tag)) ) return "timeout";
    if ( typeof tag === "string" && lost.has(tag) ) return "network";

    return value instanceof TypeError && offline.test(value.message) ? "network" : undefined;

}
export function of ( value: unknown, code: Code = "internal" ): Fault {

    if ( isFault(value) ) return value;

    const kind = sensed(value) ?? code;

    return new Fault(kind, { message: messageOf(value, messages[kind]), cause: value });

}
export function wrap ( value: unknown, code: Code, detail: Detail = {} ): Fault {

    return isFault(value) ? value.with(detail) : new Fault(code, { ...detail, cause: value, message: detail.message ?? messages[code] });

}
export function fromStatus ( status: number, detail: Detail = {} ): Fault {

    const code = byStatus.get(status) ?? (status >= 500 ? "internal" : status >= 400 ? "bad_request" : "ok");

    return new Fault(code, { ...detail, status });

}
export function toEnvelope ( value: Fault, meta: json.Dictionary = {} ): Envelope {

    return {
        data: null,
        message: value.message,
        errors: Object.keys(value.errors).length ? value.errors : null,
        code: value.code,
        reason: value.reason ?? null,
        meta: value.requestId ? { request_id: value.requestId, ...meta } : meta,
    };

}
export function toJson ( value: Fault ): json.Dictionary {

    return json.compact({
        code: value.code,
        status: value.status,
        message: value.message,
        reason: value.reason,
        errors: Object.keys(value.errors).length ? value.errors : undefined,
        retry_after: value.retryAfter,
        request_id: value.requestId,
    });

}
function told ( value: unknown ): string | undefined {

    if ( typeof value === "string" ) return value;

    return json.isRecord(value) && typeof value.message === "string" ? value.message : undefined;

}
function errorsOf ( value: unknown ): Errors | undefined {

    if ( !json.isRecord(value) ) return undefined;

    const out = new Map<string, string[]>();

    for ( const [field, found] of Object.entries(value) ) {

        const rules = (Array.isArray(found) ? found : [found]).map(told).filter(( rule ) => rule !== undefined);

        if ( field !== poison && (rules.length > 0 || Array.isArray(found)) ) out.set(field, rules);

    }

    return Object.fromEntries(out);

}
function coded ( value: unknown, status: number ): Code | undefined {

    if ( !isCode(value) ) return undefined;

    return codes[value] >= 400 || codes[value] === 0 || !(status >= 400) ? value : undefined;

}
export function fromEnvelope ( body: unknown, status: number ): Fault {

    if ( !json.isRecord(body) ) return fromStatus(status);

    const code = coded(body.code, status);
    const meta = json.isRecord(body.meta) ? body.meta : {};
    const detail: Detail = {
        message: typeof body.message === "string" ? body.message : undefined,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        errors: errorsOf(body.errors),
        status,
        requestId: typeof meta.request_id === "string" ? meta.request_id : typeof body.request_id === "string" ? body.request_id : undefined,
        retryAfter: typeof body.retry_after === "number" && body.retry_after >= 0 && Number.isFinite(body.retry_after) ? body.retry_after : undefined,
    };

    return code ? new Fault(code, json.compact(detail)) : fromStatus(status, json.compact(detail));

}
export function fromJson ( value: unknown ): Fault | undefined {

    if ( !json.isRecord(value) || !isCode(value.code) ) return undefined;

    return fromEnvelope(value, typeof value.status === "number" ? value.status : codes[value.code]);

}
