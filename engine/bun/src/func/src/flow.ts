import * as date from "engine-date";
import * as error from "engine-error";

type Step = ( value: never ) => unknown;
type Timer = ReturnType<typeof setTimeout>;

export type Deferred<T> = { promise: Promise<T>; resolve: ( value: T ) => void; reject: ( reason: unknown ) => void; settled: boolean };
export type DebounceOptions = { leading?: boolean | undefined; max?: number | undefined };
export type Debounced<F extends ( ...args: never[] ) => void> = F & { cancel: () => void; flush: () => void; pending: () => boolean };
export type Throttled<F extends ( ...args: never[] ) => void> = F & { cancel: () => void; flush: () => void; pending: () => boolean };
export type RetryOptions = {
    times?: number | undefined;
    delay?: number | undefined;
    factor?: number | undefined;
    max?: number | undefined;
    jitter?: boolean | undefined;
    when?: (( failure: unknown, attempt: number ) => boolean) | undefined;
    onRetry?: (( failure: unknown, attempt: number, wait: number ) => void) | undefined;
    signal?: AbortSignal | undefined;
};

const longest = 2_147_483_647;

function span ( ms: number ): number {

    return ms > 0 ? Math.min(ms, longest) : 0;

}
async function pause ( wait: number, signal: AbortSignal | undefined, failure: unknown ): Promise<void> {

    try {

        await date.sleep(wait, signal);

    } catch {

        throw failure;

    }

}

export function whole ( value: number | undefined, fallback: number, least: number ): number {

    return typeof value !== "number" || Number.isNaN(value) ? fallback : Math.max(least, Math.floor(value));

}
export function noop (): undefined {

    return undefined;

}
export function identity<T> ( value: T ): T {

    return value;

}
export function tap<T> ( value: T, work: ( value: T ) => void ): T {

    work(value);

    return value;

}
export function pipe<A> ( value: A ): A;
export function pipe<A, B> ( value: A, first: ( value: A ) => B ): B;
export function pipe<A, B, C> ( value: A, first: ( value: A ) => B, second: ( value: B ) => C ): C;
export function pipe<A, B, C, D> ( value: A, first: ( value: A ) => B, second: ( value: B ) => C, third: ( value: C ) => D ): D;
export function pipe<A, B, C, D, E> ( value: A, first: ( value: A ) => B, second: ( value: B ) => C, third: ( value: C ) => D, fourth: ( value: D ) => E ): E;
export function pipe<A, B, C, D, E, G> ( value: A, first: ( value: A ) => B, second: ( value: B ) => C, third: ( value: C ) => D, fourth: ( value: D ) => E, fifth: ( value: E ) => G ): G;
export function pipe<T> ( value: T, ...steps: readonly (( value: T ) => T)[] ): T;
export function pipe ( value: unknown, ...steps: readonly Step[] ): unknown {

    let current = value;

    for ( const step of steps ) current = step(current as never);

    return current;

}
export function deferred<T> (): Deferred<T> {

    let resolve: ( value: T ) => void = noop;
    let reject: ( reason: unknown ) => void = noop;
    const promise = new Promise<T>(( yes, no ) => {

        resolve = yes;
        reject = no;

    });
    const out: Deferred<T> = {
        promise,
        settled: false,
        resolve: ( value ) => {

            out.settled = true;
            resolve(value);

        },
        reject: ( reason ) => {

            out.settled = true;
            reject(reason);

        },
    };

    return out;

}
export function debounce<F extends ( ...args: never[] ) => void> ( work: F, wait: number, options: boolean | DebounceOptions = false ): Debounced<F> {

    const chosen: DebounceOptions = typeof options === "boolean" ? { leading: options } : options;
    const leading = chosen.leading === true;
    const quiet = span(wait);
    const most = typeof chosen.max === "number" && chosen.max >= 0 ? Math.max(span(chosen.max), quiet) : undefined;
    let timer: Timer | undefined;
    let limit: Timer | undefined;
    let last: Parameters<F> | undefined;
    const take = (): Parameters<F> | undefined => {

        const args = last;

        clearTimeout(timer);
        clearTimeout(limit);
        timer = undefined;
        limit = undefined;
        last = undefined;

        return args;

    };
    const fire = (): void => {

        const args = take();

        if ( args ) work(...args);

    };
    const wrapped = (( ...args: Parameters<F> ) => {

        const lead = leading && timer === undefined;

        clearTimeout(timer);
        timer = setTimeout(fire, quiet);

        if ( lead ) {

            work(...args);

            return;

        }

        last = args;

        if ( limit === undefined && most !== undefined ) limit = setTimeout(fire, most);

    }) as Debounced<F>;

    wrapped.cancel = () => {

        take();

    };
    wrapped.flush = fire;
    wrapped.pending = () => last !== undefined;

    return wrapped;

}
export function throttle<F extends ( ...args: never[] ) => void> ( work: F, wait: number ): Throttled<F> {

    const gap = span(wait);
    let lastAt = Number.NEGATIVE_INFINITY;
    let timer: Timer | undefined;
    let trailing: Parameters<F> | undefined;
    const fire = ( args: Parameters<F> ): void => {

        clearTimeout(timer);
        timer = undefined;
        trailing = undefined;
        lastAt = date.now();
        work(...args);

    };
    const late = (): void => {

        const args = trailing;

        if ( args ) fire(args);

    };
    const wrapped = (( ...args: Parameters<F> ) => {

        const elapsed = date.now() - lastAt;

        if ( elapsed >= gap || elapsed < 0 ) {

            fire(args);

            return;

        }

        trailing = args;

        if ( timer === undefined ) timer = setTimeout(late, gap - elapsed);

    }) as Throttled<F>;

    wrapped.cancel = () => {

        clearTimeout(timer);
        timer = undefined;
        trailing = undefined;

    };
    wrapped.flush = late;
    wrapped.pending = () => trailing !== undefined;

    return wrapped;

}
export async function retry<T> ( work: ( attempt: number ) => Promise<T>, options: RetryOptions = {} ): Promise<T> {

    const { delay = 100, factor = 2, max = 10_000, jitter = true, when = error.retryable, onRetry, signal } = options;
    const times = whole(options.times, 3, 1);
    let attempt = 0;

    for ( ;; ) {

        attempt += 1;

        try {

            return await work(attempt);

        } catch ( caught ) {

            if ( attempt >= times || !when(caught, attempt) || signal?.aborted ) throw caught;

            const asked = error.isFault(caught) && typeof caught.retryAfter === "number" && caught.retryAfter >= 0 ? caught.retryAfter * 1000 : undefined;
            const base = Math.min(max, delay * factor ** (attempt - 1));
            const wait = asked ?? (jitter ? base * (0.5 + Math.random() * 0.5) : base);

            if ( asked !== undefined && asked > max ) throw caught;

            onRetry?.(caught, attempt, wait);

            await pause(wait, signal, caught);

        }

    }

}
export async function timeout<T> ( work: Promise<T> | (( signal: AbortSignal ) => Promise<T>), ms: number, reason = "timeout" ): Promise<T> {

    const controller = new AbortController();
    const promise = typeof work === "function" ? work(controller.signal) : work;

    if ( ms === Number.POSITIVE_INFINITY ) return promise;

    let timer: Timer | undefined;
    const limit = new Promise<never>(( _, reject ) => {

        timer = setTimeout(() => {

            const failure = error.fault("timeout", reason);

            reject(failure);
            controller.abort(failure);

        }, span(ms));

    });

    try {

        return await Promise.race([promise, limit]);

    } finally {

        clearTimeout(timer);

    }

}
