import * as exception from "engine-exception";
import type { Adapter, Capability, Facts, Link, Pick, Picked, Sizing } from "./arch.ts";
import { sizable } from "./sizing.ts";
import { webAdapter } from "./web.ts";

export const port: exception.Slot<Adapter> = exception.slot<Adapter>("media", { fallback: () => exception.probe(() => webAdapter()) ?? {} });

export function can ( capability: Capability ): boolean {

    return port.get()[capability] !== undefined;

}
export async function resize ( file: Picked, sizing: Sizing ): Promise<Picked> {

    const { resize: made } = port.get();

    return made && sizable(file.type) ? (await exception.probeAsync(() => made(file, sizing))) ?? file : file;

}
export async function size ( file: Picked ): Promise<Facts> {

    const { size: made } = port.get();
    const found = made ? await exception.probeAsync(() => made(file)) : undefined;

    return { width: found?.width ?? file.width, height: found?.height ?? file.height, duration: found?.duration ?? file.duration };

}
export function link ( file: Picked ): Link {

    const { link: made } = port.get();

    return (made ? exception.probe(() => made(file)) : undefined) ?? { url: file.uri, release: () => undefined };

}
export async function pick ( options: Pick = {} ): Promise<Picked[]> {

    const { pick: made } = port.get();
    const found = made ? (await exception.probeAsync(() => made(options))) ?? [] : [];
    const kept = typeof options.limit === "number" && options.limit >= 1 ? found.slice(0, Math.floor(options.limit)) : found;
    const { image } = options;

    return image === undefined ? kept : Promise.all(kept.map(( one ) => resize(one, image)));

}
