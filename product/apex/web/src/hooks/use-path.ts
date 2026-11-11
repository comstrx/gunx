import * as history from "engine/history";
import { useMemo, useSyncExternalStore } from "react";

type Query = history.Entry["query"];

const none: Query = {};

let made: history.History | undefined;

export function navigator (): history.History {

    made ??= history.create();

    return made;

}
function subscribe ( listener: () => void ): () => void {

    return navigator().listen(listener);

}
function current (): string {

    return navigator().current().path;

}
function href (): string {

    return navigator().current().href;

}
export function usePath ( initial = "/" ): string {

    return useSyncExternalStore(subscribe, current, () => initial);

}
export function useQuery (): Query {

    const at = useSyncExternalStore(subscribe, href, () => "");

    return useMemo(() => {

        const found = at ? navigator().current().query : none;

        return Object.keys(found).length ? found : none;

    }, [at]);

}
export function navigate ( path: string ): void {

    navigator().push(path);

}
