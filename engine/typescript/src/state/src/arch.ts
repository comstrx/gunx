import type * as cache from "engine-cache";
import type * as exception from "engine-exception";
import type { StoreApi } from "./zustand.ts";

export type Status = "idle" | "running" | "done" | "failed";
export type ActionState<R> = { status: Status; result: R | undefined; error: exception.Fault | undefined; runs: number };
export type ActionOptions = { mode?: "latest" | "first" | undefined };
export type Action<I, R> = StoreApi<ActionState<R>> & {
    run: ( input: I ) => Promise<R | undefined>;
    abort: () => void;
    reset: () => void;
};
export type ActionFlight<R> = { controller: AbortController; promise: Promise<R | undefined>; settle: ( value: R | undefined ) => void };
export type Readable<T> = { getState: () => T; subscribe: ( listener: ( state: T, previous: T ) => void ) => () => void };
export type Watched<T> = { get: () => T; watch: ( listener: ( value: T, previous: T ) => void ) => () => void };
export type Source<T> = Readable<T> | Watched<T>;
export type Equal<R> = ( a: R, b: R ) => boolean;
export type Readables = Record<string, Source<unknown>>;
export type Combined<R extends Readables> = { [K in keyof R]: R[K] extends Readable<infer T> ? T : R[K] extends Watched<infer T> ? T : never };
export type Binding<T> = {
    useSelect: <R>( select: ( state: T ) => R, equal?: Equal<R> ) => R;
    usePick: <K extends keyof T>( ...keys: readonly K[] ) => Pick<T, K>;
    useState: () => T;
    select: <R>( select: ( state: T ) => R ) => R;
};
export type Memo<T, R> = { state: T; select: ( state: T ) => R; value: R };
export type Setter<S> = ( patch: Partial<S> | (( state: S ) => Partial<S>) ) => void;
export type Getter<S> = () => S;
export type Actions<S, A> = ( set: Setter<S>, get: Getter<S> ) => A;
export type Guard = "exclusive" | "local";
export type Persist<S> = {
    box: cache.Box;
    keys?: readonly (keyof S & string)[] | undefined;
    version?: number | undefined;
    migrate?: (( saved: unknown, version: number ) => Partial<S> | undefined) | undefined;
    accept?: (( saved: Partial<S> ) => Partial<S> | undefined) | undefined;
    seed?: Partial<S> | undefined;
    sync?: boolean | undefined;
    guard?: Guard | undefined;
    fail?: (( fault: exception.Fault ) => void) | undefined;
};
export type Definition<S extends object, A extends object> = { name: string; initial: S; actions: Actions<S, A>; persist?: Persist<S> | undefined };
export type State<S, A> = S & A & { ready: boolean; kept: boolean };
export type Instance<S extends object, A extends object> = StoreApi<State<S, A>> & {
    name: string;
    key: string;
    hydrate: () => Promise<void>;
    reload: () => Promise<void>;
    flush: () => Promise<void>;
    forget: () => Promise<void>;
    stop: () => void;
    reset: () => void;
};
export type Defined<S extends object, A extends object> = { name: string; create: () => Instance<S, A> };
export type Saved<S> = { version: number; state: Partial<S>; by?: string | undefined };
export type Verdict = "empty" | "corrupt" | "older" | "same" | "newer";
export type Keeper = { hydrate: () => Promise<void>; reload: () => Promise<void>; flush: () => Promise<void>; forget: () => Promise<void>; stop: () => void; reset: () => void };
export type Page<T> = { items: readonly T[]; next: string | null };
export type FeedStatus = "idle" | "loading" | "refreshing" | "done" | "failed";
export type FeedState<T> = { items: readonly T[]; next: string | null; ended: boolean; status: FeedStatus; failure: exception.Fault | undefined };
export type FeedOptions<T> = { load: ( cursor: string | null, signal: AbortSignal ) => Promise<Page<T>>; key: ( item: T ) => string };
export type Feed<T> = StoreApi<FeedState<T>> & {
    more: () => Promise<void>;
    refresh: () => Promise<void>;
    put: ( item: T, at?: "start" | "end" ) => void;
    drop: ( key: string ) => void;
    abort: () => void;
    reset: () => void;
};
export type Settled = { status: FeedStatus; failure: exception.Fault | undefined };
export type FeedFlight = { controller: AbortController; promise: Promise<void>; settle: () => void; before: Settled };
export type Resource<T> = { status: "idle" | "pending" | "done" | "failed"; data: T | undefined; error: exception.Fault | undefined; at: number; stale: boolean };
export type ResourceOptions<T> = { load: ( signal: AbortSignal ) => Promise<T>; seed?: T | undefined; staleAfter?: number | undefined; now?: (() => number) | undefined };
export type Handle<T> = StoreApi<Resource<T>> & {
    refresh: () => Promise<T | undefined>;
    ensure: () => Promise<T | undefined>;
    abort: () => void;
    set: ( data: T ) => void;
    update: ( change: ( current: T | undefined ) => T ) => void;
    reset: () => void;
};
export type ResourceFlight<T> = { controller: AbortController; promise: Promise<T | undefined>; settle: ( value: T | undefined ) => void };


export type Renderer = {
    ref: <T>( initial: T ) => { current: T };
    read: <T>( subscribe: ( listener: () => void ) => () => void, current: () => T, server: () => T ) => T;
};
