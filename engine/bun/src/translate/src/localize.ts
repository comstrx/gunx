import * as date from "engine-date";
import * as error from "engine-error";
import * as json from "engine-json";
import * as number from "engine-number";
import * as value from "engine-value";
import type { Translate } from "./dictionary.ts";
import { type Direction, direction, formatList, held, language, split, tried } from "./locale.ts";

export type Localizer = {
    readonly locale: string;
    readonly direction: Direction;
    number: ( value: number, options?: number.FormatOptions ) => string;
    percent: ( value: number, options?: number.FormatOptions ) => string;
    money: ( amount: value.Money, options?: number.FormatOptions ) => string;
    date: ( value: date.Input, style?: date.Style | string ) => string;
    range: ( from: date.Input, to: date.Input, options?: Intl.DateTimeFormatOptions ) => string;
    relative: ( value: date.Input, reference?: date.Input ) => string;
    list: ( items: readonly string[], kind?: "and" | "or" ) => string;
    reason: ( failure: unknown ) => string;
    field: ( failure: unknown, name: string ) => string | undefined;
};

const digits = /-u-(?:[a-z0-9]{2,8}-)*?nu-(arab|latn)(?:-|$)/i;
const sized = /^-?\d+(?:\.\d+)?$/;
const rangers = new Map<string, Intl.DateTimeFormat | undefined>();

function numerals ( locale: string ): number.Numerals | undefined {

    const found = split(locale) ? digits.exec(locale)?.[1]?.toLowerCase() : undefined;

    return found === "arab" || found === "latn" ? found : undefined;

}
function spoken ( locale: string ): string {

    return split(locale) ? locale.trim().replace(/_/g, "-") : "en";

}
function ranger ( locale: string, options: Intl.DateTimeFormatOptions ): Intl.DateTimeFormat | undefined {

    const name = `${locale}|${json.stringify(options, { stable: true })}`;

    return rangers.has(name) ? rangers.get(name) : held(rangers, name, tried(() => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options })), 32);

}

export function formatNumber ( value: number, locale: string, options: number.FormatOptions = {} ): string {

    return number.format(value, { locale, numerals: numerals(locale), ...options });

}
export function formatPercent ( value: number, locale: string, options: number.FormatOptions = {} ): string {

    return number.formatPercent(value, { locale, numerals: numerals(locale), ...options });

}
export function formatMoney ( amount: value.Money, locale: string, options: number.FormatOptions = {} ): string {

    return value.money.format(amount, { locale, numerals: numerals(locale), ...options });

}
export function formatDate ( value: date.Input, locale: string, style: date.Style | string = "date", timeZone?: string ): string {

    return date.format(value, style, { locale, numerals: numerals(locale), timeZone });

}
export function formatRange ( from: date.Input, to: date.Input, locale = "en", options: Intl.DateTimeFormatOptions = { dateStyle: "medium" } ): string {

    const start = date.from(from);
    const end = date.from(to);

    if ( !start || !end ) return "";

    return tried(() => ranger(spoken(locale), options)?.formatRange(start, end)) ?? `${formatDate(start, locale, "date", options.timeZone)} – ${formatDate(end, locale, "date", options.timeZone)}`;

}
export function reason ( failure: unknown, translate: Translate ): string {

    const fault = error.of(failure);
    const params = { message: fault.message, code: fault.code, reason: fault.reason, status: fault.status, retryAfter: fault.retryAfter, requestId: fault.requestId };

    return (fault.reason === undefined ? undefined : translate.find(`faults.${fault.reason}`, params)) ?? translate.find(`codes.${fault.code}`, params) ?? fault.message;

}
export function field ( failure: unknown, name: string, translate: Translate ): string | undefined {

    const first = error.isFault(failure) ? failure.field(name) : undefined;

    if ( typeof first !== "string" ) return undefined;

    const at = first.indexOf(":");
    const given = at === -1 ? "" : first.slice(at + 1);
    const params = { field: translate.find(`fields.${name}`) ?? name, value: given };
    const ruled = at === -1 ? undefined : translate.find(`validation.${first.slice(0, at)}`, params, sized.test(given) ? Number(given) : undefined);

    return translate.find(`validation.${first}`, params) ?? ruled ?? first;

}
export function localizer ( translate: Translate, timeZone?: string ): Localizer {

    const locale = translate.locale;

    return {
        locale,
        direction: direction(locale),
        number: ( value, options = {} ) => formatNumber(value, locale, options),
        percent: ( value, options = {} ) => formatPercent(value, locale, options),
        money: ( amount, options = {} ) => formatMoney(amount, locale, options),
        date: ( value, style = "date" ) => formatDate(value, locale, style, timeZone),
        range: ( from, to, options = { dateStyle: "medium" } ) => formatRange(from, to, locale, timeZone === undefined ? options : { timeZone, ...options }),
        relative: ( value, reference ) => date.relative(value, reference, language(locale)),
        list: ( items, kind = "and" ) => formatList(items, locale, kind),
        reason: ( failure ) => reason(failure, translate),
        field: ( failure, name ) => field(failure, name, translate),
    };

}
