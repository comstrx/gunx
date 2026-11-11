import * as list from "engine-list";
import * as string from "engine-string";
import groupRows from "../data/emoji-groups.json" with { type: "json" };
import { isArabic } from "./country.ts";
import { type FlagPlace, flagCode, flagFile } from "./flag.ts";
import { live, once, rootOf, slot, word } from "./lazy.ts";

export type EmojiGroup = { key: string; name: { en: string; ar: string } };
export type Emoji = { glyph: string; code: string; group: string; name: { en: string; ar: string }; keywords: { en: readonly string[]; ar: readonly string[] } };
export type EmojiOptions = { folder?: string | undefined; flags?: FlagPlace | undefined; locale?: string | undefined };
export type Browse = { query?: string | undefined; group?: string | undefined; limit?: number | undefined };
export type Emojis = list.Catalog<Emoji> & {
    groups: readonly EmojiGroup[];
    files: readonly string[];
    of: ( group: string ) => Emoji[];
    browse: ( browse?: Browse ) => Emoji[];
    nameOf: ( glyph: string, locale?: string ) => string;
    groupName: ( key: string, locale?: string ) => string;
    shortcode: ( glyph: string ) => string | undefined;
    byShortcode: ( code: string ) => Emoji | undefined;
    imageOf: ( glyph: string ) => string | undefined;
};

export const emojiFolder = "/world/emoji";
export const emojiGroups: readonly EmojiGroup[] = groupRows as EmojiGroup[];

const selector = "\uFE0F";
const longest = 32;
const page = 400;
const hexed = /^[0-9a-f]{1,6}$/i;
const spaces = /[ \t]{2,}/g;
const edges = /[ \t]?(\r?\n)[ \t]?/g;
const pictographic = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u;
const sequence = /\p{Regional_Indicator}{2}|\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}/gu;
const titled = new Map(emojiGroups.map(( group ) => [group.key, group]));
const rows = slot<readonly Emoji[]>("emoji", async () => (await import("../data/emojis.json")).default as Emoji[]);

export const loadEmoji = rows.load;
export const emojiReady = rows.ready;

export function everyEmoji (): readonly Emoji[] {

    return rows.get();

}
export function plainEmoji ( glyph: string ): string {

    return word(glyph).replaceAll(selector, "");

}
export function emojiCode ( glyph: string ): string {

    const text = plainEmoji(glyph);
    let out = "";

    for ( let at = 0; at < text.length; ) {

        const point = text.codePointAt(at) ?? 0;

        out += `${out === "" ? "" : "-"}${point.toString(16)}`;
        at += point > 0xffff ? 2 : 1;

    }

    return out;

}
export function emojiGlyph ( code: string ): string {

    const parts = word(code).split("-");
    const points: number[] = [];

    if ( parts.length > longest ) return "";

    for ( const part of parts ) {

        if ( part === "" ) continue;

        const point = hexed.test(part) ? Number.parseInt(part, 16) : -1;

        if ( point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) ) return "";

        points.push(point);

    }

    return String.fromCodePoint(...points);

}
export function isEmoji ( text: string ): boolean {

    return pictographic.test(word(text));

}
export function emojisIn ( text: string ): string[] {

    return word(text).match(sequence) ?? [];

}
export function stripEmoji ( text: string ): string {

    return word(text).replace(sequence, "").replace(spaces, " ").replace(edges, "$1").trim();

}
export function onlyEmoji ( text: string ): boolean {

    return word(text).trim() !== "" && stripEmoji(text) === "";

}
export function defineEmoji ( options: EmojiOptions = {} ): Emojis {

    const { folder = emojiFolder, flags, locale = "en" } = options;
    const all = everyEmoji();
    const root = rootOf(folder);
    const found = list.catalog(all, ( emoji ) => plainEmoji(emoji.glyph), ( emoji ) => [emoji.glyph, emoji.name.en, emoji.name.ar].concat(emoji.keywords.en, emoji.keywords.ar));
    const get = ( glyph: string ): Emoji | undefined => found.get(plainEmoji(glyph));
    const sorted = once(() => {

        const out = new Map<string, Emoji[]>();

        for ( const emoji of all ) {

            const held = out.get(emoji.group);

            if ( held ) held.push(emoji);
            else out.set(emoji.group, [emoji]);

        }

        return out;

    });
    const short = once(() => {

        const out = new Map<string, Emoji>();

        for ( const emoji of all ) {

            const name = string.snake(emoji.name.en);

            if ( !out.has(name) ) out.set(name, emoji);

        }

        return out;

    });
    const files = once(() => {

        const out: string[] = [];

        for ( const emoji of all ) if ( flagCode(emoji.glyph) === undefined ) out.push(`${emoji.code}.webp`);

        return out;

    });

    return {
        ...found,
        get,
        has: ( glyph ) => get(glyph) !== undefined,
        groups: emojiGroups,
        get files (): readonly string[] {

            return files();

        },
        of: ( group ) => [...(sorted().get(word(group)) ?? [])],
        browse: ( browse = {} ) => {

            const { query, group, limit = page } = browse;
            const most = Number.isNaN(limit) ? page : Math.max(0, limit);
            const typed = word(query).trim();

            if ( typed === "" ) return (group ? (sorted().get(group) ?? []) : all).slice(0, most);
            if ( !group ) return found.search(typed, most);

            return found.search(typed, all.length).filter(( emoji ) => emoji.group === group).slice(0, most);

        },
        nameOf: ( glyph, given = locale ) => {

            const emoji = get(glyph);

            return emoji ? (isArabic(given) ? emoji.name.ar : emoji.name.en) || emoji.name.en : "";

        },
        groupName: ( key, given = locale ) => {

            const group = titled.get(key);

            return group ? (isArabic(given) ? group.name.ar : group.name.en) || group.name.en : key;

        },
        shortcode: ( glyph ) => {

            const emoji = get(glyph);

            return emoji ? `:${string.snake(emoji.name.en)}:` : undefined;

        },
        byShortcode: ( code ) => short().get(string.snake(word(code))),
        imageOf: ( glyph ) => {

            const emoji = get(glyph);

            if ( !emoji ) return undefined;

            const code = flagCode(emoji.glyph);

            return code ? flagFile(code, flags) : `${root}/${emoji.code}.webp`;

        },
    };

}

export const emojis: Emojis = live(once(() => defineEmoji()));
