import type { Listener, Slot, SlotOptions } from "./arch.ts";
import { fault } from "./fault.ts";
import { probe, thenable } from "./probe.ts";

export function scoped<R> ( restore: () => void, work: () => R ): R {

    let result: R;

    try {

        result = work();

        if ( thenable(result) ) return Promise.resolve(result).finally(restore) as R;

    } catch ( caught ) {

        restore();

        throw caught;

    }

    restore();

    return result;

}
export function slot<T> ( name: string, options: SlotOptions<T> = {} ): Slot<T> {

    const listeners = new Set<Listener>();
    const stack: T[] = [];

    let spare: { value: T } | undefined;

    const checked = ( value: T ): T => {

        if ( options.check === undefined || probe(() => options.check?.(value)) === true ) return value;

        throw fault("internal", `${name}.rejected`, { message: `${name}: the given value does not pass this slot's check` });

    };
    const notify = (): void => {

        for ( const listener of [...listeners] ) probe(listener);

    };
    const fallen = (): T | undefined => {

        if ( spare === undefined && options.fallback !== undefined ) {

            const found = options.fallback();

            if ( found !== undefined ) spare = { value: checked(found) };

        }

        return spare?.value;

    };
    const peek = (): T | undefined => (stack.length > 0 ? stack[stack.length - 1] : fallen());
    const use = ( value: T ): (() => void) => {

        const entry = checked(value);

        stack.push(entry);
        notify();

        return () => {

            const at = stack.lastIndexOf(entry);

            if ( at === -1 ) return;

            stack.splice(at, 1);
            notify();

        };

    };

    return {
        name,
        use,
        with: ( value, work ) => scoped(use(value), work),
        get: () => {

            const found = peek();

            if ( found !== undefined ) return found;

            throw fault("unavailable", `${name}.unbound`, { message: `${name}: nothing is bound here and this runtime offers no default` });

        },
        peek,
        has: () => stack.length > 0 || options.fallback !== undefined,
        bound: () => stack.length > 0,
        reset: () => {

            stack.length = 0;
            spare = undefined;
            notify();

        },
        watch: ( listener ) => {

            listeners.add(listener);

            return () => {

                listeners.delete(listener);

            };

        },
    };

}
