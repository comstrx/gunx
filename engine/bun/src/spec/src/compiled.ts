import * as exception from "engine-exception";
import * as json from "engine-json";
import type { Block, Compiled, CompiledFeature, CompiledScreen, Plan } from "./arch.ts";
import { maxDepth, namePattern } from "./arch.ts";

const none: never[] = Object.freeze([]) as unknown as never[];
const words: never[] = Object.freeze([]) as unknown as never[];
const blank: Record<string, never> = Object.freeze({});
const screenDefaults: json.Dictionary = Object.freeze({ title: blank, description: blank, texts: blank, role: "any", menu: true, index: true, auth: false, guest: false, access: words, query: words, signals: words, settings: blank, features: none, blocks: none, on: blank, triggers: none, flow: words, params: words, kinds: words, depth: 0, ids: words, watches: none, emits: words, listens: words });
const featureDefaults: json.Dictionary = Object.freeze({ settings: blank, ports: blank, watch: blank, on: blank, triggers: none, access: words, form: blank });
const blockDefaults: json.Dictionary = Object.freeze({ props: blank, children: none });
const planDefaults: json.Dictionary = Object.freeze({ world: none, signals: words, on: blank, triggers: none });

function texts ( value: unknown ): value is string[] {

    return Array.isArray(value) && value.every(( item ) => typeof item === "string");

}
function idle ( value: unknown, usual: unknown ): boolean {

    if ( Array.isArray(usual) ) return Array.isArray(value) && value.length === 0;
    if ( usual === blank ) return json.isPlain(value) && Object.keys(value).length === 0;

    return value === usual;

}
function fits ( made: json.Dictionary, usual: json.Dictionary ): boolean {

    for ( const key of Object.keys(usual) ) {

        const value = made[key];
        const kind = usual[key];

        if ( kind === words ? !texts(value) : kind === none ? !Array.isArray(value) : kind === blank ? !json.isRecord(value) : typeof value !== typeof kind ) return false;

    }

    return true;

}
function whole ( raw: json.Dictionary, usual: json.Dictionary, more: json.Dictionary ): json.Dictionary {

    const made: json.Dictionary = { ...raw, ...more };

    for ( const key of Object.keys(usual) ) if ( made[key] === undefined ) made[key] = usual[key];

    return made;

}
function lean ( held: object, usual: json.Dictionary, more: json.Dictionary = {} ): json.Dictionary {

    const made: json.Dictionary = {};
    const source = held as json.Dictionary;

    for ( const key of Object.keys(source) ) {

        const value = Object.hasOwn(more, key) ? more[key] : source[key];

        if ( value !== undefined && !(Object.hasOwn(usual, key) && idle(value, usual[key])) ) made[key] = value;

    }

    return made;

}
function packed ( blocks: readonly Block[], level: number ): json.Dictionary[] {

    return blocks.map(( block ) => lean(block, blockDefaults, level < maxDepth ? { children: packed(block.children, level + 1) } : {}));

}
function grown ( value: unknown, level: number ): Block[] | undefined {

    if ( !Array.isArray(value) || level > maxDepth ) return undefined;
    if ( value.length === 0 ) return none;

    const made: Block[] = [];

    for ( const raw of value ) {

        const children = json.isRecord(raw) ? grown(raw.children ?? none, level + 1) : undefined;
        if ( !json.isRecord(raw) || children === undefined ) return undefined;

        const block = whole(raw, blockDefaults, { children });

        if ( typeof block.kind !== "string" || !fits(block, blockDefaults) ) return undefined;

        made.push(block as unknown as Block);

    }

    return made;

}
function featured ( raw: unknown ): CompiledFeature | undefined {

    if ( !json.isRecord(raw) ) return undefined;

    const made = whole(raw, featureDefaults, { id: raw.id ?? raw.name, manifest: undefined });

    return named(made.name) && named(made.id) && fits(made, featureDefaults) ? made as unknown as CompiledFeature : undefined;

}
function screened ( raw: unknown ): CompiledScreen | undefined {

    if ( !json.isRecord(raw) || !Array.isArray(raw.features ?? none) ) return undefined;

    const blocks = grown(raw.blocks ?? none, 0);
    const made = whole(raw, screenDefaults, { features: (raw.features as unknown[] | undefined ?? none).map(featured), blocks });

    return blocks !== undefined && named(made.name) && typeof made.path === "string" && fits(made, screenDefaults) && !(made.features as unknown[]).includes(undefined) ? made as unknown as CompiledScreen : undefined;

}

export function named ( value: unknown ): value is string {

    return typeof value === "string" && value.length <= 64 && namePattern.test(value) && value.split(".").every(json.safeKey);

}
export function screenOf ( compiled: Compiled, name: string ): CompiledScreen | undefined {

    return typeof name === "string" && compiled.byName !== undefined && Object.hasOwn(compiled.byName, name) ? compiled.byName[name] : undefined;

}
export function open ( compiled: Pick<Compiled, "screens"> ): boolean {

    return compiled.screens.some(( screen ) => !screen.auth && screen.access.length === 0);

}
export function serialize ( compiled: Compiled ): json.Dictionary {

    return {
        surface: { ...lean(json.omit(compiled.surface, ["screens"]), planDefaults), order: compiled.surface.screens.map(( screen ) => screen.name) },
        screens: compiled.screens.map(( found ) => lean(found, screenDefaults, {
            features: found.features.map(( feature ) => lean(json.omit(feature, ["manifest"]), featureDefaults, feature.id === feature.name ? { id: undefined } : {})),
            blocks: packed(found.blocks, 0),
        })),
        features: compiled.features,
        kinds: compiled.kinds,
        topics: compiled.topics,
    };

}
export function revive ( given: unknown ): Compiled {

    const surface = json.isRecord(given) ? given.surface : undefined;
    const screens = json.isRecord(given) ? given.screens : undefined;
    const topics = json.isRecord(given) && json.isRecord(given.topics) ? given.topics : {};

    if ( !json.isRecord(given) || !json.isRecord(surface) || !named(surface.name) || typeof surface.role !== "string" || typeof surface.locale !== "string" || !texts(surface.locales) || !(surface.address === undefined || typeof surface.address === "string") ) throw exception.fault("internal", "spec.revive", { message: "spec: not a serialized surface" });

    const found = Array.isArray(screens) ? screens.map(screened) : [undefined];
    const plan = whole(json.omit(surface, ["order"]), planDefaults, {});

    if ( found.includes(undefined) || !fits(plan, planDefaults) ) throw exception.fault("internal", "spec.revive", { message: "spec: a serialized screen is malformed" });

    const byName: Record<string, CompiledScreen> = {};

    for ( const screen of found as CompiledScreen[] ) byName[screen.name] = screen;

    const order = texts(surface.order) ? surface.order : [];
    const declared = [...new Set([...order.map(( name ) => (Object.hasOwn(byName, name) ? byName[name] : undefined)).filter(( screen ): screen is CompiledScreen => screen !== undefined), ...(found as CompiledScreen[])])];

    return {
        surface: { ...(plan as unknown as Plan), screens: declared },
        screens: found as CompiledScreen[],
        byName,
        features: texts(given.features) ? given.features : [],
        kinds: texts(given.kinds) ? given.kinds : [],
        topics: { emitted: texts(topics.emitted) ? topics.emitted : [], consumed: texts(topics.consumed) ? topics.consumed : [] },
        transfers: [],
        issues: [],
    };

}
