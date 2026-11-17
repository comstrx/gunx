import * as date from "engine-date";
import * as exception from "engine-exception";
import type { Breaker, BreakerOptions, BreakerState, Lane, LaneOptions } from "./arch.ts";
import { whole } from "./flow.ts";

const crowded = 1024;

function stopped ( signal: AbortSignal | undefined ): exception.Fault {

    return exception.fault("timeout", "lane.aborted", { cause: signal?.reason });

}

export function breaker ( options: BreakerOptions = {} ): Breaker {

    const { when = () => true, onChange } = options;
    const limit = whole(options.failures, 5, 1);
    const cooldown = whole(options.cooldown, 30_000, 0);
    let failures = 0;
    let openedAt = 0;
    let tripped = false;
    let probing = false;
    let turn = 0;
    const waited = (): number => {

        const now = date.now();

        if ( now < openedAt ) openedAt = now;

        return now - openedAt;

    };
    const state = (): BreakerState => {

        if ( !tripped ) return "closed";

        return waited() >= cooldown ? "half" : "open";

    };
    const trip = (): void => {

        tripped = true;
        probing = false;
        openedAt = date.now();
        turn += 1;
        onChange?.("open");

    };
    const close = (): void => {

        const was = tripped;

        tripped = false;
        probing = false;
        failures = 0;
        turn += 1;

        if ( was ) onChange?.("closed");

    };
    const refused = (): exception.Fault => {

        const left = Math.max(1, Math.ceil((cooldown - waited()) / 1000));

        return exception.fault("unavailable", "breaker.open", Number.isFinite(left) ? { retryAfter: left } : {});

    };

    return {
        state,
        failures: () => failures,
        reset: close,
        run: async ( work ) => {

            const current = state();

            if ( current === "open" || (current === "half" && probing) ) throw refused();

            const probe = current === "half";
            const era = turn;

            if ( probe ) {

                probing = true;
                onChange?.("half");

            }

            return await exception.rescueAsync(async () => {

                const result = await work();

                if ( era === turn && probe ) close();
                if ( era === turn ) failures = 0;

                return result;

            }, ( caught ) => {

                if ( era !== turn ) throw caught;
                if ( probe ) probing = false;
                if ( !when(caught) ) throw caught;

                failures += 1;

                if ( probe || failures >= limit ) trip();

                throw caught;

            });

        },
    };

}
export function lane ( width = 1, options: LaneOptions = {} ): Lane {

    const slots = whole(width, 1, 1);
    const limit = options.pending ?? 4096;

    if ( !Number.isSafeInteger(slots) ) throw exception.misuse("not a lane width");

    if ( !Number.isSafeInteger(limit) || limit < 0 ) throw exception.misuse("not a pending limit");
    const queue: ((() => void) | undefined)[] = [];
    const watched = new Map<() => void, () => void>();
    let idle: PromiseWithResolvers<void> | undefined;
    let head = 0;
    let parked = 0;
    let active = 0;
    const compact = (): void => {

        let kept = 0;

        for ( let at = head; at < queue.length; at += 1 ) {

            const next = queue[at];

            if ( next !== undefined ) queue[kept++] = next;

        }

        queue.length = kept;
        head = 0;

    };
    const release = (): void => {

        let next: (() => void) | undefined;

        while ( parked > 0 && next === undefined && head < queue.length ) {

            next = queue[head];
            queue[head] = undefined;
            head += 1;

        }

        if ( next === undefined ) {

            if ( queue.length > 0 ) queue.length = 0;

            head = 0;
            active -= 1;

            if ( active === 0 && idle ) {

                const done = idle;

                idle = undefined;
                done.resolve();

            }

            return;

        }

        if ( head >= crowded ) {

            queue.splice(0, head);
            head = 0;

        }

        parked -= 1;

        if ( watched.size > 0 ) watched.get(next)?.();

        next();

    };
    const park = ( signal: AbortSignal | undefined ): Promise<void> => new Promise(( resolve, reject ) => {

        queue.push(resolve);
        parked += 1;

        if ( signal === undefined ) return;

        const stop = (): void => {

            const at = queue.indexOf(resolve, head);

            if ( at !== -1 ) queue[at] = undefined;

            watched.delete(resolve);
            parked -= 1;

            if ( parked === 0 ) {

                queue.length = 0;
                head = 0;

            } else if ( queue.length - head > parked * 2 + crowded ) compact();

            reject(stopped(signal));

        };

        watched.set(resolve, () => {

            watched.delete(resolve);
            signal.removeEventListener("abort", stop);

        });
        signal.addEventListener("abort", stop, { once: true });

    });

    return {
        size: () => active + parked,
        active: () => active,
        waiting: () => parked,
        idle: () => {

            if ( active === 0 ) return Promise.resolve();

            idle ??= Promise.withResolvers<void>();

            return idle.promise;

        },
        run: async ( work, signal ) => {

            if ( signal?.aborted ) throw stopped(signal);

            if ( active < slots ) active += 1;
            else {

                if ( parked >= limit ) throw exception.fault("too_many_requests", "lane.full");

                await park(signal);

            }

            try {

                if ( signal?.aborted ) throw stopped(signal);

                return await work();

            } finally {

                release();

            }

        },
    };

}
