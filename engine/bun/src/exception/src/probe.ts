export function thenable ( value: unknown ): value is PromiseLike<unknown> {

    return ((typeof value === "object" && value !== null) || typeof value === "function")
        && typeof (value as { then?: unknown }).then === "function";

}
export function probe<T> ( read: () => T ): T | undefined {

    try { return read(); }
    catch { return undefined; }

}
export async function probeAsync<T> ( read: () => PromiseLike<T> | T ): Promise<T | undefined> {

    try { return await read(); }
    catch { return undefined; }

}
export function rescue<T, F> ( work: () => T, mend: ( caught: unknown ) => F ): T | F {

    try { return work(); }
    catch ( caught ) { return mend(caught); }

}
export async function rescueAsync<T, F> ( work: () => PromiseLike<T> | T, mend: ( caught: unknown ) => PromiseLike<F> | F ): Promise<T | F> {

    try { return await work(); }
    catch ( caught ) { return mend(caught); }

}
export function mend<T, F> ( work: PromiseLike<T> | T, heal: ( caught: unknown ) => PromiseLike<F> | F ): Promise<T | F> {

    return Promise.resolve(work).then(undefined, heal);

}
export function quiet ( work: PromiseLike<unknown> ): void {

    void Promise.resolve(work).then(undefined, () => undefined);

}
export class Thrown {

    readonly caught: unknown;
    constructor ( caught: unknown ) {

        this.caught = caught;

    }
}

export function run<T, A = undefined, B = undefined> ( work: ( first: A, second: B ) => T, first?: A, second?: B ): T | Thrown {

    try { return work(first as A, second as B); }
    catch ( caught ) { return new Thrown(caught); }

}
export function threw ( value: unknown ): value is Thrown {

    return value instanceof Thrown;

}
