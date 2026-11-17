import * as date from "engine-date";
import * as exception from "engine-exception";
import type { Bucket, Limiter, Taken } from "./arch.ts";
import { whole } from "./memory.ts";

function sized ( value: number ): number {

    if ( typeof value !== "number" || Number.isNaN(value) ) throw exception.misuse("not a limit");

    return Math.max(1, Math.trunc(value));

}

export function limiter ( limit: number, windowMs: number, size = 10_000 ): Limiter {

    const buckets = new Map<string, Bucket>();
    const cap = sized(limit);
    const span = sized(windowMs);
    const most = whole(size, 10_000, 1);
    let clock = Number.NEGATIVE_INFINITY;

    const now = (): number => {

        clock = Math.max(clock, date.now());

        return clock;

    };
    const live = ( key: string, at: number ): Bucket | undefined => {

        const found = buckets.get(key);

        if ( found === undefined || at - found.start < span ) return found;

        buckets.delete(key);

        return undefined;

    };
    const room = ( at: number ): boolean => {

        while ( buckets.size >= most ) {

            const first = buckets.entries().next();

            if ( first.done ) return true;
            if ( at - first.value[1].start < span ) return false;

            buckets.delete(first.value[0]);

        }

        return true;

    };
    const describe = ( found: Bucket | undefined, allowed: boolean, at: number ): Taken => ({
        allowed,
        limit: cap,
        remaining: Math.max(0, cap - (found?.count ?? 0)),
        retryAfter: allowed ? 0 : Math.max(1, Math.ceil(((found?.start ?? at) + span - at) / 1000)),
    });
    const full = ( at: number ): Taken => ({
        ...describe(buckets.values().next().value, false, at),
        remaining: 0,
    });
    const take = ( key: string, cost = 1 ): Taken => {

        const at = now();
        const found = live(key, at);
        const next = (found?.count ?? 0) + cost;

        if ( !Number.isFinite(cost) || cost < 0 || !Number.isFinite(next) || next > cap ) return describe(found, false, at);
        if ( cost === 0 ) return describe(found, true, at);
        if ( found === undefined && !room(at) ) return full(at);

        const bucket = found ?? { count: 0, start: at };

        if ( found === undefined ) buckets.set(key, bucket);

        bucket.count = next;

        return describe(bucket, true, at);

    };

    return {
        take,
        peek: ( key ) => {

            const at = now();
            const found = live(key, at);

            if ( found === undefined && !room(at) ) return full(at);

            return describe(found, (found?.count ?? 0) < cap, at);

        },
        reset: ( key ) => {

            buckets.delete(key);

        },
        clear: () => buckets.clear(),
        assert: ( key, cost = 1 ) => {

            const taken = take(key, cost);

            if ( !taken.allowed ) throw exception.fault("too_many_requests", "throttle", { retryAfter: taken.retryAfter });

            return taken;

        },
    };

}
