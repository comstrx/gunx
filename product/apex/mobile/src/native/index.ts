import * as cache from "engine/cache";
import * as device from "engine/device";
import * as history from "engine/history";
import * as rand from "engine/rand";
import * as world from "engine/world";
import { adapter } from "./device.ts";
import { source } from "./random.ts";
import { storage } from "./storage.ts";

export function boot (): void {

    rand.engine.use(source);
    cache.use("local", storage);
    cache.use("session", cache.memory());
    cache.use("local");
    device.port.use(adapter);
    world.appearance.use({ scheme: () => adapter.info().scheme, watch: ( listener ) => adapter.watch("scheme", listener) });
    history.port.use(history.memoryAdapter("/"));

}
