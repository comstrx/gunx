import * as error from "engine-error";
import type { Binding, Equal, Memo, Renderer, Source } from "./arch.ts";
import { readable, shallow } from "./derive.ts";

function part<T, K extends keyof T> ( state: T, keys: readonly K[] ): Pick<T, K> {

    const out = {} as Pick<T, K>;

    for ( const key of keys ) out[key] = state[key];

    return out;

}
export function bind<T> ( source: Source<T>, server?: () => T, using?: Renderer ): Binding<T> {

    const store = readable(source);
    const first = server ?? store.getState;

    const useSelect = <R>( select: ( state: T ) => R, equal: Equal<R> = Object.is ): R => {

        if ( using === undefined ) throw error.fault("unavailable", "state.renderer", { message: "a state binding needs a surface renderer" });

        const last = using.ref<Memo<T, R> | undefined>(undefined);
        const read = ( state: T ): R => {

            const memo = last.current;

            if ( memo && memo.select === select && Object.is(memo.state, state) ) return memo.value;

            const next = select(state);
            const value = memo && equal(memo.value, next) ? memo.value : next;

            last.current = { state, select, value };

            return value;

        };

        return using.read(store.subscribe, () => read(store.getState()), () => read(first()));

    };

    return {
        useSelect,
        usePick: ( ...keys ) => useSelect(( state ) => part(state, keys), shallow),
        useState: () => useSelect(( state ) => state),
        select: ( select ) => select(store.getState()),
    };

}
