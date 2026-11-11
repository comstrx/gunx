import * as list from "engine-list";
import * as number from "engine-number";
import * as value from "engine-value";
import { chosen, countriesReady, countryOf, isArabic, type Named } from "./country.ts";
import { live, once, slot, word } from "./lazy.ts";

export type Currency = { code: string; numeric: string | null; digits: number; symbol: { en: string; ar: string; narrow: string; native: string }; countries: readonly string[]; name: Named };
export type Currencies = list.Catalog<Currency> & {
    of: ( country: string ) => Currency[];
    primaryOf: ( country: string ) => Currency | undefined;
    symbolOf: ( code: string, locale?: string, narrow?: boolean ) => string;
    nameOf: ( code: string, locale?: string ) => string;
    digitsOf: ( code: string ) => number;
    exponentOf: ( code: string ) => number;
    minor: ( amount: number, code: string ) => number;
    major: ( minor: number, code: string ) => number;
    round: ( amount: number, code: string ) => number;
    format: ( amount: number, code: string, locale?: string, options?: number.FormatOptions ) => string;
};

const rows = slot<readonly Currency[]>("currencies", async () => (await import("../data/currencies.json")).default as Currency[]);

export const loadCurrencies = rows.load;
export const currenciesReady = rows.ready;

function told ( currency: Currency ): string[] {

    const { symbol, name } = currency;

    return [currency.code, currency.numeric ?? "", symbol.en, symbol.ar, symbol.narrow, symbol.native, name.en, name.ar, name.native];

}
function placed ( currency: Currency ): string[] {

    const out = told(currency);

    for ( const code of currency.countries ) {

        const country = countryOf(code);

        if ( country ) out.push(country.name.en, country.name.ar, country.name.native);

    }

    return out;

}

export function everyCurrency (): readonly Currency[] {

    return rows.get();

}
export function defineCurrencies ( codes?: readonly string[] ): Currencies {

    const all = chosen(everyCurrency(), ( currency ) => currency.code, codes, "currencies");
    const weight = ( currency: Currency ): number => currency.countries.length;
    const found = list.catalog(all, ( currency ) => currency.code, told, weight);
    const rich = once(() => list.catalog(all, ( currency ) => currency.code, placed, weight));
    const spent = once(() => {

        const out = new Map<string, Currency[]>();

        for ( const currency of all ) {

            for ( const code of currency.countries ) {

                const held = out.get(code);

                if ( held ) held.push(currency);
                else out.set(code, [currency]);

            }

        }

        return out;

    });
    const of = ( country: string ): Currency[] => [...(spent().get(word(country).trim().toUpperCase()) ?? [])];
    const digitsOf = ( code: string ): number => found.get(word(code))?.digits ?? 2;
    const exponentOf = ( code: string ): number => value.money.exponent(word(code));

    return {
        ...found,
        search: ( query, limit ) => (countriesReady() ? rich() : found).search(word(query), limit),
        of,
        primaryOf: ( country ) => {

            const wanted = countriesReady() ? countryOf(country)?.currencies[0] : undefined;

            return (wanted ? found.get(wanted) : undefined) ?? of(country)[0];

        },
        symbolOf: ( code, locale = "en", narrow = false ) => {

            const currency = found.get(word(code));

            if ( !currency ) return word(code).trim().toUpperCase();
            if ( narrow ) return currency.symbol.narrow || currency.symbol.en;

            return isArabic(locale) ? currency.symbol.ar || currency.symbol.narrow : currency.symbol.en;

        },
        nameOf: ( code, locale = "en" ) => {

            const currency = found.get(word(code));

            return currency ? (isArabic(locale) ? currency.name.ar : currency.name.en) || currency.name.en : word(code).trim().toUpperCase();

        },
        digitsOf,
        exponentOf,
        minor: ( amount, code ) => value.decimal.units(amount, exponentOf(code)),
        major: ( minor, code ) => minor / 10 ** exponentOf(code),
        round: ( amount, code ) => number.round(amount, digitsOf(code)),
        format: ( amount, code, locale = "en", options = {} ) => number.currency(amount, word(code).trim().toUpperCase(), { locale, ...options }),
    };

}

export const currencies: Currencies = live(once(() => defineCurrencies()));
