export type Platform = "linux" | "macos" | "windows" | "unknown";
export type Info = { platform: Platform; arch: string; runtime: string; name: string; identity: string; version: string };
export type Requests = {
    info: { params: undefined; response: Info };
    title: { params: { title: string }; response: undefined };
    open: { params: { url: string }; response: boolean };
};
export type Marks = { ready: { at: number } };
export type Request = keyof Requests;
export type Mark = keyof Marks;
export type Answer<K extends Request> = Requests[K]["response"];
export type Input<K extends Request> = Requests[K]["params"];
export type Window = { width: number; height: number; minWidth: number; minHeight: number };
export type Spoken = { identity: string; name: string; identifier: string; version: string; window: Window };
export type Bridge = {
    ask: <K extends Request>( name: K, params: Input<K> ) => Promise<Answer<K>>;
    tell: <K extends Mark>( name: K, payload: Marks[K] ) => void;
};

export const requests = ["info", "title", "open"] as const satisfies readonly Request[];
export const marks = ["ready"] as const satisfies readonly Mark[];
export const page = "page";
export const spoken = "host.json";
export const timeout = 10000;
