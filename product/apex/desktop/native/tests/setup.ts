import { mock } from "bun:test";

type Handler = ( params: unknown ) => unknown;
type Defined = { handlers: { requests?: Record<string, Handler> | undefined; messages?: Record<string, Handler> | undefined } };

export const calls: { name: string; args: unknown[] }[] = [];
export const windows: { title: string; shown: boolean }[] = [];

export function proxyOf ( config: Defined ): { config: Defined; request: Record<string, Handler>; send: Record<string, Handler>; setTransport: () => void } {

    const request = new Proxy({} as Record<string, Handler>, { get: ( _target, name ) => ( params: unknown ) => Promise.resolve({ name, params }) });
    const send = new Proxy({} as Record<string, Handler>, {
        get: ( _target, name ) => ( payload: unknown ) => {

            calls.push({ name: `send:${String(name)}`, args: [payload] });

        },
    });

    return { config, request, send, setTransport: () => undefined };

}

class BrowserWindow {

    title: string;
    shown = false;
    constructor ( options: { title: string } ) {

        this.title = options.title;
        windows.push(this);

    }
    setTitle ( title: string ): void {

        this.title = title;

    }
    show (): void {

        this.shown = true;

    }

}
class Electroview<T> {

    rpc?: T | undefined;
    constructor ( config: { rpc: T } ) {

        this.rpc = config.rpc;

    }
    static defineRPC ( config: Defined ) {

        return proxyOf(config);

    }

}

const Utils = {
    openExternal: ( url: string ) => {

        calls.push({ name: "openExternal", args: [url] });

        return true;

    },
};

mock.module("electrobun/main", () => ({ BrowserWindow, BrowserView: { defineRPC: proxyOf }, Utils }));
mock.module("electrobun/main/paths", () => ({ VIEWS_FOLDER: "/views" }));
mock.module("electrobun/view", () => ({ Electroview }));
