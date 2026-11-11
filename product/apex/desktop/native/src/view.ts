import type { Bridge, Marks, Requests } from "./contract.ts";
import { timeout } from "./contract.ts";

type Schema = { bun: { requests: Requests; messages: Marks }; webview: { requests: Record<never, never>; messages: Record<never, never> } };
type Marked = { __electrobunWebviewId?: number | undefined };

export function inside (): boolean {

    return (globalThis as Marked).__electrobunWebviewId !== undefined;

}
export async function connect (): Promise<Bridge | null> {

    if ( !inside() ) return null;

    const { Electroview } = await import("electrobun/view");
    const rpc = Electroview.defineRPC<Schema>({ maxRequestTime: timeout, handlers: { requests: {}, messages: {} } });
    const view = new Electroview({ rpc });
    const live = view.rpc ?? rpc;

    return {
        ask: ( name, params ) => live.request[name](params as never) as Promise<never>,
        tell: ( name, payload ) => {

            live.send[name](payload);

        },
    };

}
