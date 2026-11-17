import * as exception from "engine-exception";
import * as rand from "engine-rand";
import type { Backoff, Outbox, Schedule } from "./arch.ts";

export const longest = 86_400_000;

export function span ( value: number | undefined, fallback: number, endless = false ): number {

    if ( value === undefined ) return fallback;
    if ( Number.isNaN(value) || (!endless && value === Number.POSITIVE_INFINITY) ) throw exception.misuse("not a duration");

    return Math.max(0, value);

}
export function count ( value: number | undefined, fallback: number ): number {

    if ( value === undefined ) return fallback;
    if ( !(value >= 1) ) throw exception.misuse("not a count");

    return Math.trunc(value);

}
export function clean ( wait: number ): number {

    return wait > 0 ? Math.min(wait, longest) : 0;

}
export function backoff ( options: Backoff = {} ): ( attempt: number ) => number {

    const { factor = 2, jitter = 0 } = options;
    const delay = span(options.delay, 1000);
    const max = Math.min(span(options.max, 60_000, true), longest);

    if ( !(factor > 0) || factor === Number.POSITIVE_INFINITY ) throw exception.misuse("not a factor");
    if ( !(jitter >= 0 && jitter <= 1) ) throw exception.misuse("not a ratio");

    return ( attempt ) => {

        const grown = delay === 0 ? 0 : delay * factor ** Math.max(0, (Math.trunc(attempt) || 1) - 1);
        const base = Math.min(grown, max);
        const spread = jitter > 0 ? rand.jitter(base, jitter) : base;

        return Math.round(Math.min(max, Math.max(0, spread)));

    };

}
export function schedule ( outbox: Pick<Outbox, "flush">, options: Schedule = {} ): () => void {

    const { immediate = true, when, onFlush, fail } = options;
    const every = span(options.every, 15_000);

    if ( every < 1 ) throw exception.misuse("not a duration");

    let busy = false;
    let live = true;
    const tick = async (): Promise<void> => {

        if ( busy || !live ) return;

        if ( exception.rescue(() => when !== undefined && !when(), ( cause ) => {

            fail?.(cause);

            return true;

        }) ) return;

        busy = true;

        try {

            await exception.rescueAsync(async () => {

                const result = await outbox.flush();

                if ( live ) onFlush?.(result);

            }, ( cause ) => {

                fail?.(cause);

            });

        } finally {

            busy = false;

        }

    };

    const timer = setInterval(() => void tick(), every);

    if ( immediate ) void tick();

    return () => {

        live = false;
        clearInterval(timer);

    };

}
