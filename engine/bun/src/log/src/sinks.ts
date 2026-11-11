import * as date from "engine-date";
import * as json from "engine-json";
import type { Entry, Facts, Level, Logger, Sink } from "./logger.ts";
import { levels, tried } from "./logger.ts";

type Timer = ReturnType<typeof setTimeout>;
type Seen = { at: number; missed: number };
type Held<K> = { size: number; keys: () => Iterator<K>; delete: ( key: K ) => boolean };

export type Counter = { count: Record<Entry["level"], number>; reset: () => void };
export type BatchOptions = {
    size?: number | undefined;
    wait?: number | undefined;
    keep?: number | undefined;
    onFail?: (( failure: unknown, entries: readonly Entry[] ) => void) | undefined;
};
export type Batch = Sink & { flush: () => Promise<void>; size: () => number };

const reserved = new Set(["time", "level", "name", "message", "facts"]);
const escapes: Record<number, string> = { 9: "\\t", 10: "\\n", 13: "\\r" };
const slowest = 60_000;

function whole ( value: number | undefined, fallback: number, least: number ): number {

    return typeof value !== "number" || Number.isNaN(value) ? fallback : Math.max(least, Math.floor(value));

}
function flat ( text: string ): string {

    let out = "";
    let from = 0;

    for ( let index = 0; index < text.length; index += 1 ) {

        const code = text.charCodeAt(index);

        if ( (code > 31 && code < 127) || (code > 159 && code !== 0x2028 && code !== 0x2029) ) continue;

        out += `${text.slice(from, index)}${escapes[code] ?? `\\u${code.toString(16).padStart(4, "0")}`}`;
        from = index + 1;

    }

    return from === 0 ? text : out + text.slice(from);

}
function keyOf ( entry: Entry ): string {

    return `${entry.level}|${entry.name}|${entry.message}`;

}
function trim<K> ( held: Held<K>, most: number ): void {

    if ( held.size <= most ) return;

    const first = held.keys().next();

    if ( !first.done ) held.delete(first.value);

}

export function memorySink ( keep = 500 ): Sink & { entries: Entry[]; clear: () => void } {

    const most = whole(keep, 500, 0);
    const entries: Entry[] = [];
    const sink = (( entry: Entry ) => {

        entries.push(entry);

        if ( entries.length > most ) entries.splice(0, entries.length - most);

    }) as Sink & { entries: Entry[]; clear: () => void };

    sink.entries = entries;
    sink.clear = () => {

        entries.length = 0;

    };

    return sink;

}
export function lineSink ( write: ( line: string ) => void ): Sink {

    return ( entry ) => {

        const facts = Object.keys(entry.facts).length ? ` ${flat(json.stringify(entry.facts))}` : "";

        write(`${date.iso(entry.at)} ${entry.level.toUpperCase().padEnd(5)} ${flat(entry.name)}: ${flat(entry.message)}${facts}`);

    };

}
export function jsonSink ( write: ( line: string ) => void ): Sink {

    return ( entry ) => {

        const line: Facts = { time: date.iso(entry.at), level: entry.level, name: entry.name, message: entry.message };
        let clash: Facts | undefined;

        for ( const [key, value] of Object.entries(entry.facts) ) {

            if ( !json.safeKey(key) ) continue;

            if ( !reserved.has(key) ) line[key] = value;
            else if ( clash === undefined ) clash = { [key]: value };
            else clash[key] = value;

        }

        if ( clash ) line.facts = clash;

        write(flat(json.stringify(line)));

    };

}
export function consoleSink (): Sink {

    return ( entry ) => {

        const line = `${entry.name}: ${entry.message}`;
        const facts = Object.keys(entry.facts).length ? [entry.facts] : [];

        if ( entry.level === "error" ) console.error(line, ...facts);
        else if ( entry.level === "warn" ) console.warn(line, ...facts);
        else if ( entry.level === "info" ) console.info(line, ...facts);
        else console.debug(line, ...facts);

    };

}
export function filterSink ( sink: Sink, keep: ( entry: Entry ) => boolean ): Sink {

    return ( entry ) => {

        if ( keep(entry) ) sink(entry);

    };

}
export function leveled ( sink: Sink, level: Level ): Sink {

    const rank = levels[level];
    const floor = typeof rank === "number" ? rank : levels.info;

    return ( entry ) => {

        if ( levels[entry.level] >= floor ) sink(entry);

    };

}
export function tee ( ...sinks: readonly Sink[] ): Sink {

    return ( entry ) => {

        let first: { failure: unknown } | undefined;

        for ( const sink of sinks ) {

            const broken = tried(sink, entry);

            first ??= broken;

        }

        if ( first ) throw first.failure;

    };

}
export function once ( sink: Sink, keep = 1000 ): Sink {

    const most = whole(keep, 1000, 1);
    const seen = new Set<string>();

    return ( entry ) => {

        const key = keyOf(entry);

        if ( seen.has(key) ) return;

        seen.add(key);
        trim(seen, most);
        sink(entry);

    };

}
export function throttled ( sink: Sink, everyMs: number, keep = 1000 ): Sink {

    const most = whole(keep, 1000, 1);
    const last = new Map<string, Seen>();

    return ( entry ) => {

        const key = keyOf(entry);
        const seen = last.get(key);
        const waited = seen === undefined ? 0 : entry.at - seen.at;

        if ( seen !== undefined && waited >= 0 && waited < everyMs ) {

            seen.missed += 1;

            return;

        }

        last.delete(key);
        last.set(key, { at: entry.at, missed: 0 });
        trim(last, most);
        sink(seen !== undefined && seen.missed > 0 ? { ...entry, facts: { ...entry.facts, suppressed: seen.missed } } : entry);

    };

}
export function batchSink ( send: ( entries: readonly Entry[] ) => Promise<void> | void, options: BatchOptions = {} ): Batch {

    const { onFail } = options;
    const size = whole(options.size, 20, 1);
    const wait = Math.min(whole(options.wait, 2000, 0), slowest);
    const keep = Math.max(size, whole(options.keep, 1000, 1));
    let held: Entry[] = [];
    let failures = 0;
    let timer: Timer | undefined;
    let flight: Promise<void> | undefined;
    const disarm = (): void => {

        clearTimeout(timer);
        timer = undefined;

    };
    const arm = (): void => {

        if ( timer !== undefined ) return;

        timer = setTimeout(() => {

            timer = undefined;
            void flush();

        }, failures === 0 ? wait : Math.min(Math.max(wait, 250) * 2 ** Math.min(failures, 16), slowest));

    };
    const ship = async (): Promise<void> => {

        const batch = held;

        held = [];

        try {

            await send(batch);
            failures = 0;

        } catch ( caught ) {

            failures += 1;
            held = batch.concat(held).slice(-keep);
            disarm();

            if ( onFail ) tried(( lost: readonly Entry[] ) => onFail(caught, lost), batch);

        }

    };
    const landed = (): void => {

        flight = undefined;

        if ( failures === 0 && held.length >= size ) void flush();
        else if ( held.length > 0 ) arm();

    };
    const flush = async (): Promise<void> => {

        disarm();

        if ( flight ) await flight;

        if ( flight === undefined && held.length > 0 ) flight = ship().then(landed);

        if ( flight ) await flight;

    };
    const sink = (( entry: Entry ) => {

        held.push(entry);

        if ( held.length > keep ) held.splice(0, held.length - keep);

        if ( flight === undefined && failures === 0 && held.length >= size ) void flush();
        else arm();

    }) as Batch;

    sink.flush = flush;
    sink.size = () => held.length;

    return sink;

}
export function counting (): Sink & Counter {

    const empty = (): Record<Entry["level"], number> => ({ debug: 0, info: 0, warn: 0, error: 0 });
    const sink = (( entry: Entry ) => {

        sink.count[entry.level] += 1;

    }) as Sink & Counter;

    sink.count = empty();
    sink.reset = () => {

        sink.count = empty();

    };

    return sink;

}
export function lastOf ( entries: readonly Entry[], level?: Level ): Entry | undefined {

    const floor = level === undefined ? 0 : levels[level];

    for ( let index = entries.length - 1; index >= 0; index -= 1 ) {

        const entry = entries[index];

        if ( entry !== undefined && levels[entry.level] >= floor ) return entry;

    }

    return undefined;

}
export function mute ( logger: Logger ): Logger {

    const quiet: Logger = {
        name: logger.name,
        level: "silent",
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        child: () => quiet,
        time: () => () => 0,
        measure: async ( _, work ) => work(),
        enabled: () => false,
    };

    return quiet;

}
