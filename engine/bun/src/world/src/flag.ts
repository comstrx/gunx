import { rootOf, word } from "./lazy.ts";

export type FlagFormat = "svg" | "webp";
export type FlagPlace = { folder?: string | undefined; format?: FlagFormat | undefined };

export const flagFolder = "/world/flag";

const indicator = 0x1f1e6;
const letter = 65;
const named = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function lettered ( code: number ): boolean {

    return code >= letter && code < letter + 26;

}
function lower ( code: unknown ): code is string {

    if ( typeof code !== "string" || code.length !== 2 ) return false;

    const first = code.charCodeAt(0);
    const second = code.charCodeAt(1);

    return first >= 97 && first <= 122 && second >= 97 && second <= 122;

}
function flagged ( point: number | undefined ): point is number {

    return point !== undefined && point >= indicator && point < indicator + 26;

}

export function flagEmoji ( code: string ): string {

    const upper = word(code).trim().toUpperCase();
    const first = upper.charCodeAt(0);
    const second = upper.charCodeAt(1);

    return upper.length === 2 && lettered(first) && lettered(second) ? String.fromCodePoint(indicator + first - letter, indicator + second - letter) : "";

}
export function flagCode ( glyph: string ): string | undefined {

    const text = word(glyph);
    const first = text.codePointAt(0);
    const second = text.codePointAt(2);

    return text.length === 4 && flagged(first) && flagged(second) ? String.fromCharCode(first - indicator + letter, second - indicator + letter) : undefined;

}
export function flagFile ( code: string, place: FlagPlace = {} ): string {

    const quick = lower(code);
    const name = quick ? code : word(code).trim().toLowerCase();

    return quick || (name.length <= 16 && named.test(name)) ? `${rootOf(place.folder ?? flagFolder)}/${name}.${place.format === "webp" ? "webp" : "svg"}` : "";

}
export function isFlag ( glyph: string ): boolean {

    return flagCode(glyph) !== undefined;

}
