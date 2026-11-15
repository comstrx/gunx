import * as adapter from "engine-adapter";
import type { Adapter, Host } from "./arch.ts";
import { unknownInfo } from "./info.ts";
import { webAdapter } from "./web.ts";

export const unknown: Adapter = { info: unknownInfo, watch: () => () => undefined };
export const port: adapter.Port<Adapter> = adapter.port<Adapter>("device", { fallback: adapter.web<Adapter>("device", webAdapter, () => unknown) });

export function bindWeb ( host?: Host ): boolean {

    const made = webAdapter(host);

    if ( made ) port.use(made);

    return made !== undefined;

}
