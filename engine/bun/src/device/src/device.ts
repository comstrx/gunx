import * as adapter from "engine-adapter";
import * as error from "engine-error";
import type { Adapter, Capability, Combo, Device, Full, Hotkey, Key, Options } from "./arch.ts";
import { combos, matches } from "./keys.ts";
import { port } from "./port.ts";

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
