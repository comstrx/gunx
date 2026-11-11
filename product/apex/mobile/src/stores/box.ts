import * as cache from "engine/cache";

export const box: cache.Box = cache.open({ kind: "local", prefix: "app" });
