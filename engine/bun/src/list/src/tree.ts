import { type Key, keyOf } from "./core.ts";

export type Branch<T> = { item: T; depth: number; children: Branch<T>[] };

function looped<T> ( branch: Branch<T>, above: ReadonlyMap<Branch<T>, Branch<T>> ): Branch<T> {

    const trail = new Set<Branch<T>>();
    let at = branch;

    while ( !trail.has(at) ) {

        trail.add(at);
        at = above.get(at) ?? at;

    }

    return at;

}

export function nest<T> ( items: readonly T[], key: Key<T>, parent: Key<T> ): Branch<T>[] {

    const branches = items.map(( item ): Branch<T> => ({ item, depth: 0, children: [] }));
    const seats = new Map<unknown, Branch<T>>();
    const above = new Map<Branch<T>, Branch<T>>();
    const seen = new Set<Branch<T>>();
    const roots: Branch<T>[] = [];

    for ( const branch of branches ) {

        const name = keyOf(branch.item, key);

        if ( name !== null && name !== undefined && !seats.has(name) ) seats.set(name, branch);

    }

    for ( const branch of branches ) {

        const name = keyOf(branch.item, parent);
        const holder = name === null || name === undefined ? undefined : seats.get(name);

        if ( holder === undefined || holder === branch ) {

            roots.push(branch);

            continue;

        }

        holder.children.push(branch);
        above.set(branch, holder);

    }

    const settle = ( root: Branch<T> ): void => {

        const queue = [root];

        root.depth = 0;

        for ( let at = 0; at < queue.length; at += 1 ) {

            const branch = queue[at] as Branch<T>;

            seen.add(branch);

            for ( const child of branch.children ) {

                child.depth = branch.depth + 1;
                queue.push(child);

            }

        }

    };

    roots.forEach(settle);

    for ( const branch of branches ) {

        if ( seen.has(branch) ) continue;

        const head = looped(branch, above);
        const holder = above.get(head);

        if ( holder ) holder.children.splice(holder.children.indexOf(head), 1);

        above.delete(head);
        roots.push(head);
        settle(head);

    }

    return roots;

}
export function unnest<T> ( branches: readonly Branch<T>[] ): Branch<T>[] {

    const out: Branch<T>[] = [];
    const seen = new Set<Branch<T>>();
    const stack = [...branches].reverse();

    while ( stack.length > 0 ) {

        const branch = stack.pop() as Branch<T>;

        if ( seen.has(branch) ) continue;

        seen.add(branch);
        out.push(branch);

        for ( let index = branch.children.length - 1; index >= 0; index -= 1 ) stack.push(branch.children[index] as Branch<T>);

    }

    return out;

}
