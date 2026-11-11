import { useRef, useSyncExternalStore } from "react";
import { type Equal, readable, type Source, shallow } from "./derive.ts";

export type Binding<T> = {
    useSelect: <R>( select: ( state: T ) => R, equal?: Equal<R> ) => R;
    usePick: <K extends keyof T>( ...keys: readonly K[] ) => Pick<T, K>;
    useState: () => T;
    select: <R>( select: ( state: T ) => R ) => R;
};

type Memo<T, R> = { state: T; select: ( state: T ) => R; value: R };

function part<T, K extends keyof T> ( state: T, keys: readonly K[] ): Pick<T, K> {

    const out = {} as Pick<T, K>;

    for ( const key of keys ) out[key] = state[key];

    return out;

}
export function bind<T> ( source: Source<T>, server?: () => T ): Binding<T> {

    const store = readable(source);
    const first = server ?? store.getState;

    const useSelect = <R>( select: ( state: T ) => R, equal: Equal<R> = Object.is ): R => {

        const last = useRef<Memo<T, R> | undefined>(undefined);
        const read = ( state: T ): R => {

            const memo = last.current;

            if ( memo && memo.select === select && Object.is(memo.state, state) ) return memo.value;

            const next = select(state);
            const value = memo && equal(memo.value, next) ? memo.value : next;

            last.current = { state, select, value };

            return value;

        };

        return useSyncExternalStore(store.subscribe, () => read(store.getState()), () => read(first()));

    };

    return {
        useSelect,
        usePick: ( ...keys ) => useSelect(( state ) => part(state, keys), shallow),
        useState: () => useSelect(( state ) => state),
        select: ( select ) => select(store.getState()),
    };

}
