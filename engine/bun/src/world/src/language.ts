import * as list from "engine-list";
import { chosen, countryOf, isArabic, type Named } from "./country.ts";
import { baseOf, live, once, over, slot, word } from "./lazy.ts";

export type Direction = "ltr" | "rtl";
export type Language = { code: string; direction: Direction; script: string; name: Named };
export type Languages = list.Catalog<Language> & {
    nameOf: ( code: string, locale?: string ) => string;
    directionOf: ( code: string ) => Direction;
    scriptOf: ( code: string ) => string;
    isRtl: ( code: string ) => boolean;
    ofCountry: ( country: string ) => Language[];
    withScript: ( script: string ) => Language[];
};

const separator = /[-_]/;
const lettered = /^[a-z]+$/i;
const turned: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg", "Mand", "Samr"]);
const leftward: ReadonlySet<string> = new Set(["ar", "ckb", "dv", "fa", "he", "iw", "ks", "lrc", "mzn", "nqo", "ps", "sd", "syr", "ug", "ur", "yi"]);
const traditional: ReadonlySet<string> = new Set(["TW", "HK", "MO"]);

const rows = slot<readonly Language[]>("languages", async () => (await import("../data/languages.json")).default as Language[]);
const seats = over(everyLanguage, ( all ) => new Map(all.map(( language ) => [language.code.toLowerCase(), language])));

export const loadLanguages = rows.load;
export const languagesReady = rows.ready;

function written ( code: string ): string | undefined {

    const parts = word(code).trim().split(separator);
    const base = (parts[0] ?? "").toLowerCase();

    for ( let at = 1; at < parts.length && at < 3; at += 1 ) {

        const part = parts[at] ?? "";

        if ( part.length === 4 && lettered.test(part) ) return `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`;

    }

    if ( base !== "zh" ) return undefined;

    for ( let at = 1; at < parts.length; at += 1 ) if ( traditional.has((parts[at] ?? "").toUpperCase()) ) return "Hant";

    return undefined;

}

export function everyLanguage (): readonly Language[] {

    return rows.get();

}
export function scripted ( code: string ): string | undefined {

    return written(code) ?? (rows.ready() ? seats().get(baseOf(code))?.script : undefined);

}
export function defineLanguages ( codes?: readonly string[] ): Languages {

    const all = chosen(everyLanguage(), ( language ) => language.code, codes, "languages");
    const found = list.catalog(all, ( language ) => language.code, ( language ) => [language.code, language.name.en, language.name.ar, language.name.native]);
    const get = ( code: string ): Language | undefined => found.get(baseOf(code));
    const scriptOf = ( code: string ): string => written(code) ?? get(code)?.script ?? "Latn";
    const directionOf = ( code: string ): Direction => {

        const script = written(code);

        if ( script ) return turned.has(script) ? "rtl" : "ltr";

        return get(code)?.direction ?? (leftward.has(baseOf(code)) ? "rtl" : "ltr");

    };
    const scripts = once(() => {

        const out = new Map<string, Language[]>();

        for ( const language of all ) {

            const name = language.script.toLowerCase();
            const held = out.get(name);

            if ( held ) held.push(language);
            else out.set(name, [language]);

        }

        return out;

    });

    return {
        ...found,
        get,
        has: ( code ) => get(code) !== undefined,
        nameOf: ( code, locale = "en" ) => {

            const language = get(code);

            return language ? (isArabic(locale) ? language.name.ar : language.name.en) || language.name.en : word(code);

        },
        directionOf,
        scriptOf,
        isRtl: ( code ) => directionOf(code) === "rtl",
        ofCountry: ( country ) => {

            const out: Language[] = [];

            for ( const code of countryOf(country)?.languages ?? [] ) {

                const language = get(code);

                if ( language && !out.includes(language) ) out.push(language);

            }

            return out;

        },
        withScript: ( script ) => [...(scripts().get(word(script).trim().toLowerCase()) ?? [])],
    };

}

export const languages: Languages = live(once(() => defineLanguages()));
