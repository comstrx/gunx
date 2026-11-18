import * as exception from "engine-exception";
import type { Held } from "./arch.ts";

const tongues: Held<string> = new Map();

export function held<T> ( cache: Held<T>, key: string, make: () => T, limit = 256 ): T {

    const found = cache.get(key);

    if ( found ) return found.value;

    const value = make();

    if ( cache.size >= limit ) cache.clear();

    cache.set(key, { value });

    return value;

}
export function tongue ( locale: string ): string {

    if ( typeof locale !== "string" || locale.length > 64 ) return "en";

    return held(tongues, locale, () => {

        return exception.rescue(() => Intl.DateTimeFormat.supportedLocalesOf([locale.replace(/_/g, "-")])[0] ?? "en", () => "en");

    });

}
