import * as json from "engine-json";
import * as parse from "engine-parse";

export type Parts = { protocol: string; host: string; hostname: string; port: string; path: string; query: parse.Query; hash: string; origin: string };

function cut ( text: string, mark: string ): [string, string] {

    const at = text.indexOf(mark);

    return at === -1 ? [text, ""] : [text.slice(0, at), text.slice(at)];

}
function dotted ( part: string ): boolean {

    const plain = part.replace(/%2e/gi, ".");

    return plain === "." || plain === "..";

}
function trimmed ( text: string ): string {

    let from = 0;
    let to = text.length;

    while ( from < to && text.charCodeAt(from) === 47 ) from += 1;
    while ( to > from && text.charCodeAt(to - 1) === 47 ) to -= 1;

    return text.slice(from, to);

}

export function sound ( value: string ): boolean {

    for ( let at = 0; at < value.length; at += 1 ) {

        const code = value.charCodeAt(at);

        if ( code < 32 || code === 127 || code === 92 ) return false;

    }

    return value !== "" && value.charCodeAt(0) !== 32 && value.charCodeAt(value.length - 1) !== 32;

}
export function schemeOf ( value: string ): string | undefined {

    const first = value.charCodeAt(0) | 32;

    if ( !(first >= 97 && first <= 122) ) return undefined;

    for ( let at = 1; at < value.length; at += 1 ) {

        const code = value.charCodeAt(at);
        const letter = code | 32;

        if ( code === 58 ) return value.slice(0, at).toLowerCase();
        if ( !(letter >= 97 && letter <= 122) && !(code >= 48 && code <= 57) && code !== 43 && code !== 45 && code !== 46 ) return undefined;

    }

    return undefined;

}
export function parseUrl ( value: string ): Parts | undefined {

    if ( !sound(value) ) return undefined;

    try {

        const url = new URL(value);

        return {
            protocol: url.protocol.slice(0, -1),
            host: url.host,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            query: parse.query(url.search),
            hash: url.hash.slice(1),
            origin: url.origin,
        };

    } catch {

        return undefined;

    }

}
export function isEndpoint ( value: string ): boolean {

    const parsed = parseUrl(value);

    return parsed !== undefined && (parsed.protocol === "http" || parsed.protocol === "https") && parsed.hostname !== "";

}
export function originOf ( value: string ): string | undefined {

    const origin = parseUrl(value)?.origin;

    return origin === undefined || origin === "null" ? undefined : origin;

}
export function isOrigin ( value: string ): boolean {

    return isEndpoint(value) && originOf(value) === value.toLowerCase();

}
export function hostname ( value: string ): string | undefined {

    return parseUrl(value)?.hostname;

}
export function sameOrigin ( a: string, b: string ): boolean {

    const left = originOf(a);

    return left !== undefined && left === originOf(b);

}
export function joinUrl ( base: string, ...segments: readonly string[] ): string {

    const [front, hash] = cut(base, "#");
    const [path, query] = cut(front, "?");
    const pieces: string[] = [];
    let end = path.length;

    while ( end > 0 && path.charCodeAt(end - 1) === 47 ) end -= 1;

    const head = path.slice(0, end);

    for ( const segment of segments ) {

        const piece = trimmed(segment);

        if ( piece === "" ) continue;
        if ( !sound(piece) || piece.split("/").some(dotted) ) throw new RangeError("not a path segment");

        pieces.push(piece);

    }

    return `${pieces.length === 0 ? head : `${head}/${pieces.join("/")}`}${query}${hash}`;

}
export function withQuery ( url: string, query: parse.QueryInput ): string {

    const [front, hash] = cut(url, "#");
    const [path, existing] = cut(front, "?");
    const merged: parse.QueryInput = parse.query(existing);

    for ( const name of Object.keys(query) ) {

        const value = query[name];

        if ( value !== undefined && json.safeKey(name) ) merged[name] = value;

    }

    const text = parse.queryString(merged, "repeat");

    return `${path}${text ? `?${text}` : ""}${hash}`;

}
export function stripQuery ( url: string ): string {

    return cut(cut(url, "#")[0], "?")[0];

}
