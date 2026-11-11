import * as cache from "engine/cache";
import * as device from "engine/device";
import * as history from "engine/history";
import { host } from "./bridge.ts";

export function boot (): void {

    const web = device.webAdapter();

    cache.use("local");
    history.port.use(history.memoryAdapter("/"));

    if ( web ) device.port.use({ ...web, open: async ( target ) => ((await host.opened()) ? host.open(target) : web.open?.(target) ?? false) });

}
