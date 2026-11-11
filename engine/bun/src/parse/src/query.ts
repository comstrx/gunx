import * as json from "engine-json";

export type Arrays = "brackets" | "repeat";
export type QueryValue = string | string[];
export type Query = Record<string, QueryValue>;
export type QueryInput = Record<string, string | number | boolean | null | undefined | readonly (string | number | boolean)[]>;

const limit = 256;
const lost = "%EF%BF%BD";

function decode ( text: string ): string {

    const spaced = text.includes("+") ? text.replace(/\+/g, " ") : text;

    if ( !spaced.includes("%") ) return spaced;

    try {

        return decodeURIComponent(spaced);

    } catch {

        return spaced;

    }

}
function encode ( text: string ): string {

    try {

        return encodeURIComponent(text);

    } catch {

        return Array.from(text, ( point ) => (point.length === 1 && point >= "\ud800" && point <= "\udfff" ? lost : encodeURIComponent(point))).join("");

    }

}
function sendable ( value: unknown ): value is string | number | boolean {

    return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

}
export function query ( text: string ): Query {

    const out: Query = {};
    const hash = text.indexOf("#");
    const whole = hash === -1 ? text : text.slice(0, hash);
    const body = whole.startsWith("?") ? whole.slice(1) : whole;

    if ( body === "" ) return out;

    for ( const pair of body.split("&", limit) ) {

        if ( pair === "" ) continue;

        const at = pair.indexOf("=");
        const rawKey = decode(at === -1 ? pair : pair.slice(0, at));
        const value = at === -1 ? "" : decode(pair.slice(at + 1));
        const listed = rawKey.endsWith("[]");
        const key = listed ? rawKey.slice(0, -2) : rawKey;

        if ( key === "" || !json.safeKey(key) ) continue;

        const current = Object.hasOwn(out, key) ? out[key] : undefined;

        if ( Array.isArray(current) ) current.push(value);
        else if ( current !== undefined ) out[key] = [current, value];
        else out[key] = listed ? [value] : value;

    }

    return out;

}
export function queryString ( input: QueryInput, arrays: Arrays = "brackets" ): string {

    const parts: string[] = [];

    for ( const key of Object.keys(input).sort() ) {

        const value = input[key];
        const name = encode(key);

        if ( Array.isArray(value) ) {

            const label = arrays === "brackets" ? `${name}[]` : name;

            for ( const item of value ) if ( sendable(item) ) parts.push(item === "" ? label : `${label}=${encode(String(item))}`);

        } else if ( sendable(value) ) {

            parts.push(value === "" ? name : `${name}=${encode(String(value))}`);

        }

    }

    return parts.join("&");

}
export function isQuery ( value: unknown ): value is Query {

    return json.isPlain(value) && Object.values(value).every(( item ) => typeof item === "string" || (Array.isArray(item) && item.every(( inner ) => typeof inner === "string")));

}
