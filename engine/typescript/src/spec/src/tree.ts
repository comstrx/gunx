import * as exception from "engine-exception";
import * as json from "engine-json";
import * as string from "engine-string";
import type { Brand, Found, Groups, Messages, Reactions, Schema, Screen, Spec, SpecOptions, Surface, SurfaceOptions, Table, Trigger } from "./arch.ts";
import { maxDepth, segmentPattern } from "./arch.ts";

const surfaces = new WeakSet<object>();
const specs = new WeakSet<object>();
const holds: readonly string[] = ["id", "config", "schema", "messages", "brand"];
const kinds: readonly (keyof Brand)[] = ["icons", "images", "fonts"];
const parts: readonly string[] = ["screens", "signals", "on", "triggers"];

function refused ( reason: string, message: string ): exception.Fault {

    return exception.fault("internal", reason, { message });

}
function tabled ( given: unknown, kind: string ): Table {

    if ( given === undefined ) return Object.freeze({});
    if ( !json.isRecord(given) || !Object.entries(given).every(([name, path]) => json.safeKey(name) && typeof path === "string" && path !== "") ) throw refused("spec.surface", `brand.${kind}: a table of names and the paths that replace them, such as { logo: "./logo.svg" }`);

    return Object.freeze({ ...given }) as Table;

}
function spoken ( given: unknown ): Messages {

    if ( given === undefined ) return Object.freeze({});
    if ( !json.isRecord(given) || !Object.entries(given).every(([locale, sheet]) => json.safeKey(locale) && json.isRecord(sheet)) ) throw refused("spec.surface", "messages: a table of locales and their texts, such as { en, ar }");

    return Object.freeze({ ...given }) as Messages;

}
function drawn ( given: Schema ): Pick<Surface, "screens" | "signals" | "on" | "triggers"> {

    const held: json.Dictionary = json.isRecord(given) ? given : {};
    const screens = Array.isArray(given) ? given : held.screens;
    const { signals = [], on = {}, triggers = [] } = held;

    for ( const key of Object.keys(held) ) if ( !parts.includes(key) ) throw refused("spec.surface", `schema.${key}: a schema holds ${parts.join(", ")}`);

    if ( !Array.isArray(screens) || !Array.isArray(signals) || !json.isRecord(on) || !Array.isArray(triggers) ) throw refused("spec.surface", "schema: the surface's screens, such as [home, orders] or { screens, signals, on, triggers }");

    return { screens: Object.freeze([...screens]) as readonly Screen[], signals: Object.freeze([...signals]) as readonly string[], on: Object.freeze({ ...on }) as Reactions, triggers: Object.freeze([...triggers]) as readonly Trigger[] };

}
function pieces ( written: string ): string[] {

    return typeof written === "string" ? written.split(/[.:]/) : [];

}
function ends ( whole: readonly string[], tail: readonly string[] ): boolean {

    return tail.length <= whole.length && tail.every(( piece, index ) => whole[whole.length - tail.length + index] === piece);

}
function under ( whole: readonly string[], group: readonly string[] ): boolean {

    return group.length < whole.length && group.every(( piece, index ) => whole[index] === piece);

}
function gathered ( groups: Groups, trail: readonly string[], into: Record<string, Surface> ): void {

    if ( trail.length > maxDepth ) throw refused("spec.define", `${trail.join(".")}: groups nest too deep`);

    for ( const name of Object.keys(groups) ) {

        const held: unknown = groups[name];
        const here = [...trail, name];

        if ( !segmentPattern.test(name) || !json.safeKey(name) ) throw refused("spec.define", `${here.join(".")}: a name is lowercase letters, digits, dashes and underscores, from a letter`);

        if ( isSurface(held) ) into[here.join(".")] = held;
        else if ( json.isRecord(held) ) gathered(held as Groups, here, into);
        else throw refused("spec.define", `${here.join(".")}: a spec holds surfaces and groups of them, such as { admin } or { shop: { admin, client } }`);

    }

}

export function isSurface ( value: unknown ): value is Surface {

    return typeof value === "object" && value !== null && surfaces.has(value);

}
export function isSpec ( value: unknown ): value is Spec {

    return typeof value === "object" && value !== null && specs.has(value);

}
export function surface ( given: SurfaceOptions ): Surface {

    if ( !json.isRecord(given) ) throw refused("spec.surface", "a surface is { config, schema, messages, brand }");

    for ( const key of Object.keys(given) ) if ( !holds.includes(key) ) throw refused("spec.surface", `${key}: a surface holds ${holds.join(", ")}`);

    if ( given.id !== undefined && (typeof given.id !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(given.id)) ) throw refused("spec.surface", "id: lowercase letters, digits, dots, dashes and underscores, from a letter");
    if ( given.config !== undefined && !json.isRecord(given.config) ) throw refused("spec.surface", "config: the surface's settings, themes, contents, contracts and features");
    if ( given.brand !== undefined && !json.isRecord(given.brand) ) throw refused("spec.surface", `brand: tables of ${kinds.join(", ")}`);

    for ( const key of Object.keys(given.brand ?? {}) ) if ( !kinds.includes(key as keyof Brand) ) throw refused("spec.surface", `brand.${key}: a brand holds ${kinds.join(", ")}`);

    const brand: Brand = { icons: tabled(given.brand?.icons, "icons"), images: tabled(given.brand?.images, "images"), fonts: tabled(given.brand?.fonts, "fonts") };
    const made: Surface = Object.freeze({ id: given.id, config: (given.config ?? {}) as json.Dictionary, ...drawn(given.schema), messages: spoken(given.messages), brand: Object.freeze(brand) });

    surfaces.add(made);

    return made;

}
export function define ( groups: Groups, options: SpecOptions = {} ): Spec {

    const found: Record<string, Surface> = {};

    if ( !json.isRecord(groups) ) throw refused("spec.define", "a spec holds surfaces and groups of them, such as { admin } or { shop: { admin, client } }");

    gathered(groups, [], found);

    const names = Object.keys(found);
    const first = names[0];

    if ( first === undefined ) throw refused("spec.define", "a spec names at least one surface, such as { admin }");

    const made = { surfaces: Object.freeze(found), names: Object.freeze(names), current: first };
    const asked = options.current === undefined ? undefined : locate(made, options.current);

    if ( asked?.issue ) throw refused("spec.define", `current: ${asked.issue.message}`);

    const spec: Spec = Object.freeze({ ...made, current: asked?.name ?? first });

    specs.add(spec);

    return spec;

}
export function locate ( spec: Pick<Spec, "names">, written: string, from?: string ): Found {

    const tail = pieces(written);
    const label = String(written).slice(0, 120);
    const all = spec.names.map(( name ) => ({ name, held: name.split(".") }));
    const group = from === undefined ? [] : from.split(".").slice(0, -1);
    const where = from === undefined ? "spec" : from;

    if ( tail.length === 0 || !tail.every(( piece ) => segmentPattern.test(piece)) ) return { issue: { path: where, rule: "surface.name", message: `${label}: a surface is named like delivery, v1.delivery or shop:v1:delivery` } };

    for ( let depth = group.length; depth >= 0; depth -= 1 ) {

        const scope = group.slice(0, depth);
        const exact = [...scope, ...tail].join(".");
        const near = all.filter(( one ) => under(one.held, scope) && ends(one.held, tail));

        if ( spec.names.includes(exact) ) return { name: exact };
        if ( near.length === 1 && near[0] ) return { name: near[0].name };
        if ( near.length > 1 ) return { issue: { path: where, rule: "surface.ambiguous", message: `${label}: names ${near.map(( one ) => one.name).join(" and ")}`, fix: "write more of the address, such as v1.delivery" } };

    }

    const closest = string.closest([...spec.names], tail.join("."), ( name ) => name, 0.4)?.item ?? string.closest(all, tail[tail.length - 1] ?? "", ( one ) => one.held[one.held.length - 1] ?? "", 0.4)?.item.name;
    const issue = { path: where, rule: "surface.unknown", message: `${label}: no surface carries this name`, fix: "name a surface the spec defines" };

    return { issue: closest === undefined ? issue : { ...issue, near: closest } };

}
