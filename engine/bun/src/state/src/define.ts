import type * as cache from "engine-cache";
import * as error from "engine-error";
import * as json from "engine-json";
import { createStore, type StoreApi } from "./zustand.ts";

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
    sync?: boolean | undefined;
    guard?: Guard | undefined;
    fail?: (( fault: error.Fault ) => void) | undefined;
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

type Saved<S> = { version: number; state: Partial<S>; by?: string | undefined };
type Verdict = "empty" | "corrupt" | "older" | "same" | "newer";
type Keeper = { hydrate: () => Promise<void>; reload: () => Promise<void>; flush: () => Promise<void>; forget: () => Promise<void>; stop: () => void; reset: () => void };

const scheme = 2;
const reserved = ["ready", "kept"];

function kind ( value: unknown ): string {

    if ( value === null ) return "null";

    return Array.isArray(value) ? "array" : typeof value;

}
function alike ( model: unknown, value: unknown ): boolean {

    return model === null || model === undefined || kind(model) === kind(value);

}
function tag (): string {

    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

}
function shadow ( name: string, key: string ): error.Fault {

    return error.fault("internal", "state.shadow", { message: `${name}: "${key}" is already a state key` });

}
function versionOf ( version: number | undefined ): number {

    if ( version === undefined ) return 1;
    if ( !Number.isSafeInteger(version) || version < 0 ) throw new RangeError("not a version");

    return version;

}
function judge ( saved: unknown, version: number ): Verdict {

    if ( saved === undefined ) return "empty";
    if ( !json.isRecord(saved) || !json.isRecord(saved.state) || !Number.isSafeInteger(saved.version) ) return "corrupt";

    const found = saved.version as number;

    if ( found === version ) return "same";

    return found > version ? "newer" : "older";

}
function open<S extends object, A extends object> ( definition: Definition<S, A> ): StoreApi<State<S, A>> {

    const { name, initial, actions, persist } = definition;

    for ( const key of reserved ) if ( Object.hasOwn(initial, key) ) throw shadow(name, key);

    return createStore<State<S, A>>(( set, get ) => {

        const setter: Setter<S> = ( patch ) => set(( state ) => (typeof patch === "function" ? patch(state) : patch) as Partial<State<S, A>>);
        const moves = actions(setter, get);

        for ( const key of Object.keys(moves) ) if ( reserved.includes(key) || Object.hasOwn(initial, key) ) throw shadow(name, key);

        return { ...initial, ready: !persist, kept: false, ...moves };

    });

}
function loose<S extends object, A extends object> ( store: StoreApi<State<S, A>>, initial: S ): Keeper {

    const settled = (): Promise<void> => Promise.resolve();

    return {
        hydrate: settled,
        reload: settled,
        flush: settled,
        forget: settled,
        stop: () => undefined,
        reset: () => store.setState({ ...initial, ready: true, kept: false } as Partial<State<S, A>>),
    };

}
function keep<S extends object, A extends object> ( store: StoreApi<State<S, A>>, definition: Definition<S, A>, persist: Persist<S>, key: string ): Keeper {

    const { name, initial } = definition;
    const { box, migrate, accept, fail, sync = false } = persist;
    const version = versionOf(persist.version);
    const keys = persist.keys ?? (Object.keys(initial) as (keyof S & string)[]);
    const wrap: cache.Keep = { exclusive: persist.guard !== "local" };
    const touched = new Set<string>();
    const self = tag();
    let stored: Partial<S> | undefined;
    let warm = false;
    let busy = false;
    let frozen = false;
    let forgetting = false;
    let failed = false;
    let stopped = false;
    let unreported: error.Fault | undefined;
    let tail: Promise<void> | undefined;
    let loading: Promise<void> | undefined;
    let unwatch: (() => void) | undefined;
    const refused = ( cause: unknown ): error.Fault => error.fault("unavailable", "state.refused", { cause });
    const slice = (): Partial<S> => json.pick(store.getState(), keys) as Partial<S>;
    const report = ( fault: error.Fault ): void => {

        try {

            if ( fail ) fail(fault);
            else unreported = fault;

        } catch {

            unreported = fault;

        }

    };
    const mark = ( state: State<S, A>, kept: boolean ): void => {

        if ( state.kept !== kept ) store.setState({ kept } as Partial<State<S, A>>);

    };
    const freeze = ( fault: error.Fault ): void => {

        if ( frozen ) return;

        frozen = true;
        stored = undefined;
        mark(store.getState(), false);
        report(fault);

    };
    const thaw = (): void => {

        frozen = false;
        mark(store.getState(), true);

    };
    const record = ( state: Partial<S> ): Saved<S> => (sync ? { version, state, by: self } : { version, state });
    const read = ( saved: Saved<S>, verdict: "same" | "older" ): Partial<S> | undefined => {

        try {

            const found: unknown = verdict === "same" ? saved.state : migrate?.(saved.state, saved.version);

            if ( !json.isRecord(found) ) return undefined;

            const kept: Partial<S> = {};

            for ( const key of keys ) if ( Object.hasOwn(found, key) && alike(initial[key], found[key]) ) kept[key] = found[key] as S[keyof S & string];

            return accept ? accept(kept) : kept;

        } catch ( cause ) {

            report(error.fault("internal", "state.saved", { cause }));

            return undefined;

        }

    };
    const dirty = ( state: State<S, A> ): boolean => {

        if ( !stored ) return true;

        for ( const key of keys ) if ( !Object.is(state[key], stored[key]) ) return true;

        return false;

    };
    const newer = ( saved: unknown ): boolean => {

        if ( judge(saved, version) !== "newer" ) return false;

        freeze(error.fault("conflict", "state.newer", { message: `${name}: a newer version is saved` }));

        return true;

    };
    const pump = (): void => {

        const whole = store.getState();

        if ( tail || busy || stopped || frozen || !whole.ready || !dirty(whole) ) return;

        const state = slice();
        let written = false;

        stored = state;
        failed = false;
        tail = box.update<Saved<S>>(key, ( saved ) => {

            if ( newer(saved) ) return saved;

            written = true;

            return record(state);

        }, wrap).then(( saved ) => {

            if ( written && saved !== undefined ) mark(store.getState(), true);

        }, ( cause: unknown ) => {

            failed = true;

            if ( error.is(cause) && cause.reason === "cache.unguarded" ) freeze(error.fault("unavailable", "state.unguarded", { cause }));
            else {

                mark(store.getState(), false);
                report(refused(cause));

            }

        }).then(() => {

            tail = undefined;
            pump();

        });

    };
    const heard = ( value: unknown ): void => {

        if ( json.isRecord(value) ? value.by === self : forgetting ) return;
        if ( newer(value) ) return;

        const verdict = judge(value, version);

        if ( verdict === "corrupt" || verdict === "older" ) return;

        const next = verdict === "empty" ? (json.pick(initial, keys) as Partial<S>) : read(value as Saved<S>, "same");

        if ( !next ) return;

        const current = slice();
        const changed = keys.some(( key ) => Object.hasOwn(next, key) && !json.equal(current[key], next[key]));

        stored = changed ? { ...current, ...next } : current;

        if ( changed ) store.setState(next as Partial<State<S, A>>);
        if ( frozen ) thaw();

    };
    const adopt = ( found: Partial<S> | undefined ): void => {

        const patch: Partial<S> = {};

        if ( found ) for ( const key of keys ) if ( Object.hasOwn(found, key) && !touched.has(key) ) patch[key] = found[key];

        warm = true;

        if ( !store.getState().ready || Object.keys(patch).length > 0 ) store.setState({ ...patch, ready: true } as Partial<State<S, A>>);

    };
    const settle = async ( saved: unknown ): Promise<Saved<S> | undefined> => {

        const own = judge(saved, version);
        const legacy = own === "empty" ? await box.get(name) : undefined;
        const source = own === "empty" ? legacy : saved;
        const verdict = own === "empty" ? judge(legacy, version) : own;

        if ( verdict === "newer" ) {

            adopt(undefined);
            freeze(error.fault("conflict", "state.newer", { message: `${name}: a newer version is saved` }));

            return saved as Saved<S> | undefined;

        }

        const found = verdict === "same" || verdict === "older" ? read(source as Saved<S>, verdict) : undefined;
        const untouched = own === "same" && found !== undefined && touched.size === 0;

        adopt(found);

        const state = slice();

        stored = state;

        if ( untouched || (touched.size === 0 && found === undefined) ) return saved as Saved<S> | undefined;

        return record(state);

    };
    const load = async (): Promise<void> => {

        busy = true;

        try {

            await box.update<Saved<S>>(key, settle, wrap);

            if ( !frozen ) mark(store.getState(), true);

        } catch ( cause ) {

            if ( !warm ) adopt(undefined);

            stored = slice();

            if ( error.is(cause) && cause.reason === "cache.unguarded" ) freeze(error.fault("unavailable", "state.unguarded", { cause }));
            else report(refused(cause));

        } finally {

            busy = false;

        }

        touched.clear();

        if ( sync && !stopped ) unwatch = box.watch(key, heard);

        pump();

        if ( tail ) await tail;

    };
    const stopStore = store.subscribe(( state, previous ) => {

        if ( !warm ) for ( const key of keys ) if ( !Object.is(state[key], previous[key]) ) touched.add(key);

        pump();

    });

    return {
        hydrate: () => {

            if ( !loading ) loading = load();

            return loading;

        },
        reload: async () => {

            if ( !loading ) return;

            await loading;

            if ( tail ) await tail;
            if ( stopped ) return;

            try {

                heard(await box.get(key));

            } catch ( cause ) {

                report(refused(cause));

            }

        },
        flush: async () => {

            if ( loading ) await loading;

            if ( failed ) stored = undefined;

            pump();

            while ( tail ) await tail;

            const fault = unreported;

            unreported = undefined;

            if ( fault ) throw fault;

        },
        forget: async () => {

            while ( tail ) await tail;

            forgetting = true;

            try {

                await box.remove(key);

            } catch ( cause ) {

                throw refused(cause);

            } finally {

                forgetting = false;

            }

            stored = slice();

            if ( frozen ) thaw();

        },
        stop: () => {

            stopped = true;
            stopStore();
            unwatch?.();
            unwatch = undefined;

        },
        reset: () => {

            if ( !warm ) {

                for ( const key of keys ) touched.add(key);

                stored = undefined;

            }

            store.setState({ ...initial, ready: true } as Partial<State<S, A>>);

        },
    };

}
export function keyOf ( name: string ): string {

    return `${name}@${scheme}`;

}
export function define<S extends object, A extends object> ( definition: Definition<S, A> ): Defined<S, A> {

    const { name, initial, persist } = definition;

    if ( persist ) versionOf(persist.version);

    return {
        name,
        create: () => {

            const store = open(definition);
            const key = keyOf(name);
            const kept = persist ? keep(store, definition, persist, key) : loose(store, initial);

            return Object.assign(store, kept, { name, key });

        },
    };

}
