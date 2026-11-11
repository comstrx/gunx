import * as calendar from "engine-date";
import * as string from "engine-string";

export type Typed<T, Name extends string> = T & { readonly "~kind": Name };
export type Email = Typed<string, "email">;
export type Url = Typed<string, "url">;
export type Phone = Typed<string, "phone">;
export type Slug = Typed<string, "slug">;
export type Key = Typed<string, "key">;
export type Uuid = Typed<string, "uuid">;
export type Ulid = Typed<string, "ulid">;
export type CurrencyCode = Typed<string, "currency">;
export type LocaleTag = Typed<string, "locale">;
export type Otp = Typed<string, "otp">;
export type PlainDate = Typed<string, "plain-date">;

export const patterns = {
    email: /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/,
    phone: /^\+[1-9]\d{6,14}$/,
    slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    key: /^[a-z][a-z0-9_]*$/,
    uuid: /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/,
    ulid: /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
    currency: /^[A-Z]{3}$/,
    locale: /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/,
    plainDate: /^\d{4}-\d{2}-\d{2}$/,
} as const;

const printable = /^[!-~]*$/;

function worded ( value: unknown, longest: number ): string {

    const word = typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "bigint" ? String(value) : "";

    return word.length > longest ? "" : word;

}
function ascii ( value: unknown, longest: number ): string {

    const word = worded(value, longest);

    return printable.test(word) ? word : "";

}
function typed<T extends string> ( word: string, pattern: RegExp ): T | undefined {

    return pattern.test(word) ? (word as T) : undefined;

}
export function email ( value: unknown ): Email | undefined {

    return typed(ascii(value, 254).toLowerCase(), patterns.email);

}
export function url ( value: unknown, protocols: readonly string[] = ["http", "https"] ): Url | undefined {

    const word = worded(value, 2048);

    try {

        const found = new URL(word);

        return protocols.includes(found.protocol.slice(0, -1)) && found.href.length <= 2048 ? (found.href as Url) : undefined;

    } catch {

        return undefined;

    }

}
export function phone ( value: unknown, dial?: string ): Phone | undefined {

    const word = worded(value, 40);
    const found = string.digits(word);
    const abroad = dial === undefined || word.startsWith("+") || found.startsWith("00");

    return typed(abroad ? `+${found.replace(/^00/, "")}` : `+${string.digits(dial).replace(/^0+/, "")}${found.replace(/^0+/, "")}`, patterns.phone);

}
export function slug ( value: unknown, max = 120 ): Slug | undefined {

    return typed(ascii(value, max).toLowerCase(), patterns.slug);

}
export function key ( value: unknown, max = 64 ): Key | undefined {

    return typed(worded(value, max), patterns.key);

}
export function uuid ( value: unknown ): Uuid | undefined {

    return typed(ascii(value, 36).toLowerCase(), patterns.uuid);

}
export function ulid ( value: unknown ): Ulid | undefined {

    return typed(ascii(value, 26).toUpperCase(), patterns.ulid);

}
export function currency ( value: unknown ): CurrencyCode | undefined {

    return typed(ascii(value, 3).toUpperCase(), patterns.currency);

}
export function locale ( value: unknown ): LocaleTag | undefined {

    const [language = "", ...rest] = ascii(value, 16).replace(/_/g, "-").split("-");
    const cased = rest.map(( part ) => (part.length === 4 ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part.toUpperCase()));

    return typed([language.toLowerCase(), ...cased].join("-"), patterns.locale);

}
export function otp ( value: unknown, length = 6 ): Otp | undefined {

    const word = string.asciiDigits(worded(value, 64)).replace(/[\s-]/g, "");

    return word.length === length && /^\d+$/.test(word) ? (word as Otp) : undefined;

}
export function plainDate ( value: unknown ): PlainDate | undefined {

    const word = value instanceof Date ? calendar.plain(value) : string.asciiDigits(worded(value, 10));

    return patterns.plainDate.test(word) && calendar.from(word) !== undefined ? (word as PlainDate) : undefined;

}
