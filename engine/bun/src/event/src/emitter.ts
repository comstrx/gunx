import * as exception from "engine-exception";
import { awaited, linked } from "./abort.ts";
import type { Emitter, EmitterOptions, Events, Fail, Held } from "./arch.ts";

const none: readonly Held[] = [];
const deepest = 256;

function noted ( cause: unknown, failures: unknown[] | undefined ): unknown[] {

    if ( !failures ) return [cause];

    failures.push(cause);

    return failures;

}

export function entered ( depth: number ): number {

    if ( depth >= deepest ) throw exception.fault("internal", "event.loop");

    return depth + 1;

}
export function tried<A, B> ( work: ( first: A, second: B ) => unknown, first: A, second: B, fail: Fail | undefined, failures: unknown[] | undefined ): unknown[] | undefined {

    const out = exception.run(work, first, second);

    if ( !exception.threw(out) ) {

        if ( fail && typeof (out as PromiseLike<unknown> | undefined)?.then === "function" ) void exception.mend(out as PromiseLike<unknown>, fail);

        return failures;

    }

    if ( !fail ) return noted(out.caught, failures);

    const broken = exception.run(fail, out.caught);

    return exception.threw(broken) ? noted(broken.caught, failures) : failures;

}
export function raise ( failures: readonly unknown[] | undefined ): void {

    if ( failures ) throw failures[0];

}
export function emitter<E extends Events> ( options: EmitterOptions = {} ): Emitter<E> {

    const { fail } = options;
    const handlers = new Map<string, readonly Held[]>();
    let every: readonly Held[] = none;
    let depth = 0;
    const drop = ( name: string, held: Held ): void => {

        if ( !held.live ) return;

        held.live = false;

        const rows = (handlers.get(name) ?? none).filter(( row ) => row !== held);

        if ( rows.length ) handlers.set(name, rows);
        else handlers.delete(name);

    };
    const made: Emitter<E> = {
        on: ( name, handler, given = {} ) => {

            const held: Held = { handler: handler as Held["handler"], once: given.once === true, live: true };

            handlers.set(name, [...(handlers.get(name) ?? none), held]);

            return linked(() => drop(name, held), given.signal);

        },
        once: ( name, handler ) => made.on(name, handler, { once: true }),
        off: ( name, handler ) => {

            for ( const held of handlers.get(name) ?? none ) if ( !handler || held.handler === handler ) drop(name, held);

        },
        emit: ( name, payload ) => {

            const wide = every;
            let failures: unknown[] | undefined;
            let delivered = 0;

            depth = entered(depth);

            try {

                for ( const held of handlers.get(name) ?? none ) {

                    if ( !held.live ) continue;
                    if ( held.once ) drop(name, held);

                    delivered += 1;
                    failures = tried(held.handler, payload, name, fail, failures);

                }

                for ( const held of wide ) {

                    if ( !held.live ) continue;

                    delivered += 1;
                    failures = tried(held.handler, payload, name, fail, failures);

                }

            } finally {

                depth -= 1;

            }

            raise(failures);

            return delivered;

        },
        wait: ( name, given ) => awaited("event.wait", given, ( done ) => made.once(name, done), name),
        any: ( handler ) => {

            const held: Held = { handler: handler as Held["handler"], once: false, live: true };

            every = [...every, held];

            return () => {

                held.live = false;
                every = every.filter(( row ) => row !== held);

            };

        },
        has: ( name ) => handlers.has(name),
        count: ( name ) => {

            if ( name !== undefined ) return handlers.get(name)?.length ?? 0;

            let total = every.length;

            for ( const rows of handlers.values() ) total += rows.length;

            return total;

        },
        names: () => [...handlers.keys()].sort(),
        clear: () => {

            for ( const rows of handlers.values() ) for ( const held of rows ) held.live = false;
            for ( const held of every ) held.live = false;

            handlers.clear();
            every = none;

        },
    };

    return made;

}
