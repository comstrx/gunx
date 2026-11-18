import * as event from "engine-event";
import * as exception from "engine-exception";
import * as json from "engine-json";
import * as log from "engine-log";
import * as parse from "engine-parse";
import * as seo from "engine-seo";
import * as translate from "engine-translate";
import type { App, AppOptions, Artifact, Asked, Brand, Carried, CompiledScreen, Context, Doors, Effect, Fed, Feeder, Host, Labels, Listed, Located, Messages, Meta, Mounted, Moved, Popup, Public, Runtime, RuntimeOptions, Settled } from "./arch.ts";
import { version } from "./arch.ts";
import { open as opened, revive } from "./compiled.ts";
import { match, menuOf, readable, runtime, spoken, titleOf } from "./runtime.ts";

const tagged = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

function refused ( message: string ): exception.Fault {

    return exception.fault("internal", "spec.artifact", { message });

}
function carriedOf ( artifact: Artifact, name: string ): Carried {

    const found: unknown = Object.hasOwn(artifact.surfaces, name) ? artifact.surfaces[name] : undefined;

    if ( !json.isRecord(found) || typeof found.id !== "string" || !json.isRecord(found.config) || !json.isRecord(found.messages) || !json.isRecord(found.brand) || !json.isRecord(found.links) || !json.isRecord(found.compiled) ) throw refused(`${name}: the artifact carries no such surface; compile the specs again`);

    return found as Carried;

}
function made<D extends object> ( name: string, carried: Carried, options: AppOptions, transfer: ( moved: Moved ) => Promise<void>, navigate: ( path: string ) => void ): App<D> {

    const compiled = revive(carried.compiled);
    const config = carried.config as unknown as Settled<D>;
    const messages = carried.messages as Messages;
    const fallback = compiled.surface.locale;
    const tongues: readonly string[] = compiled.surface.locales;
    const localized = (config.settings as { localization?: unknown }).localization === true && tongues.length > 1;
    const home = typeof carried.home === "string" ? carried.home : "/";
    const login = typeof carried.login === "string" ? carried.login : undefined;
    const account = typeof carried.account === "string" ? carried.account : undefined;
    const rest: RuntimeOptions = { handlers: options.handlers, context: options.context, queue: options.queue, rulebook: options.rulebook };
    const { sinks, name: title } = options;
    const dictionaries = new Map<string, translate.Translate>();
    const sheets = new Map<string, Labels>();
    const logs = log.memorySink(100);
    const logger = log.create({ name: title ?? compiled.surface.name, sinks: [...(sinks ?? [log.consoleSink()]), logs] });
    const bus = event.bus();
    const confirmations = event.signal<Asked | undefined>(undefined);
    const popups = event.signal<readonly Popup[]>([]);
    const shared: readonly (keyof Context)[] = ["user", "device", "locale"];
    const mounts = new Map<number, Mounted>();
    const feeds = new Map<string, Fed>();
    let feeder: Feeder | undefined;
    let serial = 0;
    let synced: (() => void) | undefined;

    function spoke ( locale: string ): translate.Translate {

        const tag = compiled.surface.locales.includes(locale) ? locale : fallback;
        const known = dictionaries.get(tag);

        if ( known ) return known;

        const made = translate.dictionary(messages as translate.Dictionaries, tag, fallback);

        dictionaries.set(tag, made);

        return made;

    }
    function text ( locale: string, key: string, params?: translate.Params, count?: number ): string {

        return spoke(locale).t(key, params, count);

    }
    function report ( caught: unknown, where: string ): undefined {

        logger.error(where, caught);

        return undefined;

    }
    function ask ( key: string ): Promise<boolean> {

        return new Promise<boolean>(( resolve ) => {

            confirmations.get()?.resolve(false);
            confirmations.set({ key, resolve });

        });

    }
    function answer ( yes: boolean ): void {

        const asked = confirmations.get();

        confirmations.set(undefined);
        asked?.resolve(yes);

    }
    function labels ( locale: string, feature: string ): Labels {

        const selected = compiled.surface.locales.includes(locale) ? locale : fallback;
        const key = json.stringify([selected, feature]);
        const found = sheets.get(key);

        if ( found ) return found;

        const own = ( tag: string ): json.Dictionary => {

            const sheet: unknown = Object.hasOwn(messages, tag) ? messages[tag] : undefined;
            const part: unknown = json.isRecord(sheet) && Object.hasOwn(sheet, feature) ? sheet[feature] : undefined;

            return json.isRecord(part) ? part : {};

        };
        const names = Object.keys({ ...own(fallback), ...own(selected) }).filter(json.safeKey);
        const sheet = Object.fromEntries(names.map(( one ) => [one, text(selected, `${feature}.${one}`)]));

        if ( names.length > 0 ) sheets.set(key, sheet);

        return sheet;

    }
    function content ( key: string, locale: string ): string {

        const held: unknown = Object.hasOwn(config.contents, key) ? config.contents[key] : undefined;

        if ( typeof held === "string" ) return held;
        if ( !json.isRecord(held) ) return "";

        const spoken: unknown = Object.hasOwn(held, locale) ? held[locale] : held[fallback];

        return typeof spoken === "string" ? spoken : "";

    }
    function indexing (): Public {

        const url = content("url", fallback);
        return { indexable: url !== "" && opened(compiled), url: url === "" ? undefined : url };

    }
    function paths (): string[] {

        return compiled.surface.screens.map(( screen ) => compiled.byName[screen.name]).filter(( screen ): screen is CompiledScreen => screen !== undefined && screen.params.length === 0 && !screen.path.includes("*")).map(( screen ) => screen.path);

    }
    function site ( locale: string ): seo.Site | undefined {

        const { url } = indexing();

        return url === undefined ? undefined : { name: content("name", locale), url, locale, locales: localized ? tongues : [locale], default: localized ? fallback : locale, hide: true, description: told(locale), image: worded(found().image), twitter: worded(found().twitter) };

    }
    function href ( path: string, locale: string ): string {

        return !localized || locale === fallback || !tongues.includes(locale) ? path : `/${locale}${path === "/" ? "" : path}`;

    }
    function routes (): string[] {

        const plain = paths();

        return localized ? [...plain, ...tongues.flatMap(( locale ) => plain.map(( path ) => `/${locale}${path === "/" ? "" : path}`))] : plain;

    }
    function locate ( address: string ): Located {

        const cut = address.indexOf("/", 1);
        const first = address.slice(1, cut === -1 ? undefined : cut);
        const beyond = cut === -1 ? "/" : address.slice(cut);

        if ( localized && tongues.includes(first) ) return { locale: first, path: beyond, moved: false };
        if ( tagged.test(first) && match(compiled, address) === undefined && match(compiled, beyond) !== undefined ) return { locale: fallback, path: beyond, moved: true };

        return { locale: fallback, path: address, moved: false };

    }
    function found (): json.Dictionary {

        return json.isRecord(config.contents.seo) ? config.contents.seo : {};

    }
    function worded ( value: unknown ): string | undefined {

        return typeof value === "string" && value !== "" ? value : undefined;

    }
    function listed ( value: unknown ): string[] {

        return Array.isArray(value) ? value.filter(( item ): item is string => typeof item === "string" && item !== "") : [];

    }
    function told ( locale: string ): string {

        return content("description", locale) || content("tagline", locale);

    }
    function graph ( locale: string ): string | undefined {

        const known = site(locale);

        if ( known === undefined ) return undefined;

        const socials = Array.isArray(config.contents.socials) ? config.contents.socials.map(( one ) => (json.isRecord(one) ? worded(one.href) : undefined)).filter(( href ): href is string => href !== undefined) : [];

        return seo.jsonLd(seo.organization(known, { logo: worded(content("logo", locale)), description: worded(told(locale)), sameAs: socials.length > 0 ? socials : undefined, email: worded(content("email", locale)), phone: worded(content("phone", locale)), address: worded(content("address", locale)) }), seo.website(known));

    }
    function crawl (): string {

        const open = indexing();
        const rules = json.isRecord(found().robots) ? found().robots as json.Dictionary : {};
        const allow = listed(rules.allow);

        if ( !open.indexable || open.url === undefined ) return "User-agent: *\nDisallow: /\n";

        return seo.robots({ name: content("name", fallback), url: open.url, locale: fallback }, { allow: allow.length > 0 ? allow : ["/"], disallow: listed(rules.disallow), sitemaps: ["/sitemap.xml"] });

    }
    function heading ( screen: CompiledScreen, locale: string ): string {

        return seo.titleOf([titleOf(screen, locale, fallback), content("name", locale)]);

    }
    function meta ( screen: CompiledScreen, locale: string ): Meta {

        const known = site(locale);
        const description = spoken(screen.description, locale, fallback) ?? told(locale);
        const keywords = listed(found().keywords);

        if ( !known ) return { title: heading(screen, locale), description, robots: "noindex, nofollow", canonical: undefined, alternates: [], openGraph: {}, twitter: {}, keywords, tags: [{ name: "description", content: description }, { name: "robots", content: "noindex, nofollow" }] };

        const made = seo.metadata(known, { title: titleOf(screen, locale, fallback), description, path: screen.path, noindex: !screen.index || screen.auth || screen.access.length > 0, keywords });

        return { title: made.title, description: made.description ?? description, robots: made.robots, canonical: made.canonical, alternates: made.alternates, openGraph: made.openGraph, twitter: made.twitter, keywords: [...made.keywords], tags: seo.tags(made) };

    }

    function feed ( feature: string ): () => void {

        const known = feeds.get(feature);
        const held: Fed = known ?? { count: 0, stop: () => undefined };
        let bound = true;

        if ( !known ) {

            if ( feeder === undefined ) {

                feeder = options.live?.(app as unknown as App);
                void exception.mend(feeder?.open(), ( caught: unknown ) => report(caught, "live.open"));

            }

            held.stop = feeder?.subscribe(feature, ( delivery ) => bus.publish(delivery.event, delivery.data)) ?? held.stop;
            feeds.set(feature, held);

        }

        held.count += 1;

        return () => {

            if ( !bound ) return;

            bound = false;
            held.count -= 1;

            if ( held.count > 0 ) return;

            feeds.delete(feature);
            held.stop();

        };

    }
    function wired ( own: () => Runtime, go: ( path: string ) => void ): RuntimeOptions {

        return { ...rest, navigate: go, bus, translate: ( key ) => text(String(own().get("locale") ?? fallback), key), confirm: ask, fail: ( fault, where ) => report(fault, where), transfer, open, close, feed: config.contracts.realtime === true && options.live ? feed : undefined };

    }
    function follow (): void {

        if ( popups.get().length === 0 ) {

            synced?.();
            synced = undefined;

        } else synced ??= live.state.subscribe(( next, previous ) => {

            if ( shared.every(( key ) => next[key] === previous[key]) ) return;

            for ( const popup of popups.get() ) popup.live.patch({ user: next.user, device: next.device, locale: next.locale });

        });

    }
    async function open ( path: string, props: json.Dictionary = {} ): Promise<Popup> {

        const matched = match(compiled, path);
        const label = String(path).slice(0, 120);

        if ( !matched ) throw exception.fault("not_found", "spec.screen", { message: `${label}: no screen answers this path`, errors: { screen: [label] } });

        const now = live.state.getState();
        const child: Runtime = runtime(compiled, { ...wired(() => child, ( to ) => { void close("all").then(() => navigate(to)); }), nested: true, context: { user: now.user, device: now.device, locale: now.locale } });
        serial += 1;

        const popup: Popup = { key: serial, path, props: json.isRecord(props) ? props : {}, screen: matched.screen, params: matched.params, live: child };

        popups.set([...popups.get(), popup]);
        follow();

        await exception.rescueAsync(async () => {

            const mounted = await child.mount(matched.screen.name, { params: matched.params, query: parse.query(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "") });

            if ( popups.get().includes(popup) ) mounts.set(popup.key, mounted);
            else await mounted.unmount();

        }, async ( caught ) => {

            popups.set(popups.get().filter(( one ) => one !== popup));
            follow();

            throw caught;

        });

        return popup;

    }
    async function close ( which = "top" ): Promise<void> {

        const held = popups.get();
        const leaving = which === "all" ? [...held].reverse() : held.slice(-1);

        if ( leaving.length === 0 ) return;

        popups.set(which === "all" ? [] : held.slice(0, -1));
        follow();

        for ( const popup of leaving ) {

            const mounted = mounts.get(popup.key);

            mounts.delete(popup.key);

            await exception.mend(mounted?.unmount(), ( caught: unknown ) => report(caught, `${popup.screen.name}.close`));

        }

    }

    const live: Runtime = runtime(compiled, wired(() => live, navigate));
    const app: App<D> = {
        name,
        id: carried.id,
        address: carried.address,
        home,
        login,
        account,
        compiled,
        config,
        messages,
        brand: carried.brand as unknown as Brand,
        links: carried.links as Readonly<Record<string, string>>,
        live,
        bus,
        logger,
        logs,
        confirmations,
        popups: readable(popups),
        open,
        close,
        report,
        ask,
        answer,
        screenAt: ( path ) => match(compiled, path),
        gate: ( screen ) => {

            const signed = live.state.getState().user !== null;

            if ( screen.auth && !signed ) return login === screen.path ? undefined : login;

            return screen.guest && signed && (account ?? home) !== screen.path ? account ?? home : undefined;

        },
        menu: ( locale, at ) => menuOf(compiled, locale, at).filter(( item ) => live.opens(item.name)),
        title: ( screen, locale ) => titleOf(screen, locale, fallback),
        labels,
        text,
        settings: ( screen, feature ) => live.settings(screen, feature),
        content,
        indexing,
        crawl,
        graph,
        paths,
        routes,
        locate,
        href,
        site,
        heading,
        meta,
    };

    return app;

}

function texts ( given: unknown ): string[] {

    return Array.isArray(given) ? given.filter(( item ): item is string => typeof item === "string") : [];

}
function listedOf ( artifact: Artifact ): Listed[] {

    const given: unknown = artifact.index;
    const found = Array.isArray(given) ? given.filter(( one ): one is Listed => json.isRecord(one) && typeof one.name === "string" && typeof one.id === "string" && json.isRecord(one.settings)) : [];

    return found.length > 0 ? found : Object.keys(artifact.surfaces).map(( name ) => {

        const { id, config } = carriedOf(artifact, name);
        const settings: json.Dictionary = json.isRecord(config.settings) ? config.settings : {};

        return { name, id, indexable: false, settings: { locales: texts(settings.locales), locale: typeof settings.locale === "string" ? settings.locale : "en", scheme: typeof settings.scheme === "string" ? settings.scheme : "system", world: [] } };

    });

}

export function boot<D extends object = object> ( artifact: unknown, options: AppOptions = {} ): Host<D> {

    if ( !json.isRecord(artifact) || artifact.version !== version || typeof artifact.entry !== "string" || !json.isRecord(artifact.surfaces) ) throw refused("not a spec artifact of this engine; compile the specs again");

    const given = { ...(artifact as unknown as Artifact), surfaces: { ...(artifact.surfaces as Record<string, Carried>) } };
    const index = listedOf(given);
    const names = index.map(( one ) => one.name);
    const apps = new Map<string, App<D>>();
    const loading = new Map<string, Promise<App<D>>>();
    const active = event.signal<string>(typeof options.active === "string" && Object.hasOwn(given.surfaces, options.active) ? options.active : given.entry);
    let handed: { to: string; map: json.Dictionary } | undefined;
    let doors: Doors = { navigate: options.navigate, carry: options.carry, reload: options.reload, live: options.live };

    function of ( name: string ): App<D> {

        const known = apps.get(name);

        if ( known ) return known;

        const app = made<D>(name, carriedOf(given, name), { ...options, live: ( found ) => doors.live?.(found) }, ( moved ) => transfer(moved.name, moved), ( path ) => doors.navigate?.(path));

        apps.set(name, app);

        return app;

    }
    function ready ( name: string ): Promise<App<D>> {

        const label = String(name).slice(0, 120);
        const loader = options.load && typeof name === "string" && Object.hasOwn(options.load, name) ? options.load[name] : undefined;

        if ( typeof name !== "string" || !names.includes(name) ) return Promise.reject(exception.fault("not_found", "spec.transfer", { message: `${label}: this build carries no such surface; surfaces: ${names.join(", ")}`, errors: { surface: [label] } }));
        if ( apps.has(name) || Object.hasOwn(given.surfaces, name) ) return Promise.resolve().then(() => of(name));
        if ( !loader ) return Promise.reject(refused(`${label}: the surface is not loaded and boot was given no loader for it`));

        const pending = loading.get(name) ?? loader().then(( loaded ) => {

            given.surfaces[name] = (json.isRecord(loaded) && json.isRecord(loaded.default) ? loaded.default : loaded) as Carried;

            return of(name);

        }).finally(() => loading.delete(name));

        loading.set(name, pending);

        return pending;

    }
    function crossed ( app: App<D>, effects: readonly Effect[] | undefined, carried: json.Dictionary, where: string ): Promise<void> {

        return exception.mend(effects === undefined || effects.length === 0 ? Promise.resolve() : app.live.run(effects, carried), ( caught: unknown ) => app.report(caught, where));

    }
    function own<T> ( make: ( app: App<D> ) => T ): () => T {

        const held = new Map<string, T>();

        return () => {

            const name = active.get();

            if ( !held.has(name) ) held.set(name, make(of(name)));

            return held.get(name) as T;

        };

    }

    function bind ( given: Doors ): () => void {

        const before = doors;

        doors = { ...doors, ...given };

        return () => {

            doors = before;

        };

    }
    async function resume ( name: string, carried?: json.Dictionary ): Promise<boolean> {

        if ( typeof name !== "string" || !names.includes(name) ) return false;

        await ready(name);

        if ( json.isRecord(carried) ) handed = { to: name, map: { ...carried } };

        active.set(name);

        return true;

    }
    async function transfer ( written: string, moved: Omit<Moved, "name"> = {} ): Promise<void> {

        const from = of(active.get());
        const linked: unknown = typeof written === "string" && Object.hasOwn(from.links, written) ? from.links[written] : written;
        const to = await ready(linked as string);
        const target = to.name;
        const asked = moved.to ?? to.home;
        const landing = to.screenAt(asked)?.screen;
        const path = (landing ? to.gate(landing) : undefined) ?? asked;

        if ( target === from.name ) {

            doors.navigate?.(path);

            return;

        }

        const map = { ...(doors.carry?.(from as unknown as App, { inherit: moved.inherit !== false, names: moved.refresh === true ? [] : moved.carry ?? [] }) ?? {}), ...(json.isRecord(moved.with) ? moved.with : {}) };

        handed = { to: target, map };

        await crossed(from, from.compiled.surface.on.leave, {}, "surface.leave");
        await from.close("all");
        await crossed(to, to.compiled.surface.on.enter, map, "surface.enter");

        active.set(target);

        if ( moved.refresh === true && doors.reload ) doors.reload(path);
        else doors.navigate?.(path);

    }

    of(active.get());

    return {
        entry: given.entry,
        names,
        index,
        active: readable(active),
        get app (): App<D> {

            return of(active.get());

        },
        of,
        own,
        carried: () => (handed !== undefined && handed.to === active.get() ? handed.map : {}),
        bind,
        ready,
        resume,
        transfer,
    };

}
