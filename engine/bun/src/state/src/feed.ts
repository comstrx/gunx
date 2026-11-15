import * as error from "engine-error";
import * as event from "engine-event";
import type { Feed, FeedOptions, FeedState, FeedFlight as Flight, Page, Settled } from "./arch.ts";
import { createStore } from "./zustand.ts";

function flight ( before: Settled ): Flight {

    const { promise, resolve } = Promise.withResolvers<void>();

    return { controller: new AbortController(), promise, settle: () => resolve(), before };

}
function page<T> ( found: unknown ): Page<T> {

    const { items, next } = (typeof found === "object" && found !== null ? found : {}) as { items?: unknown; next?: unknown };

    if ( !Array.isArray(items) || (next !== null && typeof next !== "string") ) throw error.fault("internal", "feed.page", { message: "not a page" });

    return { items: items as T[], next };

}

export function feed<T> ( options: FeedOptions<T> ): Feed<T> {

    const { load, key } = options;
    const empty: FeedState<T> = { items: [], next: null, ended: false, status: "idle", failure: undefined };
    const store = createStore<FeedState<T>>(() => empty);
    let seen = new Set<string>();
    let current: Flight | undefined;
    const cancel = (): Flight | undefined => {

        const gone = current;

        current = undefined;
        gone?.controller.abort();

        return gone;

    };
    const unseen = ( found: readonly T[], known: Set<string> ): T[] => {

        const fresh: T[] = [];

        for ( const item of found ) {

            const id = key(item);

            if ( known.has(id) ) continue;

            known.add(id);
            fresh.push(item);

        }

        return fresh;

    };
    const work = async ( mine: Flight, fresh: boolean ): Promise<void> => {

        let found: Page<T>;
        let added: T[];
        let known: Set<string>;

        try {

            const loaded = await event.race(load(fresh ? null : store.getState().next, mine.controller.signal), mine.controller.signal);

            if ( current !== mine ) {

                mine.settle();

                return;

            }

            found = page<T>(loaded);
            known = fresh ? new Set<string>() : new Set(seen);
            added = unseen(found.items, known);

        } catch ( thrown ) {

            if ( current === mine ) {

                current = undefined;
                store.setState({ status: "failed", failure: error.of(thrown) });

            }

            mine.settle();

            return;

        }

        if ( current !== mine ) {

            mine.settle();

            return;

        }

        current = undefined;
        seen = known;

        const { items } = store.getState();

        store.setState({ items: fresh ? added : added.length ? [...items, ...added] : items, next: found.next, ended: found.next === null, status: "done" });
        mine.settle();

    };
    const start = ( fresh: boolean ): Promise<void> => {

        const gone = cancel();
        const { status, failure } = store.getState();
        const mine = flight(gone ? gone.before : { status, failure });

        current = mine;
        store.setState({ status: fresh ? "refreshing" : "loading", failure: undefined });

        if ( current === mine ) void work(mine, fresh);
        else mine.settle();

        return mine.promise;

    };

    return Object.assign(store, {
        more: () => {

            if ( current ) return current.promise;

            return store.getState().ended ? Promise.resolve() : start(false);

        },
        refresh: () => start(true),
        put: ( item: T, at: "start" | "end" = "start" ) => {

            const id = key(item);
            const { items } = store.getState();

            if ( seen.has(id) ) store.setState({ items: items.map(( found ) => (key(found) === id ? item : found)) });
            else {

                seen.add(id);
                store.setState({ items: at === "end" ? [...items, item] : [item, ...items] });

            }

        },
        drop: ( id: string ) => {

            if ( !seen.has(id) ) return;

            seen.delete(id);
            store.setState({ items: store.getState().items.filter(( found ) => key(found) !== id) });

        },
        abort: () => {

            const gone = cancel();

            if ( gone ) store.setState(gone.before);

        },
        reset: () => {

            cancel();
            seen = new Set<string>();
            store.setState(empty);

        },
    });

}
