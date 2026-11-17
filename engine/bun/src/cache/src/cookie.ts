import * as crypto from "engine-crypto";
import * as date from "engine-date";
import * as exception from "engine-exception";
import * as json from "engine-json";
import * as string from "engine-string";
import type { CookieDocument, CookieOptions, HeaderJar, Jar, } from "./arch.ts";

const namePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const valuePattern = /^[\x21\x23\x24\x26-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;
const pathPattern = /^\/[\x20-\x3a\x3c-\x7e]*$/;
const domainPattern = /^\.?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/;
const stampPattern = /^\d{1,16}$/;
const sites = new Set<string>(["strict", "lax", "none"]);
const largest = 4096;
const skew = 60_000;

function own ( source: Record<string, string>, name: string ): string | undefined {

    return Object.hasOwn(source, name) ? source[name] : undefined;

}
function encoded ( value: string ): string {

    if ( valuePattern.test(value) ) return value;

    return exception.rescue(() => {

        return encodeURIComponent(value);

    }, () => {

        throw exception.misuse("not a cookie value");

    });

}
function checked ( name: string, options: CookieOptions, path: string, sameSite: string ): void {

    const { maxAge, expires, domain } = options;

    if ( !namePattern.test(name) || !json.safeKey(name) ) throw exception.misuse(`not a cookie name: ${name}`);
    if ( !pathPattern.test(path) ) throw exception.misuse("not a cookie path");
    if ( domain !== undefined && domain !== "" && !domainPattern.test(domain) ) throw exception.misuse("not a cookie domain");
    if ( !sites.has(sameSite) ) throw exception.misuse("not a cookie site");
    if ( maxAge !== undefined && !Number.isFinite(maxAge) ) throw exception.misuse("not a cookie age");
    if ( expires !== undefined && Number.isNaN(expires.getTime()) ) throw exception.misuse("not a cookie expiry");
    if ( name.startsWith("__Host-") && (domain || path !== "/") ) throw exception.misuse("not a host cookie");

}

export function parseCookies ( header: string | null | undefined ): Record<string, string> {

    const out: Record<string, string> = {};

    if ( !header ) return out;

    for ( const part of header.split(";") ) {

        const at = part.indexOf("=");

        if ( at === -1 ) continue;

        const name = part.slice(0, at).trim();
        let value = part.slice(at + 1).trim();

        if ( name === "" || !json.safeKey(name) || Object.hasOwn(out, name) ) continue;
        if ( value.length > 1 && value.startsWith('"') && value.endsWith('"') ) value = value.slice(1, -1);

        exception.rescue(() => {

            out[name] = decodeURIComponent(value);

        }, () => {

            out[name] = value;

        });

    }

    return out;

}
export function serializeCookie ( name: string, value: string, options: CookieOptions = {} ): string {

    const { maxAge, expires, domain, path = "/", sameSite = "lax" } = options;

    checked(name, options, path, sameSite);

    const pair = `${name}=${encoded(value)}`;
    const parts = [pair];

    if ( pair.length > largest ) throw exception.misuse("cookie too large");

    if ( maxAge !== undefined ) parts.push(`Max-Age=${Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(maxAge)))}`);
    if ( expires ) parts.push(`Expires=${expires.toUTCString()}`);

    parts.push(`Path=${path}`);

    if ( domain ) parts.push(`Domain=${domain}`);
    if ( options.secure || sameSite === "none" || options.partitioned || name.startsWith("__Host-") || name.startsWith("__Secure-") ) parts.push("Secure");
    if ( options.httpOnly ) parts.push("HttpOnly");

    parts.push(`SameSite=${string.capitalize(sameSite)}`);

    if ( options.partitioned ) parts.push("Partitioned");

    return parts.join("; ");

}
export function documentCookies ( target: CookieDocument ): Jar {

    return {
        get: ( name ) => own(parseCookies(target.cookie), name),
        set: ( name, value, options = {} ) => {

            target.cookie = serializeCookie(name, value, options);

        },
        remove: ( name, options = {} ) => {

            target.cookie = serializeCookie(name, "", { ...options, maxAge: 0, expires: new Date(0) });

        },
        names: () => Object.keys(parseCookies(target.cookie)),
    };

}
export function headerCookies ( header: string | null | undefined ): HeaderJar {

    const incoming = parseCookies(header);
    const outgoing: string[] = [];
    const written = new Map<string, string | undefined>();

    return {
        get: ( name ) => (written.has(name) ? written.get(name) : own(incoming, name)),
        set: ( name, value, options = {} ) => {

            outgoing.push(serializeCookie(name, value, options));
            written.set(name, value);

        },
        remove: ( name, options = {} ) => {

            outgoing.push(serializeCookie(name, "", { ...options, maxAge: 0, expires: new Date(0) }));
            written.set(name, undefined);

        },
        names: () => [...new Set([...Object.keys(incoming), ...written.keys()])].filter(( name ) => !written.has(name) || written.get(name) !== undefined),
        outgoing: () => [...outgoing],
    };

}
export async function signCookie ( value: string, secret: string, now: number = date.now() ): Promise<string> {

    return crypto.sign(`${value}|${Math.trunc(now)}`, secret);

}
export async function unsignCookie ( signed: string | undefined, secret: string, maxAgeSeconds?: number, now: number = date.now() ): Promise<string | undefined> {

    if ( signed === undefined ) return undefined;

    const stamped = await crypto.unsign(signed, secret);
    const at = stamped === undefined ? -1 : stamped.lastIndexOf("|");
    const stamp = stamped === undefined || at === -1 ? "" : stamped.slice(at + 1);

    if ( stamped === undefined || !stampPattern.test(stamp) ) return undefined;

    const age = now - Number(stamp);

    return maxAgeSeconds === undefined || (age >= -skew && age <= maxAgeSeconds * 1000) ? stamped.slice(0, at) : undefined;

}
