import type * as log from "engine-log";
import type * as socket from "engine-socket";

export type Env = { restore: () => void };
export type Temp = { path: string; file: ( name: string ) => string; write: ( name: string, content: string | Uint8Array ) => string; remove: () => void };
export type Spy<A extends unknown[], R> = (( ...args: A ) => R) & { calls: A[]; results: R[]; failures: unknown[]; reset: () => void };
export type Layer = { value: unknown };
export type Stack<T> = { base: T; layers: Layer[] };
export type Caller = { id: string; token: string | undefined };
export type LiveOptions = {
    codec: { encode: ( frame: socket.Frame ) => string; decode: ( raw: unknown ) => socket.Frame | undefined };
    auth?: (( token: string | undefined ) => boolean) | undefined;
    gate?: (( channel: string, from: Caller ) => boolean) | undefined;
    onFrame?: (( frame: socket.Frame, reply: ( frame: socket.Frame ) => void, from: Caller ) => boolean | undefined | Promise<boolean | undefined>) | undefined;
};
export type Live = {
    url: string;
    port: number;
    clients: () => number;
    broadcast: ( frame: socket.Frame ) => void;
    received: () => socket.Frame[];
    drop: ( code?: number, reason?: string ) => void;
    stop: () => void;
};
export type Data = { id: string; token: string | undefined; passed: boolean; channels: Set<string> };
export type Client = { send: ( text: string ) => unknown; close: ( code?: number, reason?: string ) => void; data: Data };
export type Logs = { logger: log.Logger; entries: log.Entry[]; messages: () => string[]; clear: () => void };
