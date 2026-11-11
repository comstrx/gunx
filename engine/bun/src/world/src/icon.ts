import * as string from "engine-string";
import { word } from "./lazy.ts";

export type Glyph = { path: string | readonly string[]; viewBox?: string | undefined; mirror?: boolean | undefined; filled?: boolean | undefined };
export type IconSet = Readonly<Record<string, string | Glyph>>;
export type Icon = { readonly name: string; readonly path: readonly string[]; readonly viewBox: string; readonly mirror: boolean; readonly filled: boolean };
export type Icons = {
    readonly size: number;
    resolve: ( name: string, direction?: "ltr" | "rtl" ) => Icon | undefined;
    nameOf: ( name: string ) => string | undefined;
    has: ( name: string ) => boolean;
    names: () => string[];
    search: ( query: string, limit?: number ) => string[];
    extend: ( more: IconSet, aliases?: Readonly<Record<string, string>> ) => Icons;
};

type Shape = { readonly path: readonly string[]; readonly viewBox: string; readonly mirror: boolean; readonly filled: boolean };
type Entry = { name: string; text: string };

const square = "0 0 24 24";
const boxed = /^-?\d+(?:\.\d+)?(?:[\s,]+-?\d+(?:\.\d+)?){3}$/;
const hops = 8;
const floor = 0.3;

function shaped ( glyph: string | Glyph ): Shape {

    if ( typeof glyph !== "string" && (typeof glyph !== "object" || glyph === null) ) throw new RangeError("not a glyph");

    const given: Glyph = typeof glyph === "string" ? { path: glyph } : glyph;
    const lines: readonly string[] = typeof given.path === "string" ? [given.path] : given.path;
    const viewBox = given.viewBox === undefined ? square : word(given.viewBox).trim();
    const sound = Array.isArray(lines) && lines.length > 0 && lines.every(( line ) => typeof line === "string" && line !== "");

    if ( !sound || !boxed.test(viewBox) ) throw new RangeError("not a glyph");

    return Object.freeze({ path: Object.freeze([...lines]), viewBox, mirror: given.mirror === true, filled: given.filled === true });

}
function merged ( base: ReadonlyMap<string, Shape>, set: IconSet ): Map<string, Shape> {

    const out = new Map(base);

    for ( const [name, glyph] of Object.entries(set) ) {

        const key = string.kebab(name);

        if ( key === "" ) throw new RangeError("not a glyph");

        out.set(key, shaped(glyph));

    }

    return out;

}
function linked ( base: ReadonlyMap<string, string>, aliases: Readonly<Record<string, string>> ): Map<string, string> {

    const out = new Map(base);

    for ( const [from, to] of Object.entries(aliases) ) {

        const key = string.kebab(from);
        const target = string.kebab(word(to));

        if ( key === "" || target === "" ) throw new RangeError("not an alias");

        if ( key === target ) out.delete(key);
        else out.set(key, target);

    }

    return out;

}
function built ( glyphs: ReadonlyMap<string, Shape>, alias: ReadonlyMap<string, string> ): Icons {

    const targets = new Map<string, string>();
    const plain = new Map<string, Icon>();
    const turned = new Map<string, Icon>();
    let sorted: string[] | undefined;
    let hay: Entry[] | undefined;

    for ( const from of alias.keys() ) {

        if ( glyphs.has(from) ) continue;

        let current = from;

        for ( let left = hops; left > 0; left -= 1 ) {

            const next = alias.get(current);

            if ( next === undefined ) break;

            current = next;

        }

        if ( alias.has(current) ) throw new RangeError("not an alias");
        if ( glyphs.has(current) ) targets.set(from, current);

    }

    const settled = ( key: string ): string | undefined => {

        const found = targets.get(key) ?? key;

        return glyphs.has(found) ? found : undefined;

    };
    const canonical = ( name: string ): string | undefined => {

        const text = word(name);

        return settled(text) ?? settled(string.kebab(text));

    };
    const listed = (): Entry[] => {

        const out: Entry[] = [];

        for ( const name of glyphs.keys() ) out.push({ name, text: string.bare(name) });
        for ( const [from, name] of targets ) out.push({ name, text: string.bare(from) });

        return out;

    };

    return {
        size: glyphs.size,
        nameOf: canonical,
        has: ( name ) => canonical(name) !== undefined,
        names: () => {

            if ( !sorted ) sorted = [...glyphs.keys()].sort();

            return [...sorted];

        },
        search: ( query, limit = 10 ) => {

            const needle = string.bare(word(query));
            const most = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 10;
            const best = new Map<string, number>();

            if ( needle === "" || most === 0 ) return [];
            if ( !hay ) hay = listed();

            for ( const entry of hay ) {

                const value = string.grade(entry.text, needle);

                if ( value >= floor && value > (best.get(entry.name) ?? 0) ) best.set(entry.name, value);

            }

            return [...best].sort(( a, b ) => b[1] - a[1]).slice(0, most).map(([name]) => name);

        },
        resolve: ( name, direction = "ltr" ) => {

            const key = canonical(name);
            const shape = key === undefined ? undefined : glyphs.get(key);

            if ( key === undefined || !shape ) return undefined;

            const held = direction === "rtl" && shape.mirror ? turned : plain;
            const known = held.get(key);

            if ( known ) return known;

            const made: Icon = Object.freeze({ name: key, path: shape.path, viewBox: shape.viewBox, mirror: held === turned, filled: shape.filled });

            held.set(key, made);

            return made;

        },
        extend: ( more, moreAliases = {} ) => {

            const kept = new Map(alias);

            for ( const name of Object.keys(more) ) kept.delete(string.kebab(name));

            return built(merged(glyphs, more), linked(kept, moreAliases));

        },
    };

}

export function icons ( set: IconSet, aliases: Readonly<Record<string, string>> = {} ): Icons {

    return built(merged(new Map(), set), linked(new Map(), aliases));

}
