import * as date from "engine-date";
import * as string from "engine-string";
import { type Address, fenced, read, shown } from "./address.ts";
import { isEndpoint } from "./url.ts";

export type Directives = Record<string, readonly string[] | string | boolean | undefined>;
export type Hsts = { maxAge?: number | undefined; subdomains?: boolean | undefined; preload?: boolean | undefined };
export type Security = {
    csp?: Directives | undefined;
    reportOnly?: boolean | undefined;
    frame?: "DENY" | "SAMEORIGIN" | undefined;
    hsts?: boolean | Hsts | undefined;
    referrer?: string | undefined;
    permissions?: string | undefined;
    opener?: string | undefined;
};
export type Facts = { ip: string | undefined; agent: string; language: string | undefined; referer: string | undefined; requestId: string | undefined; secure: boolean; mobile: boolean; bot: boolean };

type Bag = Record<string, string | undefined> | { get: ( name: string ) => string | null };

const botPattern = /bot|crawl|spider|slurp|facebookexternalhit|preview|fetch|headless|lighthouse/i;
const mobilePattern = /android|iphone|ipad|ipod|mobile|windows phone/i;
const longest = 2048;
const ported = /^\](?::\d{1,5})?$/;

function plain ( text: string ): boolean {

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code < 32 || code === 127 ) return false;

    }

    return true;

}
function hop ( entry: string ): Address | undefined {

    const text = entry.trim();
    const colon = text.indexOf(":");
    const close = text.charCodeAt(0) === 91 ? text.indexOf("]") : -1;
    const bare = close > 0 && ported.test(text.slice(close)) ? text.slice(1, close) : colon > 0 && text.indexOf(":", colon + 1) === -1 && ported.test(`]${text.slice(colon)}`) ? text.slice(0, colon) : text;
    return read(bare);

}
function reader ( headers: Bag ): ( name: string ) => string | undefined {

    if ( typeof headers.get === "function" ) {

        const get = headers.get.bind(headers);

        return ( name ) => get(name) ?? undefined;

    }

    const held = new Map<string, string>();

    for ( const [name, value] of Object.entries(headers) ) if ( typeof value === "string" ) held.set(name.toLowerCase(), value);

    return ( name ) => held.get(name);

}

export function forwardedFor ( header: string | null | undefined, hops?: number ): string | undefined {

    if ( !header || header.length > longest ) return undefined;

    const chain = header.split(",");
    let first: Address | undefined;

    if ( hops !== undefined ) {

        const asked = Number.isInteger(hops) && hops > 0 ? hop(chain[chain.length - hops] ?? "") : undefined;

        return asked && shown(asked);

    }

    for ( let at = chain.length - 1; at >= 0; at -= 1 ) {

        const found = hop(chain[at] ?? "");

        if ( !found ) continue;
        if ( !fenced(found) ) return shown(found);

        first = found;

    }

    return first && shown(first);

}
export function retryAfter ( header: string | null | undefined, now: number = date.now() ): number | undefined {

    if ( !header || header.length > 64 ) return undefined;

    const text = header.trim();

    if ( /^\d{1,15}$/.test(text) ) return Math.min(Number(text), 2_147_483_647);

    const when = date.from(text);

    return when ? Math.max(0, Math.ceil((when.getTime() - now) / 1000)) : undefined;

}
export function contentSecurityPolicy ( directives: Directives ): string {

    const out: string[] = [];

    for ( const [name, allowed] of Object.entries(directives) ) {

        if ( allowed === undefined || allowed === false ) continue;
        if ( !/^[a-z][a-z0-9-]*$/i.test(name) ) throw new RangeError("not a directive");

        const sources = allowed === true ? [] : typeof allowed === "string" ? allowed.split(/\s+/).filter(Boolean) : allowed;

        for ( const source of sources ) if ( source === "" || !plain(source) || /[\s;,]/.test(source) ) throw new RangeError("not a source");

        out.push(allowed === true ? name : `${name} ${sources.length === 0 ? "'none'" : sources.join(" ")}`);

    }

    return out.join("; ");

}
export function securityHeaders ( options: Security = {} ): Record<string, string> {

    const hsts: Hsts = typeof options.hsts === "object" ? options.hsts : {};
    const age = hsts.maxAge ?? 63_072_000;
    const headers: Record<string, string> = {
        "x-content-type-options": "nosniff",
        "x-frame-options": options.frame ?? "DENY",
        "referrer-policy": options.referrer ?? "strict-origin-when-cross-origin",
        "permissions-policy": options.permissions ?? "camera=(), microphone=(), geolocation=(self), payment=(self)",
        "cross-origin-opener-policy": options.opener ?? "same-origin",
    };

    if ( !Number.isInteger(age) || age < 0 ) throw new RangeError("not a duration");

    for ( const value of Object.values(headers) ) if ( !plain(value) ) throw new RangeError("not a header");

    if ( options.hsts !== false ) headers["strict-transport-security"] = `max-age=${age}${hsts.subdomains === false ? "" : "; includeSubDomains"}${hsts.preload === true ? "; preload" : ""}`;
    if ( options.csp ) headers[options.reportOnly === true ? "content-security-policy-report-only" : "content-security-policy"] = contentSecurityPolicy(options.csp);

    return headers;

}
export function facts ( headers: Record<string, string | undefined> | Headers, remote?: string, hops?: number ): Facts {

    const get = reader(headers);
    const agent = get("user-agent") ?? "";
    const language = get("accept-language")?.split(",")[0]?.split(";")[0]?.trim() ?? "";
    const referer = get("referer") ?? "";
    const requestId = get("x-request-id") ?? "";
    const proto = get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const real = hop(get("x-real-ip") ?? "");

    return {
        ip: hops === 0 ? remote : (forwardedFor(get("x-forwarded-for"), hops) ?? (real && shown(real)) ?? remote),
        agent: plain(agent) ? string.truncate(agent, 256, "") : "",
        language: /^[a-z]{2,3}(?:-[a-z0-9]{1,8}){0,4}$/i.test(language) ? language : undefined,
        referer: referer.length <= longest && isEndpoint(referer) ? referer : undefined,
        requestId: /^[\w.:-]{1,128}$/.test(requestId) ? requestId : undefined,
        secure: proto === "https",
        mobile: mobilePattern.test(agent),
        bot: botPattern.test(agent),
    };

}
