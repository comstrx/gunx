import * as api from "engine-api";
import * as exception from "engine-exception";
import * as json from "engine-json";
import * as translate from "engine-translate";
import type { Artifact, Build, Built, Carried, Compiled, Deploy, Found, Issue, Listed, Messages, Part, Screen, Settings, Spec, Transfer } from "./arch.ts";
import { version } from "./arch.ts";
import { filed } from "./assets.ts";
import { answers, compile, nearest } from "./compile.ts";
import { open, screenOf, serialize } from "./compiled.ts";
import { plan, voiced } from "./define.ts";
import { isPart, settle, spoken } from "./part.ts";
import { chosen } from "./pick.ts";
import { isSpec, locate } from "./tree.ts";

function near ( given: string, known: Iterable<string> ): { near?: string } {

    const found = nearest(given, known);

    return found === undefined ? {} : { near: found };

}
function textsOf ( sheet: json.Dictionary | undefined ): string[] {

    return sheet === undefined ? [] : Object.keys(translate.flatten(sheet as translate.Messages));

}
function worded ( screen: Screen, messages: Messages, locales: readonly string[], issues: Issue[] ): Screen {

    const { title, description } = screen.texts ?? {};

    if ( title === undefined && description === undefined ) return screen;

    const said = ( key: string | undefined, field: "title" | "description" ): Record<string, string> => {

        if ( key === undefined ) return screen[field];

        const found = spoken(messages, locales, key);

        if ( found.missing.length === 0 ) return found.said;

        const known = textsOf(messages[locales[0] ?? ""]);

        issues.push({ path: `screens.${screen.name}.${field}`, rule: "text.unknown", message: `${key}: no message carries this key in ${found.missing.join(", ")}`, ...(known.includes(key) ? {} : near(key, known)), fix: "add the key to the seeds' messages or the role's messages in every locale" });

        return {};

    };

    return voiced(screen, { title: said(title, "title"), description: said(description, "description") });

}
function placed ( compiled: Compiled, named: string, what: "home" | "login" | "account", issues: Issue[] ): string | undefined {

    const screen = screenOf(compiled, named);

    if ( screen && screen.params.length === 0 && !screen.path.includes("*") ) return screen.path;

    issues.push({ path: `config.settings.${what}`, rule: `config.${what}`, message: `${named}: the ${what} is a screen with a fixed path`, ...near(named, compiled.screens.map(( one ) => one.name)) });

    return undefined;

}
function homeOf ( compiled: Compiled, settings: Settings, issues: Issue[] ): string | undefined {

    if ( settings.home === undefined ) return compiled.screens.some(( screen ) => screen.path === "/") ? "/" : undefined;

    return placed(compiled, settings.home, "home", issues);

}
function loginOf ( compiled: Compiled, settings: Settings, issues: Issue[] ): string | undefined {

    const found = settings.login === undefined ? undefined : placed(compiled, settings.login, "login", issues);

    if ( found !== undefined && screenOf(compiled, settings.login ?? "")?.auth === true ) issues.push({ path: "config.settings.login", rule: "config.login", message: `${settings.login}: the login screen cannot itself need a session`, fix: "mark it auth: \"guest\", or leave auth off" });

    return found;

}

function flat ( value: unknown, at: string, into: Set<string> ): Set<string> {

    if ( !json.isRecord(value) ) return into.add(at);

    for ( const [key, inner] of Object.entries(value) ) flat(inner, at === "" ? key : `${at}.${key}`, into);

    return into;

}
function matched ( messages: Messages ): Issue[] {

    const sheets = Object.entries(messages).map(([locale, sheet]) => [locale, flat(sheet, "", new Set())] as const);
    const every = new Set(sheets.flatMap(([, keys]) => [...keys]));

    return sheets.flatMap(([locale, keys]) => [...every].filter(( key ) => !keys.has(key)).map(( key ): Issue => ({ path: `seeds.messages.${locale}.${key}`, rule: "messages.keys", message: `${key}: ${locale} lacks a key the other locales carry`, fix: "every locale of the seeds carries the same keys" })));

}
export function build<D extends object = object> ( spec: Spec, owner: Part<D>, deploy: Deploy = {} ): Build<D> {

    if ( !isSpec(spec) ) throw exception.fault("internal", "spec.build", { message: "build takes a spec, such as spec.define({ admin })" });
    if ( !isPart(owner) ) throw exception.fault("internal", "spec.build", { message: "build takes a part, such as spec.part({ platform, blocks, features })" });

    const made = new Map<string, Built<D>>();
    const seeds = deploy.seeds ?? {};
    const seeded: Part<D> = seeds.messages === undefined ? owner : { ...owner, messages: json.deepMerge(owner.messages as json.Dictionary, seeds.messages as json.Dictionary) as Messages };
    const uneven = matched(seeds.messages ?? {});

    function found ( written: string, from?: string ): Found {

        return locate(spec, written, from);

    }
    function surface ( name: string ): Built<D> {

        const known = made.get(name);

        if ( known ) return known;

        const raw = Object.hasOwn(spec.surfaces, name) ? spec.surfaces[name] : undefined;

        if ( raw === undefined ) throw exception.fault("not_found", "spec.surface", { message: `no surface named ${String(name).slice(0, 120)}; surfaces: ${spec.names.join(", ")}`, errors: { surface: [nearest(String(name), spec.names) ?? ""] } });

        const source = chosen(raw, deploy.platform ?? owner.platform, deploy.release === true);
        const { config, messages, issues } = settle(seeded, source);
        const { settings, contracts } = config;
        const role = name.slice(name.lastIndexOf(".") + 1);
        const target = contracts.baseUrl;
        const address = typeof target === "string" && target !== "" ? api.address(target, { release: deploy.release }) : undefined;
        contracts.baseUrl = address ?? "";

        const screens = source.screens.map(( screen ) => worded(screen, messages, settings.locales, issues));
        const allowed = config.features.length > 0 && owner.features ? Object.fromEntries(config.features.filter(( feature ) => Object.hasOwn(owner.features ?? {}, feature)).map(( feature ) => [feature, owner.features?.[feature]])) : owner.features;
        const compiled = compile(plan({ name: `${owner.platform}-${role}`, role, platform: owner.platform, world: [...settings.world], locales: [...settings.locales], locale: settings.locale, address, screens, signals: [...source.signals], on: source.on, triggers: [...source.triggers] }), {
            blocks: owner.blocks,
            screen: owner.screen,
            carries: owner.carries,
            features: allowed as typeof owner.features,
            catalogue: owner.catalogue,
            topics: owner.topics,
            texts: textsOf(messages[settings.locale]),
            grants: [...settings.grants],
            maxDepth: owner.maxDepth,
        });

        for ( const feature of config.features ) {

            if ( owner.features && !Object.hasOwn(owner.features, feature) ) issues.push({ path: "config.features", rule: "config.feature", message: `${feature}: the part registers no such feature`, ...near(feature, Object.keys(owner.features)) });

        }

        const told = [...uneven, ...issues, ...compiled.issues];
        const id = source.id ?? name;
        const { files, urls } = filed([{ given: seeds.assets ?? {}, at: "seeds.assets" }, { given: source.assets, at: `specs.${name}.assets` }], id, deploy.served);
        const built: Built<D> = { name, id, address, home: homeOf(compiled, settings, told), login: loginOf(compiled, settings, told), account: settings.account === undefined ? undefined : placed(compiled, settings.account, "account", told), config, messages, assets: urls, places: { ...(deploy.places ?? {}) }, files, compiled: { ...compiled, issues: told }, links: {} };

        made.set(name, built);

        for ( const asked of compiled.transfers ) linked(built, asked);

        return built;

    }
    function linked ( from: Built<D>, asked: Transfer ): void {

        const target = locate(spec, asked.name, from.name);
        const { issues } = from.compiled;

        if ( target.issue ) {

            issues.push({ ...target.issue, path: asked.at });

            return;

        }

        from.links[asked.name] = target.name;

        const to = surface(target.name);
        if ( asked.to === undefined && to.home === undefined ) issues.push({ path: asked.at, rule: "transfer.home", message: `${target.name}: the surface has no default route to land on`, fix: "give it a screen at /, name one in settings.home, or pass to" });
        if ( asked.to !== undefined && !answers(to.compiled.screens, asked.to) ) issues.push({ path: asked.at, rule: "transfer.screen", message: `${asked.to}: no screen of ${target.name} answers this path`, ...near(asked.to, to.compiled.screens.map(( screen ) => screen.path)) });

    }
    function reach ( name: string ): string[] {

        const seen = new Set<string>([name]);

        for ( const next of seen ) for ( const target of Object.values(surface(next).links) ) seen.add(target);

        return [...seen];

    }
    function carried ( name: string ): Carried {

        const built = surface(name);

        return { id: built.id, ...(built.address === undefined ? {} : { address: built.address }), ...(built.home === undefined ? {} : { home: built.home }), ...(built.login === undefined ? {} : { login: built.login }), ...(built.account === undefined ? {} : { account: built.account }), config: built.config as unknown as json.Dictionary, messages: built.messages as json.Dictionary, assets: built.assets, places: built.places, links: built.links, compiled: serialize(built.compiled) };

    }
    function listed ( name: string ): Listed {

        const { id, config, compiled } = surface(name);
        const { locales, locale, scheme, world } = config.settings;
        const url: unknown = config.contents.url;

        return { name, id, indexable: typeof url === "string" && url !== "" && open(compiled), settings: { locales, locale, scheme, world } };

    }
    function artifact ( name: string, inline = true ): Artifact {

        const reached = reach(name);

        return { version, entry: name, index: reached.map(listed), surfaces: Object.fromEntries((inline ? reached : [name]).map(( one ) => [one, carried(one)])) };

    }

    return Object.freeze({ spec, part: owner, names: spec.names, current: spec.current, locate: found, surface, reach, carried, listed, artifact });

}
