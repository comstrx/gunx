import * as error from "engine-error";

export type Wait = { timeout?: number | undefined; signal?: AbortSignal | undefined };
export type Abortable = { readonly signal: AbortSignal; abort: ( reason?: unknown ) => void; release: () => void };

const longest = 2_147_483_647;

function gone ( cause: unknown ): error.Fault {

    return error.fault("timeout", "event.aborted", { cause });

}
function span ( ms: number ): number {

    return Math.min(Math.max(0, ms) || 0, longest);

}

export function awaited<T> ( reason: string, options: number | Wait | undefined, arm: ( done: ( value: T ) => void, fail: ( cause: unknown ) => void ) => () => void, subject?: string ): Promise<T> {

    const { timeout, signal }: Wait = typeof options === "number" ? { timeout: options } : (options ?? {});

    if ( Number.isNaN(timeout) ) return Promise.reject(new RangeError("not a duration"));

    return new Promise<T>(( resolve, reject ) => {

        const stops: (() => void)[] = [];
        let settled = false;
        const close = ( finish: () => void ): void => {

            if ( settled ) return;

            settled = true;

            for ( const stop of stops.splice(0) ) stop();

            finish();

        };

        if ( signal?.aborted ) {

            reject(gone(signal.reason));

            return;

        }

        const stop = arm(( value ) => close(() => resolve(value)), ( cause ) => close(() => reject(cause)));

        if ( settled ) {

            stop();

            return;

        }

        stops.push(stop);

        if ( signal ) {

            const abort = (): void => close(() => reject(gone(signal.reason)));

            signal.addEventListener("abort", abort, { once: true });
            stops.push(() => signal.removeEventListener("abort", abort));

        }

        if ( timeout !== undefined && timeout !== Number.POSITIVE_INFINITY ) {

            const late = (): void => close(() => reject(error.fault("timeout", reason, subject === undefined ? {} : { message: `${subject} did not arrive within ${timeout}ms` })));
            const timer = setTimeout(late, span(timeout));

            stops.push(() => clearTimeout(timer));

        }

    });

}
export function linked ( stop: () => void, signal: AbortSignal | undefined ): () => void {

    if ( !signal ) return stop;

    const off = (): void => {

        signal.removeEventListener("abort", off);
        stop();

    };

    if ( signal.aborted ) stop();
    else signal.addEventListener("abort", off, { once: true });

    return off;

}
export function abortable ( ...signals: readonly (AbortSignal | undefined)[] ): Abortable {

    const controller = new AbortController();
    const given = signals.filter(( signal ): signal is AbortSignal => signal !== undefined);
    const first = given.find(( signal ) => signal.aborted);
    const abort = ( reason?: unknown ): void => controller.abort(reason);

    if ( first ) controller.abort(first.reason);
    if ( first || given.length === 0 ) return { signal: controller.signal, abort, release: () => undefined };
    if ( typeof AbortSignal.any === "function" ) return { signal: AbortSignal.any([controller.signal, ...given]), abort, release: () => undefined };

    const stops = given.map(( signal ) => {

        const forward = (): void => controller.abort(signal.reason);

        signal.addEventListener("abort", forward, { once: true });

        return (): void => signal.removeEventListener("abort", forward);

    });
    const release = (): void => {

        for ( const stop of stops.splice(0) ) stop();

    };

    controller.signal.addEventListener("abort", release, { once: true });

    return { signal: controller.signal, abort, release };

}
export function deadline ( ms: number, ...signals: readonly (AbortSignal | undefined)[] ): Abortable {

    if ( Number.isNaN(ms) ) throw new RangeError("not a duration");

    const made = abortable(...signals);
    const timer = made.signal.aborted || ms === Number.POSITIVE_INFINITY ? undefined : setTimeout(() => made.abort(error.fault("timeout", "event.deadline")), span(ms));
    const release = (): void => {

        if ( timer !== undefined ) clearTimeout(timer);

        made.release();

    };

    if ( made.signal.aborted || timer === undefined ) return { signal: made.signal, abort: made.abort, release };
    if ( signals.some(( signal ) => signal !== undefined) ) made.signal.addEventListener("abort", release, { once: true });

    return {
        signal: made.signal,
        release,
        abort: ( reason ) => {

            clearTimeout(timer);
            made.abort(reason);

        },
    };

}
export function aborted ( signal: AbortSignal | undefined ): Promise<never> {

    return new Promise<never>(( _, reject ) => {

        if ( !signal ) return;

        if ( signal.aborted ) reject(gone(signal.reason));
        else signal.addEventListener("abort", () => reject(gone(signal.reason)), { once: true });

    });

}
export function race<T> ( work: PromiseLike<T>, signal: AbortSignal | undefined ): Promise<T> {

    if ( !signal ) return Promise.resolve(work);

    if ( signal.aborted ) {

        work.then(undefined, () => undefined);

        return Promise.reject(gone(signal.reason));

    }

    return new Promise<T>(( resolve, reject ) => {

        const abort = (): void => reject(gone(signal.reason));
        const settle = (): void => signal.removeEventListener("abort", abort);

        signal.addEventListener("abort", abort, { once: true });
        work.then(( value ) => {

            settle();
            resolve(value);

        }, ( cause: unknown ) => {

            settle();
            reject(cause);

        });

    });

}
