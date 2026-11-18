import * as device from "engine-device";
import * as exception from "engine-exception";
import * as translate from "engine-translate";
import type { Look, Page, Preference, Root, Scope } from "./arch.ts";

const key = "world.look";
const hold = 4000;

export const preferences: readonly Preference[] = ["system", "light", "dark"];

function worded ( value: unknown ): value is string | undefined {

    return value === undefined || typeof value === "string";

}
function scoped ( value: unknown ): value is Scope {

    const found = value as Partial<Scope> | null;
    const settings = found?.settings as Partial<Scope["settings"]> | undefined;

    return typeof found?.name === "string" && typeof found.id === "string" && Array.isArray(settings?.locales) && settings.locales.every(( one ) => typeof one === "string") && typeof settings.scheme === "string";

}
function listed ( text: string | undefined ): Scope[] {

    const found: unknown = text === undefined ? [] : JSON.parse(text);

    return Array.isArray(found) ? found.filter(scoped) : [];

}
function recalled ( page: Page ): Look | undefined {

    const text = page.localStorage?.getItem(key);
    const found = (typeof text === "string" ? JSON.parse(text) : undefined) as Partial<Look> | null | undefined;

    return found && isPreference(found.preference) && worded(found.surface) && worded(found.lang) && worded(found.dir) ? { surface: found.surface, lang: found.lang, dir: found.dir, preference: found.preference } : undefined;

}
function fresh ( scope: Scope | undefined, page: Page, root: Root ): Look | undefined {

    if ( scope === undefined ) return undefined;

    const { locales, scheme } = scope.settings;
    const lang = translate.negotiate(page.navigator?.languages, locales, root.lang ?? "");
    const spoken = locales.includes(lang) ? lang : undefined;

    return { surface: scope.id, lang: spoken, dir: spoken === undefined ? undefined : translate.direction(spoken), preference: isPreference(scheme) ? scheme : "system" };

}

function addressed ( scope: Scope | undefined, page: Page ): string | undefined {

    if ( scope === undefined ) return undefined;

    const first = (page.location?.pathname ?? "").split("/")[1] ?? "";

    return scope.settings.locales.includes(first) ? first : typeof scope.settings.locale === "string" && scope.settings.locales.includes(scope.settings.locale) ? scope.settings.locale : undefined;

}

export function isPreference ( value: unknown ): value is Preference {

    return value === "system" || value === "light" || value === "dark";

}
export function stamp ( root: Root, look: Look ): void {

    const tone = look.preference === "system" ? "light dark" : look.preference;

    if ( look.lang !== undefined && root.lang !== look.lang ) root.lang = look.lang;
    if ( look.dir !== undefined && root.dir !== look.dir ) root.dir = look.dir;

    if ( root.dataset ) {

        if ( look.surface !== undefined && root.dataset.surface !== look.surface ) root.dataset.surface = look.surface;

        if ( look.preference === "system" ) delete root.dataset.theme;
        else if ( root.dataset.theme !== look.preference ) root.dataset.theme = look.preference;

    }

    if ( root.style && root.style.colorScheme !== tone ) root.style.colorScheme = tone;

}
export function remember ( look: Look ): void {

    const text = JSON.stringify(look);

    exception.probe(() => {

        const store = device.host<Page>().localStorage;

        if ( store && store.getItem(key) !== text ) store.setItem(key, text);

    });

}
export function paint (): void {

    const page = device.host<Page>();
    const root = page.document?.documentElement;

    if ( !root ) return;

    exception.rescue(() => {

        const told = page.document?.currentScript?.dataset ?? {};
        const scopes = listed(told.surfaces);
        const entry = scopes.find(( one ) => one.name === told.surface);
        const saved = recalled(page);
        const kept = saved !== undefined && scopes.some(( one ) => one.id === saved.surface) ? saved : undefined;
        const found = kept ?? fresh(entry, page, root);
        const { dataset } = root;

        if ( found === undefined ) return;

        const spoken = told.address === "path" ? addressed(scopes.find(( one ) => one.id === found.surface), page) : undefined;
        const look = spoken === undefined ? found : { ...found, lang: spoken, dir: translate.direction(spoken) };

        stamp(root, look);

        if ( kept === undefined || kept.surface === entry?.id || !dataset ) return;

        dataset.pending = "";
        page.setTimeout?.(() => delete dataset.pending, hold);

    }, () => {

        if ( root.dataset ) root.dataset.appearance = "unavailable";

    });

}
