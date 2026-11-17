import * as exception from "engine-exception";
import type { Adapter, Host } from "./arch.ts";
import { unknownInfo } from "./info.ts";
import { webAdapter } from "./web.ts";

export const unknown: Adapter = { info: unknownInfo, watch: () => () => undefined };
export const port: exception.Slot<Adapter> = exception.slot<Adapter>("device", { fallback: () => exception.probe(() => webAdapter()) ?? unknown });

export function bindWeb ( host?: Host ): boolean {

    const made = webAdapter(host);

    if ( made ) port.use(made);

    return made !== undefined;

}
