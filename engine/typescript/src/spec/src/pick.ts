import * as exception from "engine-exception";
import * as json from "engine-json";
import type { Aim, Choices, Mode, Platform, Surface } from "./arch.ts";
import { built, isBuilt } from "./define.ts";

const platforms: readonly Platform[] = ["web", "mobile", "desktop"];
const modes: readonly Mode[] = ["dev", "release"];
const held = new WeakMap<object, Readonly<Record<string, unknown>>>();
const gone: unique symbol = Symbol("gone");

function resolved ( value: unknown, target: Aim ): unknown {

    const choices = typeof value === "object" && value !== null ? held.get(value) : undefined;

    if ( choices !== undefined ) {

        const key = Object.keys(choices).every(( name ) => modes.includes(name as Mode)) ? (target.release ? "release" : "dev") : target.platform;

        return Object.hasOwn(choices, key) ? resolved(choices[key], target) : gone;

    }

    if ( Array.isArray(value) ) {

        const items = value.map(( item ) => resolved(item, target));

        return items.every(( item, index ) => item === value[index]) ? value : items.filter(( item ) => item !== gone);

    }

    if ( !json.isRecord(value) ) return value;

    const entries = Object.entries(value).map(([key, item]) => [key, resolved(item, target)] as const);

    if ( entries.every(([key, item]) => item === value[key]) ) return value;

    const copy = Object.fromEntries(entries.filter(([, item]) => item !== gone));

    if ( isBuilt(value) ) Object.defineProperty(copy, built, { value: true, enumerable: false });

    return Object.isFrozen(value) ? Object.freeze(copy) : copy;

}

export function pick<T> ( choices: Choices<T> ): T {

    const keys = json.isRecord(choices) ? Object.keys(choices) : [];

    if ( keys.length === 0 || !(keys.every(( key ) => platforms.includes(key as Platform)) || keys.every(( key ) => modes.includes(key as Mode))) ) throw exception.fault("internal", "spec.pick", { message: `pick chooses a value by platform (${platforms.join(", ")}) or by mode (${modes.join(", ")})` });

    const made = Object.freeze({});

    held.set(made, Object.freeze({ ...choices }));

    return made as T;

}
export function isPick ( value: unknown ): boolean {

    return typeof value === "object" && value !== null && held.has(value);

}
export function chosen ( surface: Surface, platform: Platform, release = false ): Surface {

    if ( !platforms.includes(platform) ) throw exception.fault("internal", "spec.platform", { message: `${String(platform)}: a platform is ${platforms.join(", ")}` });

    const target: Aim = { platform, release: release === true };
    const config = resolved(surface.config, target);
    const screens = resolved(surface.screens, target);
    const signals = resolved(surface.signals, target);
    const on = resolved(surface.on, target);
    const triggers = resolved(surface.triggers, target);

    return Object.freeze({ ...surface, config: (config === gone ? {} : config) as json.Dictionary, screens: (screens === gone ? [] : screens) as Surface["screens"], signals: (signals === gone ? [] : signals) as Surface["signals"], on: (on === gone ? {} : on) as Surface["on"], triggers: (triggers === gone ? [] : triggers) as Surface["triggers"] });

}
