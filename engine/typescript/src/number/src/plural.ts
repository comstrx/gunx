import * as exception from "engine-exception";
import type { Category } from "./arch.ts";

const rules = new Map<string, Intl.PluralRules>();

function selected ( locale: string ): Intl.PluralRules {

    const tag = locale.replace(/_/g, "-") || "en";
    const found = rules.get(tag);

    if ( found !== undefined ) return found;

    const made = exception.rescue(() => new Intl.PluralRules([tag, "en"]), () => new Intl.PluralRules("en"));

    if ( rules.size >= 64 ) rules.delete(rules.keys().next().value ?? "");

    rules.set(tag, made);

    return made;

}

export function languageOf ( locale: string ): string {

    return (locale.split(/[-_]/)[0] ?? "").toLowerCase() || "en";

}
export function category ( count: number, locale = "en" ): Category {

    return Number.isFinite(count) ? selected(locale).select(count) : "other";

}
