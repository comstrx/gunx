import * as error from "engine-error";
import { probe } from "./runtime.ts";

export type Handler = ( event: never ) => void;
export type Target = {
    addEventListener?: ( name: string, handler: Handler, options?: { passive?: boolean } ) => void;
    removeEventListener?: ( name: string, handler: Handler ) => void;
};
export type WebStorage = { getItem: ( key: string ) => string | null; setItem: ( key: string, value: string ) => void; removeItem: ( key: string ) => void; key: ( index: number ) => string | null; readonly length: number };
export type MediaList = { matches: boolean } & Target;
export type Coordinates = { latitude: number; longitude: number; accuracy: number; altitude?: number | null; speed?: number | null; heading?: number | null };
export type Found = { coords: Coordinates; timestamp: number };
export type Wanted = { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number };
export type Geolocation = {
    getCurrentPosition: ( ok: ( position: Found ) => void, fail: ( failure: { code: number } ) => void, options?: Wanted ) => void;
    watchPosition: ( ok: ( position: Found ) => void, fail?: ( failure: { code: number } ) => void, options?: Wanted ) => number;
    clearWatch: ( id: number ) => void;
};
export type Tracks = { getTracks: () => { stop: () => void }[] };
export type FileInput = { type: string; accept: string; multiple: boolean; capture: string; onchange: null | (() => void); oncancel?: null | (() => void); files: ArrayLike<File> | null; click: () => void };
export type Connection = { effectiveType?: string; type?: string } & Target;
export type Root = { lang?: string; dir?: string; dataset?: Record<string, string | undefined>; style?: { colorScheme?: string } };
export type Host = Target & {
    navigator?: {
        product?: string;
        userAgent?: string;
        language?: string;
        languages?: readonly string[];
        onLine?: boolean;
        maxTouchPoints?: number;
        standalone?: boolean;
        connection?: Connection;
        permissions?: { query: ( descriptor: { name: string } ) => Promise<{ state: string }> };
        geolocation?: Geolocation;
        mediaDevices?: { getUserMedia: ( constraints: { video?: boolean | { facingMode?: string }; audio?: boolean } ) => Promise<Tracks> };
        clipboard?: { writeText: ( text: string ) => Promise<void>; readText: () => Promise<string> };
        share?: ( data: unknown ) => Promise<void>;
        canShare?: ( data: unknown ) => boolean;
        vibrate?: ( pattern: number | readonly number[] ) => boolean;
        getBattery?: () => Promise<{ level: number; charging: boolean }>;
        userAgentData?: { mobile?: boolean; platform?: string };
        userActivation?: { isActive?: boolean };
        wakeLock?: { request: ( kind: "screen" ) => Promise<{ release: () => Promise<void> }> };
        locks?: { request: ( name: string, work: () => Promise<unknown> ) => Promise<unknown> };
        setAppBadge?: ( count?: number ) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
    };
    document?: {
        visibilityState?: string;
        hasFocus?: () => boolean;
        createElement?: ( tag: string ) => FileInput;
        documentElement?: Root;
    } & Target;
    window?: unknown;
    location?: { pathname: string; search: string; hash: string; reload?: () => void };
    history?: { state: unknown; pushState: ( state: unknown, title: string, href: string ) => void; replaceState: ( state: unknown, title: string, href: string ) => void; go: ( delta: number ) => void };
    localStorage?: WebStorage;
    sessionStorage?: WebStorage;
    fetch?: ( url: string, init?: object ) => Promise<Response>;
    WebSocket?: new ( url: string, protocols?: string | string[] ) => unknown;
    Notification?: { permission: string; requestPermission: () => Promise<string>; new ( title: string, options?: unknown ): unknown };
    matchMedia?: ( query: string ) => MediaList;
    innerWidth?: number;
    innerHeight?: number;
    devicePixelRatio?: number;
    open?: ( url: string, target?: string, features?: string ) => unknown;
    getComputedStyle?: ( element: unknown ) => { getPropertyValue: ( name: string ) => string };
    crypto?: Crypto;
    HermesInternal?: unknown;
    Bun?: unknown;
    Deno?: unknown;
    EdgeRuntime?: unknown;
    process?: { versions?: { node?: string; bun?: string } };
    importScripts?: unknown;
    WorkerGlobalScope?: unknown;
};

export function host (): Host {

    return globalThis as unknown as Host;

}
export function web<T> ( name: string, make: ( given: Host ) => T | undefined, otherwise?: () => T ): () => T {

    return () => {

        const found = probe(() => make(host()));

        if ( found !== undefined ) return found;
        if ( otherwise ) return otherwise();

        throw error.fault("unavailable", name, { message: `${name}: the host does not answer; bind the port` });

    };

}
