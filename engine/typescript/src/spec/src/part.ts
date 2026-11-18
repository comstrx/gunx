import * as api from "engine-api";
import * as exception from "engine-exception";
import * as json from "engine-json";
import * as string from "engine-string";
import * as validate from "engine-validate";
import type { Config, Issue, Messages, Part, PartOptions, Settled, Surface } from "./arch.ts";
import { catalogShape, platformShape } from "./shapes.ts";
import { tones } from "./theme.ts";

const parts = new WeakSet<object>();
const holds: readonly string[] = ["platform", "blocks", "screen", "carries", "features", "catalogue", "topics", "defaults", "messages", "maxDepth"];
function blank ( names: readonly string[] ): json.Dictionary {

    return Object.freeze(Object.fromEntries(names.map(( name ) => [name, ""])));

}

const base: json.Dictionary = Object.freeze({
    settings: Object.freeze({ locales: Object.freeze(["en"]), localization: false, scheme: "system", world: Object.freeze([]), grants: Object.freeze([]), storage: Object.freeze({ secure: "secure" }), app: Object.freeze({ name: "", identifier: "", version: "0.0.0", slug: "", scheme: "" }) }),
    themes: Object.freeze({
        brand: "",
        color: Object.freeze({ light: blank(tones), dark: blank(tones), custom: Object.freeze({}) }),
        shadow: Object.freeze({ light: blank(["raised"]), dark: blank(["raised"]) }),
        radius: blank(["md", "lg"]),
        motion: blank(["fast", "base", "ease"]),
        font: Object.freeze({ sans: Object.freeze([]) }),
    }),
    contents: Object.freeze({
        name: "",
        tagline: "",
        description: "",
        url: "",
        logo: "",
        icon: "",
        email: "",
        phone: "",
        address: "",
        socials: Object.freeze([]),
        seo: Object.freeze({ image: "", twitter: "", keywords: Object.freeze([]), robots: Object.freeze({ allow: Object.freeze([]), disallow: Object.freeze([]) }) }),
    }),
    contracts: Object.freeze({ baseUrl: "", realtime: false, media: Object.freeze([]), wire: Object.freeze({}), live: Object.freeze({ path: "", channel: api.liveHouse.channel, events: Object.freeze({ ...api.liveHouse.events }), key: api.liveHouse.key }) }),
    features: Object.freeze([]),
});
const free: ReadonlySet<string> = new Set(["settings.locale", "settings.home", "settings.login", "settings.account"]);
const template = validate.string().check(validate.minLength(1), validate.maxLength(160));
const settled = validate.looseObject({
    settings: validate.looseObject({
        locales: validate.array(validate.locale()).check(validate.minLength(1), validate.maxLength(200)),
        locale: validate.locale(),
        localization: validate.boolean(),
        scheme: validate.string().check(validate.minLength(1), validate.maxLength(32)),
        world: validate.array(catalogShape).check(validate.maxLength(4)),
        grants: validate.array(validate.string().check(validate.minLength(1), validate.maxLength(120))).check(validate.maxLength(500)),
        storage: validate.looseObject({ secure: validate.string().check(validate.minLength(1), validate.maxLength(32)) }),
        app: validate.looseObject({ name: validate.string().check(validate.maxLength(120)), identifier: validate.string().check(validate.maxLength(160)), version: validate.string().check(validate.maxLength(40)), slug: validate.string().check(validate.maxLength(80)), scheme: validate.string().check(validate.maxLength(40)) }),
        home: validate.optional(validate.string().check(validate.minLength(1), validate.maxLength(64))),
        login: validate.optional(validate.string().check(validate.minLength(1), validate.maxLength(64))),
        account: validate.optional(validate.string().check(validate.minLength(1), validate.maxLength(64))),
    }),
    themes: validate.record(validate.string(), validate.unknown()),
    contents: validate.record(validate.string(), validate.unknown()),
    contracts: validate.looseObject({ baseUrl: validate.string().check(validate.maxLength(2048)), realtime: validate.boolean(), media: validate.array(validate.url()).check(validate.maxLength(50)), wire: validate.record(validate.string(), validate.unknown()), live: validate.looseObject({ path: validate.string().check(validate.maxLength(200)), channel: template, events: validate.looseObject({ created: template, updated: template, deleted: template }), key: validate.string().check(validate.minLength(1), validate.maxLength(64)) }) }),
    features: validate.array(validate.string().check(validate.minLength(1), validate.maxLength(64))).check(validate.maxLength(500)),
});

function refused ( message: string ): exception.Fault {

    return exception.fault("internal", "spec.part", { message });

}
function keyOf ( given: unknown ): string | undefined {

    return json.isRecord(given) && Object.keys(given).length === 1 && typeof given.key === "string" ? given.key : undefined;

}

function strangers ( known: json.Dictionary, given: json.Dictionary, at: string, issues: Issue[] ): void {

    const names = Object.keys(known);

    for ( const key of Object.keys(given) ) {

        const here = at === "" ? key : `${at}.${key}`;
        const held = Object.hasOwn(known, key) ? known[key] : undefined;
        const item = given[key];

        if ( at === "contents" && keyOf(item) !== undefined ) continue;

        if ( !Object.hasOwn(known, key) && !free.has(here) ) {

            const near = string.closest(names, key, ( name ) => name, 0.5)?.item;

            issues.push({ path: `config.${here}`, rule: "config.unknown", message: `${here}: neither the engine nor the part knows this setting`, ...(near === undefined ? {} : { near }), fix: "declare it in the part's defaults, or fix the name" });

        } else if ( json.isPlain(held) && Object.keys(held).length > 0 && json.isPlain(item) ) strangers(held, item, here, issues);

    }

}

export function spoken ( messages: Messages, locales: readonly string[], key: string ): { said: Record<string, string>; missing: string[] } {

    const said: Record<string, string> = {};
    const missing: string[] = [];

    for ( const locale of locales ) {

        const found: unknown = Object.hasOwn(messages, locale) && key.split(".").every(json.safeKey) ? json.pathGet(messages[locale], key) : undefined;

        if ( typeof found === "string" && found !== "" && json.safeKey(locale) ) said[locale] = found;
        else missing.push(locale);

    }

    return { said, missing };

}
export function isPart ( value: unknown ): value is Part {

    return typeof value === "object" && value !== null && parts.has(value);

}
export function part<D extends object = object> ( given: PartOptions<D> ): Part<D> {

    if ( !json.isRecord(given) ) throw refused("a part is { platform, blocks, screen, features, catalogue, defaults, messages }");

    for ( const key of Object.keys(given) ) if ( !holds.includes(key) ) throw refused(`${key}: a part holds ${holds.join(", ")}`);

    if ( !validate.check(platformShape, given.platform, "spec.part").ok ) throw refused("platform: web, mobile or desktop");
    if ( given.defaults !== undefined && !json.isRecord(given.defaults) ) throw refused("defaults: the part's own settings, themes, contents and contracts, which a surface overrides");
    if ( given.messages !== undefined && (!json.isRecord(given.messages) || !Object.values(given.messages).every(json.isRecord)) ) throw refused("messages: a table of locales and the part's own texts, such as { en, ar }");

    const made: Part<D> = Object.freeze({
        platform: given.platform,
        blocks: given.blocks,
        screen: given.screen,
        carries: Object.freeze([...(given.carries ?? [])]),
        features: given.features,
        catalogue: given.catalogue,
        topics: Object.freeze([...(given.topics ?? [])]),
        defaults: (given.defaults ?? {}) as D,
        messages: (given.messages ?? {}) as Messages,
        maxDepth: given.maxDepth,
    });

    parts.add(made);

    return made;

}
export function settle<D extends object> ( owner: Part<D>, found: Pick<Surface, "config" | "messages">, deployed: json.Dictionary = {} ): { config: Settled<D>; messages: Messages; issues: Issue[] } {

    const issues: Issue[] = [];
    const known = json.deepMerge(base, owner.defaults as json.Dictionary);
    const merged = json.clone(json.deepMerge(json.deepMerge(known, found.config), deployed));
    const settings: json.Dictionary = json.isRecord(merged.settings) ? merged.settings : {};
    const locales = Array.isArray(settings.locales) ? settings.locales.filter(( item ): item is string => typeof item === "string") : [];

    strangers(known, found.config, "", issues);
    strangers(known, deployed, "", issues);

    if ( settings.locale === undefined && locales[0] !== undefined ) settings.locale = locales[0];

    const checked = validate.check(settled, merged, "spec.config");

    if ( !checked.ok ) for ( const field of Object.keys(checked.fault.errors) ) issues.push({ path: `config.${field}`, rule: "config.shape", message: `${field} ${(checked.fault.errors[field] ?? []).join(",")}` });
    const bent: unknown = json.isRecord(merged.contracts) ? merged.contracts.wire : undefined;
    const wired = checked.ok && json.isRecord(bent) ? exception.attemptSync(() => api.wire(bent as api.Overrides)) : undefined;

    if ( wired !== undefined && !wired.ok ) issues.push({ path: "config.contracts.wire", rule: "config.wire", message: exception.messageOf(wired.fault) });

    if ( checked.ok && !locales.includes(String(settings.locale)) ) issues.push({ path: "config.settings.locale", rule: "config.locale", message: `${String(settings.locale)}: the default locale is one of ${locales.join(", ")}` });

    const voices: Record<string, json.Dictionary> = {};

    for ( const locale of locales ) {

        const own: unknown = Object.hasOwn(owner.messages, locale) ? owner.messages[locale] : undefined;
        const over: unknown = Object.hasOwn(found.messages, locale) ? found.messages[locale] : undefined;

        if ( json.safeKey(locale) ) voices[locale] = json.clone(json.deepMerge(json.isRecord(own) ? own : {}, json.isRecord(over) ? over : {}));

    }

    for ( const locale of Object.keys(found.messages) ) {

        if ( !locales.includes(locale) ) issues.push({ path: `messages.${locale}`, rule: "messages.locale", message: `${locale}: texts for a locale the surface does not offer`, fix: "list the locale in settings.locales, or drop its texts" });

    }

    const contents: json.Dictionary = json.isRecord(merged.contents) ? merged.contents : {};

    const given = ( source: json.Dictionary, name: string ): unknown => (json.isRecord(source.contents) && Object.hasOwn(source.contents, name) ? source.contents[name] : undefined);

    for ( const name of Object.keys(contents) ) {

        const key = keyOf(given(deployed, name) ?? given(found.config, name) ?? given(owner.defaults as json.Dictionary, name));

        if ( key === undefined ) continue;

        const told = spoken(voices, locales, key);

        if ( told.missing.length > 0 ) issues.push({ path: `config.contents.${name}`, rule: "text.unknown", message: `${key}: no message carries this key in ${told.missing.join(", ")}`, fix: "add the key to the part's messages or the surface's brand/messages in every locale" });

        contents[name] = told.said;

    }

    return { config: merged as unknown as Config & D, messages: voices, issues };

}
