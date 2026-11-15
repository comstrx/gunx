import type { Lanes, Settled } from "./arch.ts";

function stopped ( signal: AbortSignal ): Error {

    return signal.reason instanceof Error ? signal.reason : new Error("aborted", { cause: signal.reason });

}

async function visit<T> ( items: readonly T[], work: ( item: T, index: number ) => Promise<void>, options: Lanes ): Promise<void> {

    const { lanes = 4, signal } = options;
    const width = lanes >= 1 ? Math.min(Math.floor(lanes), items.length) : 1;
    let cursor = 0;
    let failed: { cause: unknown } | undefined;

    const lane = async (): Promise<void> => {

        while ( cursor < items.length && failed === undefined ) {

            try {

                if ( signal?.aborted ) throw stopped(signal);

                const index = cursor;

                cursor += 1;
                await work(items[index] as T, index);

            } catch ( cause ) {

                failed ??= { cause };

            }

        }

    };

    await Promise.all(Array.from({ length: width }, lane));

    if ( failed !== undefined ) throw failed.cause;

}
export async function mapAsync<T, R> ( items: readonly T[], work: ( item: T, index: number ) => Promise<R>, options: Lanes = {} ): Promise<R[]> {

    const out = new Array<R>(items.length);

    await visit(items, async ( item, index ) => { out[index] = await work(item, index); }, options);

    return out;

}
export async function filterAsync<T> ( items: readonly T[], test: ( item: T, index: number ) => Promise<boolean>, options: Lanes = {} ): Promise<T[]> {

    const kept = await mapAsync(items, test, options);

    return items.filter(( _, index ) => kept[index]);

}
export async function eachAsync<T> ( items: readonly T[], work: ( item: T, index: number ) => Promise<void>, options: Lanes = {} ): Promise<void> {

    await visit(items, work, options);

}
export async function reduceAsync<T, R> ( items: readonly T[], work: ( total: R, item: T, index: number ) => Promise<R>, initial: R ): Promise<R> {

    let total = initial;

    for ( let index = 0; index < items.length; index += 1 ) total = await work(total, items[index] as T, index);

    return total;

}
export async function sequence<T> ( works: readonly (() => Promise<T>)[] ): Promise<T[]> {

    const out: T[] = [];

    for ( const work of works ) out.push(await work());

    return out;

}
export async function settle<T> ( works: readonly (() => Promise<T>)[], options: Lanes = {} ): Promise<Settled<T>> {

    const results = await mapAsync(works, async ( work ) => {

        try {

            return { ok: true as const, value: await work() };

        } catch ( caught ) {

            return { ok: false as const, failure: caught };

        }

    }, options);

    return {
        done: results.flatMap(( result ) => (result.ok ? [result.value] : [])),
        failed: results.flatMap(( result ) => (result.ok ? [] : [result.failure])),
    };

}
