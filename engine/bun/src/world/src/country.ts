import * as list from "engine-list";
import * as string from "engine-string";
import regionRows from "../data/regions.json" with { type: "json" };
import { baseOf, live, once, over, slot, word } from "./lazy.ts";

export type Named = { en: string; ar: string; native: string };
export type Region = { code: string; name: { en: string; ar: string } };
export type Country = {
    code: string;
    alpha3: string;
    numeric: string;
    key: string | null;
    areas: readonly string[];
    primary: boolean;
    trunk: string | null;
    lengths: readonly [number, number] | null;
    region: Region | null;
    subregion: Region | null;
    currencies: readonly string[];
    languages: readonly string[];
    name: Named;
};
export type Grouped = { region: Region; subregions: { region: Region; countries: Country[] }[] };
export type Phone = { country: Country | undefined; key: string | undefined; national: string; e164: string | undefined; valid: boolean };
export type Key = { code: string; key: string; areas: readonly string[]; primary: boolean; name: Named };
export type Keys = { readonly all: readonly Key[]; of: ( country: string ) => string | undefined; search: ( query: string, limit?: number ) => Key[] };
export type Countries = list.Catalog<Country> & {
    byAlpha3: ( code: string ) => Country | undefined;
    byNumeric: ( code: string ) => Country | undefined;
    byPhone: ( phone: string ) => Country | undefined;
    inRegion: ( region: string ) => Country[];
    spending: ( currency: string ) => Country[];
    speaking: ( language: string ) => Country[];
    nameOf: ( code: string, locale?: string ) => string;
    dialingOf: ( code: string ) => string | undefined;
    localOf: ( phone: string ) => string;
    phone: ( text: string, fallback?: string ) => Phone;
    sorted: ( locale?: string ) => Country[];
    grouped: ( locale?: string ) => Grouped[];
};

type Row = Omit<Country, "region" | "subregion" | "areas" | "lengths"> & { region: string | null; subregion: string | null; areas: readonly string[] | null; lengths: readonly number[] | null };
type Seat = { country: Country; exact: boolean; size: number };
type Dialed = { country: Country; size: number; area: boolean };
type Order = { collator: Intl.Collator; sorted: readonly Country[] };
type Ranked = { entry: Key; at: number; rank: number };
type Numbered = { entry: Key; at: number; codes: readonly string[] };

const regionByCode = new Map((regionRows as Region[]).map(( region ) => [region.code, region]));
const letters = /\p{L}/u;
const arabic: ReadonlySet<string> = new Set(["ar", "arb", "arz", "ary", "arq", "aeb", "apc", "apd", "ajp", "acm", "acw", "afb", "ars", "ayl", "ayn"]);
const loose: readonly [number, number] = [4, 12];
const kept = 16;
const longest = 64;
const nobody: Phone = { country: undefined, key: undefined, national: "", e164: undefined, valid: false };

export const regions: readonly Region[] = regionRows as Region[];
const rows = slot<readonly Country[]>("countries", async () => ((await import("../data/countries.json")).default as Row[]).map(( row ) => ({ ...row, areas: row.areas ?? [], lengths: spanOf(row.lengths), region: regionByCode.get(row.region ?? "") ?? null, subregion: regionByCode.get(row.subregion ?? "") ?? null })));
const seats = over(everyCountry, ( all ) => new Map(all.map(( country ) => [country.code, country])));

export const loadCountries = rows.load;
export const countriesReady = rows.ready;

function spanOf ( given: readonly number[] | null ): readonly [number, number] | null {

    const low = given?.[0];
    const high = given?.[1];

    return low !== undefined && high !== undefined && low <= high ? [low, high] : null;

}
function digitsOf ( phone: string ): string {

    const text = word(phone);
    const typed = text.length > longest ? "" : string.digits(text);

    return typed.startsWith("00") ? typed.slice(2) : typed;

}
function unzeroed ( digits: string ): string {

    let at = 0;

    while ( at < digits.length && digits.charCodeAt(at) === 48 ) at += 1;

    return at === 0 ? digits : digits.slice(at);

}
function fits ( country: Country, national: string ): boolean {

    const [low, high] = country.lengths ?? loose;

    return national.length >= low && national.length <= high;

}
function cut ( country: Country, digits: string, typed: boolean ): string {

    const trunk = country.trunk;

    if ( !trunk || !digits.startsWith(trunk) ) return digits;

    const rest = digits.slice(trunk.length);

    if ( trunk === "0" ) return rest;
    if ( typed ) return fits(country, rest) ? rest : digits;

    return fits(country, digits) || !fits(country, rest) ? digits : rest;

}
function reached ( country: Country, national: string ): Phone {

    const key = country.key ?? undefined;
    const valid = key !== undefined && fits(country, national);

    return { country, key, national, e164: valid ? `${key}${national}` : undefined, valid };

}
function dialer ( all: readonly Country[] ): ( digits: string ) => Dialed | undefined {

    const held = new Map<string, Seat>();
    let longest = 0;

    const seat = ( prefix: string, country: Country, exact: boolean, size: number ): void => {

        const old = held.get(prefix);

        if ( old && (old.exact !== exact ? old.exact : old.country.primary || !country.primary) ) return;

        held.set(prefix, { country, exact, size });
        longest = Math.max(longest, prefix.length);

    };

    for ( const country of all ) {

        const base = string.digits(country.key ?? "");

        if ( base === "" ) continue;

        seat(base, country, country.areas.length === 0 || country.primary, base.length);

        for ( const area of country.areas ) seat(`${base}${area}`, country, true, base.length);

    }

    return ( digits ) => {

        for ( let size = Math.min(longest, digits.length); size > 0; size -= 1 ) {

            const found = held.get(digits.slice(0, size));

            if ( found ) return { country: found.country, size: found.size, area: size > found.size };

        }

        return undefined;

    };

}
function rankOf ( entry: Key, codes: readonly string[], typed: string, exact: boolean ): number {

    if ( codes[1] === typed ) return entry.primary ? 0 : 1;
    if ( codes.includes(typed) ) return 0;
    if ( !exact && codes.some(( code ) => code.startsWith(typed)) ) return entry.primary ? 2 : 3;

    return -1;

}

export function everyCountry (): readonly Country[] {

    return rows.get();

}
export function countryOf ( code: string ): Country | undefined {

    return seats().get(word(code).trim().toUpperCase());

}
export function isArabic ( locale = "en" ): boolean {

    return arabic.has(baseOf(locale));

}
export function nameIn ( named: Named | Region["name"] | undefined, locale: string, fallback: string ): string {

    if ( !named ) return fallback;

    return (isArabic(locale) ? named.ar : named.en) || named.en || fallback;

}
export function regionOf ( code: string ): Region | undefined {

    return regionByCode.get(word(code).trim());

}
export function regionName ( code: string, locale = "en" ): string {

    return nameIn(regionOf(code)?.name, locale, word(code));

}
export function chosen<T> ( items: readonly T[], codeOf: ( item: T ) => string, wanted: readonly string[] | undefined, what: string ): readonly T[] {

    if ( !wanted ) return items;

    const byCode = new Map<string, T>();
    const seen = new Set<T>();
    const strangers: string[] = [];
    const out: T[] = [];

    for ( const item of items ) byCode.set(codeOf(item).toLowerCase(), item);

    for ( const code of wanted ) {

        const found = byCode.get(word(code).trim().toLowerCase());

        if ( found === undefined ) strangers.push(String(code));
        else if ( !seen.has(found) ) out.push(found);

        if ( found !== undefined ) seen.add(found);

    }

    if ( strangers.length ) throw new RangeError(`unknown ${what}: ${strangers.join(", ")}`);

    return out;

}
export function dialings ( key: string | null, areas: readonly string[] = [] ): string[] {

    if ( !key ) return [];

    const bare = key.slice(1);
    const out = [key, bare, `00${bare}`];

    for ( const area of areas ) out.push(`${key}${area}`, `${bare}${area}`, `${key} ${area}`);

    return out;

}
export function defineCountries ( codes?: readonly string[] ): Countries {

    const all = chosen(everyCountry(), ( country ) => country.code, codes, "countries");
    const found = list.catalog(all, ( country ) => country.code, ( country ) => [country.code, country.alpha3, country.numeric, ...dialings(country.key, country.areas), country.name.en, country.name.ar, country.name.native], ( country ) => Number(country.primary));
    const byAlpha3 = once(() => new Map(all.map(( country ) => [country.alpha3, country])));
    const byNumeric = once(() => new Map(all.map(( country ) => [country.numeric, country])));
    const dialed = once(() => dialer(all));
    const orders = new Map<string, Order>();
    const ordered = ( locale: string ): Order => {

        const tag = word(locale).trim().replaceAll("_", "-") || "en";
        const known = orders.get(tag);

        if ( known ) return known;

        let collator: Intl.Collator;

        try {

            collator = new Intl.Collator(tag, { sensitivity: "base" });

        } catch {

            collator = new Intl.Collator("en", { sensitivity: "base" });

        }

        const names = new Map(all.map(( country ) => [country, nameIn(country.name, tag, country.code)]));
        const made = { collator, sorted: [...all].sort(( a, b ) => collator.compare(names.get(a) ?? a.code, names.get(b) ?? b.code)) };

        if ( orders.size >= kept ) orders.clear();

        orders.set(tag, made);

        return made;

    };
    const bases = new Map<Country, string>();
    const byPhone = ( phone: string ): Country | undefined => dialed()(digitsOf(phone))?.country;
    const based = ( country: Country ): string => {

        const known = bases.get(country);
        const made = known ?? string.digits(country.key ?? "");

        if ( known === undefined ) bases.set(country, made);

        return made;

    };
    const phone = ( text: string, fallback?: string ): Phone => {

        const given = word(text).trim();

        if ( given.length > longest ) return nobody;

        const typed = string.digits(given);
        const digits = typed.startsWith("00") ? typed.slice(2) : typed;
        const home = typeof fallback === "string" ? found.get(fallback) : undefined;

        if ( given.startsWith("+") || typed.startsWith("00") ) {

            const hit = dialed()(digits);

            if ( !hit ) return { country: undefined, key: undefined, national: unzeroed(digits), e164: undefined, valid: false };

            const country = home && home.areas.length === 0 && home.key === hit.country.key && !hit.area ? home : hit.country;

            return reached(country, cut(country, digits.slice(hit.size), false));

        }

        if ( home ) {

            const base = based(home);
            const local = cut(home, digits, true);
            const own = base !== "" && digits.startsWith(base) ? cut(home, digits.slice(base.length), false) : "";
            const keyed = own !== "" && fits(home, own);

            if ( fits(home, local) && (local !== digits || !keyed || digits.length <= 10) ) return reached(home, local);
            if ( keyed ) return reached(home, own);

            const hit = dialed()(digits);
            const away = hit ? cut(hit.country, digits.slice(hit.size), false) : "";

            return hit && fits(hit.country, away) ? reached(hit.country, away) : reached(home, local);

        }

        const hit = digits.length > 10 && !typed.startsWith("0") ? dialed()(digits) : undefined;

        return hit ? reached(hit.country, cut(hit.country, digits.slice(hit.size), false)) : { country: undefined, key: undefined, national: unzeroed(digits), e164: undefined, valid: false };

    };

    return {
        ...found,
        byAlpha3: ( code ) => byAlpha3().get(word(code).trim().toUpperCase()),
        byNumeric: ( code ) => byNumeric().get(word(code).trim().padStart(3, "0")),
        byPhone,
        inRegion: ( region ) => all.filter(( country ) => country.region?.code === region || country.subregion?.code === region),
        spending: ( currency ) => {

            const wanted = word(currency).trim().toUpperCase();

            return all.filter(( country ) => country.currencies.includes(wanted));

        },
        speaking: ( language ) => {

            const wanted = baseOf(language);

            return all.filter(( country ) => country.languages.includes(wanted));

        },
        nameOf: ( code, locale = "en" ) => nameIn(found.get(word(code))?.name, locale, word(code).trim().toUpperCase()),
        dialingOf: ( code ) => found.get(word(code))?.key ?? undefined,
        localOf: ( text ) => {

            const digits = digitsOf(text);
            const hit = dialed()(digits);

            return hit ? `${hit.country.trunk ?? ""}${cut(hit.country, digits.slice(hit.size), false)}` : text;

        },
        phone,
        sorted: ( locale = "en" ) => [...ordered(locale).sorted],
        grouped: ( locale = "en" ) => {

            const { collator, sorted } = ordered(locale);
            const byRegion = new Map<string, Grouped>();
            const bySub = new Map<string, Grouped["subregions"][number]>();
            const out: Grouped[] = [];

            for ( const country of sorted ) {

                const { region, subregion } = country;

                if ( !region || !subregion ) continue;

                const group = byRegion.get(region.code) ?? { region, subregions: [] };
                const name = `${region.code}/${subregion.code}`;
                const sub = bySub.get(name) ?? { region: subregion, countries: [] };

                if ( !byRegion.has(region.code) ) out.push(group);
                if ( !bySub.has(name) ) group.subregions.push(sub);

                byRegion.set(region.code, group);
                bySub.set(name, sub);
                sub.countries.push(country);

            }

            return out.sort(( a, b ) => collator.compare(nameIn(a.region.name, locale, a.region.code), nameIn(b.region.name, locale, b.region.code)));

        },
    };

}
export function defineKeys ( from: readonly Country[] = everyCountry() ): Keys {

    const all: Key[] = [];

    for ( const { code, key, areas, primary, name } of from ) if ( key ) all.push({ code, key, areas, primary, name });

    const byCode = new Map(all.map(( entry ) => [entry.code, entry.key]));
    const byName = list.catalog(all, ( entry ) => entry.code, ( entry ) => [entry.code, entry.name.en, entry.name.ar, entry.name.native], ( entry ) => Number(entry.primary));
    const numbers = once(() => all.map(( entry, at ): Numbered => ({ entry, at, codes: dialings(entry.key, entry.areas).map(string.digits) })));
    const longest = once(() => numbers().reduce(( most, found ) => found.codes.reduce(( size, code ) => Math.max(size, code.length), most), 0));

    return {
        all,
        of: ( country ) => byCode.get(word(country).trim().toUpperCase()),
        search: ( query, limit = 20 ) => {

            const asked = word(query);
            const most = Number.isNaN(limit) ? 20 : Math.max(0, limit);

            if ( letters.test(asked) ) return byName.search(asked, most);

            const typed = digitsOf(asked);

            if ( !typed ) return all.slice(0, most);

            for ( let length = Math.min(typed.length, longest()); length > 0; length -= 1 ) {

                const part = typed.slice(0, length);
                const ranked: Ranked[] = [];

                for ( const { entry, at, codes } of numbers() ) {

                    const rank = rankOf(entry, codes, part, length < typed.length);

                    if ( rank >= 0 ) ranked.push({ entry, at, rank });

                }

                if ( ranked.length ) return ranked.sort(( a, b ) => a.rank - b.rank || a.at - b.at).slice(0, most).map(( hit ) => hit.entry);

            }

            return [];

        },
    };

}

export const countries: Countries = live(once(() => defineCountries()));
export const keys: Keys = live(once(() => defineKeys()));
