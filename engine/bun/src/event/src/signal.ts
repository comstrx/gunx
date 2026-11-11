import * as error from "engine-error";
import { awaited, linked, type Wait } from "./abort.ts";
import { type Fail, raise, tried } from "./emitter.ts";

export type Listener<T> = ( value: T, previous: T ) => void;
export type Watch = { replay?: boolean | undefined; signal?: AbortSignal | undefined };
export type Readable<T> = {
    get: () => T;
    watch: ( listener: Listener<T>, options?: Watch ) => () => void;
    until: ( test: ( value: T ) => boolean, options?: number | Wait ) => Promise<T>;
};
export type Signal<T> = Readable<T> & {
    set: ( value: T | (( current: T ) => T) ) => void;
    reset: () => void;
    count: () => number;
    readonly read: Readable<T>;
};
export type SignalOptions<T> = { equal?: (( a: T, b: T ) => boolean) | undefined; fail?: Fail | undefined };

type Row<T> = { listener: Listener<T>; live: boolean };

const deepest = 1024;

function idle (): undefined {

    return undefined;

}
function waited<T> ( get: () => T, watch: Readable<T>["watch"] ): Readable<T>["until"] {

    return ( test, options ) => awaited<T>("event.until", options, ( done, fail ) => {

        const value = get();

        if ( test(value) ) {

            done(value);

            return idle;

        }

        return watch(( next ) => {

            try {

                if ( test(next) ) done(next);

            } catch ( cause ) {

                fail(cause);

            }

        });

    });

}

export function signal<T> ( initial: T, options: (( a: T, b: T ) => boolean) | SignalOptions<T> = {} ): Signal<T> {

    const given: SignalOptions<T> = typeof options === "function" ? { equal: options } : options;
    const { equal = Object.is, fail } = given;
    let rows: readonly Row<T>[] = [];
    let turns: [T, T][] | undefined;
    let current = initial;
    const get = (): T => current;
    const watch: Readable<T>["watch"] = ( listener, wanted = {} ) => {

        const row: Row<T> = { listener, live: true };

        rows = [...rows, row];

        const off = linked(() => {

            if ( !row.live ) return;

            row.live = false;
            rows = rows.filter(( other ) => other !== row);

        }, wanted.signal);
        const failures = wanted.replay && row.live ? tried(listener, current, current, fail, undefined) : undefined;

        if ( failures ) off();

        raise(failures);

        return off;

    };
    const until = waited(get, watch);
    const made: Signal<T> = {
        get,
        watch,
        until,
        set: ( value ) => {

            const next = typeof value === "function" ? (value as ( current: T ) => T)(current) : value;

            if ( equal(current, next) ) return;
            if ( turns && turns.length >= deepest ) throw error.fault("internal", "event.loop");

            const previous = current;

            current = next;

            if ( turns ) {

                turns.push([next, previous]);

                return;

            }

            const queue: [T, T][] = [[next, previous]];
            let failures: unknown[] | undefined;

            turns = queue;

            try {

                for ( let at = 0; at < queue.length; at += 1 ) {

                    const turn = queue[at];

                    if ( !turn ) continue;

                    for ( const row of rows ) if ( row.live ) failures = tried(row.listener, turn[0], turn[1], fail, failures);

                }

            } finally {

                turns = undefined;

            }

            raise(failures);

        },
        reset: () => made.set(() => initial),
        count: () => rows.length,
        read: { get, watch, until },
    };

    return made;

}
export function derive<S, T> ( source: Readable<S>, pick: ( value: S ) => T, equal: ( a: T, b: T ) => boolean = Object.is ): Readable<T> {

    const inner = signal<T>(pick(source.get()), equal);
    let stop: (() => void) | undefined;
    let watchers = 0;
    const get = (): T => {

        if ( watchers === 0 ) inner.set(() => pick(source.get()));

        return inner.get();

    };
    const watch: Readable<T>["watch"] = ( listener, wanted = {} ) => {

        if ( wanted.signal?.aborted ) return idle;

        let off: (() => void) | undefined;
        let live = true;
        const release = (): void => {

            if ( !live ) return;

            live = false;
            watchers -= 1;
            off?.();

            if ( watchers > 0 ) return;

            stop?.();
            stop = undefined;

        };

        if ( watchers === 0 ) {

            inner.set(() => pick(source.get()));
            stop = source.watch(( value ) => inner.set(() => pick(value)));

        }

        watchers += 1;

        try {

            off = inner.watch(listener, { replay: wanted.replay });

        } catch ( cause ) {

            release();

            throw cause;

        }

        return linked(release, wanted.signal);

    };

    return { get, watch, until: waited(get, watch) };

}
