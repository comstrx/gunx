export type Scope = { masking: boolean; extra: ReadonlySet<string> };
export type Verdict = { flat: string; secret: boolean };
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
export type Timer = ReturnType<typeof setTimeout>;
export type Seen = { at: number; missed: number };
export type Held<K> = { size: number; keys: () => Iterator<K>; delete: ( key: K ) => boolean };
export type Counter = { count: Record<Entry["level"], number>; reset: () => void };
export type BatchOptions = {
    size?: number | undefined;
    wait?: number | undefined;
    keep?: number | undefined;
    onFail?: (( failure: unknown, entries: readonly Entry[] ) => void) | undefined;
};
export type Batch = Sink & { flush: () => Promise<void>; size: () => number; destroy: () => void };
