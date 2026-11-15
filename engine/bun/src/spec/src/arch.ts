import type * as error from "engine-error";
import type * as event from "engine-event";
import type * as json from "engine-json";
import type * as validate from "engine-validate";
import type * as world from "engine-world";

export type Scalar = string | number | boolean | null;
export type Reference = { param: string } | { query: string } | { signal: string } | { form: string } | { user: string } | { setting: string } | { path: string } | { text: string };
export type Value = Scalar | Reference | readonly Scalar[];
export type Test = { is: string; eq?: Scalar | undefined; ne?: Scalar | undefined; in?: readonly Scalar[] | undefined; gt?: number | undefined; gte?: number | undefined; lt?: number | undefined; lte?: number | undefined; has?: Scalar | undefined; like?: string | undefined; empty?: boolean | undefined; can?: string | undefined };
export type When = boolean | Test | { all: When[] } | { any: When[] } | { not: When };
export type Effect =
    | { set: string; to: Value }
    | { clear: string }
    | { show: string }
    | { hide: string }
    | { enable: string }
    | { disable: string }
    | { emit: string; with?: Record<string, Value> | undefined }
    | { call: string; with?: Record<string, Value> | undefined; queue?: boolean | undefined }
    | { step: string }
    | { confirm: string; do: Effect[]; else?: Effect[] | undefined }
    | { check: string; do: Effect[]; else?: Effect[] | undefined; fields?: string[] | undefined }
    | { refresh: string }
    | { navigate: string; with?: Record<string, Value> | undefined }
    | { when: When; do: Effect[]; else?: Effect[] | undefined };
export type Hooks = { load?: Effect[] | undefined; leave?: Effect[] | undefined; submit?: Effect[] | undefined; success?: Effect[] | undefined; failure?: Effect[] | undefined; change?: Effect[] | undefined };
export type Trigger = { on: string; do: Effect[]; when?: When | undefined };
export type Listing = { sort?: string | undefined; filter?: Record<string, Value> | undefined; page?: Value | undefined; limit?: number | undefined; search?: Value | undefined };
export type Binding = { read: string; input?: Record<string, Value> | undefined; list?: Listing | undefined; live?: boolean | string | undefined } | { write: string; input?: Record<string, Value> | undefined; fields?: string[] | undefined } | { data: unknown } | { signal: string };
export type Feature = {
    name: string;
    id: string | undefined;
    settings: Record<string, unknown>;
    ports: Record<string, Binding>;
    when: When | undefined;
    watch: Record<string, Effect[]>;
    on: Hooks;
    triggers: Trigger[];
    access: string[];
    form: Record<string, string>;
};
export type Block = { kind: string; id: string | undefined; props: Record<string, unknown>; when: When | undefined; children: Block[] };
export type Screen = {
    name: string;
    path: string;
    title: Record<string, string>;
    role: string;
    menu: boolean;
    icon: string | undefined;
    auth: boolean;
    access: string[];
    query: string[];
    signals: string[];
    features: Feature[];
    blocks: Block[];
    on: Hooks;
    triggers: Trigger[];
    flow: string[];
};
export type Platform = "web" | "mobile" | "desktop";
export type Surface = {
    name: string;
    role: string;
    platform: Platform;
    world: world.Catalog[];
    locales: string[];
    locale: string;
    screens: Screen[];
    signals: string[];
};
export type PortKind = "list" | "one" | "write";
export type Port = { kind: PortKind; required?: boolean | undefined; fields?: readonly string[] | undefined };
export type Manifest = {
    world?: readonly world.Catalog[] | undefined;
    name: string;
    settings?: validate.Schema | undefined;
    ports?: Readonly<Record<string, Port>> | undefined;
    fields?: readonly string[] | undefined;
    actions?: readonly string[] | undefined;
    emits?: readonly string[] | undefined;
    signals?: readonly string[] | undefined;
    access?: readonly string[] | undefined;
};
export type Operation = { many: boolean; write: boolean; input: readonly string[]; output?: readonly string[] | undefined };
export type Catalogue = Readonly<Record<string, Operation>>;
export type Context = {
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    signals: json.Dictionary;
    form: json.Dictionary;
    user: json.Dictionary | null;
    device: json.Dictionary;
    settings: json.Dictionary;
    locale: string;
    event: json.Dictionary;
    flow: Flow;
};
export type Flow = { step: string; index: number; first: boolean; last: boolean; done: boolean };
export type Translate = ( key: string ) => string;
export type Cut = { at: number; mark: string };
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
export type Input = Record<string, Value>;
export type Issue = { path: string; rule: string; message: string; near?: string | undefined; fix?: string | undefined };
export type Edge = { from: string; to: string };
export type CompiledFeature = Feature & { id: string; manifest: Manifest | undefined };
export type CompiledScreen = Omit<Screen, "features"> & { features: CompiledFeature[]; params: string[]; kinds: string[]; depth: number; ids: string[]; watches: Edge[]; emits: string[]; listens: string[] };
export type Compiled = {
    surface: Surface;
    screens: CompiledScreen[];
    byName: Record<string, CompiledScreen>;
    features: string[];
    kinds: string[];
    topics: { emitted: string[]; consumed: string[] };
    issues: Issue[];
};
export type Options = {
    kinds?: readonly string[] | undefined;
    blocks?: Readonly<Record<string, validate.Schema>> | undefined;
    features?: readonly string[] | Readonly<Record<string, Manifest>> | undefined;
    catalogue?: Catalogue | undefined;
    topics?: readonly string[] | undefined;
    texts?: readonly string[] | undefined;
    grants?: readonly string[] | undefined;
    maxDepth?: number | undefined;
};
export type Shared = {
    surface: Surface;
    options: Options;
    issues: Issue[];
    manifests: Readonly<Record<string, Manifest>> | undefined;
    paths: ReadonlySet<string>;
    texts: ReadonlySet<string> | undefined;
    kinds: readonly string[] | undefined;
};
export type Scope = {
    at: string;
    issues: Issue[];
    shared: Shared;
    params: Set<string>;
    query: Set<string>;
    signals: Set<string>;
    fields: Set<string>;
    ids: Set<string>;
    actions: Set<string>;
    features: Set<string>;
    emitted: Set<string>;
    listened: Set<string>;
    watches: Edge[];
    inTrigger: boolean;
    steps: Set<string>;
    forms: Map<string, readonly string[]>;
};
export type Ranked = { screen: CompiledScreen; fixed: boolean; pieces: string[] };
export type Matched = { screen: CompiledScreen; params: Record<string, string> };
export type MenuItem = { name: string; path: string; title: string; icon: string | undefined; active: boolean };
export type Handler = ( input: json.Dictionary, runtime: Runtime ) => unknown | Promise<unknown>;
export type Navigate = ( path: string ) => void;
export type Readable<T> = { getState: () => T; subscribe: ( listener: ( state: T, previous: T ) => void ) => () => void };
export type Visibility = { hidden: Set<string>; disabled: Set<string> };
export type Mounted = { screen: CompiledScreen; unmount: () => Promise<void> };
export type Confirm = ( key: string, context: Context ) => Promise<boolean> | boolean;
export type Queue = ( action: string, input: json.Dictionary ) => Promise<unknown> | unknown;
export type Rulebook = ( form: Record<string, string> ) => validate.Schema;
export type RuntimeOptions = {
    bus?: event.Bus | undefined;
    navigate?: Navigate | undefined;
    handlers?: Readonly<Record<string, Handler>> | undefined;
    context?: Partial<Context> | undefined;
    translate?: Translate | undefined;
    confirm?: Confirm | undefined;
    queue?: Queue | undefined;
    rulebook?: Rulebook | undefined;
    fail?: (( fault: error.Fault, where: string ) => void) | undefined;
};
export type Runtime = {
    readonly compiled: Compiled;
    readonly bus: event.Bus;
    readonly state: Readable<Context>;
    readonly view: Readable<Visibility>;
    get: ( path: string ) => unknown;
    set: ( path: string, value: unknown ) => void;
    patch: ( values: Partial<Context> ) => void;
    handle: ( action: string, handler: Handler ) => () => void;
    run: ( effects: readonly Effect[] ) => Promise<void>;
    act: ( feature: string, action: string, input?: json.Dictionary ) => Promise<unknown>;
    mount: ( name: string, route?: { params?: Record<string, string> | undefined; query?: Record<string, string | string[]> | undefined } ) => Promise<Mounted>;
    visible: ( id: string ) => boolean;
    enabled: ( id: string ) => boolean;
    placed: ( screen: string, feature: string ) => CompiledFeature | undefined;
    settings: ( screen: string, feature: string ) => json.Dictionary;
    allowed: ( id: string ) => boolean;
    opens: ( screen: string ) => boolean;
    flow: () => Flow;
    errors: ( feature: string, fields?: readonly string[] ) => error.Errors | undefined;
};
export type Space = (typeof namespaces)[number];
export type Index = { ids: Map<string, CompiledFeature>; names: Map<string, CompiledFeature>; blocks: Map<string, Block>; settings: json.Dictionary };
export type Routes = { fixed: Map<string, CompiledScreen>; moving: CompiledScreen[]; menu: CompiledScreen[] };
export type Chain = { live: () => boolean; seen: () => Context };
export type Stage = { screen: CompiledScreen; index: Index; live: boolean; stops: (() => void)[]; left: Promise<void> | undefined; chain: Chain };
export type Watcher = { keys: string[]; head: Space; effects: readonly Effect[]; where: string };
export type Hook = { effects: readonly Effect[]; where: string };

export const namespaces = ["params", "query", "signals", "form", "user", "device", "settings", "locale", "event", "flow"] as const;

export const namePattern = /^[a-z][a-z0-9_.-]*$/;
export const pathPattern = /^\/(?:[a-z0-9-]+|\{[a-z][a-z0-9_]*\}|\*)?(?:\/(?:[a-z0-9-]+|\{[a-z][a-z0-9_]*\}|\*))*$/;
export const maxDepth = 64;
