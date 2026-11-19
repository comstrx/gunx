import * as exception from "engine-exception";
import * as list from "engine-list";
import * as string from "engine-string";
import fontRows from "../data/fonts.json" with { type: "json" };
import type { Display, Family, FontLink } from "./arch.ts";
import { scripted } from "./language.ts";
import { baseOf, rootOf, word } from "./lazy.ts";

export const families: readonly Family[] = fontRows as unknown as Family[];

const systemStack = ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans", "sans-serif"];
const arabicFallback = ["Noto Naskh Arabic", "Tahoma"];
const displays: readonly string[] = ["auto", "swap", "optional", "block", "fallback"];
const arabic: ReadonlySet<string> = new Set(["ar", "ckb", "fa", "ks", "lrc", "mzn", "ps", "sd", "ug", "ur"]);
const spaced = /\s/;
const script = /^[A-Za-z]{4}$/;
const plain = /^[\w\-./:~%@+,=?&#]*$/;
const stacks = new Map<string, string>();

function quote ( family: string ): string {

    return spaced.test(family) && !family.startsWith('"') ? `"${family}"` : family;

}
function cased ( script: string ): string {

    const text = word(script).trim();

    return `${text.slice(0, 1).toUpperCase()}${text.slice(1).toLowerCase()}`;

}
function linked ( address: string ): string {

    let out = "";

    if ( plain.test(address) ) return `url(${address})`;

    for ( let at = 0; at < address.length; at += 1 ) {

        const code = address.charCodeAt(at);

        out += code < 32 || code === 34 || code === 60 || code === 92 || code === 127 ? `\\${code.toString(16)} ` : address.charAt(at);

    }

    return `url("${out}")`;

}
function written ( locale: string ): string {

    return scripted(locale) ?? (arabic.has(baseOf(locale)) ? "Arab" : "Latn");

}
function wanted ( scripts: readonly string[] ): Family[] {

    const asked = scripts.map(( name ) => (script.test(name.trim()) ? cased(name) : written(name)));

    return families.filter(( family ) => asked.length === 0 || family.scripts.length === 0 || family.scripts.some(( script ) => asked.includes(script)));

}

export function fontOf ( script: string ): Family | undefined {

    const asked = cased(script);

    return families.find(( family ) => family.scripts.includes(asked)) ?? families.find(( family ) => family.scripts.length === 0);

}
export function fontFiles (): string[] {

    return families.flatMap(( family ) => family.files.map(( face ) => face.file));

}
export function fontFaces ( folder: string, display: Display = "swap" ): string {

    const root = rootOf(word(folder));

    if ( !displays.includes(display) ) throw exception.misuse("not a display");

    return families.flatMap(( family ) => family.files.map(( face ) => [
        "@font-face {",
        `    font-family: ${quote(family.family)};`,
        "    font-style: normal;",
        `    font-weight: ${family.weight[0]} ${family.weight[1]};`,
        `    font-display: ${display};`,
        `    size-adjust: ${family.sizeAdjust};`,
        `    src: ${linked(`${root}/${face.file}`)} format("woff2");`,
        `    unicode-range: ${face.range};`,
        "}",
    ].join("\n"))).join("\n");

}
export function fontStack ( script: "Arab" | "Latn" | "any" = "any" ): string {

    const known = stacks.get(script);

    if ( known !== undefined ) return known;

    const own = families.filter(( family ) => script === "any" || family.scripts.length === 0 || family.scripts.includes(script)).map(( family ) => family.family);
    const made = list.unique(own.concat(script === "Arab" ? arabicFallback : [], systemStack)).map(quote).join(", ");

    if ( script === "Arab" || script === "Latn" || script === "any" ) stacks.set(script, made);

    return made;

}
export function fontLinks ( folder: string, scripts: readonly string[] = [], faces = Number.POSITIVE_INFINITY ): FontLink[] {

    const root = rootOf(word(folder));
    const kept = Number.isFinite(faces) ? Math.max(0, Math.trunc(faces)) : undefined;

    return wanted(scripts).flatMap(( family ) => family.files.slice(0, kept).map(( face ): FontLink => ({ rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous", href: `${root}/${face.file}` })));

}
export function fontPreload ( folder: string, scripts: readonly string[] = [], faces = Number.POSITIVE_INFINITY ): string[] {

    return fontLinks(folder, scripts, faces).map(( link ) => `<link rel="${link.rel}" as="${link.as}" type="${link.type}" crossorigin href="${string.escapeHtml(link.href)}">`);

}
export function fontFor ( locale: string ): string {

    return fontStack(written(locale) === "Arab" ? "Arab" : "Latn");

}
