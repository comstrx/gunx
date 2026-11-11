import { from, type Input, utc } from "./calendar.ts";
import type { Parts } from "./extra.ts";
import { type Held, held, tongue } from "./intl.ts";

export type Hijri = { year: number; month: number; day: number; text: string };

type Moon = readonly [Intl.DateTimeFormat, Intl.DateTimeFormat];

const day = 86_400_000;
const walls: Held<Intl.DateTimeFormat | undefined> = new Map();
const moons: Held<Moon | undefined> = new Map();

function wall ( timeZone: string ): Intl.DateTimeFormat | undefined {

    if ( typeof timeZone !== "string" || timeZone.length > 64 ) return undefined;

    return held(walls, timeZone, () => {

        try {

            return new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", era: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

        } catch {

            return undefined;

        }

    });

}
function moon ( locale: string ): Moon | undefined {

    const base = tongue(locale).split("-u-")[0] ?? "en";

    return held(moons, base, () => {

        try {

            const counted = new Intl.DateTimeFormat(`${base}-u-ca-islamic-umalqura-nu-latn`, { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });

            if ( counted.resolvedOptions().calendar !== "islamic-umalqura" ) return undefined;

            return [counted, new Intl.DateTimeFormat(`${base}-u-ca-islamic-umalqura`, { timeZone: "UTC", dateStyle: "long" })] as const;

        } catch {

            return undefined;

        }

    }, 64);

}
function read ( formatter: Intl.DateTimeFormat, found: Date ): Map<string, string> {

    const out = new Map<string, string>();

    for ( const part of formatter.formatToParts(found) ) out.set(part.type, part.value);

    return out;

}
function ahead ( time: number, timeZone: string ): number | undefined {

    const local = inTimeZone(time, timeZone);

    return local ? utc(local.year, local.month, local.day, local).getTime() - time : undefined;

}

export function inTimeZone ( value: Input, timeZone: string ): Parts | undefined {

    const found = from(value);
    const formatter = found && wall(timeZone);

    if ( !found || !formatter ) return undefined;

    const fields = read(formatter, found);
    const shown = Number(fields.get("year"));
    const year = (fields.get("era") ?? "").startsWith("B") ? 1 - shown : shown;
    const month = Number(fields.get("month"));
    const date = Number(fields.get("day"));

    return {
        year,
        month,
        day: date,
        hour: Number(fields.get("hour")) % 24,
        minute: Number(fields.get("minute")),
        second: Number(fields.get("second")),
        millisecond: found.getUTCMilliseconds(),
        weekday: utc(year, month, date).getUTCDay(),
    };

}
export function offset ( value: Input, timeZone: string ): number {

    const time = from(value)?.getTime();
    const east = time === undefined ? undefined : ahead(time, timeZone);

    return east === undefined ? Number.NaN : Math.round(east / 60_000) + 0;

}
export function zoned ( value: Input, timeZone: string ): Date | undefined {

    const local = from(value)?.getTime();

    if ( local === undefined ) return undefined;

    const before = ahead(local - day, timeZone);
    const after = ahead(local + day, timeZone);

    if ( before === undefined || after === undefined ) return undefined;

    const east = Math.max(before, after);
    const west = Math.min(before, after);
    const kept = before === after || ahead(local - east, timeZone) === east ? east : ahead(local - west, timeZone) === west ? west : before;

    return from(local - kept);

}
export function hijri ( value: Input, locale = "ar" ): Hijri | undefined {

    const found = from(value);
    const pair = found && moon(locale);

    if ( !found || !pair ) return undefined;

    const fields = read(pair[0], found);
    const year = Number.parseInt(fields.get("year") ?? "", 10);
    const month = Number(fields.get("month"));
    const date = Number(fields.get("day"));

    if ( !Number.isFinite(year) || !month || !date ) return undefined;

    return { year, month, day: date, text: pair[1].format(found) };

}
