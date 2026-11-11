import { clamp, finite, precision } from "./math.ts";
import { languageOf } from "./plural.ts";

export type Numerals = "latn" | "arab";
export type FormatOptions = {
    locale?: string | undefined;
    digits?: number | undefined;
    minDigits?: number | undefined;
    numerals?: Numerals | undefined;
    grouping?: boolean | undefined;
    sign?: "auto" | "always" | "never" | undefined;
    compact?: boolean | undefined;
};
export type CurrencyParts = { amount: string; symbol: string; code: string; negative: boolean; text: string };
export type Amount = number | bigint | string;

type Style = "decimal" | "percent" | "currency";
type Told = number | bigint | `${number}`;

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const romanTable: readonly (readonly [number, string])[] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
const units = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
const formatters = new Map<string, Intl.NumberFormat>();
const plain = /^-?\d+(?:\.\d+)?$/;
const coded = /^[A-Za-z]{3}$/;

function crafted ( locale: string, settings: Intl.NumberFormatOptions ): Intl.NumberFormat {

    try {

        return new Intl.NumberFormat(locale, settings);

    } catch {

        return new Intl.NumberFormat("en", settings);

    }

}
function kept ( key: string, locale: string, settings: () => Intl.NumberFormatOptions ): Intl.NumberFormat {

    const found = formatters.get(key);

    if ( found ) return found;

    const made = crafted(locale, settings());

    if ( formatters.size > 256 ) formatters.clear();

    formatters.set(key, made);

    return made;

}
function tagOf ( locale: string, numerals: Numerals | undefined ): string {

    const tag = locale.replace(/_/g, "-");

    return numerals ? `${tag.split("-u-")[0] ?? tag}-u-nu-${numerals}` : tag;

}
function count ( digits: number ): number {

    return clamp(Math.trunc(finite(digits)), 0, 20);

}
function shaped ( style: Style, options: FormatOptions, code = "" ): Intl.NumberFormat {

    const { locale = "en", digits, minDigits, grouping = true, sign = "auto", compact = false } = options;
    const key = `${style}|${code}|${locale}|${options.numerals}|${digits}|${minDigits}|${grouping}|${sign}|${compact}`;

    return kept(key, tagOf(locale, options.numerals), () => {

        const settings: Intl.NumberFormatOptions = { style, useGrouping: grouping, signDisplay: sign };
        const most = digits === undefined ? undefined : count(digits);
        const least = minDigits === undefined ? most : Math.min(count(minDigits), most ?? 20);

        if ( most !== undefined ) settings.maximumFractionDigits = most;
        if ( least !== undefined ) settings.minimumFractionDigits = least;
        if ( compact ) settings.notation = "compact";
        if ( style === "currency" ) settings.currency = code;

        return settings;

    });

}
function told ( value: Amount ): Told {

    if ( typeof value === "string" ) return value.length <= 64 && plain.test(value) ? (value as `${number}`) : 0;

    return typeof value === "bigint" ? value : finite(value);

}
export function numerals ( text: string, system: Numerals ): string {

    if ( system === "arab" ) return text.replace(/[0-9]/g, ( digit ) => arabicDigits[Number(digit)] ?? digit);

    return text.replace(/[٠-٩۰-۹]/g, ( digit ) => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x06f0 : 0x0660)));

}
export function format ( value: Amount, options: FormatOptions = {} ): string {

    return shaped("decimal", options).format(told(value));

}
export function formatPercent ( value: number, options: FormatOptions = {} ): string {

    return shaped("percent", { ...options, digits: options.digits ?? 0, minDigits: options.minDigits ?? 0 }).format(finite(value) / 100);

}
export function abbreviate ( value: number, digits = 1, locale = "en" ): string {

    return kept(`compact|${locale}|${digits}`, tagOf(locale, undefined), () => ({ notation: "compact", maximumFractionDigits: count(digits) })).format(finite(value));

}
export function bytes ( value: number, digits = 1 ): string {

    let amount = Math.max(0, finite(value));
    let index = 0;

    while ( index < units.length - 1 && precision(amount, index === 0 ? 0 : digits) >= 1024 ) {

        amount /= 1024;
        index += 1;

    }

    return `${precision(amount, index === 0 ? 0 : digits)} ${units[index]}`;

}
export function ordinal ( value: number, locale = "en" ): string {

    const whole = Math.trunc(finite(value));

    if ( languageOf(locale) === "ar" ) return `${whole}`;

    const mod100 = Math.abs(whole) % 100;
    const mod10 = Math.abs(whole) % 10;
    const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";

    return `${whole}${suffix}`;

}
export function pad ( value: number, width = 2, fill = "0" ): string {

    const whole = Math.trunc(Math.abs(finite(value)));
    const text = String(whole);
    const filled = `${([...fill][0] ?? "0").repeat(Math.max(0, Math.trunc(finite(width)) - text.length))}${text}`;

    return value < 0 && whole !== 0 ? `-${filled}` : filled;

}
export function roman ( value: number ): string {

    let remaining = Math.trunc(finite(value));

    if ( remaining <= 0 || remaining >= 4000 ) return "";

    let text = "";

    for ( const [amount, letters] of romanTable ) {

        while ( remaining >= amount ) {

            text += letters;
            remaining -= amount;

        }

    }

    return text;

}
export function currencyParts ( value: Amount, code: string, options: FormatOptions = {} ): CurrencyParts {

    const word = code.trim();
    const amount = told(value);
    const negative = typeof amount === "string" ? amount.startsWith("-") && /[1-9]/.test(amount) : amount < 0;

    if ( !coded.test(word) ) {

        const text = shaped("decimal", options).format(amount);

        return { amount: shaped("decimal", { ...options, sign: "never" }).format(amount), symbol: word, code: word, negative, text: word === "" ? text : `${word}\u00a0${text}` };

    }

    const upper = word.toUpperCase();
    const parts = shaped("currency", options, upper).formatToParts(amount);
    const digits = parts.filter(( part ) => part.type !== "currency" && part.type !== "literal" && part.type !== "minusSign" && part.type !== "plusSign").map(( part ) => part.value).join("").trim();
    const symbol = parts.find(( part ) => part.type === "currency")?.value ?? upper;

    return { amount: digits, symbol, code: upper, negative, text: parts.map(( part ) => part.value).join("") };

}
export function currency ( value: Amount, code: string, options: FormatOptions = {} ): string {

    const word = code.trim();

    return coded.test(word) ? shaped("currency", options, word.toUpperCase()).format(told(value)) : currencyParts(value, word, options).text;

}
