import * as date from "engine-date";
import * as error from "engine-error";
import { whole } from "./flow.ts";

export type BreakerState = "closed" | "open" | "half";
export type BreakerOptions = {
    failures?: number | undefined;
    cooldown?: number | undefined;
    when?: (( failure: unknown ) => boolean) | undefined;
    onChange?: (( state: BreakerState ) => void) | undefined;
};
export type Breaker = {
    run: <T>( work: () => Promise<T> ) => Promise<T>;
    state: () => BreakerState;
    reset: () => void;
    failures: () => number;
};
export type Lane = {
    run: <T>( work: () => Promise<T>, signal?: AbortSignal ) => Promise<T>;
    size: () => number;
    active: () => number;
    waiting: () => number;
    idle: () => Promise<void>;
};

const crowded = 1024;

function stopped ( signal: AbortSignal | undefined ): error.Fault {

    return error.fault("timeout", "lane.aborted", { cause: signal?.reason });

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
    const refused = (): error.Fault => {

        const left = Math.max(1, Math.ceil((cooldown - waited()) / 1000));

        return error.fault("unavailable", "breaker.open", Number.isFinite(left) ? { retryAfter: left } : {});

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

            try {

                const result = await work();

                if ( era === turn && probe ) close();
                if ( era === turn ) failures = 0;

                return result;

            } catch ( caught ) {

                if ( era !== turn ) throw caught;
                if ( probe ) probing = false;
                if ( !when(caught) ) throw caught;

                failures += 1;

                if ( probe || failures >= limit ) trip();

                throw caught;

            }

        },
    };

}
export function lane ( width = 1 ): Lane {

    const slots = whole(width, 1, 1);
    const queue: ((() => void) | undefined)[] = [];
    const watched = new Map<() => void, () => void>();
    const idle: (() => void)[] = [];
    let head = 0;
    let parked = 0;
    let active = 0;
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

            if ( active === 0 && idle.length > 0 ) for ( const done of idle.splice(0) ) done();

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
        idle: () => (active === 0 ? Promise.resolve() : new Promise(( resolve ) => idle.push(resolve))),
        run: async ( work, signal ) => {

            if ( signal?.aborted ) throw stopped(signal);

            if ( active < slots ) active += 1;
            else await park(signal);

            try {

                return await work();

            } finally {

                release();

            }

        },
    };

}
