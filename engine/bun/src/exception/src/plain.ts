import type { Plain } from "./arch.ts";
import { probe } from "./probe.ts";

const poison = "__proto__";

export function isRecord ( value: unknown ): value is Plain {

    return typeof value === "object" && value !== null && !Array.isArray(value);

}
export function isBlank ( value: unknown ): boolean {

    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");

}
export function compact<T extends Plain> ( value: T ): Partial<T> {

    const out: Plain = {};

    for ( const [key, item] of Object.entries(value) ) if ( item !== undefined && key !== poison ) out[key] = item;

    return out as Partial<T>;

}
export function printed ( value: unknown ): string {

    const seen = new WeakSet<object>();
    const text = probe(() => JSON.stringify(value, ( _key, item: unknown ) => {

        if ( typeof item === "bigint" ) return item.toString();
        if ( typeof item !== "object" || item === null ) return item;
        if ( seen.has(item) ) return "[Circular]";

        seen.add(item);

        return item;

    }));

    return text ?? Object.prototype.toString.call(value);

}
