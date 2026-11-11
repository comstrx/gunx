import * as error from "engine-error";
import type { Host } from "./host.ts";

export type Runtime = "browser" | "worker" | "native" | "bun" | "node" | "deno" | "edge" | "unknown";
export type Facts = { runtime: Runtime; server: boolean; document: boolean; hermes: boolean; agent: string };
export type Members = Record<string, unknown>;

const servers: ReadonlySet<Runtime> = new Set(["bun", "node", "deno", "edge"]);

export function probe<T> ( read: () => T ): T | undefined {

    try {

        return read();

    } catch {

        return undefined;

    }

}
export async function probeAsync<T> ( read: () => PromiseLike<T> | T ): Promise<T | undefined> {

    try {

        return await read();

    } catch {

        return undefined;

    }

}
export function available ( ...names: readonly string[] ): boolean {

    const target = globalThis as unknown as Record<string, unknown>;

    return names.every(( name ) => probe(() => target[name]) !== undefined);

}
export function runtime ( target: Host = globalThis as unknown as Host ): Facts {

    const hermes = target.HermesInternal !== undefined;
    const agent = probe(() => target.navigator?.userAgent) ?? "";
    const document = target.document !== undefined;
    const pick = (): Runtime => {

        if ( probe(() => target.navigator?.product) === "ReactNative" ) return "native";
        if ( target.Bun !== undefined ) return "bun";
        if ( target.Deno !== undefined ) return "deno";
        if ( typeof target.EdgeRuntime === "string" || agent === "Cloudflare-Workers" ) return "edge";
        if ( probe(() => target.process?.versions?.node) !== undefined ) return "node";
        if ( document && target.window !== undefined ) return "browser";
        if ( target.importScripts !== undefined || target.WorkerGlobalScope !== undefined ) return "worker";

        return "unknown";

    };
    const kind = pick();

    return { runtime: kind, server: servers.has(kind), document, hermes, agent };

}
function named ( adapter: Members ): string[] {

    const found = new Set<string>();

    for ( let cursor: object | null = adapter; cursor !== null && cursor !== Object.prototype; cursor = Object.getPrototypeOf(cursor) as object | null ) for ( const key of Object.getOwnPropertyNames(cursor) ) found.add(key);

    return [...found];

}
export function can ( adapter: Members, capability: string ): boolean {

    if ( capability in Object.prototype && !Object.hasOwn(adapter, capability) ) return false;

    const value = probe(() => adapter[capability]);

    return value !== undefined && value !== null;

}
export function capabilities ( adapter: Members ): string[] {

    return named(adapter).filter(( key ) => can(adapter, key)).sort();

}
export function ensure ( adapter: Members, capability: string, family: string ): void {

    if ( can(adapter, capability) ) return;

    throw error.fault("unavailable", `${family}.${capability}`, { message: `${family}: this adapter cannot ${capability}`, errors: { capability: [capability] } });

}
export function fill<T extends object> ( given: { [K in keyof T]?: T[K] | undefined }, defaults: T ): T {

    const out = { ...defaults };

    for ( const [key, value] of Object.entries(given) ) if ( value !== undefined && key !== "__proto__" ) (out as Record<string, unknown>)[key] = value;

    return out;

}
