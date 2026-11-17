import * as device from "engine-device";
import * as exception from "engine-exception";
import * as json from "engine-json";
import type { Change, Codec, CookieDocument, CookieOptions, Driver, Host, Jar, Kind, Listeners, Lock, Registry, Storage, StorageEvent, Typed, WebStorage } from "./arch.ts";
import { documentCookies } from "./cookie.ts";
import { registry } from "./kinds.ts";

export const storages: Registry<Storage> = registry<Storage>("cache.storage");

const fleeting = new WeakSet<Storage>();

const made = new WeakSet<object>();

function listeners (): Listeners {

    const byKey = new Map<string, Set<Change>>();
    let failed: { cause: unknown } | undefined;
    let pending = 0;
    let idle: Promise<void> | undefined;
    let complete: (() => void) | undefined;

    const caught = ( cause: unknown ): void => { failed ??= { cause }; };
    const finished = (): void => {

        pending -= 1;

        if ( pending !== 0 ) return;

        const done = complete;

        idle = undefined;
        complete = undefined;
        done?.();

    };
    const notify = ( onChange: Change, value: string | null ): void => {

        exception.rescue(() => {

            const result: unknown = onChange(value);

            if ( result === null || (typeof result !== "object" && typeof result !== "function") || !("then" in result) ) return;

            if ( pending === 0 ) idle = new Promise<void>(( resolve ) => { complete = resolve; });

            pending += 1;
            void Promise.resolve(result).then(() => undefined, caught).then(finished);

        }, ( cause ) => {

            caught(cause);

        });

    };

    return {
        notify,
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

            if ( set !== undefined ) for ( const onChange of [...set] ) notify(onChange, value);

        },
        flush: async () => {

            while ( idle !== undefined ) await idle;

            const found = failed;

            failed = undefined;

            if ( found !== undefined ) throw found.cause;

        },
    };

}
function refused ( cause: unknown ): exception.Fault {

    const full = typeof cause === "object" && cause !== null && "name" in cause && /quota/i.test(String(cause.name));

    return exception.fault(full ? "too_large" : "unavailable", full ? "storage.full" : "storage.refused", { cause });

}
function brand ( out: Storage ): Storage {

    made.add(out);

    return out;

}
function named ( target: WebStorage, host: Host ): "local" | "session" | undefined {

    if ( exception.probe(() => host.localStorage) === target ) return "local";

    return exception.probe(() => host.sessionStorage) === target ? "session" : undefined;

}
function webLock ( target: WebStorage, host: Host ): Lock | undefined {

    const place = named(target, host);

    if ( place === "session" ) return serial();
    if ( place === undefined ) return undefined;

    const locks = exception.probe(() => host.navigator?.locks);

    if ( locks === undefined ) return undefined;

    return <T>( key: string, work: () => Promise<T> ): Promise<T> => locks.request(`engine.cache.${place}.${key}`, work) as Promise<T>;

}

export function unguarded (): exception.Fault {

    return exception.fault("unavailable", "cache.unguarded", { message: "the storage has no shared lock" });

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

    const found = exception.probe(() => device.host<Host>()[name]);

    return found ? web(found) : memory();

}
function jarKind (): Storage {

    const found = exception.probe(() => device.host<Host>().document);

    return found !== undefined && typeof found.cookie === "string" ? cookies(documentCookies(found as CookieDocument)) : memory();

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
            let stopGiven: (() => void) | undefined;

            exception.rescue(() => {

                stopGiven = given.watch?.(key, ( value ) => local.notify(onChange, value));

            }, ( cause ) => {

                stopLocal();

                throw cause;

            });

            let live = true;

            return () => {

                if ( !live ) return;

                live = false;
                stopLocal();
                stopGiven?.();

            };

        },
        lock: given.lock?.bind(given),
        flush: async () => {

            const results = await Promise.allSettled([local.flush(), given.flush?.()]);
            const failed = results.find(( result ) => result.status === "rejected");

            if ( failed?.status === "rejected" ) throw failed.reason;

        },
    });

}
export function memory (): Storage {

    const data = new Map<string, string>();
    const made = driver({
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

    fleeting.add(made);

    return made;

}
export function web ( target: WebStorage, host: Host = device.host<Host>() ): Storage {

    return driver({
        lock: webLock(target, host),
        get: ( key ) => target.getItem(key),
        set: ( key, value ) => {

            exception.rescue(() => {

                target.setItem(key, value);

            }, ( cause ) => {

                throw refused(cause);

            });

        },
        delete: ( key ) => target.removeItem(key),
        keys: () => Array.from({ length: target.length }, ( _, index ) => target.key(index)).filter(( key ): key is string => key !== null),
        watch: ( key, onChange ) => {

            const handler = ( event: StorageEvent ): void => {

                if ( event.storageArea !== undefined && event.storageArea !== target ) return;

                if ( event.key === key ) onChange(event.newValue);
                else if ( event.key === null ) onChange(null);

            };

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
        flush: () => resolved().flush(),
        lock: async ( key, work ) => {

            const target = resolved();

            if ( target.lock === undefined ) throw unguarded();

            return target.lock(key, work);

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
        flush: () => target.flush(),
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
export function use ( kind: Kind | string, given?: Driver ): () => void {

    const remove = given === undefined ? undefined : storages.add(kind, driver(given));
    const restore = storages.use(kind);

    return () => {

        restore();
        remove?.();

    };

}
export function storage ( kind?: Kind | string ): Storage {

    return storages.pick(kind);

}
export function volatile ( kind?: Kind | string ): boolean {

    return fleeting.has(storages.pick(kind));

}

storages.lazy("memory", memory);
storages.lazy("local", () => webKind("localStorage"));
storages.lazy("session", () => webKind("sessionStorage"));
storages.lazy("cookie", jarKind);
storages.lazy("secure", memory);
storages.prefer(device.runtime().runtime === "browser" ? "local" : "memory");
