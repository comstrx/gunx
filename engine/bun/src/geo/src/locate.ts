import type * as device from "engine-device";
import * as error from "engine-error";
import type { Locate, Near, Point } from "./arch.ts";
import { meters } from "./path.ts";
import { distance, earthRadius, isPoint, rad } from "./point.ts";

const patience = 15_000;

function idle (): undefined {

    return undefined;

}
function split ( options: Locate ) {

    const { within, radius, minMeters, minMs, signal, ...wanted } = options;

    return { within, radius, minMeters, minMs, signal, wanted };

}
function fine ( found: device.Position | undefined, radius: number | undefined ): found is device.Position {

    return isPoint(found) && (radius === undefined || found.accuracy <= radius);

}

export function locate ( unit: Pick<device.Device, "position" | "follow">, options: Locate = {} ): Promise<device.Position> {

    const { within, radius, signal, wanted } = split(options);
    const wait = within !== undefined && within >= 0 ? within : patience;

    return new Promise<device.Position>(( resolve, reject ) => {

        let stop: () => void = idle;
        let done = false;
        const finish = (): boolean => {

            if ( done ) return false;

            done = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            try {

                stop();

            } catch ( cause ) {

                reject(cause);

                return false;

            }

            return true;

        };
        const fail = ( cause: unknown ): void => {

            if ( finish() ) reject(cause);

        };
        const settle = ( found: device.Position ): void => {

            if ( fine(found, radius) && finish() ) resolve(found);

        };
        const abort = (): void => fail(error.fault("timeout", "geo.aborted"));
        const watch = (): void => {

            if ( done ) return;

            try {

                let acquiring = true;
                let pending: device.Position | undefined;
                const stopper = unit.follow(wanted, ( found ) => {

                    if ( !fine(found, radius) ) return;
                    if ( acquiring ) pending ??= found;
                    else settle(found);

                });

                acquiring = false;

                if ( done ) stopper();
                else {

                    stop = stopper;

                    if ( pending ) settle(pending);

                }

            } catch ( cause ) {

                fail(error.isFault(cause) ? cause : error.fault("unavailable", "geo.refused", { cause }));

            }

        };
        const timer = setTimeout(() => fail(error.fault("timeout", "geo.locate", { message: `no position within ${wait}ms` })), wait);

        if ( signal?.aborted ) return abort();

        signal?.addEventListener("abort", abort, { once: true });

        Promise.resolve()
            .then(() => done ? undefined : unit.position(wanted))
            .then(( known ) => (fine(known, radius) ? settle(known) : watch()), watch)
            .catch(fail);

    });

}
export function follow ( unit: Pick<device.Device, "follow">, options: Locate, listener: ( position: device.Position ) => void ): () => void {

    const { minMeters = 0, minMs = 0, radius, signal, wanted } = split(options);
    if ( signal?.aborted ) return idle;

    let last: device.Position | undefined;
    let ended = false;
    const stop = unit.follow(wanted, ( next ) => {

        if ( ended || signal?.aborted || !fine(next, radius) ) return;
        if ( last && minMs > 0 && next.at >= last.at && next.at - last.at < minMs ) return;
        if ( last && minMeters > 0 && distance(last, next) < minMeters ) return;

        last = next;
        listener(next);

    });
    const end = (): void => {

        if ( ended ) return;

        ended = true;
        signal?.removeEventListener("abort", end);
        stop();

    };

    if ( signal?.aborted ) end();
    else signal?.addEventListener("abort", end, { once: true });

    return end;

}
export function near<T extends Point> ( from: Point, candidates: readonly T[], radius: number, limit?: number ): Near<T>[] {

    const reach = meters(radius);
    const cos = Math.cos(from.lat * rad);
    const bend = Math.sin(Math.min(Math.PI / 2, reach / (2 * earthRadius)));
    const edge = bend * bend * (1 + 1e-9);
    const found: Near<T>[] = [];

    for ( const item of candidates ) {

        const half = Math.sin((item.lat - from.lat) * rad * 0.5);
        const turn = Math.sin((item.lng - from.lng) * rad * 0.5);

        if ( !(half * half + cos * Math.cos(item.lat * rad) * turn * turn <= edge) ) continue;

        const gap = distance(from, item);

        if ( gap <= reach ) found.push({ item, distance: gap });

    }

    found.sort(( a, b ) => a.distance - b.distance);

    return limit === undefined || Number.isNaN(limit) ? found : found.slice(0, Math.max(0, Math.trunc(limit)));

}
