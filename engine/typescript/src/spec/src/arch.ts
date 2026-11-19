import type * as api from "engine-api";
import type * as error from "engine-error";
import type * as event from "engine-event";
import type * as exception from "engine-exception";
import type * as json from "engine-json";
import type * as log from "engine-log";
import type * as seo from "engine-seo";
import type * as translate from "engine-translate";
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
    | { transfer: string; to?: string | undefined; with?: Record<string, Value> | undefined; reload?: boolean | undefined; carry?: string[] | undefined; inherit?: boolean | undefined }
    | { open: string; with?: Record<string, Value> | undefined; props?: Record<string, unknown> | undefined }
    | { close: string }
    | { toggle: string }
    | { after: number; do: Effect[]; latest?: boolean | undefined }
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
    description: Record<string, string>;
    texts: Keyed;
    role: string;
    menu: boolean;
    index: boolean;
    icon: string | undefined;
    auth: boolean;
    guest: boolean;
    access: string[];
    query: string[];
    signals: string[];
    settings: Record<string, unknown>;
    features: Feature[];
    blocks: Block[];
    on: Hooks;
    triggers: Trigger[];
    flow: string[];
};
export type Wording = string | Record<string, string> | { key: string };
export type Keyed = { title?: string | undefined; description?: string | undefined };
export type Platform = "web" | "mobile" | "desktop";
export type Plan = {
    name: string;
    role: string;
    platform: Platform;
    world: world.Catalog[];
    locales: string[];
    locale: string;
    address?: string | undefined;
    screens: Screen[];
    signals: string[];
    on: Moves;
    triggers: Trigger[];
};
export type Moves = { enter?: Effect[] | undefined; leave?: Effect[] | undefined };
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
export type Effects = Effect | readonly Effect[];
export type Reactions = { readonly [hook: string]: Effects | undefined };
export type FeatureOptions = {
    id?: string | undefined;
    settings?: Record<string, unknown> | undefined;
    ports?: Record<string, Binding> | undefined;
    when?: When | string | undefined;
    watch?: Record<string, Effects> | undefined;
    on?: Reactions | undefined;
    triggers?: Trigger[] | undefined;
    access?: string[] | undefined;
    form?: Record<string, string> | undefined;
};
export type Piece = Block | Feature;
export type Kind = {
    ( children: readonly Piece[], options?: BlockOptions ): Block;
    ( props?: Record<string, unknown>, children?: readonly Piece[], options?: BlockOptions ): Block;
};
export type BlockOptions = { id?: string | undefined; when?: When | string | undefined };
export type ScreenOptions = {
    path?: string | undefined;
    title?: Wording | undefined;
    description?: Wording | undefined;
    role?: string | undefined;
    menu?: boolean | undefined;
    index?: boolean | undefined;
    icon?: string | undefined;
    auth?: boolean | "guest" | undefined;
    access?: string[] | undefined;
    query?: string[] | undefined;
    signals?: string[] | undefined;
    settings?: Record<string, unknown> | undefined;
    layout?: readonly Piece[] | undefined;
    features?: Feature[] | undefined;
    blocks?: readonly Piece[] | undefined;
    on?: Reactions | undefined;
    triggers?: Trigger[] | undefined;
    flow?: string[] | undefined;
};
export type PlanOptions = { name: string; role: string; platform?: Platform | undefined; world?: world.Catalog[] | undefined; locales?: string[] | undefined; locale?: string | undefined; address?: string | undefined; screens: Screen[]; signals?: string[] | undefined; on?: Reactions | undefined; triggers?: Trigger[] | undefined };
export type Input = Record<string, Value>;
export type Issue = { path: string; rule: string; message: string; near?: string | undefined; fix?: string | undefined };
export type Edge = { from: string; to: string };
export type CompiledFeature = Feature & { id: string; manifest: Manifest | undefined };
export type CompiledScreen = Omit<Screen, "features"> & { features: CompiledFeature[]; params: string[]; kinds: string[]; depth: number; ids: string[]; watches: Edge[]; emits: string[]; listens: string[] };
export type Transfer = { name: string; to?: string | undefined; at: string };
export type Compiled = {
    surface: Plan;
    screens: CompiledScreen[];
    byName: Record<string, CompiledScreen>;
    features: string[];
    kinds: string[];
    topics: { emitted: string[]; consumed: string[] };
    transfers: Transfer[];
    issues: Issue[];
};
export type Messages = Readonly<Record<string, json.Dictionary>>;
export type Table = Readonly<Record<string, string>>;
export type Brand = Readonly<Record<string, Table>>;
export type Settings = { locales: string[]; locale: string; localization: boolean; scheme: string; world: world.Catalog[]; grants: string[]; storage: { secure: string }; app: { name: string; identifier: string; version: string; slug: string; scheme: string }; home?: string | undefined; login?: string | undefined; account?: string | undefined; [key: string]: unknown };
export type Toned = { light: Record<string, string>; dark: Record<string, string> };
export type Themed = { color: Toned; shadow: Toned; radius: Record<string, number | string>; motion: Record<string, number | string>; font: Record<string, string[]> };
export type Painted = { base: Record<string, string>; dark: Record<string, string>; named: Record<string, string> };
export type Contracts = { baseUrl: string; realtime: boolean; media: string[]; wire: api.Overrides; live: { path: string; channel: string; events: { created: string; updated: string; deleted: string }; key: string }; [key: string]: unknown };
export type Config = { settings: Settings; themes: json.Dictionary; contents: json.Dictionary; contracts: Contracts; features: string[] };
export type Schema = readonly Screen[] | { screens: readonly Screen[]; signals?: readonly string[] | undefined; on?: Reactions | undefined; triggers?: readonly Trigger[] | undefined };
export type SurfaceOptions = { id?: string | undefined; config?: object | undefined; schema: Schema; messages?: Messages | undefined; brand?: Readonly<Record<string, unknown>> | undefined };
export type Surface = { readonly id: string | undefined; readonly config: json.Dictionary; readonly screens: readonly Screen[]; readonly signals: readonly string[]; readonly on: Reactions; readonly triggers: readonly Trigger[]; readonly messages: Messages; readonly brand: Brand };
export type Groups = { readonly [name: string]: Surface | Groups };
export type SpecOptions = { current?: string | undefined };
export type Spec = { readonly surfaces: Readonly<Record<string, Surface>>; readonly names: readonly string[]; readonly current: string };
export type Found = { name: string; issue?: undefined } | { name?: undefined; issue: Issue };
export type PartOptions<D extends object> = {
    platform: Platform;
    blocks?: Readonly<Record<string, validate.Schema>> | undefined;
    screen?: validate.Schema | undefined;
    carries?: readonly string[] | undefined;
    features?: Readonly<Record<string, Manifest>> | undefined;
    catalogue?: Catalogue | undefined;
    topics?: readonly string[] | undefined;
    defaults?: D | undefined;
    messages?: Messages | undefined;
    maxDepth?: number | undefined;
};
export type Part<D extends object = object> = {
    readonly platform: Platform;
    readonly blocks: Readonly<Record<string, validate.Schema>> | undefined;
    readonly screen: validate.Schema | undefined;
    readonly carries: readonly string[];
    readonly features: Readonly<Record<string, Manifest>> | undefined;
    readonly catalogue: Catalogue | undefined;
    readonly topics: readonly string[];
    readonly defaults: D;
    readonly messages: Messages;
    readonly maxDepth: number | undefined;
};
export type Settled<D extends object = object> = Config & D;
export type Deploy = { url?: string | undefined; release?: boolean | undefined; config?: json.Dictionary | undefined };
export type Built<D extends object = object> = { name: string; id: string; address: string | undefined; home: string | undefined; login: string | undefined; account: string | undefined; config: Settled<D>; messages: Messages; brand: Brand; compiled: Compiled; links: Record<string, string> };
export type Carried = { id: string; address?: string | undefined; home?: string | undefined; login?: string | undefined; account?: string | undefined; config: json.Dictionary; messages: json.Dictionary; brand: json.Dictionary; links: json.Dictionary; compiled: json.Dictionary };
export type Listed = { name: string; id: string; indexable: boolean; settings: Pick<Settings, "locales" | "locale" | "scheme" | "world"> };
export type Artifact = { version: number; entry: string; index: Listed[]; surfaces: Record<string, Carried> };
export type Loaders = Readonly<Record<string, () => Promise<unknown>>>;
export type Build<D extends object = object> = {
    readonly spec: Spec;
    readonly part: Part<D>;
    readonly names: readonly string[];
    readonly current: string;
    locate: ( written: string, from?: string ) => Found;
    surface: ( name: string ) => Built<D>;
    reach: ( name: string ) => string[];
    carried: ( name: string ) => Carried;
    listed: ( name: string ) => Listed;
    artifact: ( name: string, inline?: boolean ) => Artifact;
};
export type Labels = Readonly<Record<string, string>>;
export type Public = { indexable: boolean; url: string | undefined };
export type Located = { locale: string; path: string; moved: boolean };
export type Meta = { title: string; description: string; robots: string; canonical: string | undefined; alternates: seo.Alternate[]; openGraph: Record<string, string>; twitter: Record<string, string>; keywords: string[]; tags: seo.Tag[] };
export type Head = ( tags: seo.Tag[] ) => () => void;
export type HeadNode = { hasAttribute: ( name: string ) => boolean; getAttribute: ( name: string ) => string | null; setAttribute: ( name: string, value: string ) => void; remove: () => void };
export type HeadTag = { selector: string; tag: "meta" | "link"; key: string; name: string; attribute: "content" | "href"; value: string; extra?: readonly [string, string] | undefined };
export type HeadPage = {
    document?: { head?: { querySelectorAll: ( selector: string ) => Iterable<HeadNode>; appendChild: ( node: HeadNode ) => unknown }; createElement: ( tag: string ) => HeadNode; location?: { href?: string } };
    MutationObserver?: new ( work: () => void ) => { observe: ( target: unknown, options: { childList: boolean } ) => void; disconnect: () => void };
};
export type Asked = { key: string; resolve: ( yes: boolean ) => void };
export type Moved = { name: string; to?: string | undefined; with?: json.Dictionary | undefined; refresh?: boolean | undefined; carry?: readonly string[] | undefined; inherit?: boolean | undefined };
export type Handing = { inherit: boolean; names: readonly string[] };
export type Carry = { readonly inherit?: boolean | undefined; readonly [name: string]: boolean | undefined };
export type Popup = { readonly key: number; readonly path: string; readonly props: json.Dictionary; readonly screen: CompiledScreen; readonly params: Record<string, string>; readonly live: Runtime };
export type AppOptions = Omit<RuntimeOptions, "translate" | "confirm" | "fail" | "bus" | "transfer" | "open" | "close" | "nested" | "feed"> & {
    name?: string | undefined;
    sinks?: readonly log.Sink[] | undefined;
    active?: string | undefined;
    load?: Loaders | undefined;
} & Doors;
export type Feeder = Pick<api.Live, "subscribe" | "open">;
export type Fed = { count: number; stop: () => void };
export type Doors = { navigate?: Navigate | undefined; carry?: (( app: App, asked: Handing ) => json.Dictionary) | undefined; reload?: (( path: string ) => void) | undefined; live?: (( app: App ) => Feeder | undefined) | undefined };
export type App<D extends object = object> = {
    readonly name: string;
    readonly id: string;
    readonly address: string | undefined;
    readonly home: string;
    readonly login: string | undefined;
    readonly account: string | undefined;
    readonly compiled: Compiled;
    readonly config: Settled<D>;
    readonly messages: Messages;
    readonly brand: Brand;
    readonly links: Readonly<Record<string, string>>;
    readonly live: Runtime;
    readonly bus: event.Bus;
    readonly logger: log.Logger;
    readonly logs: log.Sink & { entries: log.Entry[]; clear: () => void };
    readonly confirmations: event.Signal<Asked | undefined>;
    readonly popups: Readable<readonly Popup[]>;
    open: ( path: string, props?: json.Dictionary ) => Promise<Popup>;
    close: ( which?: string ) => Promise<void>;
    report: ( caught: unknown, where: string ) => undefined;
    ask: ( key: string ) => Promise<boolean>;
    answer: ( yes: boolean ) => void;
    screenAt: ( path: string ) => Matched | undefined;
    gate: ( screen: CompiledScreen ) => string | undefined;
    menu: ( locale: string, at: string ) => MenuItem[];
    title: ( screen: Screen, locale: string ) => string;
    labels: ( locale: string, feature: string ) => Labels;
    text: ( locale: string, key: string, params?: translate.Params, count?: number ) => string;
    settings: ( screen: string, feature: string ) => json.Dictionary;
    content: ( key: string, locale: string ) => string;
    asset: ( path: string ) => string;
    indexing: () => Public;
    crawl: () => string;
    graph: ( locale: string ) => string | undefined;
    paths: () => string[];
    routes: () => string[];
    locate: ( address: string ) => Located;
    href: ( path: string, locale: string ) => string;
    site: ( locale: string ) => seo.Site | undefined;
    heading: ( screen: CompiledScreen, locale: string ) => string;
    meta: ( screen: CompiledScreen, locale: string ) => Meta;
};
export type Host<D extends object = object> = {
    readonly entry: string;
    readonly names: readonly string[];
    readonly index: readonly Listed[];
    readonly active: Readable<string>;
    readonly app: App<D>;
    of: ( name: string ) => App<D>;
    own: <T>( make: ( app: App<D> ) => T ) => () => T;
    carried: () => json.Dictionary;
    bind: ( doors: Doors ) => () => void;
    ready: ( name: string ) => Promise<App<D>>;
    owner: ( path: string ) => Promise<string | undefined>;
    resume: ( name: string, carried?: json.Dictionary ) => Promise<boolean>;
    transfer: ( name: string, options?: Omit<Moved, "name"> ) => Promise<void>;
};
export type Options = {
    kinds?: readonly string[] | undefined;
    blocks?: Readonly<Record<string, validate.Schema>> | undefined;
    screen?: validate.Schema | undefined;
    carries?: readonly string[] | undefined;
    features?: readonly string[] | Readonly<Record<string, Manifest>> | undefined;
    catalogue?: Catalogue | undefined;
    topics?: readonly string[] | undefined;
    texts?: readonly string[] | undefined;
    grants?: readonly string[] | undefined;
    maxDepth?: number | undefined;
};
export type Shared = {
    surface: Plan;
    options: Options;
    issues: Issue[];
    manifests: Readonly<Record<string, Manifest>> | undefined;
    transfers: Transfer[];
    signals: ReadonlySet<string>;
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
    leaving: boolean;
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
    transfer?: (( moved: Moved ) => Promise<void> | void) | undefined;
    open?: (( path: string, props: json.Dictionary ) => Promise<unknown> | unknown) | undefined;
    close?: (( which: string ) => Promise<void> | void) | undefined;
    nested?: boolean | undefined;
    feed?: (( feature: string ) => () => void) | undefined;
    fail?: (( fault: exception.Fault, where: string ) => void) | undefined;
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
    run: ( effects: readonly Effect[], event?: json.Dictionary ) => Promise<void>;
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
export type Timer = ReturnType<typeof setTimeout>;
export type Chain = { live: () => boolean; seen: () => Context; timers: Map<object, Timer> };
export type Stage = { screen: CompiledScreen; index: Index; live: boolean; stops: (() => void)[]; left: Promise<void> | undefined; chain: Chain };
export type Watcher = { keys: string[]; head: Space; effects: readonly Effect[]; where: string };
export type Hook = { effects: readonly Effect[]; where: string };

export const namespaces = ["params", "query", "signals", "form", "user", "device", "settings", "locale", "event", "flow"] as const;

export const namePattern = /^[a-z][a-z0-9_.-]*$/;
export const pathPattern = /^\/(?:[a-z0-9-]+|\{[a-z][a-z0-9_]*\}|\*)?(?:\/(?:[a-z0-9-]+|\{[a-z][a-z0-9_]*\}|\*))*$/;
export const version = 2;
export const generated = "_generated";
export const segmentPattern = /^[a-z][a-z0-9_-]*$/;
export const maxDepth = 64;
