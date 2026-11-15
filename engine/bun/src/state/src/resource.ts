import * as error from "engine-error";
import * as event from "engine-event";
import type { ResourceFlight as Flight, Handle, Resource, ResourceOptions } from "./arch.ts";
import { createStore } from "./zustand.ts";

function flight<T> (): Flight<T> {

    const { promise, resolve } = Promise.withResolvers<T | undefined>();

    return { controller: new AbortController(), promise, settle: resolve };

}

export function resource<T> ( options: ResourceOptions<T> ): Handle<T> {

    const { load, seed, staleAfter, now = Date.now } = options;

    if ( staleAfter !== undefined && !(staleAfter >= 0) ) throw new RangeError("not a duration");

    const initial: Resource<T> = { status: seed === undefined ? "idle" : "done", data: seed, error: undefined, at: 0, stale: seed !== undefined };
    const store = createStore<Resource<T>>(() => initial);
    let current: Flight<T> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const calm = (): void => {

        if ( timer !== undefined ) clearTimeout(timer);

        timer = undefined;

    };
    const cancel = (): void => {

        const gone = current;

        current = undefined;
        gone?.controller.abort();

    };
    const keep = ( data: T, at = now() ): void => {

        calm();

        if ( staleAfter !== undefined && staleAfter !== Number.POSITIVE_INFINITY ) {

            timer = setTimeout(() => store.setState({ stale: true }), Math.min(staleAfter, 2_147_483_647));
            (timer as { unref?: () => void }).unref?.();

        }

        store.setState({ status: "done", data, error: undefined, at, stale: false });

    };
    const work = async ( mine: Flight<T> ): Promise<void> => {

        let data: T;
        let at: number;

        try {

            data = await event.race(load(mine.controller.signal), mine.controller.signal);

            if ( current !== mine ) {

                mine.settle(undefined);

                return;

            }

            at = now();

        } catch ( caught ) {

            if ( current === mine ) {

                current = undefined;
                store.setState({ status: "failed", error: error.of(caught) });

            }

            mine.settle(undefined);

            return;

        }

        if ( current !== mine ) {

            mine.settle(undefined);

            return;

        }

        current = undefined;
        keep(data, at);
        mine.settle(data);

    };
    const refresh = (): Promise<T | undefined> => {

        cancel();

        const mine = flight<T>();

        current = mine;
        store.setState({ status: "pending", error: undefined });

        if ( current === mine ) void work(mine);
        else mine.settle(undefined);

        return mine.promise;

    };

    return Object.assign(store, {
        refresh,
        ensure: () => {

            if ( current ) return current.promise;

            const { status, data, stale } = store.getState();

            return status === "done" && !stale ? Promise.resolve(data) : refresh();

        },
        abort: () => {

            if ( !current ) return;

            cancel();
            store.setState({ status: store.getState().data === undefined ? "idle" : "done" });

        },
        set: ( data: T ) => {

            cancel();
            keep(data);

        },
        update: ( change: ( current: T | undefined ) => T ) => {

            const data = change(store.getState().data);

            cancel();
            keep(data);

        },
        reset: () => {

            cancel();
            calm();
            store.setState(initial);

        },
    });

}
