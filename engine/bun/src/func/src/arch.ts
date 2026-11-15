export type Step = ( value: never ) => unknown;
export type Timer = ReturnType<typeof setTimeout>;
export type Deferred<T> = { promise: Promise<T>; resolve: ( value: T ) => void; reject: ( reason: unknown ) => void; settled: boolean };
export type DebounceOptions = { leading?: boolean | undefined; max?: number | undefined };
export type Debounced<F extends ( ...args: never[] ) => void> = F & { cancel: () => void; flush: () => void; pending: () => boolean };
export type Throttled<F extends ( ...args: never[] ) => void> = F & { cancel: () => void; flush: () => void; pending: () => boolean };
export type RetryOptions = {
    times?: number | undefined;
    delay?: number | undefined;
    factor?: number | undefined;
    max?: number | undefined;
    jitter?: boolean | undefined;
    when?: (( failure: unknown, attempt: number ) => boolean) | undefined;
    onRetry?: (( failure: unknown, attempt: number, wait: number ) => void) | undefined;
    signal?: AbortSignal | undefined;
};
export type BreakerState = "closed" | "open" | "half";
export type BreakerOptions = {
    failures?: number | undefined;
    cooldown?: number | undefined;
    when?: (( failure: unknown ) => boolean) | undefined;
    onChange?: (( state: BreakerState ) => void) | undefined;
};
export type Breaker = {
    run: <T>( work: () => Promise<T> ) => Promise<T>;
    state: () => BreakerState;
    reset: () => void;
    failures: () => number;
};
export type LaneOptions = { pending?: number | undefined };
export type Lane = {
    run: <T>( work: () => Promise<T>, signal?: AbortSignal ) => Promise<T>;
    size: () => number;
    active: () => number;
    waiting: () => number;
    idle: () => Promise<void>;
};
export type Budget = { left: number };
export type Entry = { value: unknown; at: number };
export type MemoOptions = { ttl?: number | undefined; size?: number | undefined; key?: (( ...args: unknown[] ) => string) | undefined };
export type Memo<F extends ( ...args: never[] ) => unknown> = F & { clear: () => void; size: () => number; forget: ( ...args: Parameters<F> ) => boolean };
