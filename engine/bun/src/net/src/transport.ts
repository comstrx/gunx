import * as adapter from "engine-adapter";
import * as date from "engine-date";
import * as error from "engine-error";
import * as event from "engine-event";
import * as func from "engine-func";
import * as json from "engine-json";
import type * as parse from "engine-parse";
import * as rand from "engine-rand";
import { readBytes } from "./guard.ts";
import { retryAfter as retryAfterOf } from "./headers.ts";
import { schemeOf, sound, withQuery } from "./url.ts";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type Redirect = "follow" | "error" | "manual";
export type Payload = string | Uint8Array | FormData | Blob;
export type Fetcher = ( url: string, init: { method: string; headers: Record<string, string>; body?: Payload | undefined; signal: AbortSignal; redirect?: Redirect | undefined } ) => Promise<Response>;
export type RequestOptions = {
    method?: Method | undefined;
    headers?: Record<string, string | undefined> | undefined;
    body?: unknown;
    query?: parse.QueryInput | undefined;
    timeout?: number | undefined;
    retries?: number | undefined;
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
    requestId?: string | undefined;
    fetcher?: Fetcher | undefined;
    idempotent?: boolean | undefined;
    redirect?: Redirect | undefined;
    as?: "auto" | "json" | "text" | "bytes" | undefined;
    failure?: (( status: number, body: unknown, headers: Record<string, string> ) => error.Fault) | undefined;
};
export type Reply<T = unknown> = { status: number; ok: boolean; headers: Record<string, string>; body: T; text: string; ms: number; attempts: number; requestId: string };

const decoder = new TextDecoder();

export const fetcher: adapter.Port<Fetcher> = adapter.port<Fetcher>("net.fetcher", { fallback: adapter.web("net.fetch", ( host ) => host.fetch as Fetcher | undefined) });

function wrong ( reason: string, message: string ): error.Fault {

    return error.fault("internal", reason, { message });

}
function has ( value: unknown, ...verbs: readonly string[] ): boolean {

    return typeof value === "object" && value !== null && verbs.every(( verb ) => verb in value && typeof (value as Record<string, unknown>)[verb] === "function");

}

export function header ( name: string, value: string ): string {

    if ( !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) ) throw wrong("net.header", "a header name is a token");

    for ( let at = 0; at < value.length; at += 1 ) {

        const code = value.charCodeAt(at);

        if ( (code < 32 && code !== 9) || code === 127 ) throw wrong("net.header", `${name}: a header value holds no control characters`);

    }

    return name.toLowerCase();

}
export function address ( url: string ): string {

    const scheme = schemeOf(url);

    if ( !sound(url) ) throw wrong("net.address", "an address holds no control characters, backslashes or outer spaces");
    if ( scheme !== undefined && scheme !== "http" && scheme !== "https" ) throw error.fault("forbidden", "net.scheme", { message: `${scheme}: a call goes over http or https` });

    return url;

}
export function gone ( caught: unknown, own: AbortSignal | undefined, limit: AbortSignal, late: string ): error.Fault {

    if ( own?.aborted ) return error.fault("timeout", "net.aborted", { cause: own.reason });
    if ( limit.aborted ) return error.fault("timeout", late, { cause: caught });
    if ( error.isFault(caught) ) return caught;

    return error.fault("network", "net.unreachable", { cause: caught, message: error.messageOf(caught) });

}

function encoded ( body: unknown, headers: Record<string, string> ): Payload | undefined {

    if ( body === undefined || typeof body === "string" || body instanceof Uint8Array ) return body;
    if ( typeof FormData !== "undefined" && body instanceof FormData ) return body;
    if ( typeof Blob !== "undefined" && body instanceof Blob ) return body;
    if ( body instanceof ArrayBuffer ) return new Uint8Array(body);
    if ( ArrayBuffer.isView(body) ) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);

    if ( typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams ) {

        headers["content-type"] ??= "application/x-www-form-urlencoded;charset=UTF-8";

        return body.toString();

    }

    const text = has(body, "getReader") || has(body, "pipe") || typeof body === "function" || typeof body === "symbol" ? undefined : json.stringify(body);

    if ( typeof text !== "string" ) throw wrong("net.body", "a body is text, bytes, a form, a file or a plain value");

    headers["content-type"] ??= "application/json";

    return text;

}

export function failure ( status: number, body: unknown, headers: Record<string, string> = {} ): error.Fault {

    const fault = error.fromEnvelope(body, status);
    const wait = retryAfterOf(headers["retry-after"]);

    return wait === undefined ? fault : fault.with({ retryAfter: wait });

}
export async function request<T = unknown> ( url: string, options: RequestOptions = {} ): Promise<Reply<T>> {

    const { method = "GET", timeout = 10_000, retries = 0, maxBytes = 5_000_000, as = "auto" } = options;
    const target = address(options.query ? withQuery(url, options.query) : url);
    const bodiless = method === "GET" || method === "HEAD";
    const headers: Record<string, string> = { accept: as === "auto" || as === "json" ? "application/json" : "*/*", "x-request-id": options.requestId ?? rand.trace() };

    for ( const [name, value] of Object.entries(options.headers ?? {}) ) if ( value !== undefined ) headers[header(name, value)] = value;

    const requestId = headers["x-request-id"] ?? "";
    const body = encoded(options.body, headers);

    header("x-request-id", requestId);

    if ( bodiless && body !== undefined ) throw wrong("net.body", `${method}: the call carries no body`);

    const send = options.fetcher ?? fetcher.get();
    const started = date.now();
    let attempts = 0;

    return func.retry(async () => {

        attempts += 1;

        if ( options.signal?.aborted ) throw error.fault("timeout", "net.aborted", { cause: options.signal.reason });

        const limit = event.deadline(timeout, options.signal);

        try {

            const response = await event.race(send(target, { method, headers, body, signal: limit.signal, ...(options.redirect === undefined ? {} : { redirect: options.redirect }) }), limit.signal);
            const replyHeaders: Record<string, string> = Object.create(null);

            response.headers.forEach(( value, name ) => {

                replyHeaders[name.toLowerCase()] = value;

            });

            const claims = (replyHeaders["content-type"] ?? "").includes("json");
            const wanted = as === "json" || (as === "auto" && claims);
            const bytes = method === "HEAD" ? new Uint8Array(0) : await readBytes(response, maxBytes, limit.signal);
            const text = as === "bytes" && response.ok ? "" : decoder.decode(bytes);
            const parsed = text !== "" && (wanted || (claims && !response.ok)) ? json.parse(text) : undefined;

            if ( !response.ok ) {

                const fault = (options.failure ?? failure)(response.status, parsed ?? text, replyHeaders);

                throw fault.with({ requestId: fault.requestId ?? requestId });

            }

            if ( wanted && parsed === undefined && text !== "" ) throw error.fault("internal", "net.json", { status: 502, requestId, message: "the reply is not the json it claims to be" });

            const payload = (as === "bytes" ? bytes : wanted && text !== "" ? parsed : as === "json" ? undefined : text) as T;

            return { status: response.status, ok: true, headers: replyHeaders, body: payload, text, ms: date.now() - started, attempts, requestId };

        } catch ( caught ) {

            throw gone(caught, options.signal, limit.signal, "net.timeout");

        } finally {

            limit.release();

        }

    }, { times: Math.max(1, (Math.trunc(retries) || 0) + 1), delay: 200, signal: options.signal, when: ( caught ) => error.retryable(caught) && (options.idempotent ?? bodiless) });

}
