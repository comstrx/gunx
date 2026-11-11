export type Readable<T> = { getState: () => T; subscribe: ( listener: ( state: T, previous: T ) => void ) => () => void };
export type Watched<T> = { get: () => T; watch: ( listener: ( value: T, previous: T ) => void ) => () => void };
export type Source<T> = Readable<T> | Watched<T>;
export type Equal<R> = ( a: R, b: R ) => boolean;
export type Readables = Record<string, Source<unknown>>;
export type Combined<R extends Readables> = { [K in keyof R]: R[K] extends Readable<infer T> ? T : R[K] extends Watched<infer T> ? T : never };

function plain ( value: object ): boolean {

    const proto: unknown = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null;

}
export function readable<T> ( source: Source<T> ): Readable<T> {

    if ( "getState" in source ) return source;

    return { getState: () => source.get(), subscribe: ( listener ) => source.watch(listener) };

}
export function shallow<T> ( a: T, b: T ): boolean {

    if ( Object.is(a, b) ) return true;

    if ( typeof a !== "object" || typeof b !== "object" || a === null || b === null ) return false;

    if ( Array.isArray(a) || Array.isArray(b) ) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(( item, index ) => Object.is(item, b[index]));

    if ( !plain(a) || !plain(b) ) return false;

    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);

    return keys.length === Object.keys(right).length && keys.every(( key ) => Object.hasOwn(right, key) && Object.is(left[key], right[key]));

}
export function derive<T, R> ( source: Source<T>, pick: ( state: T ) => R, equal: Equal<R> = Object.is ): Readable<R> {

    const origin = readable(source);
    let last: { state: T; value: R } | undefined;
    const read = (): R => {

        const state = origin.getState();

        if ( last && Object.is(last.state, state) ) return last.value;

        const value = pick(state);

        last = { state, value: last && equal(last.value, value) ? last.value : value };

        return last.value;

    };

    return {
        getState: read,
        subscribe: ( listener ) => {

            let previous = read();

            return origin.subscribe(() => {

                const next = read();

                if ( equal(previous, next) ) return;

                const before = previous;

                previous = next;
                listener(next, before);

            });

        },
    };

}
export function combine<R extends Readables> ( sources: R ): Readable<Combined<R>> {

    const names = Object.keys(sources);
    const origins = names.map(( name ) => readable(sources[name] as Source<unknown>));
    let last: { parts: readonly unknown[]; value: Combined<R> } | undefined;
    const same = ( parts: readonly unknown[] ): boolean => origins.every(( origin, index ) => Object.is(origin.getState(), parts[index]));
    const read = (): Combined<R> => {

        if ( last && same(last.parts) ) return last.value;

        const parts = origins.map(( origin ) => origin.getState());
        const value = Object.fromEntries(names.map(( name, index ) => [name, parts[index]])) as Combined<R>;

        last = { parts, value };

        return value;

    };

    return {
        getState: read,
        subscribe: ( listener ) => {

            let previous = read();
            const stops = origins.map(( origin ) => origin.subscribe(() => {

                const next = read();

                if ( next === previous ) return;

                const before = previous;

                previous = next;
                listener(next, before);

            }));

            return () => {

                for ( const stop of stops ) stop();

            };

        },
    };

}
