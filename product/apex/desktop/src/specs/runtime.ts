import * as event from "engine/event";
import * as log from "engine/log";
import * as seo from "engine/seo";
import * as spec from "engine/spec";
import { addressOf, type Compiled, roleOf } from "@/specs/deployment.ts";
import type { Locale } from "@/types/index.ts";
import { platform } from "@/types/platform.ts";
import serialized from "../../.cache/spec/current.json" with { type: "json" };

export type Labels = Readonly<Record<string, string>>;
export type Public = { indexable: boolean; url: string | undefined };

export type Asked = { key: string; resolve: ( yes: boolean ) => void };

export const compiled: Compiled = { ...spec.revive(serialized), role: roleOf(), address: addressOf(roleOf()) };
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

    const sheet = compiled.role.messages[locale] as Readonly<Record<string, Labels>>;

    return sheet[feature] ?? {};

}
export function textOf ( locale: Locale, key: string ): string {

    const [feature = "", name = ""] = key.split(".");

    return labels(locale, feature)[name] ?? key;

}
export function settingsOf ( screen: string, feature: string ): Record<string, unknown> {

    return live.settings(screen, feature);

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

    return open.url ? { name: compiled.role.config.contents.name[locale], url: open.url, locale, locales: [locale], default: locale, hide: true, description: compiled.role.config.contents.tagline[locale] } : undefined;

}
export function titleOf ( screen: spec.CompiledScreen, locale: Locale ): string {

    return seo.titleOf([title(screen, locale), compiled.role.config.contents.name[locale]]);

}
export function metadataOf ( screen: spec.CompiledScreen, locale: Locale ): Meta {

    const site = siteOf(locale);
    const description = compiled.role.config.contents.tagline[locale];

    if ( !site ) return { title: titleOf(screen, locale), description, robots: "noindex, nofollow", canonical: undefined, alternates: [], openGraph: {} };

    const made = seo.metadata(site, { title: title(screen, locale), description, path: screen.path, noindex: screen.auth || screen.access.length > 0 });

    return { title: made.title, description: made.description ?? description, robots: made.robots, canonical: made.canonical, alternates: made.alternates, openGraph: made.openGraph };

}
