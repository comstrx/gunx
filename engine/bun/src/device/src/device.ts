import * as adapter from "engine-adapter";
import * as error from "engine-error";
import type * as json from "engine-json";
import type { Info } from "./info.ts";
import { type Combo, combos, type Key, matches } from "./keys.ts";
import { port } from "./port.ts";

export type Permission = "location" | "camera" | "microphone" | "notifications" | "clipboard" | "contacts" | "photos" | "push";
export type Grant = "granted" | "denied" | "prompt" | "unsupported";
export type Watched = "online" | "scheme" | "motion" | "contrast" | "visibility" | "focus" | "size" | "network" | "language";
export type Accuracy = "low" | "balanced" | "high";
export type Haptic = "selection" | "light" | "medium" | "heavy" | "success" | "warning" | "error";
export type Position = { lat: number; lng: number; accuracy: number; altitude?: number | undefined; speed?: number | undefined; heading?: number | undefined; at: number };
export type Follow = { accuracy?: Accuracy | undefined; maxAge?: number | undefined; timeout?: number | undefined };
export type Notice = { title: string; body?: string | undefined; tag?: string | undefined; icon?: string | undefined; data?: json.Dictionary | undefined; silent?: boolean | undefined };
export type Shared = { title?: string | undefined; text?: string | undefined; url?: string | undefined; files?: readonly Blob[] | undefined };
export type Source = "camera" | "library" | "files";
export type Pick = { source?: Source | undefined; accept?: readonly string[] | undefined; multiple?: boolean | undefined };
export type Picked = { name: string; type: string; size: number; uri: string; blob?: Blob | undefined };
export type Media = { video?: boolean | { facing?: "user" | "environment" | undefined } | undefined; audio?: boolean | undefined };
export type Stream = { stream: unknown; stop: () => void };
export type Battery = { level: number; charging: boolean };
export type Hotkey = { typing?: boolean | undefined; repeat?: boolean | undefined };
export type Options = { schemes?: readonly string[] | undefined };
export type Adapter = {
    info: () => Info;
    watch: ( what: Watched, listener: ( info: Info ) => void ) => () => void;
    state?: (( permission: Permission ) => Promise<Grant> | Grant) | undefined;
    ask?: (( permission: Permission ) => Promise<Grant>) | undefined;
    notify?: (( notice: Notice ) => Promise<boolean>) | undefined;
    pushToken?: (() => Promise<string | undefined>) | undefined;
    position?: (( options?: Follow ) => Promise<Position | undefined>) | undefined;
    follow?: (( options: Follow, listener: ( position: Position ) => void ) => () => void) | undefined;
    copy?: (( text: string ) => Promise<boolean>) | undefined;
    paste?: (() => Promise<string | undefined>) | undefined;
    share?: (( data: Shared ) => Promise<boolean>) | undefined;
    vibrate?: (( pattern: number | readonly number[] ) => boolean) | undefined;
    haptic?: (( kind: Haptic ) => boolean) | undefined;
    open?: (( target: string ) => Promise<boolean>) | undefined;
    reload?: (() => boolean) | undefined;
    pick?: (( options?: Pick ) => Promise<Picked[]>) | undefined;
    media?: (( options: Media ) => Promise<Stream | undefined>) | undefined;
    keys?: (( listener: ( key: Key ) => void ) => () => void) | undefined;
    battery?: (() => Promise<Battery | undefined>) | undefined;
    awake?: (() => Promise<(() => void) | undefined>) | undefined;
    badge?: (( count?: number ) => Promise<boolean>) | undefined;
};
export type Capability = Exclude<keyof Adapter, "info" | "watch">;
export type Full = { [K in keyof Adapter]-?: Exclude<Adapter[K], undefined> };
export type Device = Full & {
    is: ( platform: Info["platform"] ) => boolean;
    can: ( capability: Capability ) => boolean;
    capabilities: () => Capability[];
    require: ( permission: Permission ) => Promise<void>;
    hotkey: ( keys: string, handler: ( key: Key ) => void, options?: Hotkey ) => () => void;
    hotkeys: ( bound: Record<string, ( key: Key ) => void>, options?: Hotkey ) => () => void;
    facts: () => json.Dictionary;
};

const openable: readonly string[] = ["http", "https", "mailto", "tel", "sms", "geo"];
const longest = 8192;
const schemed = /^([a-z][a-z0-9+.-]*):/i;
const idle = (): void => undefined;
const absent: Omit<Full, "info" | "watch"> = {
    state: () => "unsupported",
    ask: async () => "unsupported",
    notify: async () => false,
    pushToken: async () => undefined,
    position: async () => undefined,
    follow: () => idle,
    copy: async () => false,
    paste: async () => undefined,
    share: async () => false,
    vibrate: () => false,
    haptic: () => false,
    open: async () => false,
    reload: () => false,
    pick: async () => [],
    media: async () => undefined,
    keys: () => idle,
    battery: async () => undefined,
    awake: async () => undefined,
    badge: async () => false,
};

function calm<A extends unknown[], R> ( run: ( ...given: A ) => Promise<R> | R, otherwise: R ): ( ...given: A ) => Promise<R> {

    return async ( ...given ) => {

        const found: R | undefined = await adapter.probeAsync<R>(() => run(...given));

        return found ?? otherwise;

    };

}
function still<A extends unknown[], R> ( run: ( ...given: A ) => R, otherwise: R ): ( ...given: A ) => R {

    return ( ...given ) => adapter.probe(() => run(...given)) ?? otherwise;

}
function printable ( text: string ): boolean {

    for ( let at = 0; at < text.length; at += 1 ) {

        const unit = text.charCodeAt(at);

        if ( unit < 32 || unit === 127 ) return false;

    }

    return true;

}

export function targetOf ( text: string, schemes: readonly string[] = openable ): string | undefined {

    const trimmed = typeof text === "string" ? text.trim() : "";

    if ( trimmed === "" || trimmed.length > longest || !printable(trimmed) ) return undefined;

    const scheme = schemed.exec(trimmed)?.[1]?.toLowerCase();

    return scheme === undefined || schemes.some(( one ) => one.toLowerCase() === scheme) ? trimmed : undefined;

}
export function create ( given: Adapter = port.get(), options: Options = {} ): Device {

    const capable = adapter.capabilities(given).filter(( name ): name is Capability => name !== "info" && name !== "watch");
    const filled = adapter.fill<Full>(given, { ...absent, info: given.info, watch: given.watch });
    const state = calm(filled.state, "unsupported");
    const ask = calm(filled.ask, "unsupported");
    const open = calm(filled.open, false);
    const keys = still(filled.keys, idle);
    const hotkeys = ( bound: Record<string, ( key: Key ) => void>, hotkey: Hotkey = {} ): (() => void) => {

        const os = filled.info().os;
        const wanted: [Combo, ( key: Key ) => void][] = [];

        for ( const [text, handler] of Object.entries(bound) ) for ( const one of combos(text, os === "macos" || os === "ios") ) wanted.push([one, handler]);

        return keys(( pressed ) => {

            if ( pressed.repeat && hotkey.repeat !== true ) return;

            const typing = pressed.typing === true;
            const found = wanted.find(([one]) => matches(pressed, one) && (!typing || (hotkey.typing ?? (one.ctrl || one.meta || one.key === "escape"))));

            found?.[1](pressed);

        });

    };

    return {
        info: filled.info,
        watch: filled.watch,
        state,
        ask,
        notify: calm(filled.notify, false),
        pushToken: calm(filled.pushToken, undefined),
        position: calm(filled.position, undefined),
        follow: still(filled.follow, idle),
        copy: calm(filled.copy, false),
        paste: calm(filled.paste, undefined),
        share: calm(filled.share, false),
        vibrate: still(filled.vibrate, false),
        haptic: still(filled.haptic, false),
        open: async ( target ) => {

            const found = targetOf(target, options.schemes);

            return found === undefined ? false : open(found);

        },
        reload: still(filled.reload, false),
        pick: async ( wanted ) => (await adapter.probeAsync(() => filled.pick(wanted))) ?? [],
        media: calm(filled.media, undefined),
        keys,
        battery: calm(filled.battery, undefined),
        awake: calm(filled.awake, undefined),
        badge: calm(filled.badge, false),
        hotkeys,
        is: ( platform ) => filled.info().platform === platform,
        can: ( capability ) => capable.includes(capability),
        capabilities: () => [...capable],
        require: async ( permission ) => {

            const held = await state(permission);
            const grant = held === "granted" ? held : await ask(permission);

            if ( grant === "granted" ) return;

            throw error.fault(grant === "unsupported" ? "unavailable" : "forbidden", `device.${permission}.${grant}`, { message: `${permission}: ${grant}`, errors: { [permission]: [grant] } });

        },
        hotkey: ( text, handler, hotkey ) => hotkeys({ [text]: handler }, hotkey),
        facts: () => {

            const { platform, os, version, browser, mobile, language, timeZone, scheme, width, height, online, network } = filled.info();

            return { platform, os, version, browser, mobile, language, timeZone, scheme, viewport: `${width}x${height}`, online, network };

        },
    };

}
