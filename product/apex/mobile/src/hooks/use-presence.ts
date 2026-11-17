import { useEffect, useState } from "react";

export type Presence = { mounted: boolean; leaving: boolean };
export type Leaving<T> = { item: T; open: boolean };

export function usePresence ( shown: boolean, ms: number ): Presence {

    const [last, setLast] = useState(shown);
    const [leaving, setLeaving] = useState(false);

    if ( shown !== last ) {

        setLast(shown);
        setLeaving(!shown && ms > 0);

    }

    useEffect(() => {

        if ( !leaving ) return undefined;

        const timer = setTimeout(() => setLeaving(false), ms);

        return () => clearTimeout(timer);

    }, [leaving, ms]);

    return { mounted: shown || leaving, leaving: leaving && !shown };

}
export function useLeaving<T extends { key: string | number }> ( items: readonly T[], ms: number ): readonly Leaving<T>[] {

    const [last, setLast] = useState(items);
    const [gone, setGone] = useState<readonly T[]>([]);

    if ( items !== last ) {

        const held = new Set(items.map(( item ) => item.key));
        const left = [...gone, ...last].filter(( item, index, all ) => !held.has(item.key) && all.findIndex(( other ) => other.key === item.key) === index);

        setLast(items);

        if ( ms > 0 && (left.length > 0 || gone.length > 0) ) setGone(left);

    }

    useEffect(() => {

        if ( gone.length === 0 ) return undefined;

        const timer = setTimeout(() => setGone([]), ms);

        return () => clearTimeout(timer);

    }, [gone, ms]);

    return [...items.map(( item ) => ({ item, open: true })), ...gone.map(( item ) => ({ item, open: false }))];

}
