import * as number from "engine-number";
import * as string from "engine-string";
import { from, type Input, mod } from "./calendar.ts";
import { type Parts, parts } from "./extra.ts";
import { type Held, held, tongue } from "./intl.ts";
import { type Names, names } from "./names.ts";
import { inTimeZone, offset } from "./zone.ts";

export type Style = "date" | "time" | "datetime" | "long" | "short" | "clock" | "month" | "weekday" | "near";
export type FormatOptions = { locale?: string | undefined; numerals?: number.Numerals | undefined; timeZone?: string | undefined };
export type Duration = { days: number; hours: number; minutes: number; seconds: number; total: number };

type Scale = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";
type Writer = ( read: Parts, table: Names, east: number ) => string;
type Voice = readonly [Intl.RelativeTimeFormat, Intl.RelativeTimeFormat];

const tokens = /YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|D|HH|H|hh|h|mm|m|SSS|ss|s|A|a|Z|\[[^\]]*\]/g;
const ladder: readonly (readonly [Scale, number])[] = [["year", 31_557_600], ["month", 2_629_800], ["week", 604_800], ["day", 86_400], ["hour", 3600], ["minute", 60], ["second", 1]];
const styles = new Map<string, Intl.DateTimeFormatOptions>([
    ["date", { dateStyle: "medium" }],
    ["time", { timeStyle: "short" }],
    ["datetime", { dateStyle: "medium", timeStyle: "short" }],
    ["long", { dateStyle: "full" }],
    ["short", { dateStyle: "short" }],
    ["clock", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }],
    ["month", { month: "long", year: "numeric" }],
    ["weekday", { weekday: "long" }],
    ["near", { month: "short", day: "numeric" }],
]);
const arabic = new Map<Scale, readonly [string, string, string]>([
    ["second", ["ثانية", "ثانيتين", "ثوانٍ"]],
    ["minute", ["دقيقة", "دقيقتين", "دقائق"]],
    ["hour", ["ساعة", "ساعتين", "ساعات"]],
    ["day", ["يوم", "يومين", "أيام"]],
    ["week", ["أسبوع", "أسبوعين", "أسابيع"]],
    ["month", ["شهر", "شهرين", "أشهر"]],
    ["year", ["سنة", "سنتين", "سنوات"]],
]);
const writers = new Map<string, Writer>([
    ["YYYY", ( read ) => number.pad(read.year, 4)],
    ["YY", ( read ) => number.pad(mod(read.year, 100))],
    ["MMMM", ( read, table ) => table.months[read.month - 1] ?? ""],
    ["MMM", ( read, table ) => table.monthsShort[read.month - 1] ?? ""],
    ["MM", ( read ) => number.pad(read.month)],
    ["M", ( read ) => String(read.month)],
    ["DDDD", ( read, table ) => table.days[read.weekday] ?? ""],
    ["DDD", ( read, table ) => table.daysShort[read.weekday] ?? ""],
    ["DD", ( read ) => number.pad(read.day)],
    ["D", ( read ) => String(read.day)],
    ["HH", ( read ) => number.pad(read.hour)],
    ["H", ( read ) => String(read.hour)],
    ["hh", ( read ) => number.pad(read.hour % 12 || 12)],
    ["h", ( read ) => String(read.hour % 12 || 12)],
    ["mm", ( read ) => number.pad(read.minute)],
    ["m", ( read ) => String(read.minute)],
    ["SSS", ( read ) => number.pad(read.millisecond, 3)],
    ["ss", ( read ) => number.pad(read.second)],
    ["s", ( read ) => String(read.second)],
    ["A", ( read, table ) => table.meridiem[read.hour < 12 ? 0 : 1]],
    ["a", ( read, table ) => table.meridiem[read.hour < 12 ? 0 : 1].toLowerCase()],
    ["Z", ( _read, _table, east ) => shifted(east)],
]);
const formatters: Held<Intl.DateTimeFormat | undefined> = new Map();
const voices: Held<Voice | undefined> = new Map();
const counters: Held<Intl.NumberFormat | undefined> = new Map();

function shifted ( east: number ): string {

    if ( !(Math.abs(east) > 0) ) return "Z";

    const size = Math.abs(east);

    return `${east < 0 ? "-" : "+"}${number.pad(Math.floor(size / 60))}:${number.pad(size % 60)}`;

}
function tagged ( options: FormatOptions ): string {

    const tag = tongue(options.locale ?? "en");
    const { numerals } = options;

    return numerals === "arab" || numerals === "latn" ? `${tag.split("-u-")[0] ?? tag}-u-nu-${numerals}` : tag;

}
function shaped ( style: string, options: FormatOptions ): Intl.DateTimeFormat | undefined {

    const { timeZone = "UTC" } = options;

    if ( typeof timeZone !== "string" || timeZone.length > 64 ) return undefined;

    const tag = tagged(options);

    return held(formatters, `${style}|${tag}|${timeZone}`, () => {

        try {

            return new Intl.DateTimeFormat(tag, { timeZone, ...styles.get(style) });

        } catch {

            return undefined;

        }

    });

}
function yearIn ( found: Date, timeZone: string ): number | undefined {

    return timeZone === "UTC" ? found.getUTCFullYear() : inTimeZone(found, timeZone)?.year;

}
function styled ( found: Date, style: string, options: FormatOptions ): string {

    const zone = options.timeZone ?? "UTC";
    const far = style === "near" && yearIn(found, zone) !== yearIn(new Date(), zone);

    return shaped(far ? "date" : style, options)?.format(found) ?? "";

}
function patterned ( found: Date, pattern: string, options: FormatOptions ): string {

    const zone = options.timeZone ?? "UTC";
    const read = zone === "UTC" ? parts(found) : inTimeZone(found, zone);

    if ( !read ) return "";

    const table = names(options.locale);
    const east = zone === "UTC" || !pattern.includes("Z") ? 0 : offset(found, zone);
    const text = pattern.replace(tokens, ( token ) => (token.startsWith("[") ? token.slice(1, -1) : writers.get(token)?.(read, table, east) ?? token));

    return options.numerals ? number.numerals(text, options.numerals) : text;

}
function measured ( seconds: number ): readonly [Scale, number] {

    for ( const [index, [unit, size]] of ladder.entries() ) {

        const below = ladder[index + 1]?.[1] ?? 1;

        if ( seconds >= size || Math.round(seconds / below) * below >= size ) return [unit, Math.max(1, Math.round(seconds / size))];

    }

    return ["second", Math.max(1, seconds)];

}
function counted ( count: number, unit: Scale ): string {

    const [one, two, few] = arabic.get(unit) ?? [unit, unit, unit];
    const tail = count % 100;

    if ( count === 1 ) return one;
    if ( count === 2 ) return two;

    return `${count} ${tail >= 3 && tail <= 10 ? few : one}`;

}
function voice ( tag: string ): Voice | undefined {

    return held(voices, tag, () => {

        try {

            return "RelativeTimeFormat" in Intl ? ([new Intl.RelativeTimeFormat(tag, { numeric: "always" }), new Intl.RelativeTimeFormat(tag, { numeric: "auto" })] as const) : undefined;

        } catch {

            return undefined;

        }

    }, 64);

}
function worded ( count: number, unit: Scale, tag: string | undefined ): string {

    const counter = tag === undefined ? undefined : held(counters, `${tag}|${unit}`, () => {

        try {

            return new Intl.NumberFormat(tag, { style: "unit", unit, unitDisplay: "long" });

        } catch {

            return undefined;

        }

    });

    return counter?.format(count) ?? `${count} ${string.pluralize(count, unit)}`;

}

export function format ( value: Input, style: Style | string = "date", options: FormatOptions = {} ): string {

    const found = from(value);

    if ( !found || typeof style !== "string" || style.length > 256 ) return "";

    return styles.has(style) ? styled(found, style, options) : patterned(found, style, options);

}
export function relative ( value: Input, reference: Input = new Date(), locale = "en" ): string {

    const found = from(value);
    const base = from(reference);

    if ( !found || !base ) return "";

    const seconds = Math.round((found.getTime() - base.getTime()) / 1000);
    const size = Math.abs(seconds);
    const tag = tongue(locale);
    const language = tag.split("-")[0];
    const [unit, count] = measured(size);

    if ( language === "ar" ) return size < 45 ? "الآن" : `${seconds < 0 ? "منذ" : "بعد"} ${counted(count, unit)}`;

    const spoken = language === "en" ? undefined : voice(tag);

    if ( spoken ) return size < 45 ? spoken[1].format(0, "second") : spoken[0].format(seconds < 0 ? 0 - count : count, unit);
    if ( size < 45 ) return "just now";

    const word = string.pluralize(count, unit);

    return seconds < 0 ? `${count} ${word} ago` : `in ${count} ${word}`;

}
export function duration ( ms: number ): Duration {

    const total = Math.max(0, Math.trunc(number.finite(ms)));
    const seconds = Math.floor(total / 1000);

    return { days: Math.floor(seconds / 86_400), hours: Math.floor((seconds % 86_400) / 3600), minutes: Math.floor((seconds % 3600) / 60), seconds: seconds % 60, total };

}
export function humanDuration ( ms: number, locale = "en", limit = 2 ): string {

    const read = duration(ms);
    const tag = tongue(locale);
    const language = tag.split("-")[0];
    const pieces: (readonly [number, Scale])[] = [[read.days, "day"], [read.hours, "hour"], [read.minutes, "minute"], [read.seconds, "second"]];
    const kept = pieces.filter(([count]) => count > 0).slice(0, Math.max(1, Math.trunc(number.finite(limit, 2))));
    const shown = kept.length === 0 ? pieces.slice(-1) : kept;

    if ( language === "ar" ) return shown.map(([count, unit]) => counted(count, unit)).join(" و");

    return shown.map(([count, unit]) => worded(count, unit, language === "en" ? undefined : tag)).join(" ");

}
