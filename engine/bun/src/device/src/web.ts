import type { Adapter, Host } from "./arch.ts";
import { geared } from "./gear.ts";
import { granted } from "./grant.ts";
import { host as global } from "./host.ts";
import { placed } from "./place.ts";
import { reached } from "./reach.ts";
import { sensed } from "./sense.ts";

export function webAdapter ( host: Host = global() ): Adapter | undefined {

    const browser = host.navigator;
    const page = host.document;

    if ( !browser || !page ) return undefined;

    return { ...sensed(host, browser, page), ...granted(host, browser), ...placed(browser), ...reached(host, browser), ...geared(host, browser, page) };

}
