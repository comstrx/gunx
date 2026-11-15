import type * as cache from "engine-cache";
import type * as error from "engine-error";
import type * as state from "engine-state";

export type Mode = "all" | "any";
export type Holder = { abilities?: readonly string[] | undefined; roles?: readonly string[] | undefined } | null | undefined;
export type Tokens = { access: string; refresh?: string | undefined; expires?: number | undefined };
export type Signed<U> = { tokens: Tokens | null; user: U | null; since: number | null };
export type Renew = ( refresh: string, signal: AbortSignal ) => Promise<Tokens>;
export type SessionOptions = {
    name: string;
    box: cache.Box;
    renew?: Renew | undefined;
    skew?: number | undefined;
    now?: (() => number) | undefined;
    sync?: boolean | undefined;
    version?: number | undefined;
    fail?: (( fault: error.Fault ) => void) | undefined;
};
export type SessionMoves<U> = { begin: ( tokens: Tokens, user: U ) => void; end: () => void; renewed: ( tokens: Tokens ) => void; update: ( user: U ) => void };
export type Session<U> = {
    state: state.Instance<Signed<U>, SessionMoves<U>>;
    begin: ( tokens: Tokens, user: U ) => void;
    end: () => void;
    update: ( user: U ) => void;
    signed: () => boolean;
    user: () => U | null;
    token: () => Promise<string | null>;
    renew: () => Promise<string | null>;
    expiresIn: () => number | undefined;
    watch: ( listener: ( user: U | null ) => void ) => () => void;
    hydrate: () => Promise<void>;
    flush: () => Promise<void>;
};
export type Renewing = { controller: AbortController; tokens: Tokens };
