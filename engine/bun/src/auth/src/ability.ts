import * as error from "engine-error";

export type Mode = "all" | "any";
export type Holder = { abilities?: readonly string[] | undefined; roles?: readonly string[] | undefined } | null | undefined;

function covers ( held: string, wanted: string ): boolean {

    if ( held === "*" || held === wanted ) return true;

    return held.endsWith(".*") && wanted.startsWith(held.slice(0, -1));

}
export function granted ( held: readonly string[], required: readonly string[], mode: Mode = "all" ): boolean {

    const has = ( wanted: string ): boolean => held.some(( ability ) => covers(ability, wanted));

    return mode === "all" ? required.every(has) : required.some(has);

}
export function missing ( held: readonly string[], required: readonly string[] ): string[] {

    return required.filter(( wanted ) => !held.some(( ability ) => covers(ability, wanted)));

}
export function can ( holder: Holder, required: readonly string[] | string, mode: Mode = "all" ): boolean {

    const wanted = typeof required === "string" ? [required] : required;

    return wanted.length === 0 || granted(holder?.abilities ?? [], wanted, mode);

}
export function authorize ( holder: Holder, required: readonly string[] | string, mode: Mode = "all" ): void {

    const wanted = typeof required === "string" ? [required] : required;

    if ( !holder ) throw error.fault("unauthorized", "auth.guest");
    if ( !can(holder, wanted, mode) ) throw error.fault("forbidden", "auth.denied", { errors: { abilities: missing(holder.abilities ?? [], wanted) } });

}
export function hasRole ( holder: Holder, roles: readonly string[] | string, mode: Mode = "any" ): boolean {

    const wanted = typeof roles === "string" ? [roles] : roles;
    const held = holder?.roles ?? [];

    return mode === "any" ? wanted.some(( role ) => held.includes(role)) : wanted.every(( role ) => held.includes(role));

}
export function expand ( held: readonly string[], known: readonly string[] ): string[] {

    return known.filter(( ability ) => held.some(( owned ) => covers(owned, ability))).sort();

}
