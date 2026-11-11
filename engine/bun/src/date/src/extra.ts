import * as number from "engine-number";
import { add, daysIn, from, type Input, isSame, mod, startOf, strict, today, tomorrow, type Unit, utc, yesterday } from "./calendar.ts";
import { type Held, held } from "./intl.ts";

export type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number; weekday: number };
export type Grid = { weeks: (Date | undefined)[][]; month: number; year: number };
export type Span = { days: number; hours: number; minutes: number; seconds: number; ms: number; negative: boolean };

const day = 86_400_000;
const fields = ["year", "month", "day", "hour", "minute", "second", "millisecond"] as const;
const codes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const lettered = /^[a-z]{2}$/;
const area = /^\d{3}$/;
const scripted = /^[a-z]{4}$/;
const hosts: Held<string | undefined> = new Map();
const anchors = new Map<string, Unit>([["hour", "hour"], ["day", "day"], ["week", "day"], ["month", "month"], ["quarter", "quarter"], ["year", "year"]]);

function table<T> ( rows: readonly (readonly [string, T])[] ): Map<string, T> {

    return new Map(rows.flatMap(([keys, value]) => keys.split(" ").map(( key ) => [key, value] as const)));

}

const firstDays = table([
    ["MV", 5],
    ["AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY", 6],
    ["AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW", 0],
]);
const restDays = table<readonly [number, number]>([
    ["IR", [5, 5]],
    ["IN UG", [0, 0]],
    ["AF", [4, 5]],
    ["BH DZ EG IL IQ JO KW LY OM QA SA SD SY YE", [5, 6]],
]);
const likely = table([
    ["ar", "EG"], ["en haw", "US"], ["fa", "IR"], ["ps", "AF"], ["sd ur", "PK"], ["bn", "BD"], ["ja", "JP"], ["ko", "KR"], ["he", "IL"], ["th", "TH"],
    ["as bho brx doi gu hi kn kok ks mai ml mni mr or pa raj sa sat ta te", "IN"], ["id jv su", "ID"], ["pt", "BR"], ["km", "KH"], ["lo", "LA"], ["my", "MM"],
    ["ne", "NP"], ["am om ti", "ET"], ["dv", "MV"], ["mt", "MT"], ["af nr nso ss st tn ts ve xh zu", "ZA"], ["ceb fil tl", "PH"], ["dz", "BT"], ["ckb", "IQ"],
    ["sm", "WS"], ["mh", "MH"], ["ch", "GU"], ["yue zh-hant", "TW"], ["qu", "PE"], ["gn", "PY"], ["nd sn", "ZW"], ["is", "IS"], ["lg", "UG"],
]);

function subtags ( locale: string ): string[] {

    return typeof locale !== "string" || locale.length > 64 ? [] : locale.toLowerCase().replace(/_/g, "-").split("-");

}
function hosted ( tag: string ): string | undefined {

    return held(hosts, tag, () => {

        try {

            return "Locale" in Intl ? new Intl.Locale(tag).maximize().region : undefined;

        } catch {

            return undefined;

        }

    });

}
function regionOf ( tags: readonly string[] ): string {

    const language = tags[0] ?? "";
    const second = tags[1] ?? "";
    const script = scripted.test(second);
    const region = (script ? tags[2] : second) ?? "";

    if ( lettered.test(region) ) return region.toUpperCase();
    if ( area.test(region) || language === "" ) return "";

    const tag = script ? `${language}-${second}` : language;

    return likely.get(tag) ?? hosted(tag) ?? likely.get(language) ?? "";

}
function wished ( tags: readonly string[] ): number {

    const extension = tags.indexOf("u");
    const key = extension === -1 ? -1 : tags.indexOf("fw", extension + 1);

    return key === -1 ? -1 : codes.indexOf(tags[key + 1] ?? "");

}
function thursday ( found: Date ): Date {

    const time = found.getTime();

    return new Date(time - mod(time, day) + (4 - (found.getUTCDay() || 7)) * day);

}
function edge ( values: readonly Input[], later: boolean ): Date | undefined {

    let found: number | undefined;

    for ( const value of values ) {

        const time = from(value)?.getTime();

        if ( time !== undefined && (found === undefined || (later ? time > found : time < found)) ) found = time;

    }

    return found === undefined ? undefined : new Date(found);

}

export function parts ( value: Input ): Parts | undefined {

    const found = from(value);

    if ( !found ) return undefined;

    return {
        year: found.getUTCFullYear(),
        month: found.getUTCMonth() + 1,
        day: found.getUTCDate(),
        hour: found.getUTCHours(),
        minute: found.getUTCMinutes(),
        second: found.getUTCSeconds(),
        millisecond: found.getUTCMilliseconds(),
        weekday: found.getUTCDay(),
    };

}
export function fromParts ( given: Partial<Omit<Parts, "weekday">> ): Date | undefined {

    const { year = 1970, month = 1, day: date = 1, hour = 0, minute = 0, second = 0, millisecond = 0 } = given;

    return strict(year, month, date, { hour, minute, second, millisecond });

}
export function set ( value: Input, given: Partial<Omit<Parts, "weekday">> ): Date | undefined {

    const current = parts(value);

    if ( !current ) return undefined;

    const next = { ...current };

    for ( const field of fields ) {

        const wanted = given[field];

        if ( wanted !== undefined ) next[field] = wanted;

    }

    if ( given.day === undefined ) next.day = Math.min(next.day, daysIn(next.year, next.month));

    return fromParts(next);

}
export function weekStart ( locale = "en" ): number {

    const tags = subtags(locale);
    const forced = wished(tags);

    return forced === -1 ? firstDays.get(regionOf(tags)) ?? 1 : forced;

}
export function weekend ( locale = "en" ): [number, number] {

    const [start, end] = restDays.get(regionOf(subtags(locale))) ?? [6, 0];

    return [start, end];

}
export function isWeekend ( value: Input, locale = "en" ): boolean {

    const found = from(value);
    const [start, end] = weekend(locale);

    return found !== undefined && mod(found.getUTCDay() - start, 7) <= mod(end - start, 7);

}
export function quarter ( value: Input ): number {

    const found = from(value);

    return found ? Math.floor(found.getUTCMonth() / 3) + 1 : 0;

}
export function dayOfYear ( value: Input ): number {

    const found = from(value);

    return found ? Math.floor((found.getTime() - utc(found.getUTCFullYear()).getTime()) / day) + 1 : 0;

}
export function weekOfYear ( value: Input ): number {

    const found = from(value);

    if ( !found ) return 0;

    const pivot = thursday(found);

    return Math.floor((pivot.getTime() - utc(pivot.getUTCFullYear()).getTime()) / day / 7) + 1;

}
export function weekYear ( value: Input ): number {

    const found = from(value);

    return found ? thursday(found).getUTCFullYear() : Number.NaN;

}
export function range ( start: Input, end: Input, step: "hour" | "day" | "week" | "month" | "quarter" | "year" = "day" ): Date[] {

    const anchor = anchors.get(step);
    const first = anchor && startOf(start, anchor);
    const last = from(end);
    const out: Date[] = [];

    if ( !first || !last ) return out;

    let cursor: Date | undefined = first;

    while ( cursor && cursor.getTime() <= last.getTime() && out.length < 10_000 ) {

        out.push(cursor);
        cursor = add(first, { [`${step}s`]: out.length });

    }

    return out;

}
export function grid ( value: Input, locale = "en" ): Grid | undefined {

    const found = from(value);

    if ( !found ) return undefined;

    const year = found.getUTCFullYear();
    const month = found.getUTCMonth() + 1;
    const lead = mod(utc(year, month).getUTCDay() - weekStart(locale), 7);
    const cells: (Date | undefined)[] = Array.from({ length: lead }, () => undefined);

    for ( let date = 1; date <= daysIn(year, month); date += 1 ) cells.push(utc(year, month, date));

    while ( cells.length % 7 !== 0 ) cells.push(undefined);

    const weeks: (Date | undefined)[][] = [];

    for ( let index = 0; index < cells.length; index += 7 ) weeks.push(cells.slice(index, index + 7));

    return { weeks, month, year };

}
export function age ( birth: Input, at: Input = new Date() ): number {

    const born = from(birth);
    const when = from(at);

    if ( !born || !when ) return Number.NaN;

    const early = when.getUTCMonth() < born.getUTCMonth() || (when.getUTCMonth() === born.getUTCMonth() && when.getUTCDate() < born.getUTCDate());

    return Math.max(0, when.getUTCFullYear() - born.getUTCFullYear() - (early ? 1 : 0));

}
export function compare ( a: Input, b: Input ): number {

    const left = from(a)?.getTime();
    const right = from(b)?.getTime();

    if ( left === undefined || right === undefined ) return left === right ? 0 : left === undefined ? 1 : -1;

    return number.sign(left - right);

}
export function clamp ( value: Input, low: Input, high: Input ): Date | undefined {

    const found = from(value);

    if ( !found ) return undefined;

    const time = found.getTime();

    return new Date(number.clamp(time, from(low)?.getTime() ?? time, from(high)?.getTime() ?? time));

}
export function earliest ( values: readonly Input[] ): Date | undefined {

    return edge(values, false);

}
export function latest ( values: readonly Input[] ): Date | undefined {

    return edge(values, true);

}
export function isToday ( value: Input ): boolean {

    return isSame(value, today(), "day");

}
export function isTomorrow ( value: Input ): boolean {

    return isSame(value, tomorrow(), "day");

}
export function isYesterday ( value: Input ): boolean {

    return isSame(value, yesterday(), "day");

}
export function isPast ( value: Input ): boolean {

    const found = from(value);

    return found !== undefined && found.getTime() < Date.now();

}
export function isFuture ( value: Input ): boolean {

    const found = from(value);

    return found !== undefined && found.getTime() > Date.now();

}
export function span ( later: Input, earlier: Input ): Span | undefined {

    const a = from(later);
    const b = from(earlier);

    if ( !a || !b ) return undefined;

    const total = a.getTime() - b.getTime();
    const ms = Math.abs(total);

    return { days: Math.floor(ms / day), hours: Math.floor((ms % day) / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000), seconds: Math.floor((ms % 60_000) / 1000), ms, negative: total < 0 };

}
