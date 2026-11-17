import * as exception from "engine-exception";
import type { Adapter, Grant, Host, Permission } from "./arch.ts";

const grants = new Map<string, Grant>([["granted", "granted"], ["denied", "denied"], ["prompt", "prompt"], ["default", "prompt"]]);
const queries = new Map<Permission, string>([["location", "geolocation"], ["camera", "camera"], ["microphone", "microphone"], ["clipboard", "clipboard-read"]]);
const missing = new Set<string>(["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError", "OverconstrainedError"]);

function nameOf ( failure: unknown ): string {

    const name = (failure as { name?: unknown } | null)?.name;

    return typeof name === "string" ? name : "";

}

export function granted ( host: Host, browser: NonNullable<Host["navigator"]> ): Pick<Adapter, "state" | "ask"> {

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
        const found = name === undefined ? undefined : await exception.probeAsync(() => browser.permissions?.query({ name }));

        return grants.get(found?.state ?? "") ?? "prompt";

    };
    const located = (): Promise<Grant> => new Promise(( resolve ) => {

        exception.rescue(() => {

            browser.geolocation?.getCurrentPosition(() => resolve("granted"), ( failure ) => resolve(failure.code === 1 ? "denied" : "granted"), { maximumAge: Number.POSITIVE_INFINITY, timeout: 10000 });

        }, () => {

            resolve("unsupported");

        });

    });
    const recorded = async ( wanted: { video?: boolean; audio?: boolean } ): Promise<Grant> => {

        return await exception.rescueAsync(async () => {

            const stream = await browser.mediaDevices?.getUserMedia(wanted);

            for ( const track of stream?.getTracks() ?? [] ) track.stop();

            return stream ? "granted" : "unsupported";

        }, ( failure ) => {

            return missing.has(nameOf(failure)) ? "unsupported" : "denied";

        });

    };
    const noticed = async (): Promise<Grant> => {

        const answer = await exception.probeAsync(() => host.Notification?.requestPermission());

        return grants.get(answer ?? host.Notification?.permission ?? "") ?? "prompt";

    };
    const clipped = async (): Promise<Grant> => {

        return await exception.rescueAsync(async (): Promise<Grant> => {

            await browser.clipboard?.readText();

            return "granted";

        }, (): Grant => "denied");

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

    return { state, ask };

}
