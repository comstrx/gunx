import * as exception from "engine-exception";
import type { Adapter, Agent, Connection, Contrast, Host, Info, Insets, MediaList, Pointer, Target, Watched } from "./arch.ts";
import { idle } from "./guard.ts";
import { orientationOf, parseAgent } from "./info.ts";

const dark = "(prefers-color-scheme: dark)";
const reduced = "(prefers-reduced-motion: reduce)";
const more = "(prefers-contrast: more)";
const less = "(prefers-contrast: less)";
const coarse = "(pointer: coarse)";
const pointless = "(pointer: none)";
const installed = "(display-mode: standalone)";

function networkOf ( connection: Connection | undefined ): Info["network"] {

    const type = connection?.type;

    if ( type === "wifi" || type === "cellular" || type === "ethernet" || type === "none" ) return type;
    if ( connection?.effectiveType ) return "cellular";

    return "unknown";

}

export function sensed ( host: Host, browser: NonNullable<Host["navigator"]>, page: NonNullable<Host["document"]> ): Pick<Adapter, "info" | "watch"> {

    const lists = new Map<string, MediaList | undefined>();
    let sniffed: [string, Agent] | undefined;
    const media = ( query: string ): MediaList | undefined => {

        if ( !lists.has(query) ) lists.set(query, exception.probe(() => host.matchMedia?.(query)));

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

        const style = exception.probe(() => host.getComputedStyle?.(page.documentElement ?? page));
        const side = ( name: string ): number => {

            const found = Number.parseFloat(exception.probe(() => style?.getPropertyValue(`--safe-area-inset-${name}`)) ?? "");

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
            timeZone: exception.probe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC",
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
            focused: exception.probe(() => page.hasFocus?.()) ?? true,
        };

    };
    const heard = ( target: Target | undefined, names: readonly string[], listener: ( info: Info ) => void ): (() => void) => {

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

    return { info, watch };

}
