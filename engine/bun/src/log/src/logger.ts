import * as date from "engine-date";
import * as error from "engine-error";
import * as json from "engine-json";

type Scope = { masking: boolean; extra: ReadonlySet<string> };
type Verdict = { flat: string; secret: boolean };

export type Level = "debug" | "info" | "warn" | "error" | "silent";
export type Facts = Record<string, unknown>;
export type Entry = { at: number; level: Exclude<Level, "silent">; name: string; message: string; facts: Facts };
export type Sink = ( entry: Entry ) => void;
export type Options = {
    name?: string | undefined;
    level?: Level | (() => Level) | undefined;
    sinks?: readonly Sink[] | undefined;
    facts?: Facts | undefined;
    redact?: boolean | readonly string[] | undefined;
    onFail?: (( failure: unknown, entry: Entry ) => void) | undefined;
};
export type Logger = {
    readonly name: string;
    readonly level: Level;
    debug: ( message: string, facts?: Facts ) => void;
    info: ( message: string, facts?: Facts ) => void;
    warn: ( message: string, facts?: Facts ) => void;
    error: ( message: string, failure?: unknown, facts?: Facts ) => void;
    child: ( name: string, facts?: Facts ) => Logger;
    time: ( label: string ) => () => number;
    measure: <T>( label: string, work: () => Promise<T> | T, facts?: Facts ) => Promise<T>;
    enabled: ( level: Level ) => boolean;
};

export const levels: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const deepest = 6;
const widest = 100;
const most = 1000;
const anywhere = /password|passwd|passphrase|secret|token|authorization|cookie|credential|private|signature|apikey|accesskey|authkey|sessionid|cardnumber|securitycode/;
const ending = /(pass|pwd)$/;
const alone = new Set(["pass", "pwd", "pin", "otp", "cvv", "cvc", "ssn", "jwt", "csrf", "xsrf", "bearer"]);
const plain = new Set(["bypass", "compass", "encompass", "overpass", "surpass", "trespass", "underpass"]);
const shaped = /\b(Bearer|Basic|bearer|basic)\s+(?=[\w.~+/=-]*(?:\d|[a-z][A-Z]))[\w.~+/=-]{12,}|(:\/\/)[^\s/:@]*:[^\s/@]+@|([?&](?:access_token|refresh_token|id_token|token|password|passwd|secret|client_secret|api_key|apikey|signature|sig)=)[^&#\s]+|\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g;
const verdicts = new Map<string, Verdict>();

function ranked ( level: Level ): number {

    const rank = levels[level];

    return typeof rank === "number" ? rank : levels.info;

}
function veil ( _: string, scheme?: string, slashes?: string, param?: string ): string {

    if ( scheme ) return `${scheme} ***`;
    if ( slashes ) return "://***@";

    return param ? `${param}***` : "***";

}
function mask ( text: string ): string {

    return text.length < 6 ? text : text.replace(shaped, veil);

}
function squash ( name: string ): string {

    return name.toLowerCase().replace(/[\s_.:-]+/g, "");

}
function hidden ( key: string, extra: ReadonlySet<string> ): boolean {

    let verdict = verdicts.get(key);

    if ( verdict === undefined ) {

        const flat = squash(key);
        const parts = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
        const last = parts[parts.length - 1] ?? "";

        verdict = { flat, secret: anywhere.test(flat) || parts.some(( part ) => alone.has(part)) || (ending.test(last) && !plain.has(last)) };

        if ( verdicts.size >= most ) verdicts.clear();

        verdicts.set(key, verdict);

    }

    return verdict.secret || (extra.size > 0 && extra.has(verdict.flat));

}
function described ( failure: unknown ): Facts {

    try {

        return error.describe(failure);

    } catch {

        return { message: "unprintable failure" };

    }

}
function caused ( failure: Error ): Facts {

    const facts = described(failure);
    const { cause } = failure;

    if ( typeof cause === "object" && cause !== null && facts.cause !== undefined ) facts.cause = cause;

    return facts;

}
function shown ( failure: unknown ): unknown {

    return typeof failure === "object" && failure !== null ? failure : described(failure);

}
function listed ( items: readonly unknown[], scope: Scope, trail: object[] ): unknown[] {

    const out: unknown[] = [];
    const shown = Math.min(items.length, widest);

    for ( let index = 0; index < shown; index += 1 ) out.push(clean(items[index], scope, trail));

    if ( items.length > shown ) out.push(`[+${items.length - shown}]`);

    return out;

}
function put ( out: Facts, key: string, value: unknown, scope: Scope, trail: object[] ): void {

    if ( !json.safeKey(key) ) return;

    if ( scope.masking && hidden(key, scope.extra) ) out[key] = "***";
    else out[key] = typeof value === "number" || typeof value === "boolean" ? value : clean(value, scope, trail);

}
function record ( source: object, scope: Scope, trail: object[], out: Facts ): Facts {

    const held = source as Facts;
    const names = Object.keys(source);
    const shown = Math.min(names.length, widest);

    for ( let index = 0; index < shown; index += 1 ) {

        const key = names[index] ?? "";

        put(out, key, held[key], scope, trail);

    }

    if ( names.length > shown ) out["[more]"] = names.length - shown;

    return out;

}
function mapped ( source: ReadonlyMap<unknown, unknown>, scope: Scope, trail: object[] ): Facts {

    const out: Facts = {};
    let left = widest;

    for ( const [key, value] of source ) {

        if ( left === 0 ) break;

        left -= 1;
        put(out, String(key), value, scope, trail);

    }

    if ( source.size > widest ) out["[more]"] = source.size - widest;

    return out;

}
function clean ( value: unknown, scope: Scope, trail: object[] ): unknown {

    if ( typeof value === "string" ) return scope.masking ? mask(value) : value;
    if ( typeof value === "bigint" ) return value.toString();
    if ( typeof value !== "object" || value === null || value instanceof Date ) return value;
    if ( value instanceof ArrayBuffer || ArrayBuffer.isView(value) ) return `[bytes ${value.byteLength}]`;
    if ( trail.includes(value) ) return "[circular]";
    if ( trail.length >= deepest ) return "[deep]";

    trail.push(value);

    try {

        if ( Array.isArray(value) ) return listed(value, scope, trail);
        if ( value instanceof Set ) return listed(Array.from(value), scope, trail);

        if ( value instanceof Map ) return mapped(value, scope, trail);
        if ( value instanceof String || value instanceof Number || value instanceof Boolean ) return clean(value.valueOf(), scope, trail);

        return record(value instanceof Error ? caused(value) : value, scope, trail, {});

    } catch {

        return "[unreadable]";

    } finally {

        trail.pop();

    }

}
function safe ( facts: Facts, scope: Scope, out: Facts = {} ): Facts {

    try {

        return record(facts, scope, [facts], out);

    } catch {

        out["[unreadable]"] = true;

        return out;

    }

}

export function tried<A> ( work: ( value: A ) => void, value: A ): { failure: unknown } | undefined {

    try {

        work(value);

        return undefined;

    } catch ( failure ) {

        return { failure };

    }

}
export function redact ( facts: Facts, names: readonly string[] = [] ): Facts {

    return safe(facts, { masking: true, extra: new Set(names.map(squash)) });

}
export function create ( options: Options = {} ): Logger {

    const { name = "app", level = "info", sinks = [], facts: base = {}, redact: masked = true, onFail } = options;
    const scope: Scope = { masking: masked !== false, extra: new Set(typeof masked === "boolean" ? [] : masked.map(squash)) };
    const kept = safe(base, scope);
    const moving = typeof level === "function";
    const read = typeof level === "function" ? level : (): Level => level;
    const fixed = moving ? levels.info : ranked(read());
    const floor = (): number => (moving ? ranked(read()) : fixed);
    const lap = ( started: number ): number => Math.round((performance.now() - started) * 100) / 100;
    const emit = ( kind: Entry["level"], message: string, facts?: Facts ): void => {

        if ( levels[kind] < floor() ) return;

        const text = typeof message === "string" ? message : String(message);
        const entry: Entry = {
            at: date.now(),
            level: kind,
            name,
            message: scope.masking ? mask(text) : text,
            facts: facts === undefined ? { ...kept } : safe(facts, scope, { ...kept }),
        };

        for ( const sink of sinks ) {

            const broken = tried(sink, entry);

            if ( broken !== undefined && onFail ) tried(( at: Entry ) => onFail(broken.failure, at), entry);

        }

    };

    return {
        name,
        get level (): Level {

            const now = read();

            return typeof levels[now] === "number" ? now : "info";

        },
        enabled: ( wanted ) => wanted !== "silent" && levels[wanted] >= floor(),
        debug: ( message, facts ) => emit("debug", message, facts),
        info: ( message, facts ) => emit("info", message, facts),
        warn: ( message, facts ) => emit("warn", message, facts),
        error: ( message, failure, facts ) => emit("error", message, failure === undefined ? facts : { ...facts, failure: shown(failure) }),
        child: ( suffix, facts ) => create({ ...options, name: `${name}.${suffix}`, facts: facts === undefined ? base : { ...base, ...facts } }),
        time: ( label ) => {

            const started = performance.now();

            return () => {

                const ms = lap(started);

                emit("debug", label, { ms });

                return ms;

            };

        },
        measure: async ( label, work, facts ) => {

            const started = performance.now();

            try {

                const result = await work();

                emit("info", label, { ...facts, ms: lap(started), ok: true });

                return result;

            } catch ( caught ) {

                emit("error", label, { ...facts, ms: lap(started), ok: false, failure: shown(caught) });

                throw caught;

            }

        },
    };

}
