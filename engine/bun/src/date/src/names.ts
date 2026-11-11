import { mod, utc } from "./calendar.ts";
import { type Held, held, tongue } from "./intl.ts";

export type Names = { months: readonly string[]; monthsShort: readonly string[]; days: readonly string[]; daysShort: readonly string[]; meridiem: readonly [string, string] };

type Width = "long" | "short";

const english: Names = {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    meridiem: ["AM", "PM"],
};
const arabic: Names = {
    months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
    monthsShort: ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"],
    days: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    daysShort: ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
    meridiem: ["ص", "م"],
};
const tables: Held<Names> = new Map();

function listed ( tag: string, options: Intl.DateTimeFormatOptions, size: number, at: ( index: number ) => Date ): string[] {

    const formatter = new Intl.DateTimeFormat(tag, { timeZone: "UTC", calendar: "gregory", ...options });

    return Array.from({ length: size }, ( _, index ) => formatter.format(at(index)));

}
function derived ( tag: string ): Names {

    try {

        const months = ( month: Width ): string[] => listed(tag, { month }, 12, ( index ) => utc(2024, index + 1, 15));
        const days = ( weekday: Width ): string[] => listed(tag, { weekday }, 7, ( index ) => utc(2024, 9, index + 1));
        const period = new Intl.DateTimeFormat(tag, { timeZone: "UTC", hour: "numeric", hourCycle: "h12" });
        const half = ( hour: number ): string => period.formatToParts(utc(2024, 9, 1, { hour })).find(( part ) => part.type === "dayPeriod")?.value ?? "";

        return { months: months("long"), monthsShort: months("short"), days: days("long"), daysShort: days("short"), meridiem: [half(9) || "AM", half(15) || "PM"] };

    } catch {

        return english;

    }

}

export function names ( locale = "en" ): Names {

    const tag = tongue(locale).split("-u-")[0] ?? "en";
    const language = tag.split("-")[0]?.toLowerCase();

    if ( language === "en" ) return english;
    if ( language === "ar" ) return arabic;

    return held(tables, tag, () => derived(tag), 64);

}
export function monthName ( month: number, locale = "en", short = false ): string {

    const table = names(locale);

    return (short ? table.monthsShort : table.months)[mod(Math.trunc(month) - 1, 12)] ?? "";

}
export function dayName ( weekday: number, locale = "en", short = false ): string {

    const table = names(locale);

    return (short ? table.daysShort : table.days)[mod(Math.trunc(weekday), 7)] ?? "";

}
