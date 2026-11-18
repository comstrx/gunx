import * as date from "engine-date";
import * as exception from "engine-exception";
import type { Aged, Dedupe, Expiring, Kept, Lru, Node, Remember, Swr, Tagged, Timed } from "./arch.ts";

const noop = (): void => undefined;

function span ( life: number | undefined, fallback: number ): number {

    return typeof life !== "number" || Number.isNaN(life) ? fallback : Math.max(0, life);

}
function trim<K> ( held: Map<K, unknown>, most: number, drop: ( key: K ) => unknown ): void {

    if ( held.size <= most ) return;

    const oldest = held.keys().next();

    if ( !oldest.done ) drop(oldest.value);

}
function timed<V> ( ttl: number, limit: number, gone?: ( key: string ) => void ): Timed<V> {

    const data = new Map<string, Kept<V>>();
    const life = span(ttl, 60_000);
    const cap = whole(limit, 1024, 1);
    const drop = ( key: string ): boolean => {

        if ( !data.delete(key) ) return false;

        gone?.(key);

        return true;

    };

    return {
        data,
        drop,
        find: ( key ) => {

            const found = data.get(key);

            if ( found === undefined || found.until > date.now() ) return found;

            drop(key);

            return undefined;

        },
        put: ( key, value, given ) => {

            data.delete(key);
            data.set(key, { value, until: date.now() + span(given, life) });
            trim(data, cap, drop);

        },
        prune: () => {

            const now = date.now();
            let count = 0;

            for ( const [key, found] of data ) {

                if ( found.until <= now && drop(key) ) count += 1;

            }

            return count;

        },
    };

}
function flown<V> ( flights: Map<string, Promise<V>>, key: string, load: () => Promise<V>, land: ( value: V ) => void ): Promise<V> {

    const flying = flights.get(key);

    if ( flying !== undefined ) return flying;

    const flight: Promise<V> = (async () => load())()
        .then(( value ) => {

            if ( flights.get(key) === flight ) land(value);

            return value;

        })
        .finally(() => {

            if ( flights.get(key) === flight ) flights.delete(key);

        });

    flights.set(key, flight);

    return flight;

}

export function whole ( value: number | undefined, fallback: number, least: number ): number {

    return typeof value !== "number" || Number.isNaN(value) ? fallback : Math.max(least, Math.floor(value));

}
export function lru<K, V> ( limit = 256 ): Lru<K, V> {

    const nodes = new Map<K, Node<K, V>>();
    const cap = whole(limit, 256, 1);
    let oldest: Node<K, V> | undefined;
    let newest: Node<K, V> | undefined;
    const unlink = ( node: Node<K, V> ): void => {

        if ( node.older ) node.older.newer = node.newer;
        else oldest = node.newer;

        if ( node.newer ) node.newer.older = node.older;
        else newest = node.older;

        node.older = undefined;
        node.newer = undefined;

    };
    const append = ( node: Node<K, V> ): void => {

        node.older = newest;

        if ( newest ) newest.newer = node;

        newest = node;
        oldest ??= node;

    };
    const raise = ( node: Node<K, V> ): void => {

        if ( node === newest ) return;

        unlink(node);
        append(node);

    };

    return {
        get size () {

            return nodes.size;

        },
        get: ( key ) => {

            const node = nodes.get(key);

            if ( !node ) return undefined;

            raise(node);

            return node.value;

        },
        peek: ( key ) => nodes.get(key)?.value,
        set: ( key, value ) => {

            const node = nodes.get(key);

            if ( node ) {

                node.value = value;
                raise(node);

                return;

            }

            const made: Node<K, V> = { key, value, older: undefined, newer: undefined };

            nodes.set(key, made);
            append(made);

            if ( nodes.size > cap && oldest ) {

                nodes.delete(oldest.key);
                unlink(oldest);

            }

        },
        has: ( key ) => nodes.has(key),
        delete: ( key ) => {

            const node = nodes.get(key);

            if ( !node ) return false;

            unlink(node);

            return nodes.delete(key);

        },
        clear: () => {

            nodes.clear();
            oldest = undefined;
            newest = undefined;

        },
        keys: () => {

            const out: K[] = [];

            for ( let node = oldest; node; node = node.newer ) out.push(node.key);

            return out;

        },
    };

}
export function expiring<V> ( ttl = 60_000, limit = 1024 ): Expiring<V> {

    const core = timed<V>(ttl, limit);

    return {
        get size () {

            return core.data.size;

        },
        get: ( key ) => core.find(key)?.value,
        has: ( key ) => core.find(key) !== undefined,
        set: core.put,
        delete: core.drop,
        clear: () => core.data.clear(),
        prune: core.prune,
    };

}
export function dedupe (): Dedupe {

    const flying = new Map<string, Promise<unknown>>();

    return <V>( key: string, work: () => Promise<V> ): Promise<V> => flown(flying as Map<string, Promise<V>>, key, work, noop);

}
export function remember<V> ( ttl = 60_000, limit = 1024 ): Remember<V> {

    const core = timed<V>(ttl, limit);
    const flights = new Map<string, Promise<V>>();

    return {
        peek: ( key ) => core.find(key)?.value,
        has: ( key ) => core.find(key) !== undefined,
        forget: ( key ) => {

            core.drop(key);
            flights.delete(key);

        },
        clear: () => {

            core.data.clear();
            flights.clear();

        },
        get: ( key, load, life ) => {

            const kept = core.find(key);

            return kept === undefined ? flown(flights, key, load, ( value ) => core.put(key, value, life)) : Promise.resolve(kept.value);

        },
    };

}
export function swr<V> ( fresh = 10_000, stale = 60_000, limit = 1024 ): Swr<V> {

    const data = new Map<string, Aged<V>>();
    const flights = new Map<string, Promise<V>>();
    const young = span(fresh, 10_000);
    const old = Math.max(young, span(stale, 60_000));
    const cap = whole(limit, 1024, 1);
    const age = ( found: Aged<V> | undefined ): number => {

        const passed = found === undefined ? old : date.now() - found.at;

        return passed < 0 ? young : passed;

    };
    const refresh = ( key: string, load: () => Promise<V> ): Promise<V> => flown(flights, key, load, ( value ) => {

        data.delete(key);
        data.set(key, { value, at: date.now() });
        trim(data, cap, ( oldest ) => data.delete(oldest));

    });

    return {
        peek: ( key ) => data.get(key)?.value,
        state: ( key ) => {

            const passed = age(data.get(key));

            return passed < young ? "fresh" : passed < old ? "stale" : "missing";

        },
        forget: ( key ) => {

            data.delete(key);
            flights.delete(key);

        },
        clear: () => {

            data.clear();
            flights.clear();

        },
        get: ( key, load ) => {

            const found = data.get(key);
            const passed = age(found);

            if ( found !== undefined && passed < young ) return Promise.resolve(found.value);

            const flight = refresh(key, load);

            if ( found === undefined || passed >= old ) return flight;

            exception.quiet(flight);

            return Promise.resolve(found.value);

        },
    };

}
export function tagged<V> ( ttl = 60_000, limit = 1024 ): Tagged<V> {

    const byTag = new Map<string, Set<string>>();
    const tagsOf = new Map<string, readonly string[]>();
    const unlink = ( key: string ): void => {

        for ( const tag of tagsOf.get(key) ?? [] ) {

            const keys = byTag.get(tag);

            if ( keys?.delete(key) && keys.size === 0 ) byTag.delete(tag);

        }

        tagsOf.delete(key);

    };
    const core = timed<V>(ttl, limit, unlink);

    return {
        get: ( key ) => core.find(key)?.value,
        has: ( key ) => core.find(key) !== undefined,
        set: ( key, value, tags, life ) => {

            const own = [...new Set(tags)];

            unlink(key);
            core.put(key, value, life);

            if ( own.length > 0 ) tagsOf.set(key, own);

            for ( const tag of own ) {

                const keys = byTag.get(tag) ?? new Set<string>();

                keys.add(key);
                byTag.set(tag, keys);

            }

        },
        invalidate: ( tag ) => {

            let count = 0;

            for ( const key of [...(byTag.get(tag) ?? [])] ) {

                if ( core.drop(key) ) count += 1;

            }

            byTag.delete(tag);

            return count;

        },
        delete: ( key ) => {

            core.drop(key);

        },
        clear: () => {

            core.data.clear();
            byTag.clear();
            tagsOf.clear();

        },
    };

}
