import * as exception from "engine-exception";
import type { Registry } from "./arch.ts";

export function registry<T> ( name: string ): Registry<T> {

    const stacks = new Map<string, { make: () => T; made?: { value: T } }[]>();
    const preferred = exception.slot<string>(name);
    let chosen: string | undefined;
    const resolve = ( kind: string | undefined ): string | undefined => kind ?? preferred.peek() ?? chosen ?? stacks.keys().next().value;
    const bind = ( kind: string, make: () => T ): (() => void) => {

        const stack = stacks.get(kind) ?? [];
        const entry = { make };

        stack.push(entry);
        stacks.set(kind, stack);

        return () => {

            const at = stacks.get(kind) === stack ? stack.lastIndexOf(entry) : -1;

            if ( at === -1 ) return;

            stack.splice(at, 1);

            if ( stack.length === 0 ) stacks.delete(kind);

        };

    };

    return {
        name,
        add: ( kind, value ) => bind(kind, () => value),
        lazy: bind,
        pick: ( kind ) => {

            const key = resolve(kind) ?? "default";
            const entry = stacks.get(key)?.at(-1);

            if ( entry === undefined ) throw exception.fault("unavailable", `${name}.unknown`, { message: `${name}: nothing is registered as ${key}`, errors: { kind: [key] } });

            entry.made ??= { value: entry.make() };

            return entry.made.value;

        },
        has: ( kind ) => stacks.has(kind),
        prefer: ( kind ) => {

            chosen = kind;
            preferred.reset();

        },
        use: ( kind ) => preferred.use(kind),
        preferred: () => resolve(undefined),
        kinds: () => [...stacks.keys()].sort(),
    };

}
