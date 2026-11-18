import * as json from "engine-json";
import type * as parse from "engine-parse";
import type { Block, Entry, History, Patch } from "./arch.ts";

export function guard ( nav: History, blocked: Block ): () => void {

    return nav.block(blocked);

}
export function patchQuery ( nav: History, patch: Patch, action: "push" | "replace" = "replace" ): Entry {

    const current = nav.current();
    const query: parse.Query = { ...current.query };

    for ( const [key, value] of Object.entries(patch) ) {

        if ( !json.safeKey(key) ) continue;

        if ( value === null || value === undefined ) delete query[key];
        else query[key] = Array.isArray(value) ? value.map(String) : String(value);

    }

    return nav[action]({ path: current.path, query, hash: current.hash }, action === "replace" ? current.state : null);

}
