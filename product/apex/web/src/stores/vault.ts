import * as cache from "engine/cache";
import type { Kind } from "@/api/vault.ts";
import { host } from "@/specs/app.ts";

export type Shelf = { kind: Kind; volatile: boolean; box: cache.Box };

const key = "count";
const made = host.own(() => new Map<Kind, Shelf>());

export function shelf ( kind: Kind ): Shelf {

    const held = made();
    const known = held.get(kind);

    if ( known ) return known;

    const found: Shelf = { kind, volatile: cache.volatile(kind), box: cache.open({ kind, prefix: `${host.app.id}.vault` }) };

    held.set(kind, found);

    return found;

}
export function count ( kind: Kind ): Promise<number | undefined> {

    return shelf(kind).box.get<number>(key);

}
export function bump ( kind: Kind ): Promise<number | undefined> {

    return shelf(kind).box.update<number>(key, ( current ) => (current ?? 0) + 1);

}
export async function expire ( kind: Kind, seconds: number ): Promise<boolean> {

    return shelf(kind).box.touch(key, { ttl: seconds });

}
export function clear ( kind: Kind ): Promise<void> {

    return shelf(kind).box.remove(key);

}
