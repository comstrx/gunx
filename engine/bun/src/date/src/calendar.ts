import * as number from "engine-number";

export type Input = Date | number | string | null | undefined;
export type Unit = "year" | "quarter" | "month" | "week" | "day" | "hour" | "minute" | "second";
export type Shift = Partial<Record<`${Unit}s` | "milliseconds", number>>;
export type Time = { hour?: number | undefined; minute?: number | undefined; second?: number | undefined; millisecond?: number | undefined };

const limit = 8.64e15;
const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const millis = { week: 604_800_000, day: 86_400_000, hour: 3_600_000, minute: 60_000, second: 1000 } as const;
const shifts = ["years", "quarters", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds"] as const;
const monthOf = new Map(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].map(( name, index ) => [name, index + 1]));
const digits = /^\d+$/;
const isoPattern = /^([+-]\d{6}|\d{4})-(\d{2})(?:-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?)?$/;
const mailPattern = /^(?:[a-z]{3,9},\s*)?(\d{1,2})[ -]([a-z]{3})[ -](\d{4}|\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(GMT|UTC?|Z|[+-]\d{4}))?$/i;
const ascPattern = /^[a-z]{3}\s+([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/i;

function at ( time: number ): Date | undefined {

    return Math.abs(time) <= limit ? new Date(time) : undefined;

}
function fits ( value: number, low: number, high: number ): boolean {

    return Number.isInteger(value) && value >= low && value <= high;

}
function away ( text: string | undefined ): number | undefined {

    if ( text === undefined || (text[0] !== "+" && text[0] !== "-") ) return 0;

    const hours = Number(text.slice(1, 3));
    const minutes = text.length > 3 ? Number(text.slice(-2)) : 0;

    return hours > 23 || minutes > 59 ? undefined : (text[0] === "-" ? -1 : 1) * (hours * 60 + minutes);

}
function landed ( made: Date | undefined, east: number | undefined ): Date | undefined {

    return made && east !== undefined ? at(made.getTime() - east * millis.minute) : undefined;

}
function fromIso ( text: string ): Date | undefined {

    const match = isoPattern.exec(text);

    if ( !match || match[1] === "-000000" ) return undefined;

    const [, year, month, day, hour, minute, second, part, zone] = match;
    const millisecond = part === undefined ? 0 : Number(part.slice(0, 3).padEnd(3, "0"));

    return landed(strict(Number(year), Number(month), Number(day ?? 1), { hour: Number(hour ?? 0), minute: Number(minute ?? 0), second: Number(second ?? 0), millisecond }), away(zone));

}
function fromMail ( text: string ): Date | undefined {

    const mail = mailPattern.exec(text);

    if ( mail ) {

        const [, day, month = "", year = "", hour, minute, second, zone] = mail;
        const full = year.length === 2 ? Number(year) + (Number(year) < 70 ? 2000 : 1900) : Number(year);

        return landed(strict(full, monthOf.get(month.toLowerCase()) ?? 0, Number(day), { hour: Number(hour), minute: Number(minute), second: Number(second ?? 0) }), away(zone));

    }

    const asc = ascPattern.exec(text);

    if ( !asc ) return undefined;

    const [, month = "", day, hour, minute, second, year] = asc;

    return strict(Number(year), monthOf.get(month.toLowerCase()) ?? 0, Number(day), { hour: Number(hour), minute: Number(minute), second: Number(second) });

}
function subject ( given: readonly [Input?, ...unknown[]] ): Date | undefined {

    return given.length === 0 ? new Date() : from(given[0]);

}
function moved ( found: Date, months: number ): number {

    if ( months === 0 ) return found.getTime();

    const index = found.getUTCFullYear() * 12 + found.getUTCMonth() + months;
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;

    return utc(year, month, Math.min(found.getUTCDate(), daysIn(year, month))).getTime() + mod(found.getTime(), millis.day);

}
function months ( a: Date, b: Date ): number {

    const rough = (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + a.getUTCMonth() - b.getUTCMonth();
    const time = a.getTime();
    const reached = moved(b, rough);

    if ( time >= b.getTime() ) return reached > time ? rough - 1 : rough;

    return reached < time ? rough + 1 : rough;

}

export function mod ( value: number, size: number ): number {

    return ((value % size) + size) % size;

}
export function now (): number {

    return Date.now();

}
export function valid ( value: unknown ): value is Date {

    return value instanceof Date && !Number.isNaN(value.getTime());

}
export function isLeap ( year: number ): boolean {

    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

}
export function daysIn ( year: number, month: number ): number {

    const index = Math.trunc(month) - 1;
    const slot = mod(index, 12);

    return slot === 1 && isLeap(Math.trunc(year) + Math.floor(index / 12)) ? 29 : lengths[slot] ?? 0;

}
export function utc ( year: number, month = 1, day = 1, time: Time = {} ): Date {

    const made = new Date(0);

    made.setUTCFullYear(year, month - 1, day);
    made.setUTCHours(time.hour ?? 0, time.minute ?? 0, time.second ?? 0, time.millisecond ?? 0);

    return made;

}
export function strict ( year: number, month: number, day: number, time: Time = {} ): Date | undefined {

    const { hour = 0, minute = 0, second = 0, millisecond = 0 } = time;

    if ( !fits(year, -271_821, 275_760) || !fits(month, 1, 12) || !fits(day, 1, daysIn(year, month)) ) return undefined;
    if ( !fits(hour, 0, 23) || !fits(minute, 0, 59) || !fits(second, 0, 59) || !fits(millisecond, 0, 999) ) return undefined;

    const made = utc(year, month, day, { hour, minute, second, millisecond });

    return valid(made) ? made : undefined;

}
export function from ( value: Input ): Date | undefined {

    if ( value === null || value === undefined ) return undefined;
    if ( value instanceof Date ) return at(value.getTime());
    if ( typeof value === "number" ) return at(value);
    if ( typeof value !== "string" || value.length > 64 ) return undefined;

    const text = value.trim();

    if ( digits.test(text) ) return at(Number(text));

    return fromIso(text) ?? fromMail(text);

}
export function iso ( ...value: [Input?] ): string {

    return subject(value)?.toISOString() ?? "";

}
export function plain ( ...value: [Input?] ): string {

    const text = iso(...value);

    return text.slice(0, text.indexOf("T"));

}
export function clock ( ...value: [Input?, boolean?] ): string {

    const text = subject(value)?.toISOString() ?? "";
    const start = text.indexOf("T") + 1;

    return text.slice(start, start + (value[1] ? 8 : 5));

}
export function weekday ( ...value: [Input?] ): number {

    return subject(value)?.getUTCDay() ?? -1;

}
export function startOf ( value: Input, unit: Unit, weekStart = 0 ): Date | undefined {

    const found = from(value);

    if ( !found ) return undefined;

    const time = found.getTime();

    if ( unit === "second" || unit === "minute" || unit === "hour" || unit === "day" ) return at(time - mod(time, millis[unit]));
    if ( unit === "week" ) return at(time - mod(time, millis.day) - mod(found.getUTCDay() - Math.trunc(number.finite(weekStart)), 7) * millis.day);

    const month = found.getUTCMonth();
    const made = utc(found.getUTCFullYear(), unit === "year" ? 1 : unit === "quarter" ? month - (month % 3) + 1 : month + 1);

    return valid(made) ? made : undefined;

}
export function endOf ( value: Input, unit: Unit, weekStart = 0 ): Date | undefined {

    const start = startOf(value, unit, weekStart);
    const next = start && add(start, { [`${unit}s`]: 1 });

    return next ? at(next.getTime() - 1) : undefined;

}
export function add ( value: Input, shift: Shift ): Date | undefined {

    const found = from(value);

    if ( !found ) return undefined;

    const span = Math.trunc((shift.years ?? 0) * 12 + (shift.quarters ?? 0) * 3 + (shift.months ?? 0));
    const rest = (shift.weeks ?? 0) * millis.week + (shift.days ?? 0) * millis.day + (shift.hours ?? 0) * millis.hour + (shift.minutes ?? 0) * millis.minute + (shift.seconds ?? 0) * millis.second + (shift.milliseconds ?? 0);

    return at(moved(found, span) + rest);

}
export function subtract ( value: Input, shift: Shift ): Date | undefined {

    const negated: Shift = {};

    for ( const key of shifts ) {

        const amount = shift[key];

        if ( amount !== undefined ) negated[key] = 0 - amount;

    }

    return add(value, negated);

}
export function diff ( later: Input, earlier: Input, unit: Unit = "day" ): number {

    const a = from(later);
    const b = from(earlier);

    if ( !a || !b ) return Number.NaN;
    if ( unit === "year" || unit === "quarter" || unit === "month" ) return Math.trunc(months(a, b) / (unit === "year" ? 12 : unit === "quarter" ? 3 : 1)) + 0;

    return Math.trunc((a.getTime() - b.getTime()) / millis[unit]) + 0;

}
export function isSame ( a: Input, b: Input, unit: Unit = "day", weekStart = 0 ): boolean {

    const left = startOf(a, unit, weekStart);
    const right = startOf(b, unit, weekStart);

    return left !== undefined && right !== undefined && left.getTime() === right.getTime();

}
export function isBefore ( a: Input, b: Input ): boolean {

    const left = from(a);
    const right = from(b);

    return left !== undefined && right !== undefined && left.getTime() < right.getTime();

}
export function isAfter ( a: Input, b: Input ): boolean {

    return isBefore(b, a);

}
export function isBetween ( value: Input, start: Input, end: Input, inclusive = true ): boolean {

    const time = from(value)?.getTime();
    const one = from(start)?.getTime();
    const other = from(end)?.getTime();

    if ( time === undefined || one === undefined || other === undefined ) return false;

    const low = Math.min(one, other);
    const high = Math.max(one, other);

    return inclusive ? time >= low && time <= high : time > low && time < high;

}
export function today (): Date {

    const time = Date.now();

    return new Date(time - mod(time, millis.day));

}
export function tomorrow (): Date {

    return new Date(today().getTime() + millis.day);

}
export function yesterday (): Date {

    return new Date(today().getTime() - millis.day);

}
export function midnight ( ...value: [Input?] ): Date | undefined {

    return startOf(value.length === 0 ? new Date() : value[0], "day");

}
export function noon ( ...value: [Input?] ): Date | undefined {

    const start = midnight(...value);

    return start ? at(start.getTime() + 12 * millis.hour) : undefined;

}
export function sleep ( ms: number, signal?: AbortSignal ): Promise<void> {

    return new Promise(( resolve, reject ) => {

        if ( signal?.aborted ) {

            reject(signal.reason);

            return;

        }

        const stop = (): void => {

            clearTimeout(timer);
            reject(signal?.reason);

        };
        const timer = setTimeout(() => {

            signal?.removeEventListener("abort", stop);
            resolve();

        }, number.clamp(number.finite(ms), 0, 2_147_483_647));

        signal?.addEventListener("abort", stop, { once: true });

    });

}
