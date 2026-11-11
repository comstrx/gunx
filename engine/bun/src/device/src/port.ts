import * as adapter from "engine-adapter";
import type { Adapter } from "./device.ts";
import { unknownInfo } from "./info.ts";
import { type Host, webAdapter } from "./web.ts";

export const unknown: Adapter = { info: unknownInfo, watch: () => () => undefined };
export const port: adapter.Port<Adapter> = adapter.port<Adapter>("device", { fallback: adapter.web<Adapter>("device", webAdapter, () => unknown) });

export function bindWeb ( host?: Host ): boolean {

    const made = webAdapter(host);

    if ( made ) port.use(made);

    return made !== undefined;

}
