import * as date from "engine-date";
import * as rand from "engine-rand";
import * as string from "engine-string";
import * as validate from "engine-validate";
import * as value from "engine-value";
import * as world from "engine-world";
import { type Country, domains, fallback, files, type Locale, nets, plans, pools, statuses, zones } from "./data.ts";
import { matcher } from "./pattern.ts";
import { type Overrides, shaped } from "./schema.ts";

export type Seed = string | number;
export type Point = { lat: number; lng: number };
export type Upload = { name: string; type: string; size: number };
export type Status = (typeof statuses)[number];
export type Person = { firstName: string; lastName: string; fullName: string; username: string; email: string; phone: string; birthdate: string; city: string; country: Country };
export type Format = ( faker: Faker, field: validate.Field ) => unknown;
export type Options = {
    locale?: Locale | undefined;
    country?: Country | undefined;
    now?: Date | number | undefined;
    formats?: Readonly<Record<string, Format>> | undefined;
    images?: (( seed: string, width: number, height: number ) => string) | undefined;
};
export type Faker = {
    readonly locale: Locale;
    readonly home: Country;
    readonly now: number;
    readonly random: rand.Random;
    firstName: () => string;
    lastName: () => string;
    fullName: () => string;
    username: () => string;
    person: () => Person;
    email: ( name?: string ) => string;
    phone: ( country?: Country ) => string;
    password: ( length?: number ) => string;
    city: () => string;
    street: () => string;
    address: () => string;
    postcode: () => string;
    coordinates: ( center?: Point, km?: number ) => Point;
    timezone: () => string;
    company: () => string;
    product: () => string;
    sku: () => string;
    barcode: () => string;
    rating: ( top?: number ) => number;
    word: () => string;
    words: ( count?: number ) => string;
    sentence: ( words?: number ) => string;
    paragraph: ( sentences?: number ) => string;
    text: ( low?: number, high?: number ) => string;
    title: () => string;
    slug: () => string;
    domain: () => string;
    url: () => string;
    image: ( width?: number, height?: number ) => string;
    ip: ( version?: 4 | 6 ) => string;
    mac: () => string;
    file: ( ending?: string ) => Upload;
    uuid: () => string;
    id: () => string;
    digits: ( length: number ) => string;
    integer: ( low?: number, high?: number ) => number;
    float: ( low?: number, high?: number, digits?: number ) => number;
    boolean: () => boolean;
    percent: () => number;
    price: ( low?: number, high?: number ) => number;
    money: ( currency?: string, low?: number, high?: number ) => value.Money;
    date: ( from?: Date | number, to?: Date | number ) => Date;
    iso: ( from?: Date | number, to?: Date | number ) => string;
    plainDate: ( from?: Date | number, to?: Date | number ) => string;
    past: ( days?: number ) => Date;
    future: ( days?: number ) => Date;
    birthdate: ( youngest?: number, oldest?: number ) => string;
    pick: <T>( items: readonly T[] ) => T;
    pickMany: <T>( items: readonly T[], count: number ) => T[];
    shuffle: <T>( items: readonly T[] ) => T[];
    weighted: <T>( items: readonly { item: T; weight: number }[] ) => T;
    many: <T>( count: number, make: ( index: number ) => T ) => T[];
    unique: <T>( count: number, make: ( index: number ) => T, key?: ( item: T ) => unknown ) => T[];
    maybe: <T>( make: () => T, chance?: number ) => T | undefined;
    status: () => Status;
    color: () => string;
    records: <T>( count: number, make: ( index: number, faker: Faker ) => T ) => T[];
    matching: ( pattern: RegExp | string ) => string;
    from: <T extends validate.Schema>( schema: T, overrides?: Overrides ) => validate.infer<T>;
    payload: <T extends validate.Schema>( schema: T, overrides?: Overrides ) => validate.input<T>;
    country: () => string;
    currency: () => string;
    language: () => string;
    emoji: () => string;
    sequence: ( prefix?: string, start?: number ) => () => string;
    fork: ( name: string ) => Faker;
};

type Latin = { first: readonly string[]; last: readonly string[]; words: readonly string[] };

const most = 100_000;
const minute = 60_000;
const day = 86_400_000;
const year = 31_557_600_000;
const epoch = Date.UTC(2020, 0, 1);
const cairo: Point = { lat: 30.0444, lng: 31.2357 };
const clean = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

let lowered: Latin | undefined;

function latin (): Latin {

    if ( !lowered ) lowered = { first: pools.en.first.map(( name ) => string.slug(name, "")), last: pools.en.last.map(( name ) => string.slug(name, "")), words: pools.en.words.map(( word ) => string.slug(word)) };

    return lowered;

}

function counted ( count: number ): number {

    if ( !Number.isInteger(count) || count < 0 || count > most ) throw new RangeError("not a count");

    return count;

}
function times<T> ( count: number, make: ( index: number ) => T ): T[] {

    const size = counted(count);
    const out = new Array<T>(size);

    for ( let at = 0; at < size; at += 1 ) out[at] = make(at);

    return out;

}
function lasting ( days: number ): number {

    if ( !(days > 0) || days > 36_525 ) throw new RangeError("not a duration");

    return Math.max(minute, Math.round(days * day));

}
function sized ( side: number ): number {

    if ( !Number.isInteger(side) || side < 1 || side > 16_384 ) throw new RangeError("not a size");

    return side;

}
function turned ( degrees: number ): number {

    return ((((degrees + 180) % 360) + 360) % 360) - 180;

}

export function create ( seed: Seed = "engine", given: Locale | Options = "en" ): Faker {

    const options: Options = typeof given === "string" ? { locale: given } : given;
    const { locale = "en", country: home = "EG", formats = {}, images } = options;
    const now = options.now === undefined ? date.now() : Number(options.now);

    if ( !Object.hasOwn(pools, locale) ) throw new RangeError("not a locale");
    if ( !Object.hasOwn(plans, home) ) throw new RangeError("not a country");
    if ( !Number.isFinite(now) ) throw new RangeError("not a date");

    const random = rand.seeded(seed);
    const table = pools[locale];
    const ascii = latin();
    const arabic = locale === "ar";
    const edge = table.words[0]?.[0] ?? "x";
    const pick = <T>( items: readonly T[] ): T => {

        if ( items.length === 0 ) throw new RangeError("not a choice");

        return items[random.index(items.length)] as T;

    };
    const handle = ( name: string | undefined, separator: string ): string => {

        const made = name === undefined ? "" : string.slug(string.transliterate(name), separator);

        return clean.test(made) ? made : `${pick(ascii.first)}${separator}${pick(ascii.last)}`;

    };
    const between = ( from: Date | number | undefined, to: Date | number | undefined ): Date => random.date(from ?? epoch, to ?? Math.max(now, epoch));
    const faker: Faker = {
        locale,
        home,
        now,
        random,
        pick,
        firstName: () => pick(table.first),
        lastName: () => pick(table.last),
        fullName: () => `${pick(table.first)} ${pick(table.last)}`,
        username: () => `${handle(undefined, "_")}${random.int(1, 999)}`,
        person: () => {

            const first = random.index(table.first.length);
            const last = random.index(table.last.length);
            const firstName = table.first[first] ?? "";
            const lastName = table.last[last] ?? "";
            const given = ascii.first[first % ascii.first.length] ?? "";
            const family = ascii.last[last % ascii.last.length] ?? "";
            const tail = random.int(1, 99);

            return {
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`,
                username: `${given}_${family}${tail}`,
                email: `${given}.${family}${tail}@${pick(domains)}`,
                phone: faker.phone(),
                birthdate: faker.birthdate(),
                city: pick(table.city),
                country: home,
            };

        },
        email: ( name ) => `${handle(name, ".")}${random.int(1, 99)}@${pick(domains)}`,
        phone: ( country = home ) => {

            if ( !Object.hasOwn(plans, country) ) throw new RangeError("not a country");

            const plan = plans[country];

            return `+${plan.dial}${pick(plan.heads)}${random.digits(plan.rest)}`;

        },
        password: ( length = 12 ) => random.password({ length }),
        city: () => pick(table.city),
        street: () => (arabic ? `شارع ${pick(table.street)}` : `${pick(table.street)} St`),
        address: () => (arabic ? `${random.int(1, 200)} شارع ${pick(table.street)}، ${pick(table.city)}` : `${random.int(1, 200)} ${pick(table.street)} St, ${pick(table.city)}`),
        postcode: () => random.digits(5),
        coordinates: ( center = cairo, km = 10 ) => {

            if ( !(km >= 0) || km > 1000 || !(Math.abs(center.lat) <= 90) || !(Math.abs(center.lng) <= 180) ) throw new RangeError("not a point");

            const reach = km * Math.sqrt(random.next());
            const turn = random.next() * 2 * Math.PI;
            const wide = 111.32 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180));
            const lat = Math.max(-90, Math.min(90, center.lat + (reach * Math.cos(turn)) / 111.32));
            const lng = turned(center.lng + (reach * Math.sin(turn)) / wide);

            return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };

        },
        timezone: () => pick(zones),
        company: () => `${pick(table.last)} ${pick(table.company)}`,
        product: () => (arabic ? `${pick(table.goods)} ${pick(table.traits)}` : `${pick(table.traits)} ${pick(table.goods)}`),
        sku: () => `${random.string(3, "upper")}-${random.digits(5)}`,
        barcode: () => {

            const body = random.digits(12);
            let sum = 0;

            for ( let at = 0; at < 12; at += 1 ) sum += (body.charCodeAt(at) - 48) * (at % 2 === 0 ? 1 : 3);

            return `${body}${(10 - (sum % 10)) % 10}`;

        },
        rating: ( top = 5 ) => random.float(1, Math.max(1, top), 1),
        word: () => pick(table.words),
        words: ( count = 3 ) => times(count, () => pick(table.words)).join(" "),
        sentence: ( words = 8 ) => {

            const text = faker.words(words);

            return arabic ? `${text}.` : `${string.capitalize(text)}.`;

        },
        paragraph: ( sentences = 3 ) => times(sentences, () => faker.sentence(random.int(6, 12))).join(" "),
        text: ( low = 1, high = Math.max(low, 80) ) => {

            const least = counted(low);
            const aim = random.int(least, Math.max(least, Math.min(counted(high), least + 48)));
            let out = "";

            while ( out.length < aim ) out += `${out === "" ? "" : " "}${pick(table.words)}`;

            out = out.slice(0, aim);

            return out.endsWith(" ") ? `${out.slice(0, -1)}${edge}` : out;

        },
        title: () => (arabic ? faker.words(2) : string.title(faker.words(2))),
        slug: () => `${pick(ascii.words)}-${pick(ascii.words)}`,
        domain: () => pick(domains),
        url: () => `https://${pick(domains)}/${faker.slug()}`,
        image: ( width = 640, height = 480 ) => {

            const wide = sized(width);
            const high = sized(height);
            const tag = random.hex(6);

            return images ? images(tag, wide, high) : `https://picsum.photos/seed/${tag}/${wide}/${high}`;

        },
        ip: ( version = 4 ) => (version === 6 ? `2001:db8:${times(6, () => random.hex(4)).join(":")}` : `${pick(nets)}.${random.int(1, 254)}`),
        mac: () => `02:${times(5, () => random.hex(2)).join(":")}`,
        file: ( ending ) => {

            const wanted = ending?.trim().toLowerCase().replace(/^\./, "");
            const kinds = wanted === undefined ? files : files.filter(( [known] ) => known === wanted);

            if ( kinds.length === 0 ) throw new RangeError("not a file");

            const [end, type] = pick(kinds);

            return { name: `${faker.slug()}.${end}`, type, size: random.int(1024, 2_097_152) };

        },
        uuid: () => random.uuid(),
        id: () => random.string(10, "safe"),
        digits: ( length ) => random.digits(counted(length)),
        integer: ( low = 0, high = 1000 ) => random.int(low, high),
        float: ( low = 0, high = 1000, digits = 2 ) => random.float(low, high, digits),
        boolean: () => random.boolean(),
        percent: () => random.int(0, 100),
        price: ( low = 5, high = 500 ) => random.float(low, high, 2),
        money: ( currency = "EGP", low = 5, high = 500 ) => value.money.of(random.float(low, high, 2), currency),
        date: between,
        iso: ( from, to ) => date.iso(between(from, to)),
        plainDate: ( from, to ) => date.plain(between(from, to)),
        past: ( days = 30 ) => new Date(now - random.int(minute, lasting(days))),
        future: ( days = 30 ) => new Date(now + random.int(minute, lasting(days))),
        birthdate: ( youngest = 18, oldest = 70 ) => {

            if ( !(youngest >= 0) || !(oldest >= youngest) || oldest > 130 ) throw new RangeError("not an age");

            return date.plain(new Date(now - random.int(Math.round(youngest * year), Math.round(oldest * year))));

        },
        pickMany: ( items, count ) => random.pickMany(items, counted(count)),
        shuffle: ( items ) => random.shuffle(items),
        weighted: ( items ) => {

            const found = random.weighted(items);

            if ( found === undefined && !items.some(( one ) => one.weight > 0) ) throw new RangeError("not a choice");

            return found as (typeof items)[number]["item"];

        },
        many: times,
        unique: ( count, make, key = ( item ) => item ) => {

            const size = counted(count);
            const seen = new Set<unknown>();
            const out: ReturnType<typeof make>[] = [];

            for ( let turn = 0; out.length < size; turn += 1 ) {

                if ( turn > size * 20 + 100 ) throw new RangeError("not unique");

                const made = make(out.length);
                const mark = key(made);

                if ( seen.has(mark) ) continue;

                seen.add(mark);
                out.push(made);

            }

            return out;

        },
        maybe: ( make, chance = 50 ) => (random.chance(chance) ? make() : undefined),
        status: () => pick(statuses),
        color: () => random.color(),
        records: ( count, make ) => times(count, ( index ) => make(index, faker)),
        matching: ( pattern ) => {

            const draw = matcher(pattern);

            if ( !draw ) throw new RangeError("not a pattern");

            return draw(random);

        },
        from: ( schema, overrides ) => validate.assert(schema, shaped({ faker, formats, overrides }, schema)) as never,
        payload: ( schema, overrides ) => {

            const made = shaped({ faker, formats, overrides }, schema);

            validate.assert(schema, made);

            return made as never;

        },
        country: () => (world.loaded("countries") ? pick(world.everyCountry()).code : pick(fallback.countries)),
        currency: () => (world.loaded("currencies") ? pick(world.everyCurrency()).code : pick(fallback.currencies)),
        language: () => (world.loaded("languages") ? pick(world.everyLanguage()).code : pick(fallback.languages)),
        emoji: () => (world.loaded("emoji") ? pick(world.everyEmoji()).glyph : pick(fallback.emoji)),
        sequence: ( prefix = "", start = 1 ) => {

            let at = Number.isSafeInteger(start) ? start : 1;

            return () => {

                const out = `${prefix}${at}`;

                at += 1;

                return out;

            };

        },
        fork: ( name ) => create(`${String(seed)}/${name}`, { locale, country: home, now, formats, images }),
    };

    return faker;

}

export const seeded = create;
