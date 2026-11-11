import { split } from "./locale.ts";

export type Routing = { locales: readonly string[]; default: string; hide?: boolean | undefined };
export type Routed = { locale: string; path: string };

type Shape = { locale: string | undefined; segments: string[]; slash: boolean; tail: string };
type Index = { exact: Map<string, string>; spoken: Map<string, string> };

const tailed = /[?#]/;
const stray = /[\t\n\r\\]/;
const blank = /[\t\n\r]/g;
const back = /\\/g;
const indexes = new WeakMap<readonly string[], Index>();

function low ( name: string ): string {

    return name.includes("_") ? name.toLowerCase().replace(/_/g, "-") : name.toLowerCase();

}
function indexed ( locales: readonly string[] ): Index {

    const cached = indexes.get(locales);

    if ( cached ) return cached;

    const made: Index = { exact: new Map(), spoken: new Map() };

    for ( const locale of locales ) {

        const name = low(String(locale));
        const language = split(locale)?.language;

        if ( !made.exact.has(name) ) made.exact.set(name, locale);
        if ( language !== undefined && !made.spoken.has(language) ) made.spoken.set(language, locale);

    }

    indexes.set(locales, made);

    return made;

}
function known ( name: string, routing: Routing ): string | undefined {

    const asked = low(String(name));
    const index = indexed(routing.locales);

    return index.exact.get(asked) ?? index.spoken.get(asked);

}
function shape ( path: string, routing: Routing ): Shape {

    const text = typeof path === "string" ? path : "";
    const cut = text.search(tailed);
    const raw = cut === -1 ? text : text.slice(0, cut);
    const body = stray.test(raw) ? raw.replace(blank, "").replace(back, "/") : raw;
    const segments = body.split("/").filter(Boolean);
    const locale = segments[0] === undefined ? undefined : known(segments[0], routing);

    return { locale, segments: locale === undefined ? segments : segments.slice(1), slash: body.endsWith("/"), tail: cut === -1 ? "" : text.slice(cut) };

}
function joined ( segments: readonly string[], slash: boolean, tail: string ): string {

    return `/${segments.join("/")}${slash && segments.length > 0 ? "/" : ""}${tail}`;

}

export function localeOfPath ( path: string, routing: Routing ): Routed {

    const { locale, segments, slash, tail } = shape(path, routing);

    return { locale: locale ?? routing.default, path: joined(segments, slash, tail) };

}
export function routeOf ( path: string, locale: string, routing: Routing ): string {

    const { segments, slash, tail } = shape(path, routing);
    const target = known(locale, routing) ?? routing.default;
    const lead = routing.hide !== false && target === routing.default ? [] : [target];

    return joined([...lead, ...segments], slash && segments.length > 0, tail);

}
