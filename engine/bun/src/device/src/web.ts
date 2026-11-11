import * as adapter from "engine-adapter";
import type { Adapter, Battery, Follow, Grant, Haptic, Media, Notice, Permission, Pick, Picked, Position, Shared, Stream, Watched } from "./device.ts";
import { type Agent, type Contrast, type Info, type Insets, orientationOf, type Pointer, parseAgent } from "./info.ts";
import type { Key } from "./keys.ts";

type Found = adapter.Found;
type Wanted = adapter.Wanted;
type MediaList = adapter.MediaList;
type Connection = adapter.Connection;
type Edited = { tagName?: string; type?: string; isContentEditable?: boolean };
type KeyEvent = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; repeat: boolean; isComposing?: boolean; target?: Edited | null };
type Sentinel = { release: () => Promise<void> };
export type Host = adapter.Host;

const grants = new Map<string, Grant>([["granted", "granted"], ["denied", "denied"], ["prompt", "prompt"], ["default", "prompt"]]);
const queries = new Map<Permission, string>([["location", "geolocation"], ["camera", "camera"], ["microphone", "microphone"], ["clipboard", "clipboard-read"]]);
const fields = new Set<string>(["INPUT", "TEXTAREA", "SELECT"]);
const pressed = new Set<string>(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);
const missing = new Set<string>(["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError", "OverconstrainedError"]);
const pulses = new Map<Haptic, number | readonly number[]>([["selection", 5], ["light", 10], ["medium", 20], ["heavy", 40], ["success", [10, 60, 20]], ["warning", [20, 80, 20]], ["error", [30, 60, 30, 60, 30]]]);
const dark = "(prefers-color-scheme: dark)";
const reduced = "(prefers-reduced-motion: reduce)";
const more = "(prefers-contrast: more)";
const less = "(prefers-contrast: less)";
const coarse = "(pointer: coarse)";
const pointless = "(pointer: none)";
const installed = "(display-mode: standalone)";
const hyper = /^https?:/i;
const schemed = /^[a-z][a-z0-9+.-]*:/i;
const idle = (): void => undefined;

function finite ( given: number | null | undefined ): given is number {

    return typeof given === "number" && Number.isFinite(given);

}
function span ( given: number | undefined ): given is number {

    return typeof given === "number" && given >= 0;

}
function nameOf ( failure: unknown ): string {

    const name = (failure as { name?: unknown } | null)?.name;

    return typeof name === "string" ? name : "";

}
function positionOf ( found: Found ): Position | undefined {

    const { coords, timestamp } = found;

    if ( !finite(coords.latitude) || !finite(coords.longitude) ) return undefined;

    const made: Position = { lat: coords.latitude, lng: coords.longitude, accuracy: finite(coords.accuracy) ? coords.accuracy : 0, at: timestamp };

    if ( finite(coords.altitude) ) made.altitude = coords.altitude;
    if ( finite(coords.speed) ) made.speed = coords.speed;
    if ( finite(coords.heading) ) made.heading = coords.heading;

    return made;

}
function wantedOf ( options: Follow ): Wanted {

    const made: Wanted = { enableHighAccuracy: options.accuracy === "high" };

    if ( span(options.maxAge) ) made.maximumAge = options.maxAge;
    if ( span(options.timeout) ) made.timeout = options.timeout;

    return made;

}
function networkOf ( connection: Connection | undefined ): Info["network"] {

    const type = connection?.type;

    if ( type === "wifi" || type === "cellular" || type === "ethernet" || type === "none" ) return type;
    if ( connection?.effectiveType ) return "cellular";

    return "unknown";

}
function typingIn ( target: Edited | null | undefined ): boolean {

    if ( !target ) return false;
    if ( target.isContentEditable === true ) return true;

    const tag = (target.tagName ?? "").toUpperCase();

    return fields.has(tag) && !(tag === "INPUT" && pressed.has((target.type ?? "").toLowerCase()));

}
function keyOf ( event: KeyEvent ): Key {

    return { key: event.key, code: event.code ?? "", ctrl: event.ctrlKey === true, meta: event.metaKey === true, shift: event.shiftKey === true, alt: event.altKey === true, repeat: event.repeat === true, typing: typingIn(event.target) };

}

export function webAdapter ( host: Host = adapter.host() ): Adapter | undefined {

    const browser = host.navigator;
    const page = host.document;

    if ( !browser || !page ) return undefined;

    const lists = new Map<string, MediaList | undefined>();
    let sniffed: [string, Agent] | undefined;
    const media = ( query: string ): MediaList | undefined => {

        if ( !lists.has(query) ) lists.set(query, adapter.probe(() => host.matchMedia?.(query)));

        return lists.get(query);

    };
    const matched = ( query: string ): boolean => media(query)?.matches === true;
    const agent = (): Agent => {

        const text = browser.userAgent ?? "";

        if ( sniffed?.[0] === text ) return sniffed[1];

        const made = parseAgent(text, { platform: browser.userAgentData?.platform, mobile: browser.userAgentData?.mobile, touch: browser.maxTouchPoints });

        sniffed = [text, made];

        return made;

    };
    const insets = (): Insets => {

        const style = adapter.probe(() => host.getComputedStyle?.(page.documentElement ?? page));
        const side = ( name: string ): number => {

            const found = Number.parseFloat(adapter.probe(() => style?.getPropertyValue(`--safe-area-inset-${name}`)) ?? "");

            return Number.isFinite(found) ? found : 0;

        };

        return { top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };

    };
    const info = (): Info => {

        const found = agent();
        const width = host.innerWidth ?? 0;
        const height = host.innerHeight ?? 0;
        const language = browser.language || browser.languages?.[0] || "en";
        const pointer: Pointer = matched(coarse) ? "coarse" : matched(pointless) ? "none" : "fine";
        const contrast: Contrast = matched(more) ? "more" : matched(less) ? "less" : "normal";

        return {
            platform: "web",
            os: found.os,
            version: found.version,
            browser: found.browser,
            model: "",
            mobile: found.mobile,
            touch: (browser.maxTouchPoints ?? 0) > 0,
            pointer,
            language,
            languages: browser.languages?.length ? [...browser.languages] : [language],
            timeZone: adapter.probe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC",
            online: browser.onLine ?? true,
            network: networkOf(browser.connection),
            reducedMotion: matched(reduced),
            contrast,
            scheme: matched(dark) ? "dark" : "light",
            width,
            height,
            pixelRatio: host.devicePixelRatio ?? 1,
            orientation: orientationOf(width, height),
            insets: insets(),
            standalone: browser.standalone === true || matched(installed),
            visible: page.visibilityState !== "hidden",
            focused: adapter.probe(() => page.hasFocus?.()) ?? true,
        };

    };
    const heard = ( target: adapter.Target | undefined, names: readonly string[], listener: ( info: Info ) => void ): (() => void) => {

        const handler = (): void => listener(info());

        for ( const name of names ) target?.addEventListener?.(name, handler);

        return () => {

            for ( const name of names ) target?.removeEventListener?.(name, handler);

        };

    };
    const queried = ( names: readonly string[], listener: ( info: Info ) => void ): (() => void) => {

        const stops = names.map(( name ) => heard(media(name), ["change"], listener));

        return () => {

            for ( const stop of stops ) stop();

        };

    };
    const watch = ( what: Watched, listener: ( info: Info ) => void ): (() => void) => {

        switch ( what ) {
            case "online": return heard(host, ["online", "offline"], listener);
            case "size": return heard(host, ["resize", "orientationchange"], listener);
            case "focus": return heard(host, ["focus", "blur"], listener);
            case "language": return heard(host, ["languagechange"], listener);
            case "visibility": return heard(page, ["visibilitychange"], listener);
            case "network": return heard(browser.connection, ["change"], listener);
            case "scheme": return queried([dark], listener);
            case "motion": return queried([reduced], listener);
            case "contrast": return queried([more, less], listener);
            default: return idle;
        }

    };
    const present = ( permission: Permission ): boolean => {

        switch ( permission ) {
            case "location": return browser.geolocation !== undefined;
            case "camera":
            case "microphone": return browser.mediaDevices !== undefined;
            case "notifications":
            case "push": return host.Notification !== undefined;
            case "clipboard": return browser.clipboard !== undefined;
            default: return false;
        }

    };
    const state = async ( permission: Permission ): Promise<Grant> => {

        if ( !present(permission) ) return "unsupported";
        if ( permission === "notifications" || permission === "push" ) return grants.get(host.Notification?.permission ?? "") ?? "prompt";

        const name = queries.get(permission);
        const found = name === undefined ? undefined : await adapter.probeAsync(() => browser.permissions?.query({ name }));

        return grants.get(found?.state ?? "") ?? "prompt";

    };
    const located = (): Promise<Grant> => new Promise(( resolve ) => {

        try {

            browser.geolocation?.getCurrentPosition(() => resolve("granted"), ( failure ) => resolve(failure.code === 1 ? "denied" : "granted"), { maximumAge: Number.POSITIVE_INFINITY, timeout: 10000 });

        } catch {

            resolve("unsupported");

        }

    });
    const recorded = async ( wanted: { video?: boolean; audio?: boolean } ): Promise<Grant> => {

        try {

            const stream = await browser.mediaDevices?.getUserMedia(wanted);

            for ( const track of stream?.getTracks() ?? [] ) track.stop();

            return stream ? "granted" : "unsupported";

        } catch ( failure ) {

            return missing.has(nameOf(failure)) ? "unsupported" : "denied";

        }

    };
    const noticed = async (): Promise<Grant> => {

        const answer = await adapter.probeAsync(() => host.Notification?.requestPermission());

        return grants.get(answer ?? host.Notification?.permission ?? "") ?? "prompt";

    };
    const clipped = async (): Promise<Grant> => {

        try {

            await browser.clipboard?.readText();

            return "granted";

        } catch {

            return "denied";

        }

    };
    const ask = async ( permission: Permission ): Promise<Grant> => {

        const held = await state(permission);

        if ( held !== "prompt" ) return held;

        switch ( permission ) {
            case "location": return located();
            case "camera": return recorded({ video: true });
            case "microphone": return recorded({ audio: true });
            case "notifications":
            case "push": return noticed();
            case "clipboard": return clipped();
            default: return "unsupported";
        }

    };
    const notify = async ( notice: Notice ): Promise<boolean> => {

        if ( host.Notification?.permission !== "granted" ) return false;

        try {

            new host.Notification(notice.title, { body: notice.body, tag: notice.tag, icon: notice.icon, data: notice.data, silent: notice.silent });

            return true;

        } catch {

            return false;

        }

    };
    const position = ( options: Follow = {} ): Promise<Position | undefined> => new Promise(( resolve ) => {

        const geolocation = browser.geolocation;

        if ( !geolocation ) {

            resolve(undefined);

            return;

        }

        geolocation.getCurrentPosition(( found ) => resolve(positionOf(found)), () => resolve(undefined), wantedOf(options));

    });
    const follow = ( options: Follow, listener: ( position: Position ) => void ): (() => void) => {

        const geolocation = browser.geolocation;

        if ( !geolocation ) return idle;

        const id = geolocation.watchPosition(( found ) => {

            const made = positionOf(found);

            if ( made ) listener(made);

        }, undefined, wantedOf(options));

        return () => geolocation.clearWatch(id);

    };
    const copy = async ( text: string ): Promise<boolean> => {

        try {

            await browser.clipboard?.writeText(text);

            return browser.clipboard !== undefined;

        } catch {

            return false;

        }

    };
    const paste = (): Promise<string | undefined> => adapter.probeAsync(() => browser.clipboard?.readText());
    const share = async ( data: Shared ): Promise<boolean> => {

        try {

            if ( !browser.share || (browser.canShare && !browser.canShare(data)) ) return false;

            await browser.share(data);

            return true;

        } catch {

            return false;

        }

    };
    const vibrate = ( pattern: number | readonly number[] ): boolean => browser.vibrate?.(pattern) ?? false;
    const reload = (): boolean => {

        host.location?.reload?.();

        return true;

    };
    const haptic = ( kind: Haptic ): boolean => browser.vibrate?.(pulses.get(kind) ?? 10) ?? false;
    const open = async ( target: string ): Promise<boolean> => {

        if ( target === "settings" || !host.open ) return false;

        if ( hyper.test(target) || !schemed.test(target) ) host.open(target, "_blank", "noopener,noreferrer");
        else host.open(target, "_self");

        return true;

    };
    const pick = ( options: Pick = {} ): Promise<Picked[]> => new Promise(( resolve ) => {

        const input = browser.userActivation?.isActive === false ? undefined : adapter.probe(() => page.createElement?.("input"));

        if ( !input ) {

            resolve([]);

            return;

        }

        input.type = "file";
        input.accept = options.accept?.join(",") ?? (options.source === "files" ? "" : "image/*");
        input.multiple = options.multiple === true;
        input.onchange = () => resolve(Array.from(input.files ?? [], ( file ) => ({ name: file.name, type: file.type, size: file.size, uri: "", blob: file })));
        input.oncancel = () => resolve([]);

        if ( options.source === "camera" ) input.capture = "environment";

        try {

            input.click();

        } catch {

            resolve([]);

        }

    });
    const recording = async ( options: Media ): Promise<Stream | undefined> => {

        const video = typeof options.video === "object" ? { facingMode: options.video.facing ?? "environment" } : options.video === true;
        const audio = options.audio === true;
        const stream = video === false && !audio ? undefined : await adapter.probeAsync(() => browser.mediaDevices?.getUserMedia({ video, audio }));

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

        const found = await adapter.probeAsync(() => browser.getBattery?.());

        return found && finite(found.level) ? { level: Math.min(1, Math.max(0, found.level)), charging: found.charging === true } : undefined;

    };
    const awake = async (): Promise<(() => void) | undefined> => {

        const request = (): Promise<Sentinel | undefined> => adapter.probeAsync(() => browser.wakeLock?.request("screen"));
        const drop = ( sentinel: Sentinel | undefined ): void => {

            void adapter.probeAsync(() => sentinel?.release());

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
    const badge = async ( count?: number ): Promise<boolean> => {

        if ( !browser.setAppBadge ) return false;

        try {

            const total = count === undefined ? undefined : Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(count) || 0));

            if ( total === 0 && browser.clearAppBadge ) await browser.clearAppBadge();
            else await browser.setAppBadge(total);

            return true;

        } catch {

            return false;

        }

    };

    return {
        info,
        watch,
        state,
        ask,
        notify: host.Notification ? notify : undefined,
        position: browser.geolocation ? position : undefined,
        follow: browser.geolocation ? follow : undefined,
        copy: browser.clipboard ? copy : undefined,
        paste: browser.clipboard ? paste : undefined,
        share: browser.share ? share : undefined,
        vibrate: browser.vibrate ? vibrate : undefined,
        haptic: browser.vibrate ? haptic : undefined,
        open: host.open ? open : undefined,
        reload: host.location?.reload ? reload : undefined,
        pick: page.createElement ? pick : undefined,
        media: browser.mediaDevices ? recording : undefined,
        keys: host.addEventListener ? keys : undefined,
        battery: browser.getBattery ? battery : undefined,
        awake: browser.wakeLock ? awake : undefined,
        badge: browser.setAppBadge ? badge : undefined,
    };

}
