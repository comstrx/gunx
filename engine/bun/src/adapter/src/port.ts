import * as error from "engine-error";

export type Options<T> = { fallback?: (() => T) | undefined; check?: (( value: T ) => boolean) | undefined };
export type Listener = () => void;
export type Port<T> = {
    readonly name: string;
    use: ( value: T ) => () => void;
    lazy: ( make: () => T ) => () => void;
    get: () => T;
    peek: () => T | undefined;
    has: () => boolean;
    bound: () => boolean;
    reset: () => void;
    with: <R>( value: T, work: () => R ) => R;
    watch: ( listener: Listener ) => () => void;
};
export type AnyPort = {
    readonly name: string;
    use: ( value: never ) => () => void;
    get: () => unknown;
    peek: () => unknown;
    has: () => boolean;
    bound: () => boolean;
    reset: () => void;
    watch: ( listener: Listener ) => () => void;
};
export type Family<T> = {
    readonly name: string;
    add: ( kind: string, value: T ) => () => void;
    lazy: ( kind: string, make: () => T ) => () => void;
    pick: ( kind?: string ) => T;
    peek: ( kind?: string ) => T | undefined;
    has: ( kind: string ) => boolean;
    prefer: ( kind: string ) => void;
    preferred: () => string | undefined;
    kinds: () => string[];
    reset: () => void;
};

type Slot<T> = { make: () => T; value?: T | undefined; made: boolean; making: boolean };

function deferred<T> ( make: () => T ): Slot<T> {

    return { make, made: false, making: false };

}
function held<T> ( value: T ): Slot<T> {

    return { make: () => value, value, made: true, making: false };

}
function realize<T> ( slot: Slot<T> ): T {

    if ( slot.made ) return slot.value as T;

    slot.making = true;

    try {

        slot.value = slot.make();
        slot.made = true;

    } finally {

        slot.making = false;

    }

    return slot.value as T;

}
function live<T> ( stack: readonly Slot<T>[] ): Slot<T> | undefined {

    for ( let at = stack.length - 1; at >= 0; at -= 1 ) if ( !stack[at]?.making ) return stack[at];

    return undefined;

}
function passes<T> ( check: (( value: T ) => boolean) | undefined, value: T ): boolean {

    try {

        return check === undefined || check(value);

    } catch {

        return false;

    }

}
function thenable ( value: unknown ): value is PromiseLike<unknown> {

    return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";

}
export function drain ( works: readonly (() => void)[] ): void {

    const failed: unknown[] = [];

    for ( const work of works ) {

        try {

            work();

        } catch ( caught ) {

            failed.push(caught);

        }

    }

    if ( failed.length > 0 ) throw failed[0];

}
export function scoped<R> ( restore: () => void, work: () => R ): R {

    let result: R;

    try {

        result = work();

    } catch ( caught ) {

        restore();

        throw caught;

    }

    if ( thenable(result) ) return Promise.resolve(result).finally(restore) as R;

    restore();

    return result;

}
export function port<T> ( name: string, options: Options<T> = {} ): Port<T> {

    const listeners = new Set<Listener>();
    const stack: Slot<T>[] = [];
    let fallback = options.fallback ? deferred(options.fallback) : undefined;
    const current = (): Slot<T> | undefined => live(stack) ?? (fallback && !fallback.making ? fallback : undefined);
    const notify = (): void => drain([...listeners]);
    const checked = ( value: T ): T => {

        if ( passes(options.check, value) ) return value;

        throw error.fault("internal", `${name}.rejected`, { message: `${name}: the given adapter does not pass the port's check` });

    };
    const drop = ( slot: Slot<T> ): boolean => {

        const at = stack.lastIndexOf(slot);

        if ( at !== -1 ) stack.splice(at, 1);

        return at !== -1;

    };
    const bind = ( next: Slot<T> ): (() => void) => {

        stack.push(next);

        try {

            notify();

        } catch ( caught ) {

            if ( drop(next) ) error.attemptSync(notify);

            throw caught;

        }

        return () => {

            if ( drop(next) ) notify();

        };

    };
    const made: Port<T> = {
        name,
        use: ( value ) => bind(held(checked(value))),
        lazy: ( make ) => bind(deferred(() => checked(make()))),
        get: () => {

            const slot = current();

            if ( slot ) return realize(slot);

            throw error.fault("unavailable", `${name}.unbound`, { message: `${name}: no adapter is bound to this port on this runtime` });

        },
        peek: () => {

            const slot = current();

            return slot ? realize(slot) : undefined;

        },
        has: () => stack.length > 0 || fallback !== undefined,
        bound: () => stack.length > 0,
        reset: () => {

            stack.length = 0;
            fallback = options.fallback ? deferred(options.fallback) : undefined;
            notify();

        },
        with: ( value, work ) => scoped(made.use(value), work),
        watch: ( listener ) => {

            listeners.add(listener);

            return () => {

                listeners.delete(listener);

            };

        },
    };

    return made;

}
export function family<T> ( name: string ): Family<T> {

    const stacks = new Map<string, Slot<T>[]>();
    let chosen: string | undefined;
    const resolve = ( kind: string | undefined ): string | undefined => kind ?? chosen ?? stacks.keys().next().value;
    const find = ( kind: string | undefined ): Slot<T> | undefined => live(stacks.get(resolve(kind) ?? "") ?? []);
    const bind = ( kind: string, slot: Slot<T> ): (() => void) => {

        const stack = stacks.get(kind) ?? [];

        stack.push(slot);
        stacks.set(kind, stack);

        return () => {

            const at = stacks.get(kind) === stack ? stack.lastIndexOf(slot) : -1;

            if ( at === -1 ) return;

            stack.splice(at, 1);

            if ( stack.length === 0 ) stacks.delete(kind);

        };

    };

    return {
        name,
        add: ( kind, value ) => bind(kind, held(value)),
        lazy: ( kind, make ) => bind(kind, deferred(make)),
        pick: ( kind ) => {

            const slot = find(kind);

            if ( slot ) return realize(slot);

            const key = resolve(kind) ?? "default";

            throw error.fault("unavailable", `${name}.unknown`, { message: `${name}: no adapter is registered as ${key}`, errors: { kind: [key] } });

        },
        peek: ( kind ) => {

            const slot = find(kind);

            return slot ? realize(slot) : undefined;

        },
        has: ( kind ) => stacks.has(kind),
        prefer: ( kind ) => {

            chosen = kind;

        },
        preferred: () => resolve(undefined),
        kinds: () => [...stacks.keys()].sort(),
        reset: () => {

            stacks.clear();
            chosen = undefined;

        },
    };

}
