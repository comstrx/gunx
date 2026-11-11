type RpcRequests = Record<string, { params: unknown; response: unknown }>;
type RpcMessages = Record<string, unknown>;
type RpcSide = { requests: RpcRequests; messages: RpcMessages };
type RpcInput = { requests?: RpcRequests | undefined; messages?: RpcMessages | undefined };
type RpcSchema<I extends RpcInput> = {
    requests: undefined extends I["requests"] ? RpcRequests : NonNullable<I["requests"]>;
    messages: undefined extends I["messages"] ? RpcMessages : NonNullable<I["messages"]>;
};
type RpcPair = { bun: RpcSide; webview: RpcSide };
type RpcOther<Side extends keyof RpcPair> = Side extends "bun" ? "webview" : "bun";
type RpcArguments<P> = undefined extends P ? [params?: P] : [params: P];
type RpcHandlers<S extends RpcPair, Side extends keyof RpcPair> = {
    maxRequestTime?: number | undefined;
    handlers: {
        requests?: {
            [K in keyof S[Side]["requests"]]?: (
                params: S[Side]["requests"][K]["params"],
            ) => S[Side]["requests"][K]["response"] | Promise<S[Side]["requests"][K]["response"]>;
        };
        messages?: { [K in keyof S[Side]["messages"]]?: ( payload: S[Side]["messages"][K] ) => void };
    };
};
type RpcProxy<S extends RpcPair, Side extends keyof RpcPair> = {
    request: {
        [K in keyof S[RpcOther<Side>]["requests"]]: (
            ...args: RpcArguments<S[RpcOther<Side>]["requests"][K]["params"]>
        ) => Promise<S[RpcOther<Side>]["requests"][K]["response"]>;
    };
    send: { [K in keyof S[RpcOther<Side>]["messages"]]: ( payload: S[RpcOther<Side>]["messages"][K] ) => void };
    setTransport: ( transport: unknown ) => void;
};

declare module "electrobun" {
    type Platform = { bundleCEF?: boolean | undefined; icon?: string | undefined };

    export type ElectrobunConfig = {
        app: { name: string; identifier: string; version: string; description?: string | undefined };
        build?: {
            mainProcess?: "bun" | "cottontail" | undefined;
            bun?: { entrypoint?: string | undefined; minify?: boolean | undefined; sourcemap?: boolean | undefined } | undefined;
            copy?: Record<string, string> | undefined;
            mac?: Platform | undefined;
            win?: Platform | undefined;
            linux?: Platform | undefined;
        } | undefined;
        runtime?: { exitOnLastWindowClosed?: boolean | undefined } | undefined;
    };
}

declare module "electrobun/main" {
    export type RPCSchema<I extends RpcInput> = RpcSchema<I>;
    export type WindowOptions<T> = {
        title: string;
        url: string | null;
        frame: { x?: number | undefined; y?: number | undefined; width: number; height: number };
        rpc?: T | undefined;
        hidden?: boolean | undefined;
        sandbox: boolean;
    };

    export class BrowserWindow<T = undefined> {
        constructor ( options?: Partial<WindowOptions<T>> );
        setTitle ( title: string ): void;
        show (): void;
    }
    export const BrowserView: { defineRPC: <S extends RpcPair>( config: RpcHandlers<S, "bun"> ) => RpcProxy<S, "bun"> };
    export const Utils: { openExternal: ( url: string ) => boolean };
}

declare module "electrobun/main/paths" {
    export const VIEWS_FOLDER: string;
}

declare module "electrobun/view" {
    export class Electroview<T extends { setTransport: ( transport: unknown ) => void }> {
        constructor ( config: { rpc: T } );
        rpc?: T | undefined;
        static defineRPC<S extends RpcPair> ( config: RpcHandlers<S, "webview"> ): RpcProxy<S, "webview">;
    }
}
