import * as date from "engine-date";
import * as error from "engine-error";
import { whole } from "./memory.ts";

type Bucket = { count: number; start: number };

export type Taken = { allowed: boolean; remaining: number; retryAfter: number; limit: number };
export type Limiter = { take: ( key: string, cost?: number ) => Taken; peek: ( key: string ) => Taken; reset: ( key: string ) => void; clear: () => void; assert: ( key: string, cost?: number ) => Taken };

function sized ( value: number ): number {

    if ( typeof value !== "number" || Number.isNaN(value) ) throw new RangeError("not a limit");

    return Math.max(1, Math.trunc(value));

}

export function limiter ( limit: number, windowMs: number, size = 10_000 ): Limiter {

    const buckets = new Map<string, Bucket>();
    const cap = sized(limit);
    const span = sized(windowMs);
    const most = whole(size, 10_000, 1);
    const live = ( key: string, now: number ): Bucket | undefined => {

        const found = buckets.get(key);
        const passed = found === undefined ? span : now - found.start;

        return passed >= 0 && passed < span ? found : undefined;

    };
    const opened = ( key: string, now: number ): Bucket => {

        const fresh: Bucket = { count: 0, start: now };
        const oldest = buckets.size >= most && !buckets.has(key) ? buckets.keys().next() : undefined;

        if ( oldest && !oldest.done ) buckets.delete(oldest.value);

        buckets.delete(key);
        buckets.set(key, fresh);

        return fresh;

    };
    const describe = ( found: Bucket | undefined, allowed: boolean, now: number ): Taken => ({
        allowed,
        limit: cap,
        remaining: Math.max(0, cap - (found?.count ?? 0)),
        retryAfter: allowed ? 0 : Math.max(1, Math.ceil(((found?.start ?? now) + span - now) / 1000)),
    });
    const take = ( key: string, cost = 1 ): Taken => {

        const now = date.now();
        const weight = cost >= 0 ? cost : cost < 0 ? 0 : Number.POSITIVE_INFINITY;
        const found = live(key, now);
        const next = (found?.count ?? 0) + weight;

        if ( next > cap ) return describe(found, false, now);

        const bucket = found ?? opened(key, now);

        bucket.count = next;

        return describe(bucket, true, now);

    };

    return {
        take,
        peek: ( key ) => {

            const now = date.now();
            const found = live(key, now);

            return describe(found, (found?.count ?? 0) < cap, now);

        },
        reset: ( key ) => {

            buckets.delete(key);

        },
        clear: () => buckets.clear(),
        assert: ( key, cost = 1 ) => {

            const taken = take(key, cost);

            if ( !taken.allowed ) throw error.fault("too_many_requests", "throttle", { retryAfter: taken.retryAfter });

            return taken;

        },
    };

}
