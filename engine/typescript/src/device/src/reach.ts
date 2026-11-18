import * as exception from "engine-exception";
import type { Adapter, Haptic, Host, Notice, Shared } from "./arch.ts";

const pulses = new Map<Haptic, number | readonly number[]>([["selection", 5], ["light", 10], ["medium", 20], ["heavy", 40], ["success", [10, 60, 20]], ["warning", [20, 80, 20]], ["error", [30, 60, 30, 60, 30]]]);
const hyper = /^https?:/i;
const schemed = /^[a-z][a-z0-9+.-]*:/i;

export function reached ( host: Host, browser: NonNullable<Host["navigator"]> ): Pick<Adapter, "notify" | "copy" | "paste" | "share" | "vibrate" | "haptic" | "open" | "reload" | "badge"> {

    const notify = async ( notice: Notice ): Promise<boolean> => {

        const Maker = host.Notification;

        if ( Maker?.permission !== "granted" ) return false;

        return exception.rescue(() => {

            new Maker(notice.title, { body: notice.body, tag: notice.tag, icon: notice.icon, data: notice.data, silent: notice.silent });

            return true;

        }, () => {

            return false;

        });

    };
    const copy = async ( text: string ): Promise<boolean> => {

        return await exception.rescueAsync(async () => {

            await browser.clipboard?.writeText(text);

            return browser.clipboard !== undefined;

        }, () => {

            return false;

        });

    };
    const paste = (): Promise<string | undefined> => exception.probeAsync(() => browser.clipboard?.readText());
    const share = async ( data: Shared ): Promise<boolean> => {

        return await exception.rescueAsync(async () => {

            if ( !browser.share || (browser.canShare && !browser.canShare(data)) ) return false;

            await browser.share(data);

            return true;

        }, () => {

            return false;

        });

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
    const badge = async ( count?: number ): Promise<boolean> => {

        if ( !browser.setAppBadge ) return false;

        return await exception.rescueAsync(async () => {

            const total = count === undefined ? undefined : Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(count) || 0));

            if ( total === 0 && browser.clearAppBadge ) await browser.clearAppBadge();
            else await browser.setAppBadge?.(total);

            return true;

        }, () => {

            return false;

        });

    };


    return {
        notify: host.Notification ? notify : undefined,
        copy: browser.clipboard ? copy : undefined,
        paste: browser.clipboard ? paste : undefined,
        share: browser.share ? share : undefined,
        vibrate: browser.vibrate ? vibrate : undefined,
        haptic: browser.vibrate ? haptic : undefined,
        open: host.open ? open : undefined,
        reload: host.location?.reload ? reload : undefined,
        badge: browser.setAppBadge ? badge : undefined,
    };

}
