import type * as spec from "engine-spec";
import type * as world from "engine-world";

export type Walked = { path: string; relative: string; size: number };
export type WalkOptions = { extensions?: readonly string[] | undefined; ignore?: readonly string[] | undefined };
export type Member = { name: string; folder: string; description: string; dependencies: string[] };
export type Pending = { folder: string; inside: string; level: number };
export type Rules = {
    root: string;
    source?: string | undefined;
    alias?: string | undefined;
    layers: readonly string[];
    vendor?: readonly string[] | undefined;
    bare?: readonly string[] | undefined;
    only?: Readonly<Record<string, readonly string[]>> | undefined;
    engine?: string | undefined;
    members?: readonly string[] | undefined;
    framework?: Readonly<Record<string, readonly string[]>> | undefined;
    owners?: Readonly<Record<string, readonly string[]>> | undefined;
    outside?: readonly string[] | undefined;
    shared?: readonly string[] | undefined;
    entries?: readonly string[] | undefined;
};
export type Resolved = {
    root: string;
    source: string;
    alias: string;
    layers: readonly string[];
    vendor: readonly string[];
    bare: readonly string[];
    only: Readonly<Record<string, readonly string[]>>;
    engine: string;
    members: readonly string[];
    framework: Readonly<Record<string, readonly string[]>>;
    owners: Readonly<Record<string, readonly string[]>>;
    outside: readonly string[];
    shared: readonly string[];
    entries: readonly string[];
};
export type Rule = "bare" | "layer" | "member" | "only" | "outside" | "owner" | "runtime" | "vendor";
export type Issue = { file: string; line: number; message: string; rule: Rule };
export type Analysis = { files: number; issues: Issue[]; edges: Record<string, string[]>; cycles: string[][]; orphans: string[] };
export type Found = { target: string; line: number; typed: boolean; text: string };
export type Visit = { node: string; next: number };
export type Kinded = { isFile: () => boolean; isDirectory: () => boolean; isSymbolicLink: () => boolean };
export type Vars = Readonly<Record<string, string | undefined>>;
export type Reached = { name: string; id: string; settings: spec.Settings; themes: spec.Config["themes"]; media: string[] };
export type Reach = { names: string[]; addresses: string[]; world: world.Catalog[]; surfaces: Reached[] };
export type View<D extends object = object> = D extends unknown ? spec.Compiled & { name: string; id: string; address: string | undefined; config: spec.Settled<D>; settings: spec.Settled<D>["settings"]; themes: spec.Settled<D>["themes"]; locale: string; dir: "ltr" | "rtl"; places: Readonly<Record<string, string>>; index: spec.Listed[]; reach: Reach } : never;
export type Scope<V = unknown> = {
    readonly root: string;
    readonly argv: readonly string[];
    readonly env: Vars;
    readonly role: V;
    readonly build: spec.Build | undefined;
    readonly placing: Placement | undefined;
    at: ( path: string ) => string;
    into: ( path: string ) => string;
    expand: ( text: string ) => string;
    emit: ( path: string, content: unknown ) => boolean;
    copy: ( from: string, to: string, options?: CopyOptions ) => number;
    run: ( command: string, options?: RunOptions ) => Promise<void>;
    say: ( text: string ) => void;
    flag: ( where: string, message: string, rule?: string ) => void;
};
export type Act<V = unknown> = ( scope: Scope<V> ) => unknown;
export type Step<V = unknown> = { readonly name: string; readonly act: Act<V> };
export type Each<V = unknown> = { readonly each: Steps<V>; readonly roles: readonly string[] | undefined };
export type Env<V = unknown> = { readonly env: Vars; readonly steps: Steps<V> };
export type Option<V = unknown> = { readonly option: string; readonly on: Steps<V>; readonly off: Steps<V> };
export type Target = { readonly release?: boolean | undefined; readonly platform?: spec.Platform | undefined };
export type Targeted<V = unknown> = { readonly target: Target; readonly steps: Steps<V> };
export type Steps<V = unknown> = string | Step<V> | Act<V> | Each<V> | Env<V> | Targeted<V> | Option<V> | readonly Steps<V>[];
export type Needs<S> = S extends Step<infer V> ? V : S extends Each<infer V> ? V : S extends Env<infer V> ? V : S extends Targeted<infer V> ? V : S extends Option<infer V> ? V : S extends Act<infer V> ? V : S extends readonly (infer T)[] ? Needs<T> : unknown;
export type Joined<U> = (U extends unknown ? ( needs: U ) => void : never) extends ( needs: infer I ) => void ? I : never;
export type Tasks<V = unknown> = Readonly<Record<string, Steps<V>>>;
export type Project<V = unknown> = { readonly tasks: Tasks<V>; readonly steps: Tasks<V>; readonly paths: Paths; readonly specs: spec.Spec | undefined; readonly part: spec.Part | undefined; readonly seeds: spec.Seeds | undefined; readonly assets: Placement | undefined };
export type Paths = Readonly<Record<string, string>>;
export type Placing = { readonly root: string; readonly into: string; readonly entry?: Readonly<Record<string, string>> | undefined; readonly places?: Readonly<Record<string, string>> | undefined };
export type Placement = { readonly root: string; readonly into: string; readonly url: string; readonly entry: Readonly<Record<string, string>>; readonly places: Readonly<Record<string, string>>; readonly urls: Readonly<Record<string, string>> };
export type Context = { readonly role: string | undefined; readonly env: Vars; readonly target: Target; readonly held: { build: spec.Build | undefined; views: Map<string, View> } };
export type Defined<D extends object> = { specs: spec.Spec; part: spec.Part<D>; tasks: Tasks<View<D>>; steps?: Tasks<View<D>> | undefined; paths?: Paths | undefined; seeds?: spec.Seeds | undefined; assets?: Placing | undefined };
export type Made<V> = ( role: V, scope: Scope<V> ) => unknown;
export type CopyOptions = { extensions?: readonly string[] | undefined; clean?: boolean | undefined; optional?: boolean | undefined };
export type RunOptions = { env?: Vars | undefined; cwd?: string | undefined };
export type Flagged = { task: string; step: string; where: string; message: string; rule: string };
export type Outcome = { tasks: string[]; steps: number; written: number; flagged: Flagged[]; failed: boolean };
export type Played = { root: string; argv?: readonly string[] | undefined; env?: Vars | undefined; out?: (( line: string ) => void) | undefined };
export type Planned = { lines: string[]; steps: number };
export type Build = Omit<Bun.BuildConfig, "entrypoints" | "outdir">;
export type BundleOptions = Build & { clean?: boolean | undefined; inline?: Vars | undefined; world?: "role" | "all" | undefined };
export type Processor = { process: ( css: string, options: { from: string; to: string } ) => PromiseLike<{ css: string }> };
export type Fonts = { css?: string | undefined; url?: string | undefined };
export type Size = number | string;
export type Limits = { total?: Size | undefined; each?: Size | undefined; gzip?: Size | undefined; lines?: number | undefined };
export type Budget = string | readonly string[] | (Limits & { files: string | readonly string[] });
export type Measured = { path: string; size: number; lines: number; gzip: number };
export type Bounded = { name: string; patterns: string[]; total: number | undefined; each: number | undefined; gzip: number | undefined; lines: number | undefined };
export type Layers = Omit<Rules, "root">;
export type Values = Readonly<Record<string, unknown>>;
export type Directives = Readonly<Record<string, string>>;
export type Sources = Readonly<Record<string, readonly string[]>>;
export type Declared<V = unknown> =
    | string
    | readonly Declared<V>[]
    | { readonly run: string; readonly env?: Vars | undefined; readonly cwd?: string | undefined }
    | { readonly copy: CopyOptions & { readonly from: string; readonly to: string } }
    | { readonly emit: { readonly to: string; readonly content: unknown } }
    | { readonly specs: string }
    | { readonly theme: string }
    | { readonly styles: { readonly into: string; readonly imports: readonly string[] } }
    | { readonly fonts: Fonts & { readonly into: string } }
    | { readonly call: { readonly module: string; readonly name: string; readonly to: string } }
    | { readonly script: { readonly from: string; readonly to: string } }
    | { readonly bundle: BundleOptions & { readonly from: string | readonly string[]; readonly to: string } }
    | { readonly css: { readonly from: string; readonly to: string; readonly processor: Processor } }
    | { readonly page: { readonly from: string; readonly to: string; readonly values?: Values | undefined; readonly sources?: Sources | undefined } }
    | { readonly spoken: string }
    | { readonly budget: Readonly<Record<string, Budget>> }
    | { readonly layers: Layers }
    | { readonly step: string; readonly act: Act<V> }
    | { readonly each: Declared<V>; readonly roles?: readonly string[] | undefined }
    | { readonly target: Target; readonly steps: Declared<V> }
    | { readonly option: string; readonly on: Declared<V>; readonly off?: Declared<V> | undefined }
    | { readonly env: Vars; readonly steps: Declared<V> };
export type Declaration<V = unknown> = { readonly paths?: Paths | undefined; readonly seeds?: spec.Seeds | undefined; readonly assets?: Placing | undefined; readonly steps?: Readonly<Record<string, Declared<V>>> | undefined; readonly tasks: Readonly<Record<string, Declared<V>>> };
export type Described<D extends object> = Declaration<View<D>> & { readonly specs: spec.Spec; readonly part: spec.Part<D> };
