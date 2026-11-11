import type * as world from "engine-world";
import type { Binding, Block, Effect, Feature, Hooks, Listing, Platform, Reference, Screen, Surface, Trigger, Value, When } from "./shapes.ts";
import { type Flow, when as parseWhen } from "./when.ts";

export type FeatureOptions = {
    id?: string | undefined;
    ports?: Record<string, Binding> | undefined;
    when?: When | string | undefined;
    watch?: Record<string, Effect[]> | undefined;
    on?: Hooks | undefined;
    triggers?: Trigger[] | undefined;
    access?: string[] | undefined;
    form?: Record<string, string> | undefined;
};
export type BlockOptions = { id?: string | undefined; when?: When | string | undefined };
export type ScreenOptions = {
    name: string;
    path: string;
    title: Record<string, string> | string;
    role?: string | undefined;
    menu?: boolean | undefined;
    icon?: string | undefined;
    auth?: boolean | undefined;
    access?: string[] | undefined;
    query?: string[] | undefined;
    signals?: string[] | undefined;
    features?: Feature[] | undefined;
    blocks?: Block[] | undefined;
    on?: Hooks | undefined;
    triggers?: Trigger[] | undefined;
    flow?: string[] | undefined;
};
export type SurfaceOptions = { name: string; role: string; platform?: Platform | undefined; world?: world.Catalog[] | undefined; locales?: string[] | undefined; locale?: string | undefined; screens: Screen[]; signals?: string[] | undefined };

type Input = Record<string, Value>;

export const built: unique symbol = Symbol.for("engine.spec.built");

function brand<T extends object> ( made: T ): T {

    Object.defineProperty(made, built, { value: true, enumerable: false });

    return made;

}
function judged ( given: When | string | undefined ): When | undefined {

    return given === undefined ? undefined : parseWhen(given);

}

export function isBuilt ( value: unknown ): boolean {

    return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[built] === true;

}
export function block ( kind: string, props: Record<string, unknown> = {}, children: Block[] = [], options: BlockOptions = {} ): Block {

    return brand({ kind, id: options.id, props, when: judged(options.when), children });

}
export function feature ( name: string, settings: Record<string, unknown> = {}, options: FeatureOptions = {} ): Feature {

    return brand({
        name,
        id: options.id,
        settings,
        ports: options.ports ?? {},
        when: judged(options.when),
        watch: options.watch ?? {},
        on: options.on ?? {},
        triggers: options.triggers ?? [],
        access: options.access ?? [],
        form: options.form ?? {},
    });

}
export function screen ( given: ScreenOptions ): Screen {

    return brand({
        name: given.name,
        path: given.path,
        title: typeof given.title === "string" ? { en: given.title } : given.title,
        role: given.role ?? "any",
        menu: given.menu ?? true,
        icon: given.icon,
        auth: given.auth ?? false,
        access: given.access ?? [],
        query: given.query ?? [],
        signals: given.signals ?? [],
        features: given.features ?? [],
        blocks: given.blocks ?? [],
        on: given.on ?? {},
        triggers: given.triggers ?? [],
        flow: given.flow ?? [],
    });

}
export function surface ( given: SurfaceOptions ): Surface {

    return brand({
        name: given.name,
        role: given.role,
        platform: given.platform ?? "web",
        world: given.world ?? [],
        locales: given.locales ?? ["en"],
        locale: given.locale ?? given.locales?.[0] ?? "en",
        screens: given.screens,
        signals: given.signals ?? [],
    });

}
export function when ( text: string | When ): When {

    return parseWhen(text);

}
export function all ( ...conditions: readonly (When | string)[] ): When {

    return { all: conditions.map(parseWhen) };

}
export function any ( ...conditions: readonly (When | string)[] ): When {

    return { any: conditions.map(parseWhen) };

}
export function not ( condition: When | string ): When {

    const made = parseWhen(condition);

    return typeof made === "boolean" ? !made : { not: made };

}
export function can ( ability: string ): When {

    return { is: "user.abilities", can: ability };

}
export function read ( operation: string, input?: Input, options: { list?: Listing | undefined; live?: boolean | string | undefined } = {} ): Binding {

    const made: { read: string; input?: Input; list?: Listing; live?: boolean | string } = { read: operation };

    if ( input ) made.input = input;
    if ( options.list ) made.list = options.list;
    if ( options.live !== undefined ) made.live = options.live;

    return made;

}
export function write ( operation: string, input?: Input, fields?: string[] ): Binding {

    const made: { write: string; input?: Input; fields?: string[] } = { write: operation };

    if ( input ) made.input = input;
    if ( fields ) made.fields = fields;

    return made;

}
export function data ( value: unknown ): Binding {

    return { data: value };

}
export function signal ( name: string ): Binding {

    return { signal: name };

}
export function param ( name: string ): Reference {

    return { param: name };

}
export function query ( name: string ): Reference {

    return { query: name };

}
export function form ( name: string ): Reference {

    return { form: name };

}
export function user ( name: string ): Reference {

    return { user: name };

}
export function setting ( name: string ): Reference {

    return { setting: name };

}
export function text ( key: string ): Reference {

    return { text: key };

}
export function fromSignal ( name: string ): Reference {

    return { signal: name };

}
export function fromEvent ( name: string ): Reference {

    return { path: `event.${name}` };

}
export function fromDevice ( name: string ): Reference {

    return { path: `device.${name}` };

}
export function fromFlow ( name: keyof Flow ): Reference {

    return { path: `flow.${name}` };

}
export function set ( path: string, to: Value ): Effect {

    return { set: path, to };

}
export function clear ( path: string ): Effect {

    return { clear: path };

}
export function show ( target: string ): Effect {

    return { show: target };

}
export function hide ( target: string ): Effect {

    return { hide: target };

}
export function enable ( target: string ): Effect {

    return { enable: target };

}
export function disable ( target: string ): Effect {

    return { disable: target };

}
export function emit ( topic: string, payload?: Input ): Effect {

    return payload ? { emit: topic, with: payload } : { emit: topic };

}
export function call ( action: string, input?: Input ): Effect {

    return input ? { call: action, with: input } : { call: action };

}
export function queued ( action: string, input?: Input ): Effect {

    return input ? { call: action, with: input, queue: true } : { call: action, queue: true };

}
export function refresh ( featureName: string ): Effect {

    return { refresh: featureName };

}
export function navigate ( path: string, input?: Input ): Effect {

    return input ? { navigate: path, with: input } : { navigate: path };

}
export function step ( to: "next" | "back" | string ): Effect {

    return { step: to };

}
export function branch ( condition: When | string, effects: Effect[], otherwise?: Effect[] ): Effect {

    return otherwise ? { when: parseWhen(condition), do: effects, else: otherwise } : { when: parseWhen(condition), do: effects };

}
export function confirm ( key: string, run: Effect[], otherwise?: Effect[] ): Effect {

    return otherwise ? { confirm: key, do: run, else: otherwise } : { confirm: key, do: run };

}
export function check ( featureName: string, run: Effect[], otherwise?: Effect[], fields?: string[] ): Effect {

    return { check: featureName, do: run, ...(otherwise ? { else: otherwise } : {}), ...(fields ? { fields } : {}) };

}
export function trigger ( on: string, effects: Effect[], condition?: When | string ): Trigger {

    return condition === undefined ? { on, do: effects } : { on, do: effects, when: parseWhen(condition) };

}
