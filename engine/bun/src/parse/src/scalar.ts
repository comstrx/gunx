import * as date from "engine-date";
import * as string from "engine-string";
import * as casts from "engine-value";

export type Semver = { major: number; minor: number; patch: number; prerelease: string; build: string };

type Table = readonly (readonly [string, number])[];

const spans: Table = [["ms msec msecs millisecond milliseconds", 1], ["s sec secs second seconds", 1000], ["m min mins minute minutes", 60_000], ["h hr hrs hour hours", 3_600_000], ["d day days", 86_400_000], ["w wk wks week weeks", 604_800_000]];
const sizes: Table = [["b byte bytes", 1], ["k kb kib", 1024], ["m mb mib", 1024 ** 2], ["g gb gib", 1024 ** 3], ["t tb tib", 1024 ** 4], ["p pb pib", 1024 ** 5]];
const durationUnits = named(spans);
const byteUnits = named(sizes);
const isoPattern = /^p(?:(\d+(?:\.\d+)?)w)?(?:(\d+(?:\.\d+)?)d)?(?:t(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?)?$/;
const isoSizes = [604_800_000, 86_400_000, 3_600_000, 60_000, 1000];
const rangePattern = /^(-?\d+(?:\.\d+)?)\s*(?:\.{2,3}|-|–|—|to)\s*(-?\d+(?:\.\d+)?)$/;
const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const shiftPattern = /^([+-])(\d+)(ms|mo|s|m|h|d|w|y)$/;
const instants = new Set(["now", "الآن", "الان", "دلوقتي"]);
const days = new Map([["today", 0], ["اليوم", 0], ["النهاردة", 0], ["النهارده", 0], ["tomorrow", 1], ["غدا", 1], ["غداً", 1], ["بكرة", 1], ["بكره", 1], ["yesterday", -1], ["أمس", -1], ["امس", -1], ["امبارح", -1], ["إمبارح", -1]]);
const escapes = new Map([["n", "\n"], ["r", "\r"], ["t", "\t"]]);
const poison = "__proto__";
const limit = 256;

function named ( table: Table ): Map<string, number> {

    return new Map(table.flatMap(([names, size]) => names.split(" ").map(( name ) => [name, size] as const)));

}
function clean ( value: unknown ): string {

    if ( typeof value !== "string" ) return typeof value === "number" || typeof value === "boolean" ? String(value) : "";

    const word = value.trim();

    return word.length > limit ? "" : string.asciiDigits(word);

}
function exact ( total: number ): number {

    return Math.round(total * 1000) / 1000;

}
function spanned ( text: string ): number | undefined {

    if ( text === "" ) return undefined;

    const iso = text.length > 1 && !text.endsWith("t") ? isoPattern.exec(text) : null;

    if ( iso ) return exact(isoSizes.reduce(( total, size, index ) => total + Number(iso[index + 1] ?? 0) * size, 0));

    let total = 0;
    let rest = text;

    while ( rest !== "" ) {

        const found = /^(\d+(?:\.\d+)?)([a-z]+)/.exec(rest);
        const size = found ? durationUnits.get(found[2] ?? "") : undefined;

        if ( !found || size === undefined ) return undefined;

        total += Number(found[1]) * size;
        rest = rest.slice(found[0].length);

    }

    return exact(total);

}
export function duration ( value: unknown, fallback?: number ): number | undefined {

    if ( typeof value === "number" ) return Number.isFinite(value) && value >= 0 ? value : fallback;

    const text = clean(value).toLowerCase().replace(/\s+/g, "");

    if ( text === "" ) return fallback;
    if ( /^\d+$/.test(text) ) return Number(text);

    return spanned(text) ?? fallback;

}
export function bytes ( value: unknown, fallback?: number ): number | undefined {

    if ( typeof value === "number" ) return value >= 0 && Number.isSafeInteger(Math.trunc(value)) ? Math.trunc(value) : fallback;

    const found = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(clean(value));
    const factor = found?.[2] ? byteUnits.get(found[2].toLowerCase()) : 1;
    const total = found && factor !== undefined ? Math.round(Number(found[1]) * factor) : Number.NaN;

    return Number.isSafeInteger(total) ? total : fallback;

}
export function keyValue ( value: unknown, pairSeparator: string | RegExp = /[,;\n]/, keySeparator = "=" ): Record<string, string> {

    const out: Record<string, string> = {};

    if ( keySeparator === "" ) return out;

    for ( const pair of casts.list(value, pairSeparator) ) {

        const at = pair.indexOf(keySeparator);
        const key = at > 0 ? pair.slice(0, at).trim() : "";

        if ( key !== "" && key !== poison ) out[key] = pair.slice(at + keySeparator.length).trim();

    }

    return out;

}
export function env ( text: string ): Record<string, string> {

    const out: Record<string, string> = {};
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const opener = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/gm;
    const quoted = /[ \t]*(?:"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|`([^`]*)`)[ \t]*(?:#[^\r\n]*)?$/my;
    const plain = /[^\r\n]*/y;

    for ( let found = opener.exec(body); found; found = opener.exec(body) ) {

        quoted.lastIndex = opener.lastIndex;
        plain.lastIndex = opener.lastIndex;

        const wrapped = quoted.exec(body);
        const rest = wrapped ? "" : plain.exec(body)?.[0] ?? "";
        const note = rest.search(/[ \t]#/);
        const value = wrapped ? (wrapped[1]?.replace(/\\([nrt"\\])/g, ( _, letter: string ) => escapes.get(letter) ?? letter) ?? wrapped[2] ?? wrapped[3] ?? "") : (note === -1 ? rest : rest.slice(0, note)).trim();

        opener.lastIndex = wrapped ? quoted.lastIndex : plain.lastIndex;

        if ( found[1] !== undefined && found[1] !== poison ) out[found[1]] = value;

    }

    return out;

}
export function range ( value: unknown ): [number, number] | undefined {

    const found = rangePattern.exec(clean(value).toLowerCase());

    if ( !found ) {

        const single = casts.number(value);

        return single === undefined ? undefined : [single, single];

    }

    const low = Number(found[1]);
    const high = Number(found[2]);

    return [Math.min(low, high), Math.max(low, high)];

}
export function semver ( value: unknown ): Semver | undefined {

    const found = semverPattern.exec(clean(value));

    if ( !found ) return undefined;

    const [major, minor, patch] = [Number(found[1]), Number(found[2]), Number(found[3])];

    if ( !(Number.isSafeInteger(major) && Number.isSafeInteger(minor) && Number.isSafeInteger(patch)) ) return undefined;

    return { major, minor, patch, prerelease: found[4] ?? "", build: found[5] ?? "" };

}
function ordered ( a: number | string, b: number | string ): -1 | 0 | 1 {

    return a < b ? -1 : a > b ? 1 : 0;

}
function ranked ( a: string, b: string ): -1 | 0 | 1 {

    const [left, right] = [/^\d+$/.test(a), /^\d+$/.test(b)];

    if ( left && right ) return ordered(a.length, b.length) || ordered(a, b);

    return left ? -1 : right ? 1 : ordered(a, b);

}
function staged ( a: string, b: string ): -1 | 0 | 1 {

    if ( a === b ) return 0;
    if ( a === "" || b === "" ) return a === "" ? 1 : -1;

    const [left, right] = [a.split("."), b.split(".")];

    for ( const [index, part] of left.entries() ) {

        const other = right[index];
        const found = other === undefined ? 1 : ranked(part, other);

        if ( found !== 0 ) return found;

    }

    return left.length < right.length ? -1 : 0;

}
function versioned ( value: string | Semver ): Semver | undefined {

    if ( typeof value === "string" ) return semver(value);

    const sound = typeof value === "object" && value !== null && [value.major, value.minor, value.patch].every(( part ) => Number.isSafeInteger(part) && part >= 0) && typeof value.prerelease === "string";

    return sound ? value : undefined;

}
export function compareSemver ( a: string | Semver, b: string | Semver ): -1 | 0 | 1 | undefined {

    const [left, right] = [versioned(a), versioned(b)];

    if ( !left || !right ) return undefined;

    return ordered(left.major, right.major) || ordered(left.minor, right.minor) || ordered(left.patch, right.patch) || staged(left.prerelease, right.prerelease);

}
function shifted ( reference: Date, sign: number, count: number, unit: string ): Date | undefined {

    if ( unit === "mo" ) return date.add(reference, { months: sign * count });
    if ( unit === "y" ) return date.add(reference, { years: sign * count });

    return new Date(reference.getTime() + sign * count * (durationUnits.get(unit) ?? 0));

}
function moved ( text: string, reference: Date ): Date | undefined {

    const instant = text.replace(/\s+/g, "");
    const shift = shiftPattern.exec(instant);

    if ( shift ) return shifted(reference, shift[1] === "-" ? -1 : 1, Number(shift[2]), shift[3] ?? "");

    const ahead = instant.startsWith("in") ? spanned(instant.slice(2)) : undefined;
    const behind = instant.endsWith("ago") ? spanned(instant.slice(0, -3)) : undefined;

    if ( ahead === undefined && behind === undefined ) return undefined;

    return new Date(reference.getTime() + (ahead ?? 0) - (behind ?? 0));

}
export function when ( value: unknown, reference: Date = new Date() ): Date | undefined {

    const word = clean(value);
    const text = word.toLowerCase();

    if ( text === "" || !date.valid(reference) ) return undefined;
    if ( instants.has(text) ) return new Date(reference.getTime());

    const offset = days.get(text);

    if ( offset !== undefined ) return date.add(date.startOf(reference, "day"), { days: offset });

    const found = moved(text, reference) ?? date.from(word);

    return date.valid(found) ? found : undefined;

}
