import * as cache from "engine-cache";
import * as date from "engine-date";
import * as error from "engine-error";
import * as event from "engine-event";
import * as func from "engine-func";
import * as json from "engine-json";
import * as rand from "engine-rand";
import { backoff, clean, count, schedule, span } from "./policy.ts";

export type Status = "pending" | "running" | "done" | "failed" | "dead";
export type Job<P = unknown> = {
    id: string;
    type: string;
    payload: P;
    owner: string;
    key: string | undefined;
    status: Status;
    attempts: number;
    at: number;
    available: number;
    error: string | undefined;
    code: string | undefined;
};
export type Perform = ( job: Job, signal: AbortSignal ) => Promise<void>;
export type Outcome = { done: number; failed: number };
export type Counts = Record<Status, number>;
export type Push = { key?: string | undefined; delay?: number | undefined };
export type Options = {
    name?: string | undefined;
    store?: cache.Storage | undefined;
    owner: string;
    perform: Perform;
    retries?: number | undefined;
    delay?: number | undefined;
    factor?: number | undefined;
    backoff?: (( attempt: number ) => number) | undefined;
    when?: (( fault: error.Fault, job: Job ) => boolean) | undefined;
    timeout?: number | undefined;
    lanes?: number | undefined;
    strict?: boolean | undefined;
    keep?: number | undefined;
    onChange?: (( jobs: Job[] ) => void) | undefined;
    fail?: (( cause: unknown ) => void) | undefined;
};
export type Outbox = {
    push: <P>( type: string, payload: P, options?: Push ) => Promise<Job<P>>;
    flush: ( signal?: AbortSignal ) => Promise<Outcome>;
    jobs: ( status?: Status ) => Promise<Job[]>;
    get: ( id: string ) => Promise<Job | undefined>;
    counts: () => Promise<Counts>;
    pending: () => Promise<number>;
    next: () => Promise<number | undefined>;
    retry: ( id: string ) => Promise<boolean>;
    replay: () => Promise<number>;
    drop: ( id: string ) => Promise<boolean>;
    prune: ( status?: "done" | "dead" ) => Promise<number>;
    clear: () => Promise<void>;
    watch: ( listener: ( jobs: Job[] ) => void ) => () => void;
    start: ( every?: number ) => void;
    stop: () => void;
    load: () => Promise<Job[]>;
};

type End = "done" | "free" | "fail" | "dead";
type Ended = { job: Job; fault: error.Fault | undefined; end: End; wait: number };
type Flight = { signal: AbortSignal | undefined; seen: Set<string>; tally: Outcome; failures: unknown[]; blocked: boolean };

const statuses: readonly Status[] = ["pending", "running", "done", "failed", "dead"];
const spent: readonly Status[] = ["done", "dead"];
const grace = 5000;
const widest = 64;

function finite ( value: unknown ): number {

    return typeof value === "number" && Number.isFinite(value) ? value : 0;

}
function text ( value: unknown ): string | undefined {

    return typeof value === "string" ? value : undefined;

}
function jobOf ( value: unknown ): Job | undefined {

    if ( !json.isRecord(value) ) return undefined;

    const { id, type, owner } = value;
    const status = statuses.find(( known ) => known === value.status);

    if ( typeof id !== "string" || id === "" || typeof type !== "string" || typeof owner !== "string" || !status ) return undefined;

    return {
        id,
        type,
        payload: value.payload,
        owner,
        key: text(value.key),
        status,
        attempts: Math.max(0, Math.trunc(finite(value.attempts))),
        at: finite(value.at),
        available: finite(value.available),
        error: text(value.error),
        code: text(value.code),
    };

}
function waiting ( job: Job ): boolean {

    return job.status === "pending" || job.status === "failed";

}
function trimmed ( jobs: Job[], owner: string, keep: number ): Job[] {

    let extra = -keep;

    for ( const job of jobs ) if ( job.owner === owner ) extra += 1;

    if ( extra <= 0 ) return jobs;

    const gone = new Set<Job>();

    for ( const status of spent ) {

        for ( const job of jobs ) {

            if ( gone.size >= extra ) break;
            if ( job.owner === owner && job.status === status ) gone.add(job);

        }

    }

    return jobs.filter(( job ) => !gone.has(job));

}
function revive ( job: Job, now: number ): void {

    Object.assign(job, { status: "pending", attempts: job.status === "dead" ? 0 : job.attempts, available: now, error: undefined, code: undefined });

}
function halted ( signal: AbortSignal ): error.Fault {

    return error.fault("timeout", "queue.aborted", { cause: signal.reason });

}

export function create ( options: Options ): Outbox {

    const { name = "outbox", owner, perform, strict = false } = options;
    const retries = count(options.retries, 5);
    const lanes = strict ? 1 : Math.min(count(options.lanes, 1), widest);
    const keep = count(options.keep, 200);
    const timeout = span(options.timeout, 30_000, true);
    const lease = timeout === Number.POSITIVE_INFINITY ? 300_000 : timeout + grace;
    const pause = options.backoff ?? backoff({ delay: options.delay, factor: options.factor, max: 300_000 });
    const again = options.when ?? (( fault: error.Fault ) => error.transient(fault));
    const raw = options.store ?? cache.memory();
    const store = cache.typed<unknown>(raw);
    const lane = func.lane(1);
    let writing = false;
    let listening = false;
    const stray: unknown[] = [];
    const changes = event.emitter<{ change: Job[] }>({ fail: options.fail ?? (( cause ) => void stray.push(cause)) });
    const flights = new Map<string, event.Abortable>();
    const held = new Set<string>();
    let flight: Promise<Outcome> | undefined;
    let halt: (() => void) | undefined;
    const mine = ( jobs: readonly Job[] ): Job[] => jobs.filter(( job ) => job.owner === owner);
    const parsed = ( saved: unknown ): Job[] => {

        const jobs: Job[] = [];

        if ( !Array.isArray(saved) ) return jobs;

        for ( const row of saved ) {

            const job = jobOf(row);

            if ( job ) jobs.push(job);

        }

        return jobs;

    };
    const rows = async (): Promise<Job[]> => parsed(await store.read(name));
    const locked = <T>( work: () => Promise<T> ): Promise<T> => lane.run(() => (raw.lock === undefined ? work() : raw.lock(name, work)));
    const listen = (): void => {

        if ( listening ) return;

        listening = true;
        raw.watch(name, ( text ) => {

            if ( writing ) return;

            const jobs = mine(parsed(text === null ? undefined : json.parse(text)));

            if ( changes.has("change") ) changes.emit("change", jobs);

        });

    };
    const read = (): Promise<Job[]> => locked(async () => mine(await rows()));
    const raised = async <T>( work: Promise<T> ): Promise<T> => {

        const value = await work;

        if ( stray.length > 0 ) throw stray.splice(0)[0];

        return value;

    };
    const mutate = <T>( work: ( jobs: Job[] ) => readonly [T, boolean] ): Promise<T> => locked(async () => {

        const jobs = await rows();
        const [value, changed] = work(jobs);

        if ( !changed ) return value;

        const kept = trimmed(jobs, owner, keep);

        writing = true;

        try {

            await store.write(name, kept);

        } finally {

            writing = false;

        }

        if ( changes.has("change") ) changes.emit("change", mine(kept));

        return value;

    });
    const judged = ( job: Job, fault: error.Fault | undefined, state: Flight ): Ended => {

        if ( !fault ) return { job, fault, end: "done", wait: 0 };
        if ( state.signal?.aborted ) return { job, fault, end: "free", wait: 0 };

        const attempts = job.attempts + 1;

        try {

            const dead = attempts >= retries || !again(fault, job);

            return { job, fault, end: dead ? "dead" : "fail", wait: dead ? 0 : Math.max(clean(pause(attempts)), clean((fault.retryAfter ?? 0) * 1000)) };

        } catch ( cause ) {

            state.failures.push(cause);

            return { job, fault, end: attempts >= retries ? "dead" : "fail", wait: clean(options.delay ?? 1000) };

        }

    };
    const run = async ( job: Job, state: Flight ): Promise<Ended> => {

        const made = timeout === Number.POSITIVE_INFINITY ? event.abortable(state.signal) : event.deadline(timeout, state.signal);
        let fault: error.Fault | undefined;

        flights.set(job.id, made);

        try {

            await event.race((async () => perform(job, made.signal))(), made.signal);

        } catch ( caught ) {

            fault = error.of(caught);

        } finally {

            made.release();
            flights.delete(job.id);

        }

        return judged(job, fault, state);

    };
    const apply = ( jobs: Job[], ended: Ended, state: Flight, now: number ): boolean => {

        const { job, fault, end } = ended;
        const found = jobs.find(( row ) => row.id === job.id && row.owner === owner);

        held.delete(job.id);

        if ( !found || (end !== "done" && found.status !== "running") ) return false;

        if ( end === "done" ) Object.assign(found, { status: "done", attempts: job.attempts + 1, available: now, error: undefined, code: undefined });
        else if ( end === "free" ) Object.assign(found, { status: job.error === undefined ? "pending" : "failed", attempts: job.attempts, available: now });
        else Object.assign(found, { status: end === "dead" ? "dead" : "failed", attempts: job.attempts + 1, available: now + ended.wait, error: fault?.message, code: fault?.code });

        if ( end === "done" ) state.tally.done += 1;
        else if ( end !== "free" ) state.tally.failed += 1;

        if ( end !== "done" && strict ) state.blocked = true;

        return true;

    };
    const step = ( state: Flight, last: Ended | undefined ): Promise<Job | undefined> => mutate(( jobs ) => {

        const now = date.now();
        let changed = last ? apply(jobs, last, state, now) : false;

        if ( state.blocked || state.signal?.aborted ) return [undefined, changed];

        for ( const job of jobs ) {

            if ( job.owner !== owner || job.status === "done" || job.status === "dead" ) continue;

            const stale = job.status === "running" && job.available <= now && !held.has(job.id);

            if ( stale && job.attempts >= retries ) {

                const lost = error.fault("timeout", "queue.abandoned");

                Object.assign(job, { status: "dead", error: lost.message, code: lost.code });
                changed = true;

                continue;

            }

            if ( (stale || waiting(job)) && job.available <= now && !state.seen.has(job.id) ) {

                const taken: Job = { ...job, status: "running" };

                Object.assign(job, { status: "running", attempts: job.attempts + 1, available: now + lease });
                held.add(job.id);
                state.seen.add(job.id);

                return [taken, true];

            }

            if ( strict ) break;

        }

        return [undefined, changed];

    });
    const drain = async ( signal: AbortSignal | undefined ): Promise<Outcome> => {

        const state: Flight = { signal, seen: new Set(), tally: { done: 0, failed: 0 }, failures: [], blocked: false };
        const worker = async ( first: Job | undefined ): Promise<void> => {

            try {

                let job = first ?? await step(state, undefined);

                while ( job ) job = await step(state, await run(job, state));

            } catch ( cause ) {

                state.failures.push(cause);
                state.blocked = true;

            }

        };

        if ( signal?.aborted ) throw halted(signal);

        const first = await step(state, undefined);

        if ( first ) await Promise.all([worker(first), ...Array.from({ length: lanes - 1 }, () => worker(undefined))]);

        if ( signal?.aborted ) throw halted(signal);
        if ( state.failures.length > 0 ) throw state.failures[0];

        return state.tally;

    };
    const outbox: Outbox = {
        load: read,
        push: ( type, payload, given = {} ) => raised(mutate(( jobs ) => {

            if ( typeof type !== "string" || type === "" ) throw error.fault("internal", "queue.type");

            const now = date.now();
            const key = given.key || undefined;
            const wait = span(given.delay, 0);
            const existing = key === undefined ? undefined : jobs.find(( job ) => job.owner === owner && job.type === type && job.key === key && waiting(job));

            if ( existing ) {

                existing.payload = payload;
                existing.at = now;

                return [existing as Job<typeof payload>, true];

            }

            if ( jobs.filter(( job ) => job.owner === owner && job.status !== "done" && job.status !== "dead").length >= keep ) throw error.fault("too_many_requests", "queue.full");

            const job: Job<typeof payload> = { id: rand.ulid(), type, payload, owner, key, status: "pending", attempts: 0, at: now, available: now + wait, error: undefined, code: undefined };

            jobs.push(job);

            return [job, true];

        })),
        flush: ( signal ) => {

            if ( flight ) return signal ? event.race(flight, signal) : flight;

            const made = raised(drain(signal)).finally(() => {

                held.clear();
                flight = undefined;

            });

            flight = made;

            return made;

        },
        jobs: async ( status ) => {

            const jobs = await read();

            return status === undefined ? jobs : jobs.filter(( job ) => job.status === status);

        },
        get: async ( id ) => (await read()).find(( job ) => job.id === id),
        counts: async () => {

            const counts: Counts = { pending: 0, running: 0, done: 0, failed: 0, dead: 0 };

            for ( const job of await read() ) counts[job.status] += 1;

            return counts;

        },
        pending: async () => (await read()).filter(waiting).length,
        next: async () => {

            let soonest: number | undefined;

            for ( const job of await read() ) if ( waiting(job) && (soonest === undefined || job.available < soonest) ) soonest = job.available;

            return soonest;

        },
        retry: ( id ) => raised(mutate(( jobs ) => {

            const found = jobs.find(( job ) => job.id === id && job.owner === owner);

            if ( !found || found.status === "done" || found.status === "running" ) return [false, false];

            revive(found, date.now());

            return [true, true];

        })),
        replay: () => raised(mutate(( jobs ) => {

            const now = date.now();
            let revived = 0;

            for ( const job of jobs ) {

                if ( job.owner !== owner || (job.status !== "failed" && job.status !== "dead") ) continue;

                revive(job, now);
                revived += 1;

            }

            return [revived, revived > 0];

        })),
        drop: ( id ) => raised(mutate(( jobs ) => {

            const at = jobs.findIndex(( job ) => job.id === id && job.owner === owner);

            if ( at === -1 ) return [false, false];

            jobs.splice(at, 1);
            flights.get(id)?.abort(error.fault("gone", "queue.dropped"));

            return [true, true];

        })),
        prune: ( status = "done" ) => raised(mutate(( jobs ) => {

            const before = jobs.length;

            for ( let index = before - 1; index >= 0; index -= 1 ) if ( jobs[index]?.owner === owner && jobs[index]?.status === status ) jobs.splice(index, 1);

            return [before - jobs.length, jobs.length < before];

        })),
        clear: () => raised(mutate(( jobs ) => {

            const before = jobs.length;

            for ( let index = before - 1; index >= 0; index -= 1 ) if ( jobs[index]?.owner === owner ) jobs.splice(index, 1);
            for ( const made of flights.values() ) made.abort(error.fault("gone", "queue.dropped"));

            return [undefined, jobs.length < before];

        })),
        watch: ( listener ) => {

            listen();

            return changes.on("change", listener);

        },
        start: ( every = 5000 ) => {

            outbox.stop();
            halt = schedule(outbox, { every, immediate: false, fail: options.fail });

        },
        stop: () => {

            halt?.();
            halt = undefined;

        },
    };

    if ( options.onChange ) outbox.watch(options.onChange);

    return outbox;

}
