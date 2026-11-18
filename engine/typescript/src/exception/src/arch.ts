import type * as error from "engine-error";

export type Plain = Record<string, unknown>;
export type Result<T> = { ok: true; value: T } | { ok: false; fault: error.Failure };
export type Arms<R> = { readonly [K in error.Code]?: ( fault: error.Failure ) => R } & { readonly else: ( fault: error.Failure ) => R };
export type Listener = () => void;
export type SlotOptions<T> = { fallback?: (() => T | undefined) | undefined; check?: (( value: T ) => boolean) | undefined };
export type Slot<T> = {
    readonly name: string;
    use: ( value: T ) => () => void;
    with: <R>( value: T, work: () => R ) => R;
    get: () => T;
    peek: () => T | undefined;
    has: () => boolean;
    bound: () => boolean;
    reset: () => void;
    watch: ( listener: Listener ) => () => void;
};
