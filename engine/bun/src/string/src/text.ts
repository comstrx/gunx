export type Direction = "rtl" | "ltr";
export type PadSide = "start" | "end" | "both";
export type MaskKind = "email" | "phone" | "name" | "card" | "text";
export type MaskOptions = { kind?: MaskKind | undefined; keep?: number | undefined; keepEnd?: number | undefined; mark?: string | undefined };

const arabicRange = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const rtlRange = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const strong = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-ࣿיִ-﷿ﹰ-﻿]/;
const clustered = /[\p{M}\p{Cf}\p{Regional_Indicator}\p{Emoji_Modifier}\r\u0d4e\u0e33\u0eb3\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff\uff9e\uff9f\u{111c2}\u{111c3}\u{113d1}\u{1193f}\u{11941}\u{11a3a}\u{11a84}-\u{11a89}\u{11d46}\u{11f02}]/u;
const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const htmlNames = new Map(Object.entries(htmlEscapes).map(([letter, name]) => [name, letter]));
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

function paired ( text: string, at: number ): boolean {

    return at > 0 && at < text.length && (text.charCodeAt(at) & 0xfc00) === 0xdc00 && (text.charCodeAt(at - 1) & 0xfc00) === 0xd800;

}

export function isBlank ( value: unknown ): boolean {

    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");

}
export function isArabic ( text: string ): boolean {

    return arabicRange.test(text);

}
export function isAscii ( text: string ): boolean {

    for ( let index = 0; index < text.length; index += 1 ) if ( text.charCodeAt(index) > 127 ) return false;

    return true;

}
export function direction ( text: string ): Direction {

    const first = strong.exec(text);

    return first && rtlRange.test(first[0]) ? "rtl" : "ltr";

}
export function isolate ( text: string ): string {

    return direction(text) === "rtl" ? `⁧${text}⁩` : `⁦${text}⁩`;

}
export function graphemes ( text: string ): string[] {

    if ( !segmenter || !clustered.test(text) ) return [...text];

    return Array.from(segmenter.segment(text), ( part ) => part.segment);

}
export function length ( text: string ): number {

    return graphemes(text).length;

}
export function collapse ( text: string ): string {

    return text.replace(/\s+/g, " ").trim();

}
export function lines ( text: string ): string[] {

    return text.split(/\r\n|\r|\n/);

}
export function reverse ( text: string ): string {

    return graphemes(text).reverse().join("");

}
export function truncate ( text: string, limit: number, tail = "…" ): string {

    if ( text.length <= limit ) return text;

    const letters = graphemes(text);

    if ( letters.length <= limit ) return text;

    const room = Math.max(0, limit - graphemes(tail).length);

    return `${letters.slice(0, room).join("").trimEnd()}${tail}`;

}
export function excerpt ( text: string, phrase: string, radius = 40, tail = "…" ): string {

    const at = text.search(new RegExp(escapeRegExp(phrase), "i"));

    if ( at === -1 ) return truncate(text, radius * 2 + phrase.length, tail);

    const from = Math.max(0, at - radius);
    const to = Math.min(text.length, at + phrase.length + radius);
    const start = paired(text, from) ? from - 1 : from;
    const end = paired(text, to) ? to + 1 : to;

    return `${start > 0 ? tail : ""}${text.slice(start, end).trim()}${end < text.length ? tail : ""}`;

}
export function limitWords ( text: string, limit: number, tail = "…" ): string {

    const parts = collapse(text).split(" ");

    return parts.length <= limit ? collapse(text) : `${parts.slice(0, limit).join(" ")}${tail}`;

}
export function wordCount ( text: string ): number {

    const trimmed = collapse(text);

    return trimmed === "" ? 0 : trimmed.split(" ").length;

}
export function pad ( text: string, width: number, fill = " ", side: PadSide = "start" ): string {

    const units = graphemes(fill);
    const missing = Math.max(0, width - graphemes(text).length);

    if ( missing === 0 || units.length === 0 ) return text;

    const filler = ( count: number ): string => Array.from({ length: count }, ( _, index ) => units[index % units.length]).join("");

    if ( side === "start" ) return `${filler(missing)}${text}`;
    if ( side === "end" ) return `${text}${filler(missing)}`;

    const head = Math.floor(missing / 2);

    return `${filler(head)}${text}${filler(missing - head)}`;

}
export function initials ( text: string, limit = 2 ): string {

    return collapse(text).split(" ").filter(Boolean).slice(0, limit).map(( word ) => graphemes(word)[0] ?? "").join("").toUpperCase();

}
export function escapeHtml ( text: string ): string {

    return text.replace(/[&<>"']/g, ( char ) => htmlEscapes[char] ?? char);

}
export function unescapeHtml ( text: string ): string {

    return text.replace(/&(?:amp|lt|gt|quot|#39);/g, ( name ) => htmlNames.get(name) ?? name);

}
export function escapeRegExp ( text: string ): string {

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}
export function before ( text: string, search: string ): string {

    const at = text.indexOf(search);

    return at === -1 ? text : text.slice(0, at);

}
export function beforeLast ( text: string, search: string ): string {

    const at = text.lastIndexOf(search);

    return at === -1 ? text : text.slice(0, at);

}
export function after ( text: string, search: string ): string {

    const at = text.indexOf(search);

    return at === -1 ? "" : text.slice(at + search.length);

}
export function afterLast ( text: string, search: string ): string {

    const at = text.lastIndexOf(search);

    return at === -1 ? "" : text.slice(at + search.length);

}
export function between ( text: string, open: string, close: string ): string {

    return beforeLast(after(text, open), close);

}
export function start ( text: string, prefix: string ): string {

    return text.startsWith(prefix) ? text : `${prefix}${text}`;

}
export function finish ( text: string, suffix: string ): string {

    return text.endsWith(suffix) ? text : `${text}${suffix}`;

}
export function chopStart ( text: string, prefix: string ): string {

    return prefix !== "" && text.startsWith(prefix) ? text.slice(prefix.length) : text;

}
export function chopEnd ( text: string, suffix: string ): string {

    return suffix !== "" && text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;

}
export function unwrap ( text: string, open: string, close = open ): string {

    return chopEnd(chopStart(text, open), close);

}
export function deduplicate ( text: string, letter = " " ): string {

    return letter === "" ? text : text.replace(new RegExp(`(?:${escapeRegExp(letter)}){2,}`, "g"), letter);

}
export function swap ( text: string, pairs: Readonly<Record<string, string>> ): string {

    const keys = Object.keys(pairs).filter(( key ) => key !== "").sort(( a, b ) => b.length - a.length);

    return keys.length === 0 ? text : text.replace(new RegExp(keys.map(escapeRegExp).join("|"), "g"), ( found ) => pairs[found] ?? found);

}
export function remove ( text: string, search: string | RegExp ): string {

    return typeof search === "string" ? text.split(search).join("") : text.replace(search, "");

}
export function replaceFirst ( text: string, search: string, replacement: string ): string {

    const at = text.indexOf(search);

    return at === -1 ? text : `${text.slice(0, at)}${replacement}${text.slice(at + search.length)}`;

}
export function replaceLast ( text: string, search: string, replacement: string ): string {

    const at = text.lastIndexOf(search);

    return at === -1 ? text : `${text.slice(0, at)}${replacement}${text.slice(at + search.length)}`;

}
export function take ( text: string, count: number ): string {

    const letters = graphemes(text);
    const size = Math.trunc(count);

    return size > 0 ? letters.slice(0, size).join("") : size < 0 ? letters.slice(size).join("") : "";

}
export function chunk ( text: string, size: number ): string[] {

    const letters = graphemes(text);
    const step = size >= 1 ? Math.floor(size) : 1;
    const out: string[] = [];

    for ( let index = 0; index < letters.length; index += step ) out.push(letters.slice(index, index + step).join(""));

    return out;

}
export function count ( text: string, search: string ): number {

    if ( search === "" ) return 0;

    let found = 0;
    let at = text.indexOf(search);

    while ( at !== -1 ) {

        found += 1;
        at = text.indexOf(search, at + search.length);

    }

    return found;

}
export function startsWithAny ( text: string, prefixes: readonly string[] ): boolean {

    return prefixes.some(( prefix ) => text.startsWith(prefix));

}
export function endsWithAny ( text: string, suffixes: readonly string[] ): boolean {

    return suffixes.some(( suffix ) => text.endsWith(suffix));

}
export function includesAny ( text: string, needles: readonly string[] ): boolean {

    return needles.some(( needle ) => text.includes(needle));

}
export function includesAll ( text: string, needles: readonly string[] ): boolean {

    return needles.every(( needle ) => text.includes(needle));

}
export function wrap ( text: string, width: number ): string[] {

    const out: string[] = [];
    let line = "";

    for ( const word of collapse(text).split(" ") ) {

        if ( line !== "" && length(line) + 1 + length(word) > width ) {

            out.push(line);
            line = word;

        } else {

            line = line === "" ? word : `${line} ${word}`;

        }

    }

    if ( line !== "" ) out.push(line);

    return out;

}
function maskMiddle ( value: string, keep: number, keepEnd: number, mark: string ): string {

    const letters = graphemes(value);

    if ( letters.length <= keep + keepEnd + 1 ) return mark.repeat(Math.max(1, letters.length));

    return `${letters.slice(0, keep).join("")}${mark.repeat(letters.length - keep - keepEnd)}${keepEnd ? letters.slice(-keepEnd).join("") : ""}`;

}
export function mask ( value: string, options: MaskOptions = {} ): string {

    const { kind = "text", mark = "*" } = options;

    if ( kind === "email" ) {

        const at = value.indexOf("@");

        if ( at === -1 ) return maskMiddle(value, options.keep ?? 1, options.keepEnd ?? 0, mark);

        return `${maskMiddle(value.slice(0, at), options.keep ?? 1, options.keepEnd ?? 1, mark)}${value.slice(at)}`;

    }

    if ( kind === "phone" ) return maskMiddle(value, options.keep ?? 3, options.keepEnd ?? 2, mark);
    if ( kind === "card" ) return maskMiddle(value.replace(/\s+/g, ""), options.keep ?? 0, options.keepEnd ?? 4, mark).replace(/(.{4})(?=.)/g, "$1 ");
    if ( kind === "name" ) return collapse(value).split(" ").map(( word ) => maskMiddle(word, options.keep ?? 1, options.keepEnd ?? 0, mark)).join(" ");

    return maskMiddle(value, options.keep ?? 2, options.keepEnd ?? 2, mark);

}
