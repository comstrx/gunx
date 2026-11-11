import * as date from "engine-date";
import { whole } from "./flow.ts";

type Budget = { left: number };
type Entry = { value: unknown; at: number };

export type MemoOptions = { ttl?: number | undefined; size?: number | undefined; key?: (( ...args: unknown[] ) => string) | undefined };
export type Memo<F extends ( ...args: never[] ) => unknown> = F & { clear: () => void; size: () => number; forget: ( ...args: Parameters<F> ) => boolean };

const deepest = 8;
const widest = 512;
const most = 1024;
const marks = new WeakMap<object, number>();
const symbols = new Map<symbol, number>();
let marked = 0;

function mark ( value: object ): string {

    const known = marks.get(value);

    if ( known !== undefined ) return `#${known}`;

    marked += 1;
    marks.set(value, marked);

    return `#${marked}`;

}
function symbolic ( value: symbol ): string {

    const known = symbols.get(value);

    if ( known !== undefined ) return `@${known}`;

    const oldest = symbols.keys().next();

    if ( symbols.size >= most && !oldest.done ) symbols.delete(oldest.value);

    marked += 1;
    symbols.set(value, marked);

    return `@${marked}`;

}
function sign ( value: unknown, depth: number, budget: Budget ): string {

    if ( typeof value === "string" ) return `'${value.length}:${value}`;
    if ( typeof value === "number" ) return Object.is(value, -0) ? "-0" : `${value}`;
    if ( typeof value === "boolean" ) return value ? "t" : "f";
    if ( typeof value === "bigint" ) return `${value}n`;
    if ( typeof value === "symbol" ) return symbolic(value);
    if ( typeof value === "function" ) return mark(value);
    if ( typeof value !== "object" ) return "u";
    if ( value === null ) return "l";
    if ( value instanceof Date ) return `d${value.getTime()}`;
    if ( depth >= deepest ) return mark(value);

    let out = "";

    if ( Array.isArray(value) ) {

        budget.left -= value.length;

        if ( budget.left < 0 ) return mark(value);

        for ( let index = 0; index < value.length; index += 1 ) out += `${index === 0 ? "" : ","}${sign(value[index], depth + 1, budget)}`;

        return `[${out}]`;

    }

    const parent: unknown = Object.getPrototypeOf(value);

    if ( (parent !== Object.prototype && parent !== null) || Object.getOwnPropertySymbols(value).length > 0 ) return mark(value);

    const names = Object.keys(value);
    const held = value as Record<string, unknown>;
    let sorted = true;

    budget.left -= names.length;

    if ( budget.left < 0 ) return mark(value);

    for ( let index = 1; sorted && index < names.length; index += 1 ) sorted = (names[index - 1] ?? "") < (names[index] ?? "");

    if ( !sorted ) names.sort();

    for ( const name of names ) out += `${out === "" ? "" : ","}${name.length}:${name}${sign(held[name], depth + 1, budget)}`;

    return `{${out}}`;

}
function keyOf ( args: readonly unknown[] ): string {

    const first = args[0];

    if ( args.length === 1 && typeof first === "string" ) return `s${first}`;
    if ( args.length === 0 ) return "";

    const budget: Budget = { left: widest };
    let out = sign(first, 0, budget);

    for ( let index = 1; index < args.length; index += 1 ) out += `,${sign(args[index], 0, budget)}`;

    return out;

}
function guarded<T> ( value: T, forget: () => void ): T {

    if ( !(value instanceof Promise) ) return value;

    return value.then(undefined, ( reason: unknown ) => {

        forget();

        throw reason;

    }) as T;

}

export function once<T> ( work: () => T ): () => T {

    let done = false;
    let kept: T;

    return () => {

        if ( !done ) {

            const made: T = guarded(work(), () => {

                if ( kept === made ) done = false;

            });

            kept = made;
            done = true;

        }

        return kept;

    };

}
export function memo<F extends ( ...args: never[] ) => unknown> ( work: F, options: MemoOptions = {} ): Memo<F> {

    const { ttl, key } = options;
    const size = whole(options.size, 256, 0);
    const cache = new Map<string, Entry>();
    let latest: string | undefined;
    const named = ( args: readonly unknown[] ): string => (key ? key(...args) : keyOf(args));
    const wrapped = (( ...args: Parameters<F> ) => {

        const name = named(args);
        const found = cache.get(name);
        const age = found === undefined || ttl === undefined ? 0 : date.now() - found.at;

        if ( found !== undefined && (ttl === undefined || (age >= 0 && age < ttl)) ) {

            if ( name !== latest ) {

                cache.delete(name);
                cache.set(name, found);
                latest = name;

            }

            return found.value;

        }

        const value = work(...args);
        const entry: Entry = { value, at: date.now() };

        if ( value instanceof Promise ) entry.value = guarded(value, () => {

            if ( cache.get(name) === entry ) cache.delete(name);

        });

        if ( found !== undefined ) cache.delete(name);

        cache.set(name, entry);
        latest = name;

        if ( cache.size > size ) {

            const oldest = cache.keys().next();

            if ( !oldest.done ) cache.delete(oldest.value);

        }

        return entry.value;

    }) as Memo<F>;

    wrapped.clear = () => cache.clear();
    wrapped.size = () => cache.size;
    wrapped.forget = ( ...args ) => cache.delete(named(args));

    return wrapped;

}
export function single<A extends unknown[], T> ( work: ( ...args: A ) => Promise<T>, key?: ( ...args: A ) => string ): ( ...args: A ) => Promise<T> {

    const flights = new Map<string, Promise<T>>();

    return ( ...args ) => {

        const name = key ? key(...args) : keyOf(args);
        const flying = flights.get(name);

        if ( flying ) return flying;

        const flight = (async () => work(...args))().finally(() => flights.delete(name));

        flights.set(name, flight);

        return flight;

    };

}
