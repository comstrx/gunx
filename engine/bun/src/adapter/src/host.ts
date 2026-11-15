import * as error from "engine-error";
import type { Host } from "./arch.ts";
import { probe } from "./runtime.ts";

export function host (): Host {

    return globalThis as unknown as Host;

}
export function web<T> ( name: string, make: ( given: Host ) => T | undefined, otherwise?: () => T ): () => T {

    return () => {

        const found = probe(() => make(host()));

        if ( found !== undefined ) return found;
        if ( otherwise ) return otherwise();

        throw error.fault("unavailable", name, { message: `${name}: the host does not answer; bind the port` });

    };

}
