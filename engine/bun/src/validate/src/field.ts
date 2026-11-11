import * as date from "engine-date";
import * as value from "engine-value";
import { format } from "./check.ts";
import * as zod from "./zod.ts";

export type FileLike = { size: number; type: string; name?: string | undefined };
export type FileLimits = { maxBytes?: number | undefined; types?: readonly string[] | undefined; extensions?: readonly string[] | undefined };

const hexShape = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const fourth = zod.ipv4();
const sixth = zod.ipv6();

function read<T> ( reader: ( given: unknown ) => T | undefined, expected: "number" | "boolean" ) {

    return zod.transform(( given: unknown, context ) => {

        const found = reader(given);

        if ( found === undefined ) {

            context.issues.push({ code: "invalid_type", expected, input: given });

            return zod.NEVER;

        }

        return found;

    });

}

export function text ( max = 255 ) {

    return zod.string().check(zod.trim(), zod.minLength(1), zod.maxLength(max));

}
export function email () {

    return zod.string().check(zod.trim(), zod.toLowerCase(), zod.email({ pattern: value.patterns.email }), zod.maxLength(254));

}
export function url () {

    return zod.string().check(zod.trim(), zod.url({ protocol: /^https?$/ }), zod.maxLength(2048));

}
export function phone ( dial?: string ) {

    return zod.pipe(zod.pipe(zod.string().check(zod.trim()), zod.transform(( word: string ) => value.phone(word, dial) ?? word)), zod.string().check(zod.regex(value.patterns.phone))).check(format("phone"));

}
export function slug ( max = 120 ) {

    return zod.string().check(zod.trim(), zod.toLowerCase(), zod.minLength(1), zod.maxLength(max), zod.regex(value.patterns.slug), format("slug"));

}
export function key ( max = 64 ) {

    return zod.string().check(zod.trim(), zod.minLength(1), zod.maxLength(max), zod.regex(value.patterns.key), format("key"));

}
export function password ( min = 8, max = 128 ) {

    return zod.string().check(zod.minLength(min), zod.maxLength(max), zod.refine(( word ) => /\p{L}/u.test(word) && /\d/.test(word), "letters_and_digits"), format("password"));

}
export function otp ( length = 6 ) {

    if ( !Number.isInteger(length) || length < 1 || length > 12 ) throw new RangeError("not an otp length");

    return zod.pipe(zod.pipe(zod.string().check(zod.trim()), zod.transform(( word: string ) => value.otp(word, length) ?? word)), zod.string().check(zod.regex(new RegExp(`^\\d{${length}}$`)))).check(format("otp", length));

}
export function currency () {

    return zod.string().check(zod.trim(), zod.toUpperCase(), zod.regex(value.patterns.currency), format("currency"));

}
export function locale () {

    return zod.pipe(zod.pipe(zod.string().check(zod.trim()), zod.transform(( word: string ) => value.locale(word) ?? word)), zod.string().check(zod.regex(value.patterns.locale))).check(format("locale"));

}
export function timezone () {

    return zod.string().check(zod.trim(), zod.refine(( word ) => word !== "" && !Number.isNaN(date.offset(0, word)), "timezone"), format("timezone"));

}
export function hexColor () {

    return zod.string().check(zod.trim(), zod.toLowerCase(), zod.refine(( word ) => hexShape.test(word), "hex_color"), format("hex_color"));

}
export function plainDate () {

    return zod.string().check(zod.trim(), zod.refine(( word ) => value.plainDate(word) === word, "date"), format("date"));

}
export function numeric () {

    return zod.pipe(read(( given ) => value.number(given), "number"), zod.number());

}
export function integer () {

    return zod.pipe(read(( given ) => value.number(given), "number"), zod.int());

}
export function flag () {

    return zod.pipe(read(( given ) => value.boolean(given), "boolean"), zod.boolean());

}
export function money () {

    return zod.pipe(zod.object({ amount: zod.union([zod.string(), zod.number()]), currency: currency() }), zod.transform(( given: { amount: string | number; currency: string }, context ) => {

        const parsed = value.money.fromJson(given);

        if ( !parsed ) {

            context.issues.push({ code: "custom", message: "money", input: given });

            return zod.NEVER;

        }

        return parsed;

    })).check(format("money"));

}
export function ip () {

    return zod.string().check(zod.trim(), zod.refine(( word ) => fourth.safeParse(word).success || sixth.safeParse(word).success, "ip"), format("ip"));

}
export function file ( limits: FileLimits = {} ) {

    const { maxBytes = 10 * 1024 * 1024 } = limits;
    const types = limits.types?.map(( type ) => type.trim().toLowerCase());
    const endings = limits.extensions?.map(( ending ) => ending.trim().toLowerCase().replace(/^\./, ""));
    const typed = ( given: string ): boolean => {

        const found = (given.split(";")[0] ?? "").trim().toLowerCase();

        return types === undefined || types.some(( wanted ) => wanted === "*/*" || (wanted.endsWith("/*") ? found.startsWith(wanted.slice(0, -1)) : wanted === found));

    };
    const named = ( given: unknown ): boolean => {

        if ( endings === undefined ) return given === undefined || typeof given === "string";

        const at = typeof given === "string" ? given.lastIndexOf(".") : -1;

        return typeof given === "string" && at !== -1 && endings.includes(given.slice(at + 1).toLowerCase());

    };

    return zod.custom<FileLike>(( input ) => {

        const given = input as Partial<FileLike> | null;

        return typeof given === "object" && given !== null && typeof given.size === "number" && given.size >= 0 && given.size <= maxBytes && typeof given.type === "string" && typed(given.type) && named(given.name);

    }, "file").check(format("file"));

}
