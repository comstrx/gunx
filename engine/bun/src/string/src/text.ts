import { collectGraphemes, countGraphemes, splitGraphemes as units } from "unicode-segmenter/grapheme";
import type { Direction, MaskOptions, PadSide } from "./arch.ts";

const arabicRange = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const rtlRange = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const strong = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-ࣿיִ-﷿ﹰ-﻿]/;
const complex = /[^\p{ASCII}]|\r/u;
const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const htmlNames = new Map(Object.entries(htmlEscapes).map(([letter, name]) => [name, letter]));
function budget ( value: number ): number {

    return Math.max(0, Math.trunc(value) || 0);

}
function trimmed ( text: string ): string {

    if ( !complex.test(text) ) return text.trim();

    let from = 0;
    let to = 0;
    let at = 0;
    let started = false;

    for ( const part of units(text) ) {

        if ( part.trim() !== "" ) {

            if ( !started ) from = at;

            started = true;
            to = at + part.length;

        }

        at += part.length;

    }

    return text.slice(from, to);

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

    return complex.test(text) ? collectGraphemes(text) : [...text];

}
export function length ( text: string ): number {

    if ( !complex.test(text) ) return text.length;

    return countGraphemes(text);

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

    const size = budget(limit);

    if ( size === 0 ) return "";
    if ( text.length <= size ) return text;

    const mark = take(tail, size);
    const room = Math.max(0, size - length(mark));
    let count = 0;
    let at = 0;
    let end = 0;

    for ( const part of units(text) ) {

        count += 1;

        if ( count > size ) return text.slice(0, end) + mark;

        at += part.length;

        if ( count <= room && part.trim() !== "" ) end = at;

    }

    return text;

}
export function excerpt ( text: string, phrase: string, radius = 40, tail = "…" ): string {

    const reach = budget(radius);
    const at = text.search(new RegExp(escapeRegExp(phrase), "i"));

    if ( at === -1 ) return truncate(text, reach * 2 + length(phrase), tail);

    let from = Math.max(0, at - reach);
    let to = Math.min(text.length, at + phrase.length + reach);

    if ( complex.test(text) && to > from ) {

        let start = 0;

        for ( const part of units(text) ) {

            const end = start + part.length;

            if ( start <= from && from < end ) from = start;

            if ( end >= to ) {

                to = end;

                break;

            }

            start = end;

        }

    }

    return (from > 0 ? tail : "") + trimmed(text.slice(from, to)) + (to < text.length ? tail : "");

}
export function limitWords ( text: string, limit: number, tail = "…" ): string {

    const size = budget(limit);

    if ( size === 0 ) return "";

    const parts: string[] = [];

    for ( const found of text.matchAll(/\S+/g) ) {

        if ( parts.length === size ) return parts.join(" ") + tail;

        parts.push(found[0]);

    }

    return parts.join(" ");

}
export function wordCount ( text: string ): number {

    let count = 0;

    for ( const _ of text.matchAll(/\S+/g) ) count += 1;

    return count;

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

    const size = budget(limit);
    let count = 0;
    let out = "";

    if ( size === 0 ) return out;

    for ( const found of text.matchAll(/\S+/g) ) {

        out += take(found[0], 1);
        count += 1;

        if ( count === size ) break;

    }

    return out.toUpperCase();

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

    const size = Math.trunc(count);

    if ( !size ) return "";
    if ( size < 0 ) return graphemes(text).slice(size).join("");
    if ( size >= text.length ) return text;

    let seen = 0;
    let end = 0;

    for ( const part of units(text) ) {

        end += part.length;
        seen += 1;

        if ( seen === size ) break;

    }

    return text.slice(0, end);

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
    let size = 0;

    for ( const found of text.matchAll(/\S+/g) ) {

        const word = found[0];
        const count = length(word);

        if ( line !== "" && size + 1 + count > width ) {

            out.push(line);
            line = word;
            size = count;

        } else {

            size += (line === "" ? 0 : 1) + count;
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
