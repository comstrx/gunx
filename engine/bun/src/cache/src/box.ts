import * as crypto from "engine-crypto";
import * as date from "engine-date";
import * as json from "engine-json";
import { type Kind, lazy, namespaced, type Storage, storage, unguarded } from "./storage.ts";

type Envelope = { v: unknown; e?: number | undefined; k?: string | undefined };

export type Place = { kind?: Kind | string | undefined; storage?: Storage | undefined; prefix?: string | undefined };
export type Options = Place & { secret?: string | undefined; sign?: string | undefined; ttl?: number | undefined };
export type Keep = { ttl?: number | undefined; exclusive?: boolean | undefined };
export type Box = {
    readonly storage: Storage;
    get: <T = unknown>( key: string ) => Promise<T | undefined>;
    set: <T>( key: string, value: T, keep?: Keep ) => Promise<void>;
    has: ( key: string ) => Promise<boolean>;
    remove: ( key: string ) => Promise<void>;
    pull: <T = unknown>( key: string ) => Promise<T | undefined>;
    keys: () => Promise<string[]>;
    clear: () => Promise<void>;
    remember: <T>( key: string, make: () => T | Promise<T>, keep?: Keep ) => Promise<T>;
    update: <T>( key: string, change: ( current: T | undefined ) => T | undefined | Promise<T | undefined>, keep?: Keep ) => Promise<T | undefined>;
    all: <T = unknown>() => Promise<Record<string, T>>;
    touch: ( key: string, keep?: Keep ) => Promise<boolean>;
    increment: ( key: string, by?: number, keep?: Keep ) => Promise<number>;
    decrement: ( key: string, by?: number, keep?: Keep ) => Promise<number>;
    watch: <T = unknown>( key: string, onChange: ( value: T | undefined ) => void ) => () => void;
};

const ready: Promise<void> = Promise.resolve();
const noop = (): void => undefined;

function until ( seconds: number | undefined ): number | undefined {

    if ( seconds === undefined || seconds === Number.POSITIVE_INFINITY ) return undefined;
    if ( typeof seconds !== "number" || Number.isNaN(seconds) ) throw new RangeError("not a ttl");

    return seconds <= 0 ? 0 : date.now() + seconds * 1000;

}
function empty ( value: unknown ): boolean {

    return value === undefined || typeof value === "function" || typeof value === "symbol";

}
function fresh ( envelope: Envelope | undefined ): Envelope | undefined {

    return envelope === undefined || envelope.e === undefined || envelope.e > date.now() ? envelope : undefined;

}

export function place ( given: Place = {} ): Storage {

    const base = given.storage ?? lazy(() => storage(given.kind));

    return given.prefix ? namespaced(base, given.prefix) : base;

}
export function open ( options: Options = {} ): Box {

    const inner = place(options);
    const { secret, sign, ttl, prefix } = options;
    const guarded = secret !== undefined || sign !== undefined;
    const turns = new Map<string, Promise<unknown>>();
    const named = ( key: string ): string => (prefix ? `${prefix}.${key}` : key);
    const lasting = ( kept: Envelope | undefined, keep: Keep | undefined ): number | undefined => (keep === undefined && kept !== undefined ? kept.e : until(keep?.ttl ?? ttl));
    const locked = <T>( key: string, work: () => Promise<T> | T, keep?: Keep ): Promise<T> => {

        const shared = keep?.exclusive === true ? inner.lock : undefined;
        const run = (turns.get(key) ?? ready).then(() => {

            if ( keep?.exclusive === true && shared === undefined ) throw unguarded();

            return shared === undefined ? work() : shared(key, async () => work());

        });
        const tail = run.then(noop, noop);

        turns.set(key, tail);
        void tail.then(() => {

            if ( turns.get(key) === tail ) turns.delete(key);

        });

        return run;

    };
    const encode = async ( key: string, value: unknown, e: number | undefined ): Promise<string> => {

        const text = json.stringify((guarded ? { v: value, e, k: named(key) } : { v: value, e }) satisfies Envelope);
        const body = secret === undefined ? text : await crypto.seal(text, secret);

        return sign === undefined ? body : crypto.sign(body, sign);

    };
    const decode = async ( key: string, text: string ): Promise<Envelope | undefined> => {

        const body = sign === undefined ? text : await crypto.unsign(text, sign);

        if ( body === undefined ) return undefined;

        const plain = secret === undefined ? body : await crypto.open(body, secret);

        if ( plain === undefined ) return undefined;

        const envelope = json.parse(plain);

        if ( !json.isRecord(envelope) || !Object.hasOwn(envelope, "v") ) return undefined;
        if ( envelope.e !== undefined && typeof envelope.e !== "number" ) return undefined;

        return guarded && envelope.k !== named(key) ? undefined : (envelope as Envelope);

    };
    const sweep = async ( key: string, text: string ): Promise<void> => {

        if ( (await inner.get(key)) === text ) await inner.delete(key);

    };
    const read = async ( key: string, held = false ): Promise<Envelope | undefined> => {

        const text = await inner.get(key);

        if ( text === null ) return undefined;

        const envelope = await decode(key, text);

        if ( envelope === undefined || fresh(envelope) ) return envelope;

        if ( held ) await inner.delete(key);
        else await locked(key, () => sweep(key, text));

        return undefined;

    };
    const seen = async ( key: string ): Promise<Envelope | undefined> => {

        const turn = turns.get(key);

        if ( turn ) await turn;

        return read(key);

    };
    const write = async ( key: string, value: unknown, e: number | undefined ): Promise<void> => {

        if ( empty(value) || (e !== undefined && e <= date.now()) ) await inner.delete(key);
        else await inner.set(key, await encode(key, value, e));

    };
    const count = ( key: string, by: number, keep: Keep | undefined ): Promise<number> => locked(key, async () => {

        const kept = await read(key, true);
        const next = (typeof kept?.v === "number" ? kept.v : 0) + by;

        if ( kept !== undefined && typeof kept.v !== "number" ) throw new RangeError("not a counter");
        if ( !Number.isFinite(next) ) throw new RangeError("not a step");

        await write(key, next, lasting(kept, keep));

        return next;

    }, keep);
    const box: Box = {
        storage: inner,
        get: async <T>( key: string ) => (await seen(key))?.v as T | undefined,
        set: ( key, value, keep ) => locked(key, () => write(key, value, until(keep?.ttl ?? ttl)), keep),
        has: async ( key ) => (await seen(key)) !== undefined,
        remove: ( key ) => locked(key, () => inner.delete(key)),
        pull: <T>( key: string ) => locked(key, async () => {

            const kept = await read(key, true);

            if ( kept !== undefined ) await inner.delete(key);

            return kept?.v as T | undefined;

        }),
        keys: () => inner.keys(),
        clear: async () => {

            await Promise.all((await inner.keys()).map(( key ) => box.remove(key)));

        },
        remember: async <T>( key: string, make: () => T | Promise<T>, keep?: Keep ): Promise<T> => {

            const kept = await seen(key);

            if ( kept !== undefined ) return kept.v as T;

            return locked(key, async () => {

                const again = await read(key, true);

                if ( again !== undefined ) return again.v as T;

                const value = await make();

                await write(key, value, until(keep?.ttl ?? ttl));

                return value;

            }, keep);

        },
        update: <T>( key: string, change: ( current: T | undefined ) => T | undefined | Promise<T | undefined>, keep?: Keep ) => locked(key, async () => {

            const kept = await read(key, true);
            const next = await change(kept?.v as T | undefined);

            if ( !Object.is(next, kept?.v) ) await write(key, next, lasting(kept, keep));

            return next;

        }, keep),
        all: async <T>() => {

            const names = (await inner.keys()).filter(( key ) => json.safeKey(key));
            const kept = await Promise.all(names.map(( key ) => read(key)));
            const found: Record<string, T> = {};

            for ( let index = 0; index < names.length; index += 1 ) {

                const envelope = kept[index];

                if ( envelope !== undefined ) found[names[index] ?? ""] = envelope.v as T;

            }

            return found;

        },
        touch: ( key, keep ) => locked(key, async () => {

            const kept = await read(key, true);

            if ( kept === undefined ) return false;

            await write(key, kept.v, until(keep?.ttl ?? ttl));

            return true;

        }, keep),
        increment: ( key, by = 1, keep ) => count(key, by, keep),
        decrement: ( key, by = 1, keep ) => count(key, -by, keep),
        watch: <T>( key: string, onChange: ( value: T | undefined ) => void ) => {

            let chain: Promise<unknown> = ready;
            let live = true;
            const stop = inner.watch(key, ( next ) => {

                const turn = chain.then(() => (next === null ? undefined : decode(key, next)));

                chain = turn.then(noop, noop);
                void turn.then(( envelope ) => {

                    if ( live ) onChange(fresh(envelope)?.v as T | undefined);

                });

            });

            return () => {

                live = false;
                stop();

            };

        },
    };

    return box;

}
