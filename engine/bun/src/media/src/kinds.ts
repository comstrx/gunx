import type { Kind } from "./arch.ts";

const known: readonly Kind[] = ["image", "video", "audio"];

export function kindOf ( type: string ): Kind | undefined {

    const family = typeof type === "string" ? type.slice(0, Math.max(0, type.indexOf("/"))).toLowerCase() : "";

    return known.find(( kind ) => kind === family);

}
export function kindsOf ( accept: readonly string[] | undefined ): Kind[] {

    const named = new Set((accept ?? []).map(kindOf));

    return known.filter(( kind ) => named.has(kind));

}
