import * as exception from "engine-exception";
import type { Adapter, Battery, Capture, Edited, Host, Key, KeyEvent, Sentinel, Stream } from "./arch.ts";
import { finite } from "./guard.ts";

const fields = new Set<string>(["INPUT", "TEXTAREA", "SELECT"]);
const pressed = new Set<string>(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);

function typingIn ( target: Edited | null | undefined ): boolean {

    if ( !target ) return false;
    if ( target.isContentEditable === true ) return true;

    const tag = (target.tagName ?? "").toUpperCase();

    return fields.has(tag) && !(tag === "INPUT" && pressed.has((target.type ?? "").toLowerCase()));

}
function keyOf ( event: KeyEvent ): Key {

    return { key: event.key, code: event.code ?? "", ctrl: event.ctrlKey === true, meta: event.metaKey === true, shift: event.shiftKey === true, alt: event.altKey === true, repeat: event.repeat === true, typing: typingIn(event.target) };

}

export function geared ( host: Host, browser: NonNullable<Host["navigator"]>, page: NonNullable<Host["document"]> ): Pick<Adapter, "capture" | "keys" | "battery" | "awake"> {

    const capture = async ( options: Capture ): Promise<Stream | undefined> => {

        const side = typeof options.video === "object" && finite(options.video.side) && options.video.side >= 1 ? { width: { ideal: Math.floor(options.video.side) }, height: { ideal: Math.floor(options.video.side) } } : {};
        const video = typeof options.video === "object" ? { facingMode: options.video.facing ?? "environment", ...side } : options.video === true;
        const audio = options.audio === true;
        const stream = video === false && !audio ? undefined : await exception.probeAsync(() => browser.mediaDevices?.getUserMedia({ video, audio }));

        return stream ? { stream, stop: () => { for ( const track of stream.getTracks() ) track.stop(); } } : undefined;

    };
    const keys = ( listener: ( key: Key ) => void ): (() => void) => {

        const handler = ( event: KeyEvent ): void => {

            if ( event.isComposing !== true && typeof event.key === "string" ) listener(keyOf(event));

        };

        host.addEventListener?.("keydown", handler);

        return () => host.removeEventListener?.("keydown", handler);

    };
    const battery = async (): Promise<Battery | undefined> => {

        const found = await exception.probeAsync(() => browser.getBattery?.());

        return found && finite(found.level) ? { level: Math.min(1, Math.max(0, found.level)), charging: found.charging === true } : undefined;

    };
    const awake = async (): Promise<(() => void) | undefined> => {

        const request = (): Promise<Sentinel | undefined> => exception.probeAsync(() => browser.wakeLock?.request("screen"));
        const drop = ( sentinel: Sentinel | undefined ): void => {

            void exception.probeAsync(() => sentinel?.release());

        };
        let held = await request();
        let live = held !== undefined;

        if ( !held ) return undefined;

        const renew = async (): Promise<void> => {

            if ( !live || page.visibilityState === "hidden" ) return;

            const next = await request();

            if ( !next ) return;

            drop(live ? held : next);

            if ( live ) held = next;

        };
        const handler = (): void => {

            void renew();

        };

        page.addEventListener?.("visibilitychange", handler);

        return () => {

            if ( !live ) return;

            live = false;
            page.removeEventListener?.("visibilitychange", handler);
            drop(held);

        };

    };

    return {
        capture: browser.mediaDevices ? capture : undefined,
        keys: host.addEventListener ? keys : undefined,
        battery: browser.getBattery ? battery : undefined,
        awake: browser.wakeLock ? awake : undefined,
    };

}
