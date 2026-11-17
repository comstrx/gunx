import * as event from "engine-event";
import * as exception from "engine-exception";
import type { Action, ActionOptions, ActionState, ActionFlight as Flight } from "./arch.ts";
import { createStore } from "./zustand.ts";

function flight<R> (): Flight<R> {

    const { promise, resolve } = Promise.withResolvers<R | undefined>();

    return { controller: new AbortController(), promise, settle: resolve };

}

export function action<I, R> ( perform: ( input: I, signal: AbortSignal ) => Promise<R>, options: ActionOptions = {} ): Action<I, R> {

    const store = createStore<ActionState<R>>(() => ({ status: "idle", result: undefined, error: undefined, runs: 0 }));
    let current: Flight<R> | undefined;
    const cancel = (): void => {

        const gone = current;

        current = undefined;
        gone?.controller.abort();

    };
    const work = async ( input: I, mine: Flight<R> ): Promise<void> => {

        const done = await exception.attempt(() => event.race(perform(input, mine.controller.signal), mine.controller.signal));

        if ( !done.ok ) {

            if ( current === mine ) {

                current = undefined;
                store.setState({ status: "failed", error: done.fault });

            }

            mine.settle(undefined);

            return;

        }

        const result = done.value;

        if ( current !== mine ) {

            mine.settle(undefined);

            return;

        }

        current = undefined;
        store.setState({ status: "done", result, error: undefined });
        mine.settle(result);

    };

    return Object.assign(store, {
        run: ( input: I ) => {

            if ( options.mode === "first" && current ) return current.promise;

            cancel();

            const mine = flight<R>();

            current = mine;
            store.setState({ status: "running", error: undefined, runs: store.getState().runs + 1 });

            if ( current === mine ) void work(input, mine);
            else mine.settle(undefined);

            return mine.promise;

        },
        abort: () => {

            if ( !current ) return;

            cancel();
            store.setState({ status: store.getState().result === undefined ? "idle" : "done" });

        },
        reset: () => {

            cancel();
            store.setState({ status: "idle", result: undefined, error: undefined });

        },
    });

}
