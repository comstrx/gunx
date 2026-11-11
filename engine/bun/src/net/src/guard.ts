import * as error from "engine-error";
import * as event from "engine-event";
import { isLoopback } from "./address.ts";
import type { Fetcher } from "./transport.ts";
import { originOf, parseUrl } from "./url.ts";

export type Policy = { origins: readonly string[]; allowLoopback?: boolean | undefined };
export type Body = { body?: ReadableStream<Uint8Array> | null | undefined; arrayBuffer: () => Promise<ArrayBuffer>; headers?: { get: ( name: string ) => string | null } | undefined };

type Reader = { read: () => Promise<{ done: boolean; value?: Uint8Array | undefined }> };

type Wild = { protocol: string; suffix: string; port: string };

const longest = 2_147_483_647;
const moved = new Set([301, 302, 303, 307, 308]);
const secret = new Set(["authorization", "cookie", "proxy-authorization"]);
const framed = new Set(["content-type", "content-length", "content-encoding", "content-language", "content-location"]);

function over ( maxBytes: number ): error.Fault {

    return error.fault("too_large", "net.body", { errors: { body: [`max:${maxBytes}`] } });

}
export function dropped ( stream: { cancel: () => Promise<void> } | null | undefined ): void {

    if ( stream ) void stream.cancel().catch(() => undefined);

}
function refused ( url: string, reason: string, message: string ): error.Fault {

    return error.fault("forbidden", reason, { message: `${originOf(url) ?? "the address"}: ${message}` });

}
function without ( headers: Record<string, string>, names: ReadonlySet<string> ): Record<string, string> {

    const out: Record<string, string> = {};

    for ( const [name, value] of Object.entries(headers) ) if ( !names.has(name.toLowerCase()) ) out[name] = value;

    return out;

}
function resolved ( onward: string, base: string ): string {

    try {

        return new URL(onward, base).href;

    } catch {

        return "";

    }

}

async function drained ( reader: Reader, maxBytes: number ): Promise<Uint8Array> {

    const chunks: Uint8Array[] = [];
    let total = 0;

    for ( ;; ) {

        const { done, value } = await reader.read();

        if ( done || !value ) break;

        total += value.byteLength;

        if ( total > maxBytes ) throw over(maxBytes);

        chunks.push(value);

    }

    if ( chunks.length === 1 && chunks[0] ) return chunks[0];

    const out = new Uint8Array(total);
    let offset = 0;

    for ( const chunk of chunks ) {

        out.set(chunk, offset);
        offset += chunk.byteLength;

    }

    return out;

}

export function timeoutSignal ( ms: number ): AbortSignal {

    if ( Number.isNaN(ms) ) throw new RangeError("not a duration");

    const controller = new AbortController();

    if ( ms === Number.POSITIVE_INFINITY ) return controller.signal;

    const timer: unknown = setTimeout(() => controller.abort(error.fault("timeout", "net.timeout")), Math.min(Math.max(0, ms), longest));

    if ( typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function" ) timer.unref();

    return controller.signal;

}
export function anySignal ( ...signals: readonly (AbortSignal | undefined)[] ): AbortSignal {

    return event.abortable(...signals).signal;

}
export async function readBytes ( response: Body, maxBytes = 5_000_000, signal?: AbortSignal ): Promise<Uint8Array> {

    if ( Number.isNaN(maxBytes) ) throw new RangeError("not a size");

    const declared = Number(response.headers?.get("content-length") ?? 0);

    if ( declared > maxBytes ) {

        dropped(response.body);

        throw over(maxBytes);

    }

    const reader = response.body?.getReader();

    if ( !reader ) {

        const whole = new Uint8Array(await event.race(response.arrayBuffer(), signal));

        if ( whole.byteLength > maxBytes ) throw over(maxBytes);

        return whole;

    }

    try {

        return await event.race(drained(reader, maxBytes), signal);

    } catch ( caught ) {

        dropped(reader);

        throw caught;

    }

}
export function policy ( given: Policy ): ( url: string ) => boolean {

    const exact = new Set<string>();
    const wild: Wild[] = [];

    for ( const entry of given.origins ) {

        const starred = entry.includes("://*.");
        const parts = parseUrl(starred ? entry.replace("://*.", "://x.") : entry);

        if ( !parts || parts.origin === "null" || parts.path !== "/" || parts.hash !== "" || entry.includes("?") || entry.includes("@") || parts.hostname.includes("*") ) throw new RangeError("not an origin");

        if ( starred ) wild.push({ protocol: parts.protocol, suffix: parts.hostname.slice(1), port: parts.port });
        else exact.add(parts.origin);

    }

    return ( url ) => {

        const parts = parseUrl(url);

        if ( !parts || parts.origin === "null" ) return false;
        if ( exact.has(parts.origin) ) return true;
        if ( wild.some(( one ) => one.protocol === parts.protocol && one.port === parts.port && parts.hostname.length > one.suffix.length && parts.hostname.endsWith(one.suffix)) ) return true;

        return given.allowLoopback === true && (parts.protocol === "http" || parts.protocol === "https") && isLoopback(parts.hostname);

    };

}
export function guarded ( fetcher: Fetcher, allow: ( url: string ) => boolean, hops = 5 ): Fetcher {

    return async ( url, init ) => {

        let target = url;
        let { method, headers, body } = init;

        if ( !allow(target) ) throw refused(target, "net.origin", "the origin is outside the policy");

        for ( let hop = 0; ; hop += 1 ) {

            const response = await fetcher(target, { ...init, method, headers, body, redirect: init.redirect === "error" || init.redirect === "manual" ? init.redirect : "manual" });
            const onward = moved.has(response.status) ? response.headers.get("location") : null;

            if ( response.type === "opaqueredirect" && init.redirect !== "manual" ) throw refused(target, "net.redirect", "a guarded call does not follow a redirect it cannot read");

            if ( onward === null || init.redirect === "manual" ) {

                if ( response.url !== "" && !allow(response.url) ) {

                    dropped(response.body);

                    throw refused(response.url, "net.redirect", "the call was redirected outside the policy");

                }

                return response;

            }

            dropped(response.body);

            const next = resolved(onward, target);

            if ( hop >= hops ) throw refused(target, "net.redirect", "too many redirects");
            if ( !allow(next) ) throw refused(next, "net.redirect", "the call was redirected outside the policy");

            if ( response.status === 303 ? method !== "GET" && method !== "HEAD" : response.status !== 307 && response.status !== 308 && method === "POST" ) {

                method = "GET";
                body = undefined;
                headers = without(headers, framed);

            }

            if ( originOf(next) !== originOf(target) ) headers = without(headers, secret);

            target = next;

        }

    };

}
