import * as json from "engine-json";
import * as string from "engine-string";

export type Params = Record<string, string>;
export type Fallback = string | (( key: string ) => string);

type Route = { names: string[]; matcher: RegExp };

const keyPattern = /\{([a-zA-Z_][a-zA-Z0-9_.]*)(\*)?\}/g;
const slotPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)(\*)?\}/g;
const dots = new Set([".", ".."]);
const poison = "__proto__";
const longest = 4096;
const compiled = new Map<string, Route>();

export function templateKeys ( template: string ): string[] {

    return [...new Set(Array.from(template.matchAll(keyPattern), ( found ) => found[1] ?? ""))];

}
export function placeholders ( template: string ): string[] {

    return templateKeys(template);

}
export function interpolate ( template: string, data: Readonly<Record<string, unknown>>, fallback: Fallback = "" ): string {

    return template.replace(keyPattern, ( _, key: string ) => {

        const value = json.pathGet(data, key);

        if ( value !== undefined && value !== null ) return String(value);

        return typeof fallback === "function" ? fallback(key) : fallback;

    });

}
function piece ( text: string ): string {

    if ( dots.has(text) ) throw new RangeError("not a path segment");

    try {

        return encodeURIComponent(text);

    } catch {

        throw new RangeError("not a path segment");

    }

}
export function fill ( pattern: string, params: Readonly<Record<string, string | number>> ): string {

    return pattern.replace(keyPattern, ( _, key: string, rest: string | undefined ) => {

        const text = Object.hasOwn(params, key) ? String(params[key] ?? "") : "";

        return rest ? text.split("/").map(piece).join("/") : piece(text);

    });

}
export function segments ( path: string ): string[] {

    return bare(path).split("/").filter(Boolean);

}
function bare ( path: string ): string {

    const cut = path.search(/[?#]/);

    return cut === -1 ? path : path.slice(0, cut);

}
function shaped ( segment: string, names: string[] ): string {

    if ( segment === "*" ) return ".+";

    let source = "";
    let at = 0;

    for ( const found of segment.matchAll(slotPattern) ) {

        source += `${string.escapeRegExp(segment.slice(at, found.index))}${found[2] ? "(.+)" : "([^/]+)"}`;
        at = found.index + found[0].length;
        names.push(found[1] ?? "");

    }

    return `${source}${string.escapeRegExp(segment.slice(at))}`;

}
function compile ( pattern: string ): Route {

    const found = compiled.get(pattern);

    if ( found ) return found;

    const names: string[] = [];
    const source = pattern.split("/").filter(Boolean).map(( segment ) => shaped(segment, names)).join("/");
    const made = { names, matcher: new RegExp(`^/?${source}/?$`) };

    if ( compiled.size > 512 ) compiled.clear();

    compiled.set(pattern, made);

    return made;

}
function decoded ( raw: string ): string {

    if ( !raw.includes("%") ) return raw;

    try {

        return decodeURIComponent(raw);

    } catch {

        return raw;

    }

}
export function match ( pattern: string, path: string ): Params | undefined {

    if ( path.length > longest ) return undefined;

    const { names, matcher } = compile(pattern);
    const found = matcher.exec(bare(path));

    if ( !found ) return undefined;

    const params: Params = {};

    for ( const [index, name] of names.entries() ) if ( name !== poison ) params[name] = decoded(found[index + 1] ?? "");

    return params;

}
export function matches ( pattern: string, path: string ): boolean {

    return path.length <= longest && compile(pattern).matcher.test(bare(path));

}
