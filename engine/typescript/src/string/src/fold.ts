import { collapse } from "./text.ts";

const diacritics = /[\u0300-\u036f\u0610-\u061A\u064B-\u065F\u0670\u0640]/g;
const arabicDigits = /[٠-٩۰-۹]/g;
const asciiOnly = /^[\x20-\x7e]*$/;
const alef = /[أإآٱ]/g;
const sounds: Record<string, string> = { "ة": "ه", "ى": "ي", "ک": "ك", "ی": "ي" };
const sounded = /[ةىکی]/g;

export function asciiDigits ( text: string ): string {

    return text.replace(arabicDigits, ( digit ) => {

        const code = digit.charCodeAt(0);

        return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);

    });

}
export function digits ( text: string ): string {

    return asciiDigits(text).replace(/[^0-9]/g, "");

}
export function fold ( text: string ): string {

    if ( asciiOnly.test(text) ) return text.toLowerCase();

    const base = text.normalize("NFKD").replace(diacritics, "").replace(alef, "ا");

    return asciiDigits(base.replace(sounded, ( letter ) => sounds[letter] ?? letter)).toLowerCase();

}
export function bare ( text: string ): string {

    return collapse(fold(text).replace(/[^\p{L}\p{N}\s]+/gu, " "));

}
export function tokens ( text: string ): string[] {

    return bare(text).split(" ").filter(Boolean);

}
export function score ( candidate: string, query: string ): number {

    return grade(bare(candidate), bare(query));

}
export function grade ( haystack: string, needle: string ): number {

    if ( needle === "" ) return 0;
    if ( haystack === needle ) return 1;
    if ( haystack.startsWith(needle) ) return 0.9;

    const needles = needle.split(" ");
    const hay = haystack.split(" ");
    const matched = needles.filter(( token ) => hay.some(( word ) => word.startsWith(token))).length;

    if ( matched === needles.length ) return 0.7 + 0.1 * (needle.length / Math.max(needle.length, haystack.length));
    if ( haystack.includes(needle) ) return 0.6;

    return matched === 0 ? 0 : 0.3 * (matched / needles.length);

}
export function rank<T> ( items: readonly T[], query: string, read: ( item: T ) => string, limit = 10, floor = 0.3 ): T[] {

    const needle = bare(query);

    return items.map(( item, index ) => ({ item, index, value: grade(bare(read(item)), needle) }))
        .filter(( entry ) => entry.value >= floor)
        .sort(( a, b ) => b.value - a.value || a.index - b.index)
        .slice(0, limit)
        .map(( entry ) => entry.item);

}
