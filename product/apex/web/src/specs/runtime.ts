import * as error from "engine/error";
import * as event from "engine/event";
import * as log from "engine/log";
import * as seo from "engine/seo";
import * as spec from "engine/spec";
import * as translate from "engine/translate";
import { type Compiled, roleOf } from "@/specs/deployment.ts";
import type { Locale } from "@/types/index.ts";
import { platform } from "@/types/platform.ts";
import serialized from "../../.cache/spec/current.json" with { type: "json" };

export type Labels = Readonly<Record<string, string>>;
export type Public = { indexable: boolean; url: string | undefined };

export type Asked = { key: string; resolve: ( yes: boolean ) => void };

const revived = spec.revive(serialized);

if ( revived.surface.address === undefined ) throw error.fault("internal", "spec.address", { message: "the compiled spec names no api address; compile it again" });

export const compiled: Compiled = { ...revived, role: roleOf(), address: revived.surface.address };
const dictionaries = new Map(compiled.surface.locales.map(( locale ) => [locale, translate.dictionary(compiled.role.messages, locale, compiled.surface.locale)]));
const sheets = new Map<string, Labels>();

export const logs: log.Sink & { entries: log.Entry[]; clear: () => void } = log.memorySink(100);
export const logger: log.Logger = log.create({ name: `${platform}-${compiled.role.role}`, sinks: [log.consoleSink(), logs] });
export const bus: event.Bus = event.bus();
export const confirmations: event.Signal<Asked | undefined> = event.signal<Asked | undefined>(undefined);
export const live: spec.Runtime = spec.runtime(compiled, { bus, translate: ( key ) => textOf(String(live.get("locale") ?? compiled.surface.locale) as Locale, key), confirm: ask, fail: ( fault, where ) => report(fault, where) });

export function report ( caught: unknown, where: string ): undefined {

    logger.error(where, caught);

    return undefined;

}

export function ask ( key: string ): Promise<boolean> {

    return new Promise<boolean>(( resolve ) => {

        confirmations.get()?.resolve(false);
        confirmations.set({ key, resolve });

    });

}
export function answer ( yes: boolean ): void {

    const asked = confirmations.get();

    confirmations.set(undefined);
    asked?.resolve(yes);

}

export function screenAt ( path: string ): spec.Matched | undefined {

    return spec.match(compiled, path);

}
export function menu ( locale: Locale, at: string ): spec.MenuItem[] {

    return spec.menuOf(compiled, locale, at).filter(( item ) => live.opens(item.name));

}
export function title ( screen: spec.Screen, locale: Locale ): string {

    return spec.titleOf(screen, locale, compiled.surface.locale);

}
export function labels ( locale: Locale, feature: string ): Labels {

    const selected = compiled.surface.locales.includes(locale) ? locale : compiled.surface.locale;
    const key = JSON.stringify([selected, feature]);
    const found = sheets.get(key);

    if ( found ) return found;

    const messages: Readonly<Record<string, Readonly<Record<string, Labels>>>> = compiled.role.messages;
    const names = Object.keys({ ...messages[compiled.surface.locale]?.[feature], ...messages[selected]?.[feature] });
    const made = Object.fromEntries(names.map(( name ) => [name, textOf(selected, `${feature}.${name}`)]));

    if ( names.length > 0 ) sheets.set(key, made);

    return made;

}
export function textOf ( locale: Locale, key: string, params?: translate.Params, count?: number ): string {

    return (dictionaries.get(locale) ?? dictionaries.get(compiled.surface.locale))?.t(key, params, count) ?? key;

}
export function settingsOf ( screen: string, feature: string ): Record<string, unknown> {

    return live.settings(screen, feature);

}
export function contentOf ( key: "name" | "tagline", locale: string ): string {

    const values: Readonly<Record<string, string>> = compiled.role.config.contents[key];

    return values[locale] ?? values[compiled.surface.locale] ?? "";

}
export function publicOf (): Public {

    const url = compiled.role.config.contents.url;
    const open = compiled.screens.some(( screen ) => !screen.auth && screen.access.length === 0);

    return { indexable: typeof url === "string" && url.length > 0 && open, url: typeof url === "string" && url.length > 0 ? url : undefined };

}
export function pathsOf (): string[] {

    return compiled.surface.screens.map(( screen ) => compiled.byName[screen.name]).filter(( screen ): screen is spec.CompiledScreen => screen !== undefined && screen.params.length === 0 && !screen.path.includes("*")).map(( screen ) => screen.path);

}
export type Meta = { title: string; description: string; robots: string; canonical: string | undefined; alternates: seo.Alternate[]; openGraph: Record<string, string> };

export function siteOf ( locale: Locale, open: Public = publicOf() ): seo.Site | undefined {

    return open.url ? { name: contentOf("name", locale), url: open.url, locale, locales: [locale], default: locale, hide: true, description: contentOf("tagline", locale) } : undefined;

}
export function titleOf ( screen: spec.CompiledScreen, locale: Locale ): string {

    return seo.titleOf([title(screen, locale), contentOf("name", locale)]);

}
export function metadataOf ( screen: spec.CompiledScreen, locale: Locale ): Meta {

    const site = siteOf(locale);
    const description = contentOf("tagline", locale);

    if ( !site ) return { title: titleOf(screen, locale), description, robots: "noindex, nofollow", canonical: undefined, alternates: [], openGraph: {} };

    const made = seo.metadata(site, { title: title(screen, locale), description, path: screen.path, noindex: screen.auth || screen.access.length > 0 });

    return { title: made.title, description: made.description ?? description, robots: made.robots, canonical: made.canonical, alternates: made.alternates, openGraph: made.openGraph };

}
