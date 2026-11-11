import * as string from "engine-string";
import * as validate from "engine-validate";
import * as value from "engine-value";
import { coins, locales } from "./data.ts";
import type { Faker, Format } from "./faker.ts";
import { matcher } from "./pattern.ts";

export type Overrides = Readonly<Record<string, unknown>>;
export type Context = { faker: Faker; formats: Readonly<Record<string, Format>>; overrides: Overrides | undefined };

type Maker = ( context: Context, exact: string, starred: string, depth: number ) => unknown;
type Hint = ( faker: Faker, field: validate.Field ) => unknown;

const shallow = 3;
const year = 31_557_600_000;
const integers = new Set<string>(["safeint", "int32", "uint32"]);
const empty = new Set<string>(["null", "undefined", "void", "never"]);
const described = new WeakMap<validate.Schema, validate.Field>();
const plans = new WeakMap<validate.Field, Maker>();

function word ( names: string ): RegExp {

    return new RegExp(`(?:^|_)(?:${names})s?(?:$|_)`);

}
function bounded ( faker: Faker, text: string, field: validate.Field ): string {

    const low = field.min ?? 0;
    const high = Math.max(low, field.max ?? Number.POSITIVE_INFINITY);
    const cut = text.length > high ? text.slice(0, high).replace(/[-_]+$/, "") : text;

    return cut.length < low ? `${cut}${faker.random.string(low - cut.length, "lower")}` : cut;

}
function measured ( text: string ): number {

    return Array.from(text).length;

}
function fitted ( faker: Faker, text: string, low: number, high: number ): string {

    const points = Array.from(text);

    if ( points.length >= low && points.length <= high ) return text;

    if ( points.length < low ) {

        const gap = low - points.length;

        return gap > 1 && text !== "" ? `${text} ${faker.text(gap - 1, gap - 1)}` : `${text}${faker.text(gap, gap)}`;

    }

    const cut = points.slice(0, high).join("");

    return cut.endsWith(" ") ? `${cut.slice(0, -1)}${points[0] ?? ""}` : cut;

}
function decimals ( step: number ): number {

    const text = String(step);
    const at = text.indexOf(".");

    return text.includes("e") ? 12 : at === -1 ? 0 : text.length - at - 1;

}
function joined ( base: string, name: string ): string {

    return base === "" ? name : `${base}.${name}`;

}

const known: ReadonlyMap<string, Hint> = new Map<string, Hint>([
    ["email", ( faker ) => faker.email()],
    ["url", ( faker ) => faker.url()],
    ["hostname", ( faker ) => faker.domain()],
    ["uuid", ( faker ) => faker.uuid()],
    ["guid", ( faker ) => faker.uuid()],
    ["ulid", ( faker ) => faker.matching("[0-7][0-9A-HJKMNP-TV-Z]{25}")],
    ["nanoid", ( faker ) => faker.matching("[a-zA-Z0-9_-]{21}")],
    ["cuid", ( faker ) => faker.matching("c[a-z0-9]{24}")],
    ["cuid2", ( faker ) => faker.matching("[a-z][a-z0-9]{23}")],
    ["xid", ( faker ) => faker.matching("[0-9a-v]{20}")],
    ["ksuid", ( faker ) => faker.matching("[A-Za-z0-9]{27}")],
    ["base64", ( faker ) => faker.matching("(?:[A-Za-z0-9+/]{4}){4}")],
    ["base64url", ( faker ) => faker.matching("[A-Za-z0-9_-]{22}")],
    ["mac", ( faker ) => faker.mac()],
    ["ipv4", ( faker ) => faker.ip(4)],
    ["ipv6", ( faker ) => faker.ip(6)],
    ["ip", ( faker ) => faker.ip(faker.random.chance(80) ? 4 : 6)],
    ["cidrv4", ( faker ) => `${faker.ip(4).replace(/\d+$/, "0")}/24`],
    ["cidrv6", ( faker ) => `2001:db8:${faker.random.hex(4)}::/48`],
    ["e164", ( faker ) => faker.phone()],
    ["phone", ( faker ) => faker.phone()],
    ["slug", ( faker, field ) => bounded(faker, faker.slug(), field)],
    ["key", ( faker, field ) => bounded(faker, faker.slug().replace(/-/g, "_"), field)],
    ["password", ( faker, field ) => faker.password(Math.max(field.min ?? 8, Math.min(12, field.max ?? 12)))],
    ["otp", ( faker, field ) => faker.digits(field.min ?? 6)],
    ["currency", ( faker ) => faker.pick(coins)],
    ["locale", ( faker ) => faker.pick(locales)],
    ["timezone", ( faker ) => faker.timezone()],
    ["hex_color", ( faker ) => faker.color()],
    ["date", ( faker ) => faker.plainDate()],
    ["datetime", ( faker ) => faker.iso()],
    ["time", ( faker ) => faker.matching("(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]")],
    ["duration", ( faker ) => `P${faker.random.int(1, 28)}D`],
    ["emoji", ( faker ) => faker.emoji()],
    ["file", ( faker ) => faker.file()],
    ["money", ( faker ) => {

        const { amount, currency } = value.money.toJson(faker.money(faker.pick(coins)));

        return { amount, currency };

    }],
]);
const hints: readonly (readonly [RegExp, Hint])[] = [
    [word("email|e_mail"), ( faker ) => faker.email()],
    [word("phone|mobile|whatsapp|telephone"), ( faker ) => faker.phone()],
    [word("image|avatar|photo|picture|logo|cover|thumbnail|banner"), ( faker ) => faker.image()],
    [word("url|uri|link|website|href"), ( faker ) => faker.url()],
    [word("uuid|guid"), ( faker ) => faker.uuid()],
    [word("id"), ( faker ) => faker.id()],
    [word("first_name|given_name"), ( faker ) => faker.firstName()],
    [word("last_name|family_name|surname"), ( faker ) => faker.lastName()],
    [word("username|user_name|login|handle|nickname"), ( faker ) => faker.username()],
    [word("password|secret"), ( faker ) => faker.password()],
    [word("otp|pin"), ( faker ) => faker.digits(6)],
    [word("sku"), ( faker ) => faker.sku()],
    [word("barcode|ean|gtin"), ( faker ) => faker.barcode()],
    [word("company|organization|organisation|vendor|merchant|supplier|brand"), ( faker ) => faker.company()],
    [word("product|item|goods"), ( faker ) => faker.product()],
    [word("city|town"), ( faker ) => faker.city()],
    [word("country"), ( faker ) => faker.country()],
    [word("currency"), ( faker ) => faker.pick(coins)],
    [word("street"), ( faker ) => faker.street()],
    [word("address"), ( faker ) => faker.address()],
    [word("zip|postcode|postal_code"), ( faker ) => faker.postcode()],
    [word("timezone|time_zone|tz"), ( faker ) => faker.timezone()],
    [word("locale|language|lang"), ( faker ) => faker.language()],
    [word("color|colour"), ( faker ) => faker.color()],
    [word("slug"), ( faker ) => faker.slug()],
    [word("domain|host|hostname"), ( faker ) => faker.domain()],
    [word("ip|ip_address"), ( faker ) => faker.ip()],
    [word("status"), ( faker ) => faker.status()],
    [word("emoji"), ( faker ) => faker.emoji()],
    [word("date|birthday|birthdate|dob"), ( faker ) => faker.plainDate()],
    [/(?:_at|_on|_time|^time|timestamp)$/, ( faker ) => faker.iso()],
    [word("description|body|content|bio|about|summary|message|comment|note|detail"), ( faker ) => faker.sentence()],
    [word("tag|label|category|keyword|topic"), ( faker ) => faker.word()],
    [word("title|subject|headline"), ( faker ) => faker.title()],
    [word("name"), ( faker ) => faker.fullName()],
];
const ranges: readonly (readonly [RegExp, readonly [number, number]])[] = [
    [word("age"), [18, 70]],
    [word("year"), [2000, 2030]],
    [word("percent|percentage"), [0, 100]],
    [word("quantity|qty|stock|count"), [0, 100]],
    [word("rating|star"), [1, 5]],
];
const fractional = word("price|amount|total|subtotal|cost|fee|rate|ratio|weight|score|balance|discount|tax|rating");
const latitude = word("lat|latitude");
const longitude = word("lng|lon|long|longitude");

function made ( context: Context, field: validate.Field, exact: string, starred: string, depth: number ): unknown {

    const { faker, formats, overrides } = context;
    const key = overrides === undefined ? undefined : Object.hasOwn(overrides, exact) ? exact : Object.hasOwn(overrides, starred) ? starred : undefined;

    if ( overrides !== undefined && key !== undefined ) {

        const forced = overrides[key];

        return typeof forced === "function" ? (forced as Format)(faker, field) : forced;

    }

    if ( depth > 0 && field.nullable && faker.random.chance(12) ) return null;

    const custom = field.format !== undefined && Object.hasOwn(formats, field.format) ? formats[field.format] : undefined;

    return custom ? custom(faker, field) : (plans.get(field) ?? planned(field))(context, exact, starred, depth);

}
function object ( parts: readonly validate.Field[] ): Maker {

    return ( context, exact, starred, depth ) => {

        const { faker, overrides } = context;
        const out: [string, unknown][] = [];

        for ( const part of parts ) {

            const here = overrides === undefined ? "" : joined(exact, part.name);
            const there = overrides === undefined ? "" : joined(starred, part.name);
            const forced = overrides !== undefined && (Object.hasOwn(overrides, here) || Object.hasOwn(overrides, there));

            if ( part.optional && !forced && (depth >= shallow - 1 || faker.random.chance(25)) ) continue;

            out.push([part.name, made(context, part, here, there, depth + 1)]);

        }

        return Object.fromEntries(out);

    };

}
function many ( field: validate.Field ): Maker {

    const { item, values, kind } = field;
    const low = Math.max(0, field.min ?? 0);
    const least = field.min === undefined ? Math.min(1, field.max ?? 1) : low;
    const most = Math.max(least, Math.min(field.max ?? least + 2, least + 2));

    return ( context, exact, starred, depth ) => {

        const { faker, overrides } = context;
        const count = depth >= shallow ? low : faker.random.int(least, most);
        const out: unknown[] = values?.length ? faker.pickMany(values, Math.min(count, values.length)) : [];

        if ( !values?.length && item ) {

            const there = overrides === undefined ? "" : joined(starred, "*");

            for ( let at = 0; at < count; at += 1 ) out.push(made(context, item, overrides === undefined ? "" : joined(exact, String(at)), there, depth + 1));

        }

        return kind === "set" ? new Set(out) : out;

    };

}
function tuple ( parts: readonly validate.Field[] ): Maker {

    return ( context, exact, starred, depth ) => {

        const named = context.overrides !== undefined;

        return parts.map(( part ) => made(context, part, named ? joined(exact, part.name) : "", named ? joined(starred, part.name) : "", depth + 1));

    };

}
function record ( item: validate.Field | undefined ): Maker {

    return ( context, exact, starred, depth ) => {

        const { faker, overrides } = context;
        const count = !item || depth >= shallow ? 0 : faker.random.int(1, 3);
        const there = overrides === undefined ? "" : joined(starred, "*");
        const out: [string, unknown][] = [];

        for ( let at = 0; item && at < count; at += 1 ) {

            const name = faker.slug().replace(/-/g, "_");

            out.push([name, made(context, item, overrides === undefined ? "" : joined(exact, name), there, depth + 1)]);

        }

        return Object.fromEntries(out);

    };

}
function either ( variants: readonly validate.Field[] ): Maker {

    const full = variants.filter(( variant ) => !empty.has(variant.kind));
    const live = full.length ? full : variants;

    if ( live.length === 0 ) return () => undefined;

    return ( context, exact, starred, depth ) => made(context, context.faker.pick(live), exact, starred, depth + 1);

}
function numeric ( field: validate.Field ): Maker {

    const { step, format, kind, above, below } = field;
    const name = string.snake(field.name);
    const [floor, ceiling] = ranges.find(( [shape] ) => shape.test(name))?.[1] ?? [0, 1000];
    const digits = step === undefined ? 2 : decimals(step);
    const nudge = 10 ** -digits;
    const bottom = Math.max(field.min ?? Number.NEGATIVE_INFINITY, above ?? Number.NEGATIVE_INFINITY);
    const top = Math.min(field.max ?? Number.POSITIVE_INFINITY, below ?? Number.POSITIVE_INFINITY);
    const start = above === bottom ? Math.floor(bottom) + 1 : Math.ceil(bottom);
    const end = below === top ? Math.ceil(top) - 1 : Math.floor(top);
    const declared = kind === "bigint" || (format !== undefined && integers.has(format)) || (step !== undefined && Number.isInteger(step));
    const whole = declared || (step === undefined && !fractional.test(name) && start <= end);
    const from = whole ? start : above === bottom ? bottom + nudge : bottom;
    const to = whole ? end : below === top ? top - nudge : top;
    const middle = (bottom + top) / 2;
    const low = from > to ? middle : Number.isFinite(from) ? from : Number.isFinite(to) && to < floor ? to - 1000 : floor;
    const high = from > to ? middle : Number.isFinite(to) ? to : low > ceiling ? low + 1000 : ceiling;
    const free = step === undefined && bottom === Number.NEGATIVE_INFINITY && top === Number.POSITIVE_INFINITY;
    const least = Math.ceil(low);
    const most = Math.max(least, Math.floor(high));

    if ( kind === "bigint" ) return ( { faker } ) => BigInt(faker.random.int(least, most));
    if ( free && !declared && latitude.test(name) ) return ( { faker } ) => faker.coordinates().lat;
    if ( free && !declared && longitude.test(name) ) return ( { faker } ) => faker.coordinates().lng;

    if ( step !== undefined && step > 0 ) {

        const first = Math.ceil(Number((low / step).toFixed(9)));
        const last = Math.max(first, Math.floor(Number((high / step).toFixed(9))));

        return ( { faker } ) => Number((faker.random.int(first, last) * step).toFixed(digits));

    }

    if ( whole ) return ( { faker } ) => faker.random.int(least, most);

    return ( { faker } ) => Math.min(high, Math.max(low, faker.random.float(low, high, digits)));

}
function textual ( field: validate.Field ): Maker {

    const low = Math.max(0, field.min ?? 0);
    const high = Math.max(low, field.max ?? Number.POSITIVE_INFINITY);
    const draw = field.pattern ? matcher(field.pattern) : undefined;
    const name = string.snake(field.name);
    const hint = hints.find(( [shape] ) => shape.test(name))?.[1];

    if ( draw ) return ( { faker } ) => {

        let out = draw(faker.random);

        for ( let turn = 0; turn < 4 && (measured(out) < low || measured(out) > high); turn += 1 ) {

            const base = draw(faker.random, 0);

            out = measured(base) >= low ? base : draw(faker.random, low - measured(base));

        }

        return out;

    };

    if ( hint ) return ( { faker } ) => fitted(faker, String(hint(faker, field)), low, high);

    return ( { faker } ) => fitted(faker, faker.words(faker.random.int(1, 3)), low, high);

}
function timed ( field: validate.Field ): Maker {

    const { min, max } = field;

    return ( { faker } ) => faker.date(min ?? (max === undefined ? undefined : max - year), max ?? (min === undefined ? undefined : Math.max(faker.now, min + year)));

}
function planned ( field: validate.Field ): Maker {

    const { kind, format, values, fields, item, variants } = field;
    const builtin = format === undefined ? undefined : known.get(format);
    const listed = kind === "array" || kind === "set";
    let maker: Maker;

    if ( values?.length && !listed ) maker = ( { faker } ) => faker.pick(values);
    else if ( builtin ) maker = ( { faker } ) => builtin(faker, field);
    else if ( kind === "object" ) maker = object(fields ?? []);
    else if ( listed ) maker = many(field);
    else if ( kind === "tuple" ) maker = tuple(fields ?? []);
    else if ( kind === "record" ) maker = record(item);
    else if ( kind === "map" ) maker = () => new Map<unknown, unknown>();
    else if ( kind === "union" ) maker = either(variants ?? []);
    else if ( kind === "number" || kind === "bigint" ) maker = numeric(field);
    else if ( kind === "boolean" ) maker = ( { faker } ) => faker.boolean();
    else if ( kind === "date" ) maker = timed(field);
    else if ( kind === "null" ) maker = () => null;
    else if ( kind === "nan" ) maker = () => Number.NaN;
    else if ( empty.has(kind) ) maker = () => undefined;
    else if ( kind === "string" ) maker = textual(field);
    else maker = ( { faker } ) => faker.word();

    plans.set(field, maker);

    return maker;

}

export function shaped ( context: Context, schema: validate.Schema ): unknown {

    let field = described.get(schema);

    if ( !field ) {

        field = validate.field(schema);
        described.set(schema, field);

    }

    return made(context, field, "", "", 0);

}
