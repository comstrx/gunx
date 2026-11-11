import * as adapter from "engine-adapter";
import * as error from "engine-error";
import * as json from "engine-json";
import type { CookieOptions, Jar } from "./cookie.ts";

type StorageEvent = { key: string | null; newValue: string | null; storageArea?: unknown };
type Listeners = { add: ( key: string, onChange: Change ) => () => void; fire: ( key: string, value: string | null ) => void };

export type Kind = "local" | "session" | "memory" | "cookie";
export type Change = ( value: string | null ) => void;
export type Lock = <T>( key: string, work: () => Promise<T> ) => Promise<T>;
export type Storage = {
    get: ( key: string ) => Promise<string | null>;
    set: ( key: string, value: string ) => Promise<void>;
    delete: ( key: string ) => Promise<void>;
    keys: () => Promise<string[]>;
    watch: ( key: string, onChange: Change ) => () => void;
    lock: Lock | undefined;
};
export type Driver = {
    get: ( key: string ) => Promise<string | null> | string | null;
    set: ( key: string, value: string ) => Promise<void> | void;
    delete: ( key: string ) => Promise<void> | void;
    keys: () => Promise<string[]> | string[];
    watch?: (( key: string, onChange: Change ) => () => void) | undefined;
    lock?: Lock | undefined;
};
export type WebStorage = adapter.WebStorage;
export type Codec<T> = { encode: ( value: T ) => string; decode: ( text: string ) => T | undefined };
export type Typed<T> = { read: ( key: string ) => Promise<T | undefined>; write: ( key: string, value: T ) => Promise<void>; remove: ( key: string ) => Promise<void> };

export const storages: adapter.Family<Storage> = adapter.family<Storage>("cache.storage");

const made = new WeakSet<object>();

function listeners (): Listeners {

    const byKey = new Map<string, Set<Change>>();

    return {
        add: ( key, onChange ) => {

            const set = byKey.get(key) ?? new Set<Change>();

            set.add(onChange);
            byKey.set(key, set);

            return () => {

                set.delete(onChange);

                if ( set.size === 0 && byKey.get(key) === set ) byKey.delete(key);

            };

        },
        fire: ( key, value ) => {

            const set = byKey.get(key);
            let failed: { failure: unknown } | undefined;

            if ( set === undefined ) return;

            for ( const onChange of [...set] ) {

                try {

                    onChange(value);

                } catch ( failure ) {

                    failed ??= { failure };

                }

            }

            if ( failed ) throw failed.failure;

        },
    };

}
function refused ( cause: unknown ): error.Fault {

    const full = typeof cause === "object" && cause !== null && "name" in cause && /quota/i.test(String(cause.name));

    return error.fault(full ? "too_large" : "unavailable", full ? "storage.full" : "storage.refused", { cause });

}
function brand ( out: Storage ): Storage {

    made.add(out);

    return out;

}
function named ( target: WebStorage, host: adapter.Host ): "local" | "session" | undefined {

    if ( adapter.probe(() => host.localStorage) === target ) return "local";

    return adapter.probe(() => host.sessionStorage) === target ? "session" : undefined;

}
function webLock ( target: WebStorage, host: adapter.Host ): Lock | undefined {

    const place = named(target, host);

    if ( place === "session" ) return serial();
    if ( place === undefined ) return undefined;

    const locks = adapter.probe(() => host.navigator?.locks);

    if ( locks === undefined ) return undefined;

    return <T>( key: string, work: () => Promise<T> ): Promise<T> => locks.request(`engine.cache.${place}.${key}`, work) as Promise<T>;

}

export function unguarded (): error.Fault {

    return error.fault("unavailable", "cache.unguarded", { message: "the storage has no shared lock" });

}
export function serial (): Lock {

    const turns = new Map<string, Promise<unknown>>();

    return <T>( key: string, work: () => Promise<T> ): Promise<T> => {

        const run = (turns.get(key) ?? Promise.resolve()).then(work);
        const tail = run.then(() => undefined, () => undefined);

        turns.set(key, tail);
        void tail.then(() => {

            if ( turns.get(key) === tail ) turns.delete(key);

        });

        return run;

    };

}
function webKind ( name: "localStorage" | "sessionStorage" ): Storage {

    const found = adapter.probe(() => adapter.host()[name]);

    return found ? web(found) : memory();

}

export function driver ( given: Driver ): Storage {

    if ( made.has(given) ) return given as Storage;

    const local = listeners();

    return brand({
        get: async ( key ) => given.get(key),
        set: async ( key, value ) => {

            await given.set(key, value);
            local.fire(key, value);

        },
        delete: async ( key ) => {

            await given.delete(key);
            local.fire(key, null);

        },
        keys: async () => given.keys(),
        watch: ( key, onChange ) => {

            const stopLocal = local.add(key, onChange);
            const stopGiven = given.watch?.(key, onChange);

            return () => {

                stopLocal();
                stopGiven?.();

            };

        },
        lock: given.lock,
    });

}
export function memory (): Storage {

    const data = new Map<string, string>();

    return driver({
        get: ( key ) => data.get(key) ?? null,
        set: ( key, value ) => {

            data.set(key, value);

        },
        delete: ( key ) => {

            data.delete(key);

        },
        keys: () => [...data.keys()],
        lock: serial(),
    });

}
export function web ( target: WebStorage, host: adapter.Host = adapter.host() ): Storage {

    return driver({
        lock: webLock(target, host),
        get: ( key ) => target.getItem(key),
        set: ( key, value ) => {

            try {

                target.setItem(key, value);

            } catch ( cause ) {

                throw refused(cause);

            }

        },
        delete: ( key ) => target.removeItem(key),
        keys: () => Array.from({ length: target.length }, ( _, index ) => target.key(index)).filter(( key ): key is string => key !== null),
        watch: ( key, onChange ) => {

            const handler = (( event: StorageEvent ): void => {

                if ( event.storageArea !== undefined && event.storageArea !== target ) return;

                if ( event.key === key ) onChange(event.newValue);
                else if ( event.key === null ) onChange(null);

            }) as adapter.Handler;

            host.addEventListener?.("storage", handler);

            return () => host.removeEventListener?.("storage", handler);

        },
    });

}
export function cookies ( jar: Jar, options: CookieOptions = {} ): Storage {

    return driver({
        get: ( key ) => jar.get(key) ?? null,
        set: ( key, value ) => jar.set(key, value, { maxAge: 60 * 60 * 24 * 365, ...options }),
        delete: ( key ) => jar.remove(key, options),
        keys: () => jar.names(),
    });

}
export function lazy ( make: () => Storage ): Storage {

    let inner: Storage | undefined;
    const resolved = (): Storage => {

        inner ??= make();

        return inner;

    };

    return brand({
        get: async ( key ) => resolved().get(key),
        set: async ( key, value ) => resolved().set(key, value),
        delete: async ( key ) => resolved().delete(key),
        keys: async () => resolved().keys(),
        watch: ( key, onChange ) => resolved().watch(key, onChange),
        lock: async ( key, work ) => {

            const { lock } = resolved();

            if ( lock === undefined ) throw unguarded();

            return lock(key, work);

        },
    });

}
export function namespaced ( target: Storage, prefix: string ): Storage {

    const head = `${prefix}.`;

    if ( prefix === "" ) return target;

    return brand({
        get: ( key ) => target.get(`${head}${key}`),
        set: ( key, value ) => target.set(`${head}${key}`, value),
        delete: ( key ) => target.delete(`${head}${key}`),
        keys: async () => (await target.keys()).filter(( key ) => key.startsWith(head)).map(( key ) => key.slice(head.length)),
        watch: ( key, onChange ) => target.watch(`${head}${key}`, onChange),
        lock: target.lock === undefined ? undefined : ( key, work ) => (target.lock as Lock)(`${head}${key}`, work),
    });

}
export function jsonCodec<T> (): Codec<T> {

    return { encode: ( value ) => json.stringify(value), decode: ( text ) => json.parse(text) as T | undefined };

}
export function typed<T> ( target: Storage, codec: Codec<T> = jsonCodec<T>() ): Typed<T> {

    return {
        read: async ( key ) => {

            const text = await target.get(key);

            return text === null ? undefined : codec.decode(text);

        },
        write: ( key, value ) => target.set(key, codec.encode(value)),
        remove: ( key ) => target.delete(key),
    };

}
export function use ( kind: Kind | string, given?: Driver ): void {

    if ( given ) storages.add(kind, driver(given));

    storages.prefer(kind);

}
export function storage ( kind?: Kind | string ): Storage {

    return storages.pick(kind);

}

storages.lazy("memory", memory);
storages.lazy("local", () => webKind("localStorage"));
storages.lazy("session", () => webKind("sessionStorage"));
storages.prefer(adapter.runtime().runtime === "browser" ? "local" : "memory");
