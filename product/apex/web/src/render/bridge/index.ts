import * as device from "engine/device";
import * as history from "engine/history";
import { host } from "./host.ts";

export function boot (): void {

    const web = device.webAdapter();

    history.port.use(history.memoryAdapter("/"));

    if ( web ) device.port.use({ ...web, open: async ( target ) => ((await host.opened()) ? host.open(target) : web.open?.(target) ?? false) });

}
