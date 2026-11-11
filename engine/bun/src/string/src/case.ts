import { asciiDigits } from "./fold.ts";
import { collapse, escapeRegExp } from "./text.ts";

const splitter = /([a-z0-9])([A-Z])|([A-Z]+)([A-Z][a-z])/g;
const breaks = /[^\p{L}\p{N}]+/u;
const arabicLetters: Record<string, string> = {
    "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "g", "ح": "h", "خ": "kh", "د": "d", "ذ": "th", "ر": "r", "ز": "z",
    "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "a", "ء": "", "ئ": "e", "ؤ": "o", "ﻻ": "la",
};
const marks = /[ً-ْٰـ]/g;
const diacritics = /[̀-ͯ]/g;

export function words ( text: string ): string[] {

    return text.replace(splitter, ( _, a: string | undefined, b: string | undefined, c: string | undefined, d: string | undefined ) => (a !== undefined ? `${a} ${b}` : `${c} ${d}`)).split(breaks).filter(Boolean);

}
export function capitalize ( text: string ): string {

    const letters = [...text];

    return `${(letters[0] ?? "").toUpperCase()}${letters.slice(1).join("")}`;

}
export function uncapitalize ( text: string ): string {

    const letters = [...text];

    return `${(letters[0] ?? "").toLowerCase()}${letters.slice(1).join("")}`;

}
export function camel ( text: string ): string {

    return words(text).map(( word, index ) => (index === 0 ? word.toLowerCase() : capitalize(word.toLowerCase()))).join("");

}
export function pascal ( text: string ): string {

    return words(text).map(( word ) => capitalize(word.toLowerCase())).join("");

}
export function studly ( text: string ): string {

    return pascal(text);

}
export function snake ( text: string ): string {

    return words(text).map(( word ) => word.toLowerCase()).join("_");

}
export function kebab ( text: string ): string {

    return words(text).map(( word ) => word.toLowerCase()).join("-");

}
export function constant ( text: string ): string {

    return words(text).map(( word ) => word.toUpperCase()).join("_");

}
export function title ( text: string ): string {

    return collapse(text).split(" ").map(( word ) => capitalize(word.toLowerCase())).join(" ");

}
export function headline ( text: string ): string {

    return words(text).map(( word ) => capitalize(word.toLowerCase())).join(" ");

}
export function sentence ( text: string ): string {

    return capitalize(words(text).join(" ").toLowerCase());

}
export function transliterate ( text: string ): string {

    const stripped = text.replace(marks, "").normalize("NFD").replace(diacritics, "");

    return [...asciiDigits(stripped)].map(( letter ) => arabicLetters[letter] ?? letter).join("");

}
export function slug ( text: string, separator = "-" ): string {

    const kept = text.replace(marks, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, separator);
    const joint = `(?:${escapeRegExp(separator)})`;

    return separator === "" ? kept : kept.replace(new RegExp(`^${joint}+|${joint}+$`, "g"), "").replace(new RegExp(`${joint}{2,}`, "g"), separator);

}
