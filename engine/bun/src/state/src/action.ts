import * as error from "engine-error";
import * as event from "engine-event";
import { createStore, type StoreApi } from "./zustand.ts";

export type Status = "idle" | "running" | "done" | "failed";
export type ActionState<R> = { status: Status; result: R | undefined; error: error.Fault | undefined; runs: number };
export type ActionOptions = { mode?: "latest" | "first" | undefined };
export type Action<I, R> = StoreApi<ActionState<R>> & {
    run: ( input: I ) => Promise<R | undefined>;
    abort: () => void;
    reset: () => void;
};

type Flight<R> = { controller: AbortController; promise: Promise<R | undefined>; settle: ( value: R | undefined ) => void };

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

        let result: R;

        try {

            result = await event.race(perform(input, mine.controller.signal), mine.controller.signal);

        } catch ( caught ) {

            if ( current === mine ) {

                current = undefined;
                store.setState({ status: "failed", error: error.of(caught) });

            }

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
