import * as cache from "engine/cache";
import { host } from "@/specs/app.ts";

export const shared: cache.Box = cache.open({ kind: "local", prefix: "spec" });
export const passing: cache.Box = cache.open({ kind: "session", prefix: "spec" });
export const box: () => cache.Box = host.own(( app ) => cache.open({ kind: "local", prefix: app.id }));
