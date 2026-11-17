import * as exception from "engine-exception";
import type { Facts, Host, Runtime } from "./arch.ts";

const servers: ReadonlySet<Runtime> = new Set(["bun", "node", "deno", "edge"]);

export function host<T = Host> (): T {

    return globalThis as unknown as T;

}
export function runtime ( target: Host = host() ): Facts {

    const hermes = target.HermesInternal !== undefined;
    const agent = exception.probe(() => target.navigator?.userAgent) ?? "";
    const document = target.document !== undefined;
    const pick = (): Runtime => {

        if ( exception.probe(() => target.navigator?.product) === "ReactNative" ) return "native";
        if ( target.Bun !== undefined ) return "bun";
        if ( target.Deno !== undefined ) return "deno";
        if ( typeof target.EdgeRuntime === "string" || agent === "Cloudflare-Workers" ) return "edge";
        if ( exception.probe(() => target.process?.versions?.node) !== undefined ) return "node";
        if ( document && target.window !== undefined ) return "browser";
        if ( target.importScripts !== undefined || target.WorkerGlobalScope !== undefined ) return "worker";

        return "unknown";

    };
    const kind = pick();

    return { runtime: kind, server: servers.has(kind), document, hermes, agent };

}
