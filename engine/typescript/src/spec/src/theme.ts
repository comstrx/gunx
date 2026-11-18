import * as json from "engine-json";
import * as string from "engine-string";
import * as world from "engine-world";
import type { Painted, Themed, Toned } from "./arch.ts";

export const tones: readonly string[] = ["brand", "brandStrong", "brandSoft", "brandSoftStrong", "onBrand", "ink", "inkMuted", "surface", "surfaceRaised", "surfaceSunken", "line", "danger", "dangerStrong", "dangerSoft", "success", "successSoft", "warning", "warningSoft", "scrim", "shade"];

const generic = "ui-sans-serif, system-ui, sans-serif";

function told ( given: unknown ): Record<string, string> {

    return json.isRecord(given) ? Object.fromEntries(Object.entries(given).filter(( entry ): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")) : {};

}
function measured ( given: unknown ): Record<string, number | string> {

    return json.isRecord(given) ? Object.fromEntries(Object.entries(given).filter(( entry ): entry is [string, number | string] => (typeof entry[1] === "number" && Number.isFinite(entry[1])) || (typeof entry[1] === "string" && entry[1] !== ""))) : {};

}
function faced ( given: unknown ): Record<string, string[]> {

    const out: Record<string, string[]> = {};

    if ( json.isRecord(given) ) for ( const [name, value] of Object.entries(given) ) {

        const faces = (typeof value === "string" ? [value] : Array.isArray(value) ? value : []).filter(( face ): face is string => typeof face === "string" && face !== "");

        if ( faces.length > 0 ) out[name] = faces;

    }

    return out;

}
function branded ( brand: unknown ): Toned {

    const found = typeof brand === "string" && brand !== "" ? world.color(brand) : undefined;

    if ( found === undefined ) return { light: {}, dark: {} };

    const steps = world.shades(found);
    const hex = ( step: world.Shade ): string => world.toHex(steps[step]);

    return {
        light: { brand: hex(600), brandStrong: hex(700), brandSoft: hex(50), brandSoftStrong: hex(100), onBrand: world.toHex(world.onColor(steps[600])) },
        dark: { brand: hex(400), brandStrong: hex(300), brandSoft: hex(950), brandSoftStrong: hex(900), onBrand: world.toHex(world.onColor(steps[400])) },
    };

}
function toned ( given: unknown ): Toned {

    const held = json.isRecord(given) ? given : {};

    return { light: told(held.light), dark: told(held.dark) };

}

export function theme ( themes: unknown ): Themed {

    const held = json.isRecord(themes) ? themes : {};
    const color = json.isRecord(held.color) ? held.color : {};
    const brand = branded(held.brand);
    const custom = told(color.custom);
    const shadow = toned(held.shadow);

    return {
        color: { light: { ...brand.light, ...custom, ...told(color.light) }, dark: { ...brand.dark, ...custom, ...told(color.dark) } },
        shadow,
        radius: measured(held.radius),
        motion: measured(held.motion),
        font: faced(held.font),
    };

}
export function painted ( themed: Themed ): Painted {

    const lengths = ( given: Record<string, number | string>, unit: ( value: number ) => string, named: ( name: string ) => string ): Record<string, string> => Object.fromEntries(Object.entries(given).map(([name, value]) => [named(name), typeof value === "number" ? unit(value) : value]));
    const colored = ( given: Record<string, string>, kind: string ): Record<string, string> => Object.fromEntries(Object.entries(given).map(([name, value]) => [`${kind}-${string.kebab(name)}`, value]));
    const known = new Set(tones);

    return {
        base: {
            ...colored(themed.color.light, "color"),
            ...colored(themed.shadow.light, "shadow"),
            ...lengths(themed.radius, ( value ) => `${value / 16}rem`, ( name ) => `radius-${string.kebab(name)}`),
            ...lengths(themed.motion, ( value ) => `${value}ms`, ( name ) => (name === "ease" ? "ease-standard" : `motion-${string.kebab(name)}`)),
            ...Object.fromEntries(Object.entries(themed.font).map(([name, faces]) => [`font-${string.kebab(name)}`, `${faces.map(( face ) => JSON.stringify(face)).join(", ")}, ${generic}`])),
        },
        dark: { ...colored(themed.color.dark, "color"), ...colored(themed.shadow.dark, "shadow") },
        named: colored(Object.fromEntries(Object.entries(themed.color.light).filter(([name]) => !known.has(name))), "color"),
    };

}
