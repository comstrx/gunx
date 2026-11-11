import * as date from "engine-date";
import * as string from "engine-string";

export type Direction = "rtl" | "ltr";
export type Tag = { language: string; script: string | undefined; region: string | undefined; text: string };

type Wish = { tag: string; language: string; script: string | undefined; region: string | undefined };
type Offer = Wish & { item: string };
type Naming = "language" | "region";

const longest = 64;
const widest = 1024;
const tagPattern = /^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{4}))?(?:[-_]([a-zA-Z]{2}|\d{3}))?(?:[-_][a-zA-Z0-9]{1,8})*$/;
const regionPattern = /^(?:[a-zA-Z]{2}|\d{3})$/;
const qualityPattern = /^q=(\d(?:\.\d{0,3})?)$/i;
const rightScripts = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg", "Mand", "Samr"]);
const rightLanguages = new Set(["ar", "he", "iw", "fa", "ur", "ps", "sd", "ug", "yi", "ji", "dv", "ckb", "ks", "syr", "nqo", "mzn", "lrc"]);
const tags = new Map<string, Tag | undefined>();
const offers = new WeakMap<readonly string[], readonly Offer[]>();
const accepts = new Map<string, readonly Wish[]>();
const namers = new Map<string, Intl.DisplayNames | undefined>();
const listers = new Map<string, Intl.ListFormat | undefined>();

export function held<K, V> ( map: Map<K, V>, key: K, value: V, limit: number ): V {

    const first = map.keys().next();

    if ( map.size >= limit && !first.done ) map.delete(first.value);

    map.set(key, value);

    return value;

}
export function tried<T> ( work: () => T ): T | undefined {

    try {

        return work();

    } catch {

        return undefined;

    }

}
function read ( locale: string ): Tag | undefined {

    const found = tagPattern.exec(locale.trim());

    if ( !found ) return undefined;

    const language = (found[1] ?? "").toLowerCase();
    const script = found[2] ? `${found[2].charAt(0).toUpperCase()}${found[2].slice(1).toLowerCase()}` : undefined;
    const region = found[3]?.toUpperCase();

    return Object.freeze({ language, script, region, text: [language, script, region].filter(Boolean).join("-") });

}
function scriptOf ( found: Tag ): string | undefined {

    return found.script ?? tried(() => new Intl.Locale(found.text).maximize().script);

}
function wish ( text: string ): Wish | undefined {

    const found = split(text);

    return found && { tag: found.text.toLowerCase(), language: found.language, script: scriptOf(found), region: found.region };

}
function offered ( supported: readonly string[] ): readonly Offer[] {

    const cached = offers.get(supported);

    if ( cached ) return cached;

    const made = supported.flatMap(( item ) => {

        const found = wish(item);

        return found ? [{ ...found, item }] : [];

    });

    offers.set(supported, made);

    return made;

}
function ranked ( part: string ): { wish: Wish; quality: number }[] {

    const [value = "", ...rest] = part.split(";");
    const weight = rest.map(( item ) => item.trim()).find(( item ) => /^q=/i.test(item));
    const quality = weight === undefined ? 1 : Math.min(1, Number(qualityPattern.exec(weight)?.[1] ?? 0));
    const found = quality > 0 ? wish(value.trim()) : undefined;

    return found ? [{ wish: found, quality }] : [];

}
function wanted ( accept: string | readonly string[] | undefined ): readonly Wish[] {

    const text = typeof accept === "string" ? accept : Array.isArray(accept) ? accept.join(",") : "";

    if ( text === "" || text.length > widest ) return [];

    const cached = accepts.get(text);

    if ( cached ) return cached;

    return held(accepts, text, text.split(",", 32).flatMap(ranked).sort(( a, b ) => b.quality - a.quality).map(( entry ) => entry.wish), 256);

}
function score ( asked: Wish, offer: Offer ): number {

    if ( offer.tag === asked.tag ) return 4;
    if ( offer.language !== asked.language ) return 0;
    if ( offer.script !== asked.script ) return 1;

    return offer.region === undefined ? 3 : 2;

}
function namer ( locale: string, type: Naming ): Intl.DisplayNames | undefined {

    const spoken = tag(locale);
    const name = `${spoken}|${type}`;

    return namers.has(name) ? namers.get(name) : held(namers, name, tried(() => new Intl.DisplayNames(spoken, { type })), 64);

}
function named ( locale: string, type: Naming, code: string ): string | undefined {

    return tried(() => namer(locale, type)?.of(code));

}
function lister ( locale: string, kind: "and" | "or" ): Intl.ListFormat | undefined {

    const spoken = tag(locale);
    const name = `${spoken}|${kind}`;

    return listers.has(name) ? listers.get(name) : held(listers, name, tried(() => new Intl.ListFormat(spoken, { type: kind === "or" ? "disjunction" : "conjunction" })), 64);

}

export function split ( locale: string ): Tag | undefined {

    if ( typeof locale !== "string" || locale.length > longest ) return undefined;

    const cached = tags.get(locale);

    return cached !== undefined || tags.has(locale) ? cached : held(tags, locale, read(locale), 512);

}
export function tag ( locale: string ): string {

    return split(locale)?.text ?? "en";

}
export function language ( locale: string ): string {

    return split(locale)?.language ?? "en";

}
export function region ( locale: string ): string | undefined {

    return split(locale)?.region;

}
export function direction ( locale: string ): Direction {

    const found = split(locale);

    if ( !found ) return "ltr";
    if ( found.script ) return rightScripts.has(found.script) ? "rtl" : "ltr";

    return rightLanguages.has(found.language) ? "rtl" : "ltr";

}
export function negotiate ( accept: string | readonly string[] | undefined, supported: readonly string[], fallback: string ): string {

    const have = offered(supported);

    for ( const asked of wanted(accept) ) {

        let best: Offer | undefined;
        let most = 0;

        for ( const offer of have ) {

            const fit = score(asked, offer);

            if ( fit <= most ) continue;

            best = offer;
            most = fit;

        }

        if ( best ) return best.item;

    }

    return fallback;

}
export function languageName ( code: string, inLocale = code ): string {

    const spoken = split(code)?.language;

    if ( spoken === undefined ) return String(code);

    const found = named(inLocale, "language", spoken);

    return found && found !== spoken ? found : string.capitalize(spoken);

}
export function localeName ( code: string, inLocale = code ): string {

    const found = split(code);

    if ( !found ) return String(code);

    const name = named(inLocale, "language", found.text);

    return name && name !== found.text ? name : found.text;

}
export function regionName ( code: string, inLocale = "en" ): string {

    const place = typeof code === "string" && regionPattern.test(code) ? code.toUpperCase() : undefined;

    return place === undefined ? String(code) : named(inLocale, "region", place) ?? place;

}
export function isTimeZone ( zone: string ): boolean {

    return typeof zone === "string" && zone !== "" && date.inTimeZone(0, zone) !== undefined;

}
export function formatList ( items: readonly string[], locale = "en", kind: "and" | "or" = "and" ): string {

    return tried(() => lister(locale, kind)?.format(items)) ?? items.join(", ");

}
