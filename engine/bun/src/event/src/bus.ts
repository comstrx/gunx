import { awaited, linked, type Wait } from "./abort.ts";
import { entered, type Fail, raise, tried } from "./emitter.ts";

export type Message<T = unknown> = { topic: string; payload: T; at: number; id: number };
export type Subscriber<T = unknown> = ( payload: T, message: Message<T> ) => void;
export type Pattern = string;
export type Subscribe = { replay?: boolean | number | undefined; signal?: AbortSignal | undefined };
export type BusOptions = { replay?: number | undefined; topics?: number | undefined; now?: (() => number) | undefined; fail?: Fail | undefined };
export type Bus = {
    publish: <T>( topic: string, payload: T ) => number;
    subscribe: <T = unknown>( pattern: Pattern, subscriber: Subscriber<T>, options?: Subscribe ) => () => void;
    once: <T = unknown>( pattern: Pattern, options?: number | Wait ) => Promise<Message<T>>;
    last: <T = unknown>( topic: string ) => Message<T> | undefined;
    history: ( pattern?: Pattern ) => Message[];
    topics: () => string[];
    count: ( pattern?: Pattern ) => number;
    forget: ( pattern?: Pattern ) => number;
    clear: () => void;
};

type Row = { id: number; pattern: Pattern; subscriber: Subscriber; live: boolean };
type Wild = { parts: readonly string[]; rows: readonly Row[] };

const none: readonly Row[] = [];

function whole ( value: number | undefined, fallback: number ): number {

    return value === undefined || Number.isNaN(value) ? fallback : Math.max(0, Math.floor(value));

}
function fits ( one: string, other: string ): boolean {

    if ( one === "**" || other === "**" ) return true;
    if ( one === "*" ) return other !== "";
    if ( other === "*" ) return one !== "";

    return one === other;

}
function meet ( one: readonly string[], other: readonly string[] ): boolean {

    const wide = other.length + 1;
    const seen = new Uint8Array((one.length + 1) * wide);
    const open = [0];

    for ( let spot = open.pop(); spot !== undefined; spot = open.pop() ) {

        if ( seen[spot] ) continue;

        seen[spot] = 1;

        const at = Math.floor(spot / wide);
        const to = spot % wide;

        if ( at === one.length && to === other.length ) return true;
        if ( at === one.length || to === other.length ) continue;

        const first = one[at] ?? "";
        const second = other[to] ?? "";

        if ( !fits(first, second) ) continue;

        open.push((at + 1) * wide + to + 1);

        if ( first === "**" ) open.push(at * wide + to + 1);
        if ( second === "**" ) open.push((at + 1) * wide + to);

    }

    return false;

}
function walk ( pattern: readonly string[], topic: readonly string[] ): boolean {

    let at = 0;
    let spot = 0;
    let star = -1;
    let mark = 0;

    while ( spot < topic.length ) {

        const part = pattern[at];

        if ( part === "**" ) {

            star = at;
            mark = spot + 1;
            at += 1;
            spot = mark;

            continue;

        }

        if ( part !== undefined && (part === "*" ? topic[spot] !== "" : part === topic[spot]) ) {

            at += 1;
            spot += 1;

            continue;

        }

        if ( star === -1 || mark >= topic.length ) return false;

        mark += 1;
        at = star + 1;
        spot = mark;

    }

    return at === pattern.length;

}

export function matches ( pattern: Pattern, topic: string ): boolean {

    if ( pattern === topic || pattern === "**" ) return true;
    if ( !pattern.includes("*") ) return false;

    return walk(pattern.split("."), topic.split("."));

}
export function bus ( options: BusOptions = {} ): Bus {

    const { now = Date.now, fail } = options;
    const replay = whole(options.replay, 1);
    const cap = whole(options.topics, 1024);
    const exact = new Map<Pattern, readonly Row[]>();
    const wild = new Map<Pattern, Wild>();
    const kept = new Map<string, Message[]>();
    let sequence = 0;
    let order = 0;
    let depth = 0;
    const held = ( pattern: Pattern ): readonly Row[] => (pattern.includes("*") ? wild.get(pattern)?.rows : exact.get(pattern)) ?? none;
    const put = ( pattern: Pattern, rows: readonly Row[] ): void => {

        if ( !pattern.includes("*") ) {

            if ( rows.length ) exact.set(pattern, rows);
            else exact.delete(pattern);

            return;

        }

        if ( rows.length ) wild.set(pattern, { parts: wild.get(pattern)?.parts ?? pattern.split("."), rows });
        else wild.delete(pattern);

    };
    const drop = ( row: Row ): void => {

        if ( !row.live ) return;

        row.live = false;
        put(row.pattern, held(row.pattern).filter(( other ) => other !== row));

    };
    const keep = ( message: Message ): void => {

        if ( replay === 0 || cap === 0 ) return;

        const rows = replay === 1 ? [] : (kept.get(message.topic) ?? []);

        rows.push(message);

        if ( rows.length > replay ) rows.shift();

        kept.delete(message.topic);
        kept.set(message.topic, rows);

        if ( kept.size <= cap ) return;

        const oldest = kept.keys().next();

        if ( !oldest.done ) kept.delete(oldest.value);

    };
    const targets = ( topic: string ): readonly Row[] => {

        const direct = exact.get(topic) ?? none;

        if ( wild.size === 0 ) return direct;

        const found: Row[] = [...direct];
        let parts: string[] | undefined;
        let sorted = true;
        let last = found[found.length - 1]?.id ?? 0;

        for ( const [pattern, entry] of wild ) {

            if ( pattern !== "**" ) {

                parts = parts ?? topic.split(".");

                if ( !walk(entry.parts, parts) ) continue;

            }

            for ( const row of entry.rows ) {

                if ( row.id < last ) sorted = false;

                last = row.id;
                found.push(row);

            }

        }

        return sorted ? found : found.sort(( a, b ) => a.id - b.id);

    };
    const made: Bus = {
        publish: ( topic, payload ) => {

            let failures: unknown[] | undefined;
            let delivered = 0;

            depth = entered(depth);

            try {

                sequence += 1;

                const message: Message = { topic, payload, at: now(), id: sequence };

                keep(message);

                for ( const row of targets(topic) ) {

                    if ( !row.live ) continue;

                    delivered += 1;
                    failures = tried(row.subscriber, payload, message, fail, failures);

                }

            } finally {

                depth -= 1;

            }

            raise(failures);

            return delivered;

        },
        subscribe: ( pattern, subscriber, given = {} ) => {

            order += 1;

            const row: Row = { id: order, pattern, subscriber: subscriber as Subscriber, live: true };

            put(pattern, [...held(pattern), row]);

            const off = linked(() => drop(row), given.signal);
            const past = given.replay && row.live ? made.history(pattern) : [];
            const from = given.replay === true ? 0 : Math.max(0, past.length - whole(Number(given.replay), 0));
            let failures: unknown[] | undefined;

            for ( const message of past.slice(from) ) if ( row.live ) failures = tried(row.subscriber, message.payload, message, fail, failures);

            if ( failures ) off();

            raise(failures);

            return off;

        },
        once: <T>( pattern: Pattern, given?: number | Wait ) => awaited<Message<T>>("event.once", given, ( done ) => made.subscribe<T>(pattern, ( _, message ) => done(message)), pattern),
        last: <T>( topic: string ) => {

            const rows = kept.get(topic);

            return rows?.[rows.length - 1] as Message<T> | undefined;

        },
        history: ( pattern = "**" ) => {

            const found: Message[] = [];

            for ( const [topic, rows] of kept ) if ( matches(pattern, topic) ) for ( const message of rows ) found.push(message);

            return found.sort(( a, b ) => a.id - b.id);

        },
        topics: () => [...kept.keys()].sort(),
        count: ( pattern ) => {

            const parts = pattern?.split(".");
            let total = 0;

            for ( const [own, rows] of exact ) if ( pattern === undefined || matches(pattern, own) ) total += rows.length;
            for ( const entry of wild.values() ) if ( !parts || meet(parts, entry.parts) ) total += entry.rows.length;

            return total;

        },
        forget: ( pattern = "**" ) => {

            let dropped = 0;

            for ( const [topic, rows] of kept ) {

                if ( !matches(pattern, topic) ) continue;

                dropped += rows.length;
                kept.delete(topic);

            }

            return dropped;

        },
        clear: () => {

            for ( const rows of exact.values() ) for ( const row of rows ) row.live = false;
            for ( const entry of wild.values() ) for ( const row of entry.rows ) row.live = false;

            exact.clear();
            wild.clear();
            kept.clear();

        },
    };

    return made;

}
