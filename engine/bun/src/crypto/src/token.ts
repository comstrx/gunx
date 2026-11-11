import * as json from "engine-json";
import * as string from "engine-string";
import { equal, keyed, mac } from "./digest.ts";

export type Claims = json.Dictionary & {
    sub?: string | undefined;
    iss?: string | undefined;
    aud?: string | string[] | undefined;
    exp?: number | undefined;
    iat?: number | undefined;
    nbf?: number | undefined;
    jti?: string | undefined;
};
export type SignOptions = {
    expiresIn?: number | undefined;
    notBefore?: number | undefined;
    issuer?: string | undefined;
    audience?: string | string[] | undefined;
    subject?: string | undefined;
    id?: string | undefined;
    now?: number | undefined;
};
export type VerifyOptions = {
    issuer?: string | undefined;
    audience?: string | string[] | undefined;
    subject?: string | undefined;
    leeway?: number | undefined;
    maxAge?: number | undefined;
    now?: number | undefined;
};

const header = string.base64url(json.stringify({ alg: "HS256", typ: "JWT" }));
const shape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const longest = 8192;
const texts = ["sub", "iss", "jti"] as const;
const times = ["exp", "nbf", "iat"] as const;

function seconds ( now: number | undefined ): number {

    const at = Math.floor((now ?? Date.now()) / 1000);

    if ( Number.isFinite(at) ) return at;

    throw new RangeError("not a time");

}
function ahead ( value: number ): number {

    if ( Number.isFinite(value) ) return Math.max(0, Math.trunc(value));

    throw new RangeError("not a duration");

}
function listed ( value: string | readonly string[] | undefined ): readonly string[] {

    return value === undefined ? [] : typeof value === "string" ? [value] : value;

}
function sound ( body: json.Dictionary ): body is Claims {

    const audience = body.aud;

    if ( texts.some(( name ) => body[name] !== undefined && typeof body[name] !== "string") ) return false;
    if ( times.some(( name ) => body[name] !== undefined && !Number.isFinite(body[name])) ) return false;

    return audience === undefined || typeof audience === "string" || (Array.isArray(audience) && audience.every(( item ) => typeof item === "string"));

}
function split ( token: unknown ): readonly [string, string, string] | undefined {

    if ( typeof token !== "string" || token.length > longest || !shape.test(token) ) return undefined;

    const [head = "", body = "", signature = ""] = token.split(".");

    return [head, body, signature];

}
function read ( part: string ): json.Dictionary | undefined {

    const found = json.parse(string.utf8(string.fromBase64(part)));

    return json.isRecord(found) ? found : undefined;

}
function headed ( part: string ): boolean {

    if ( part === header ) return true;

    const found = read(part);
    const kind = found?.typ;

    return found !== undefined && found.alg === "HS256" && found.crit === undefined && (kind === undefined || (typeof kind === "string" && kind.toUpperCase() === "JWT"));

}
function claimed ( part: string ): Claims | undefined {

    const found = read(part);

    return found && sound(found) ? found : undefined;

}

export async function signToken ( claims: Claims, secret: string | Uint8Array, options: SignOptions = {} ): Promise<string> {

    const now = seconds(options.now);
    const body: Claims = { ...claims, iat: claims.iat ?? now };

    if ( options.expiresIn !== undefined ) body.exp = now + ahead(options.expiresIn);
    if ( options.notBefore !== undefined ) body.nbf = now + ahead(options.notBefore);
    if ( options.issuer !== undefined ) body.iss = options.issuer;
    if ( options.audience !== undefined ) body.aud = options.audience;
    if ( options.subject !== undefined ) body.sub = options.subject;
    if ( options.id !== undefined ) body.jti = options.id;

    const payload = `${header}.${string.base64url(json.stringify(body))}`;

    if ( !sound(body) || payload.length + 44 > longest ) throw new RangeError("not a claim");

    return `${payload}.${string.base64url(await mac(secret, payload))}`;

}
export function decodeToken ( token: string ): Claims | undefined {

    const parts = split(token);

    return parts ? claimed(parts[1]) : undefined;

}
export async function verifyToken ( token: string, secret: string | Uint8Array, options: VerifyOptions = {} ): Promise<Claims | undefined> {

    keyed(secret);

    const now = seconds(options.now);
    const leeway = ahead(options.leeway ?? 0);
    const maxAge = options.maxAge === undefined ? undefined : ahead(options.maxAge);
    const parts = split(token);

    if ( !parts || !headed(parts[0]) ) return undefined;

    const [head, body, signature] = parts;

    if ( !equal(string.base64url(await mac(secret, `${head}.${body}`)), signature) ) return undefined;

    const claims = claimed(body);

    if ( !claims ) return undefined;
    if ( claims.exp !== undefined && claims.exp + leeway <= now ) return undefined;
    if ( claims.nbf !== undefined && claims.nbf - leeway > now ) return undefined;
    if ( maxAge !== undefined && !(claims.iat !== undefined && now - claims.iat <= maxAge + leeway) ) return undefined;
    if ( options.issuer !== undefined && claims.iss !== options.issuer ) return undefined;
    if ( options.subject !== undefined && claims.sub !== options.subject ) return undefined;
    if ( options.audience !== undefined && !listed(options.audience).some(( name ) => listed(claims.aud).includes(name)) ) return undefined;

    return claims;

}
