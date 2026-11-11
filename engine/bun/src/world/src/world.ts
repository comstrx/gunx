import { type Countries, countriesReady, defineCountries, defineKeys, everyCountry, regions as everyRegion, type Keys, loadCountries, type Region, regionName } from "./country.ts";
import { type Currencies, currenciesReady, defineCurrencies, loadCurrencies } from "./currency.ts";
import { defineEmoji, type EmojiOptions, type Emojis, emojiReady, everyEmoji, loadEmoji } from "./emoji.ts";
import { type FlagPlace, flagCode, flagEmoji, flagFile } from "./flag.ts";
import { type Family, fontFiles, fontOf } from "./font.ts";
import { type Direction, defineLanguages, type Languages, languagesReady, loadLanguages } from "./language.ts";
import { type Catalog, catalogs, once, over, word } from "./lazy.ts";

export type Options = { locale?: string | undefined; countries?: readonly string[] | undefined; currencies?: readonly string[] | undefined; languages?: readonly string[] | undefined; emoji?: EmojiOptions | undefined; flags?: FlagPlace | undefined };
export type Assets = { flag: string[]; font: string[]; emoji: string[] };
export type World = {
    readonly locale: string;
    readonly countries: Countries;
    readonly keys: Keys;
    readonly currencies: Currencies;
    readonly languages: Languages;
    readonly regions: readonly Region[];
    readonly emojis: Emojis;
    country: ( code: string ) => string;
    currency: ( code: string ) => string;
    language: ( code: string ) => string;
    region: ( code: string ) => string;
    symbol: ( code: string, narrow?: boolean ) => string;
    direction: ( code?: string ) => Direction;
    flag: ( code: string ) => string;
    flagUrl: ( code: string ) => string;
    fontOf: ( language: string ) => Family | undefined;
    assets: () => Assets;
};

const tagged = /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/;
const loaders: Readonly<Record<Catalog, () => Promise<unknown>>> = { countries: loadCountries, currencies: loadCurrencies, languages: loadLanguages, emoji: loadEmoji };
const ready: Readonly<Record<Catalog, () => boolean>> = { countries: countriesReady, currencies: currenciesReady, languages: languagesReady, emoji: emojiReady };
const flags = over(everyCountry, ( all ) => all.map(( country ) => `${country.code.toLowerCase()}.svg`));
const images = over(everyEmoji, ( all ) => {

    const out: string[] = [];

    for ( const emoji of all ) if ( flagCode(emoji.glyph) === undefined ) out.push(`${emoji.code}.webp`);

    return out;

});

export async function load ( ...names: readonly Catalog[] ): Promise<void> {

    const wanted = names.length ? names : catalogs;
    const strangers = wanted.filter(( name ) => !Object.hasOwn(loaders, name));

    if ( strangers.length ) throw new RangeError(`unknown catalog: ${strangers.map(String).join(", ")}`);

    await Promise.all(wanted.map(( name ) => loaders[name]()));

}
export function loaded ( name: Catalog ): boolean {

    return Object.hasOwn(ready, name) && ready[name]();

}
export function define ( options: Options = {} ): World {

    const asked = word(options.locale).trim();
    const locale = asked === "" ? "en" : asked;

    if ( !tagged.test(locale) ) throw new RangeError("not a locale");

    const countries = defineCountries(options.countries);
    const currencies = defineCurrencies(options.currencies);
    const languages = defineLanguages(options.languages);
    const emojis = once(() => defineEmoji({ locale, ...options.emoji, flags: options.emoji?.flags ?? options.flags }));

    return {
        locale,
        countries,
        keys: defineKeys(countries.all),
        currencies,
        languages,
        regions: everyRegion,
        get emojis (): Emojis {

            return emojis();

        },
        country: ( code ) => countries.nameOf(code, locale),
        currency: ( code ) => currencies.nameOf(code, locale),
        language: ( code ) => languages.nameOf(code, locale),
        region: ( code ) => regionName(code, locale),
        symbol: ( code, narrow = false ) => currencies.symbolOf(code, locale, narrow),
        direction: ( code = locale ) => languages.directionOf(code),
        flag: flagEmoji,
        flagUrl: ( code ) => flagFile(code, options.flags),
        fontOf: ( language ) => fontOf(languages.scriptOf(language)),
        assets: () => ({ flag: [...flags()], font: fontFiles(), emoji: [...images()] }),
    };

}
