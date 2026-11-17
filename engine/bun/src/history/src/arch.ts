import type * as parse_ from "engine-parse";

export type Href = { path: string; query: parse_.Query; hash: string };
export type Target = string | Partial<Href>;
export type Action = "push" | "replace" | "pop";
export type Entry = Href & { href: string; state: unknown; index: number };
export type Listener = ( entry: Entry, action: Action, previous: Entry ) => void;
export type Block = ( next: Entry, previous: Entry, action: Action ) => boolean;
export type Saved = { href: string; state: unknown };
export type Snapshot = { entries: readonly Saved[]; index: number };
export type Adapter = {
    read: () => Saved;
    push: ( href: string, state: unknown ) => void;
    replace: ( href: string, state: unknown ) => void;
    go: ( delta: number ) => void;
    listen: ( onPop: ( state: unknown ) => void ) => () => void;
};
export type Memory = Adapter & { entries: () => string[]; snapshot: () => Snapshot };
export type History = {
    current: () => Entry;
    push: ( to: Target, state?: unknown ) => Entry;
    replace: ( to: Target, state?: unknown ) => Entry;
    back: () => void;
    forward: () => void;
    go: ( delta: number ) => void;
    listen: ( listener: Listener ) => () => void;
    block: ( blocked: Block ) => () => void;
    href: ( to: Target ) => string;
    isCurrent: ( path: string, exact?: boolean ) => boolean;
    destroy: () => void;
};
export type Held = { at: number | undefined; state: unknown };
export type Seen = { href: string; state: unknown; entry: Entry };
export type Failed = { failure: unknown };
export type Patch = Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>;
export type Host = {
    location?: { pathname: string; search: string; hash: string };
    history?: { state: unknown; pushState: ( state: unknown, title: string, href: string ) => void; replaceState: ( state: unknown, title: string, href: string ) => void; go: ( delta: number ) => void };
    addEventListener?: ( name: "popstate", handler: ( event: { state: unknown } ) => void ) => void;
    removeEventListener?: ( name: "popstate", handler: ( event: { state: unknown } ) => void ) => void;
};
