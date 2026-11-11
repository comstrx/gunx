import { describe, expect, test as it, jest } from "bun:test";
import * as cache from "engine/cache";
import * as error from "engine/error";
import * as queue from "engine/queue";

function tick ( ms = 0 ): Promise<void> {

    return new Promise(( done ) => setTimeout(done, ms));

}
function told ( failure: unknown ): string;
function told ( run: () => unknown ): string;
function told ( given: unknown ): string {

    try {

        if ( typeof given === "function" ) {

            given();

            return "ok";

        }

        throw given;

    } catch ( failure ) {

        if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

        return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

    }

}
async function faked ( work: () => void | Promise<void> ): Promise<void> {

    jest.useFakeTimers();

    try {

        await work();

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

}

describe("queue", () => {

    it("jobs persist, dedupe by key, run in order and settle", async () => {

        const store = cache.memory();
        const performed: string[] = [];
        const changes: number[] = [];
        const box = queue.create({ store, owner: "user-1", perform: async ( job ) => { performed.push(`${job.type}:${JSON.stringify(job.payload)}`); }, onChange: ( jobs ) => { changes.push(jobs.length); } });
        const first = await box.push("cart.add", { sku: "a" }, { key: "cart" });

        await box.push("cart.add", { sku: "b" }, { key: "cart" });
        await box.push("note", { text: "x" });
        await box.push("later", {}, { delay: 60_000 });
        expect(first.status).toBe("pending");
        expect(await box.pending()).toBe(3);
        expect((await box.jobs("pending")).map(( job ) => job.type)).toEqual(["cart.add", "note", "later"]);
        expect(await box.flush()).toEqual({ done: 2, failed: 0 });
        expect(performed).toEqual(['cart.add:{"sku":"b"}', 'note:{"text":"x"}']);
        expect((await box.jobs("done")).map(( job ) => job.attempts)).toEqual([1, 1]);
        expect(await box.pending()).toBe(1);

        const reloaded = queue.create({ store, owner: "user-1", perform: async () => undefined });

        expect((await reloaded.load()).length).toBe(3);
        expect(changes.length).toBeGreaterThan(0);

        const other = queue.create({ store, owner: "user-2", perform: async () => { throw new Error("never"); } });

        expect(await other.jobs()).toEqual([]);
        expect(await other.flush()).toEqual({ done: 0, failed: 0 });
        expect(await other.drop(first.id)).toBe(false);
        await box.clear();
        expect(await box.jobs()).toEqual([]);
        expect(await box.drop("nope")).toBe(false);

    });
    it("failures back off, dead-letter on settled faults and can be retried", async () => {

        const box = queue.create({ owner: "u", retries: 3, delay: 1, perform: async ( job ) => {

            if ( job.type === "forbidden" ) throw error.fault("forbidden");
            if ( job.type === "flaky" && job.attempts < 2 ) throw new Error("flaky");

        } });
        const flaky = await box.push("flaky", {});

        await box.push("forbidden", {});
        expect(await box.flush()).toEqual({ done: 0, failed: 2 });

        const after = await box.jobs();

        expect(after.find(( job ) => job.type === "flaky")?.status).toBe("failed");
        expect(after.find(( job ) => job.type === "flaky")?.error).toBe("flaky");
        expect(after.find(( job ) => job.type === "forbidden")?.status).toBe("dead");
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        expect(await box.flush()).toEqual({ done: 0, failed: 1 });
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        expect(await box.flush()).toEqual({ done: 1, failed: 0 });
        expect((await box.jobs("done"))[0]?.id).toBe(flaky.id);

        const dead = (await box.jobs("dead"))[0];

        expect(await box.retry(dead?.id ?? "")).toBe(true);
        expect(await box.retry(flaky.id)).toBe(false);
        expect(await box.pending()).toBe(1);
        expect(await box.drop(dead?.id ?? "")).toBe(true);
        box.start(1);
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        box.stop();

    });
    it("backoff grows geometrically under a cap and a schedule flushes only when allowed", async () => {

        const wait = queue.backoff({ delay: 100, factor: 2, max: 500 });

        expect([1, 2, 3, 4, 9].map(wait)).toEqual([100, 200, 400, 500, 500]);
        expect(queue.backoff({ delay: 100, jitter: 0.5 })(1)).toBeGreaterThanOrEqual(50);
        expect(queue.backoff({ delay: 100, jitter: 0.5 })(1)).toBeLessThanOrEqual(150);

        const performed: string[] = [];
        const box = queue.create({ store: cache.memory(), owner: "u", perform: async ( job ) => { performed.push(job.type); } });
        let online = false;
        const results: number[] = [];
        const stop = queue.schedule(box, { every: 5, when: () => online, onFlush: ( result ) => { results.push(result.done); } });

        await box.push("a", {});
        await new Promise(( resolve ) => setTimeout(resolve, 15));
        expect(performed).toEqual([]);
        online = true;
        await new Promise(( resolve ) => setTimeout(resolve, 25));
        stop();
        expect(performed).toEqual(["a"]);
        expect(results.length).toBeGreaterThan(0);

    });
    it("two instances on one store claim each job once under the lock, and a sibling's watch hears the writes", async () => {

        const inner = cache.memory();
        const slow = cache.driver({
            get: async ( key ) => {

                await tick(1);

                return inner.get(key);

            },
            set: async ( key, value ) => {

                await tick(1);

                return inner.set(key, value);

            },
            delete: ( key ) => inner.delete(key),
            keys: () => inner.keys(),
            lock: inner.lock,
        });
        const ran: string[] = [];
        const heard: Record<string, number[]> = { a: [], b: [] };
        const make = ( tag: "a" | "b" ): queue.Outbox => queue.create({ store: slow, owner: "u", perform: async ( job ) => {

            ran.push(`${tag}:${job.type}`);
            await tick(2);

        }, onChange: ( jobs ) => { heard[tag]?.push(jobs.length); } });
        const a = make("a");
        const b = make("b");

        await a.push("one", {});
        await a.push("two", {});
        expect(heard).toEqual({ a: [1, 2], b: [1, 2] });

        const [ra, rb] = await Promise.all([a.flush(), b.flush()]);

        expect([ran.sort(), ra.done + rb.done, (await a.jobs("done")).map(( job ) => job.attempts)]).toEqual([["a:one", "b:two"].sort().length === 2 ? ran.sort() : [], 2, [1, 1]]);
        expect(ran).toHaveLength(2);
        expect(new Set(ran.map(( line ) => line.slice(2))).size).toBe(2);

        const other = queue.create({ store: slow, owner: "someone-else", perform: async () => undefined });
        const foreign: number[] = [];

        other.watch(( jobs ) => { foreign.push(jobs.length); });
        await a.push("three", {});
        await tick(2);
        expect([foreign, await other.jobs(), (await b.jobs()).length]).toEqual([[0], [], 3]);

        const own = queue.create({ store: cache.memory(), owner: "u", perform: async () => undefined });
        const echoes: number[] = [];

        own.watch(( jobs ) => { echoes.push(jobs.length); });
        await own.push("x", {});
        await own.push("y", {});
        await tick(2);
        expect(echoes).toEqual([1, 2]);

    });
    it("a lease stops a sibling from stealing a live job, a crashed run is reclaimed once the lease passes or abandoned when spent", async () => {

        const store = cache.memory();
        const stuck = queue.create({ store, owner: "u", perform: () => new Promise(() => undefined), timeout: Number.POSITIVE_INFINITY });

        await stuck.push("hang", {});

        const flushing = stuck.flush();

        await tick(2);
        expect((await stuck.jobs()).map(( job ) => [job.status, job.attempts, job.available > Date.now()])).toEqual([["running", 1, true]]);

        const sibling = queue.create({ store, owner: "u", perform: async () => undefined, timeout: Number.POSITIVE_INFINITY });

        expect([await sibling.flush(), (await sibling.jobs()).map(( job ) => job.status)]).toEqual([{ done: 0, failed: 0 }, ["running"]]);
        expect(await stuck.retry((await stuck.jobs())[0]?.id ?? "")).toBe(false);
        await stuck.clear();
        expect(await flushing).toEqual({ done: 0, failed: 0 });

        const typed = cache.typed<unknown[]>(store);
        const ran: string[] = [];
        const crashed = queue.create({ store, owner: "u", retries: 3, perform: async ( job ) => { ran.push(`${job.type}:${job.attempts}`); } });
        const now = Date.now();

        await typed.write("outbox", [
            { id: "r1", type: "reclaim", payload: null, owner: "u", status: "running", attempts: 1, at: now - 100, available: now - 1, error: undefined, code: undefined },
            { id: "r2", type: "spent", payload: null, owner: "u", status: "running", attempts: 3, at: now - 100, available: now - 1 },
            { id: "r3", type: "live", payload: null, owner: "u", status: "running", attempts: 1, at: now, available: now + 60_000 },
            { id: "r4", type: "foreign", payload: null, owner: "v", status: "running", attempts: 1, at: now - 100, available: now - 1 },
            { id: "", type: "junk", payload: null, owner: "u", status: "pending", attempts: 0, at: 0, available: 0 },
            { id: "r5", type: "odd", payload: null, owner: "u", status: "nope", attempts: 0, at: 0, available: 0 },
            "not a row",
        ]);
        expect(await crashed.flush()).toEqual({ done: 1, failed: 0 });
        expect(ran).toEqual(["reclaim:1"]);

        const after = await crashed.jobs();

        expect(after.map(( job ) => [job.id, job.status, job.attempts, job.code ?? null])).toEqual([["r1", "done", 2, null], ["r2", "dead", 3, "timeout"], ["r3", "running", 1, null]]);
        expect(after.find(( job ) => job.id === "r2")?.error).toBe(error.fault("timeout", "queue.abandoned").message);
        expect((await typed.read("outbox"))?.length).toBe(4);

    });
    it("a full outbox refuses a push, trimming drops only the owner's settled jobs, and another owner's rows stay untouched", async () => {

        const store = cache.memory();
        const mine = queue.create({ store, owner: "u", keep: 4, perform: async ( job ) => {

            if ( job.type === "fail" ) throw error.fault("forbidden", "no");

        } });
        const theirs = queue.create({ store, owner: "v", keep: 1, perform: async () => undefined });

        await theirs.push("t1", {});
        await mine.push("ok", {});
        await mine.push("fail", {});
        expect(await mine.flush()).toEqual({ done: 1, failed: 1 });
        await mine.push("p1", {});
        await mine.push("p2", {});
        await mine.push("p3", {});
        expect((await mine.jobs()).map(( job ) => job.type)).toEqual(["fail", "p1", "p2", "p3"]);
        await mine.push("p4", {});
        expect(await mine.push("p5", {}).then(() => "accepted", told)).toBe("too_many_requests/queue.full");
        expect((await mine.jobs()).map(( job ) => job.type)).toEqual(["p1", "p2", "p3", "p4"]);
        expect(await mine.push("p1", {}, { key: "same" }).then(() => "accepted", told)).toBe("too_many_requests/queue.full");
        expect((await theirs.jobs()).map(( job ) => job.type)).toEqual(["t1"]);
        expect(await theirs.push("t2", {}).then(() => "accepted", told)).toBe("too_many_requests/queue.full");
        await theirs.flush();
        await theirs.push("t2", {});
        expect((await theirs.jobs()).map(( job ) => [job.type, job.status])).toEqual([["t2", "pending"]]);
        expect((await mine.jobs()).length).toBe(4);
        expect(await mine.counts()).toEqual({ pending: 4, running: 0, done: 0, failed: 0, dead: 0 });

    });
    it("a never-settling perform times out, an aborted flush frees its in-flight jobs, and strict stops at the first failure", async () => {

        const seen: string[] = [];
        const slow = queue.create({ owner: "u", timeout: 5, retries: 2, delay: 0, perform: ( job, signal ) => new Promise(( _, reject ) => { signal.addEventListener("abort", () => { seen.push(`${job.type}:${told(signal.reason)}`); reject(signal.reason); }, { once: true }); }) });

        await slow.push("hang", {});
        expect(await slow.flush()).toEqual({ done: 0, failed: 1 });
        expect([(await slow.jobs())[0]?.status, (await slow.jobs())[0]?.code, seen]).toEqual(["failed", "timeout", ["hang:timeout/event.deadline"]]);

        const controller = new AbortController();
        const held: string[] = [];
        const waiting = queue.create({ owner: "u", timeout: Number.POSITIVE_INFINITY, perform: ( job, signal ) => new Promise(( _, reject ) => { signal.addEventListener("abort", () => { held.push(job.type); reject(signal.reason); }, { once: true }); }) });

        await waiting.push("a", {});
        await waiting.push("b", {});

        const flushing = waiting.flush(controller.signal);
        const joined = waiting.flush();

        await tick(2);
        controller.abort(new Error("leaving"));
        expect([await flushing.then(() => "settled", told), await joined.then(() => "settled", told)]).toEqual(["timeout/queue.aborted", "timeout/queue.aborted"]);
        expect((await waiting.jobs()).map(( job ) => [job.type, job.status, job.attempts])).toEqual([["a", "pending", 0], ["b", "pending", 0]]);
        expect(held).toEqual(["a"]);

        const order: string[] = [];
        const strict = queue.create({ owner: "u", strict: true, retries: 2, delay: 0, perform: async ( job ) => {

            order.push(job.type);

            if ( job.type === "bad" ) throw error.fault("unavailable", "down");

        } });

        await strict.push("first", {});
        await strict.push("bad", {});
        await strict.push("after", {});
        expect([await strict.flush(), order, (await strict.jobs()).map(( job ) => job.status)]).toEqual([{ done: 1, failed: 1 }, ["first", "bad"], ["done", "failed", "pending"]]);
        expect([await strict.flush(), order.slice(2), (await strict.jobs()).map(( job ) => job.status)]).toEqual([{ done: 0, failed: 1 }, ["bad"], ["done", "dead", "pending"]]);
        expect([await strict.flush(), order.slice(3)]).toEqual([{ done: 1, failed: 0 }, ["after"]]);

        let peak = 0;
        let live = 0;
        const wide = queue.create({ owner: "u", lanes: 3, perform: async () => {

            live += 1;
            peak = Math.max(peak, live);
            await tick(2);
            live -= 1;

        } });

        for ( const type of ["a", "b", "c", "d", "e"] ) await wide.push(type, {});

        expect([await wide.flush(), peak]).toEqual([{ done: 5, failed: 0 }, 3]);

    });
    it("settled faults dead-letter at once, a 429 waits retryAfter, a throwing judge fails the flush but keeps the job, and dead jobs revive with a fresh budget", async () => {

        const codes: error.Code[] = ["bad_request", "conflict", "too_large", "forbidden", "unauthorized", "not_found", "validation"];
        const box = queue.create({ owner: "u", retries: 3, delay: 0, perform: async ( job ) => {

            if ( job.type === "limited" ) throw error.fault("too_many_requests", "slow", { retryAfter: 2 });
            if ( job.type === "flaky" ) throw error.fault("unavailable", "down");

            throw error.fault(job.type as error.Code, "x");

        } });

        for ( const code of codes ) await box.push(code, {});

        await box.push("limited", {});
        await box.push("flaky", {});

        const before = Date.now();

        expect(await box.flush()).toEqual({ done: 0, failed: 9 });

        const jobs = await box.jobs();

        expect(jobs.filter(( job ) => codes.includes(job.type as error.Code)).map(( job ) => [job.status, job.attempts, job.code])).toEqual(codes.map(( code ) => ["dead", 1, code]));

        const limited = jobs.find(( job ) => job.type === "limited") as queue.Job;
        const flaky = jobs.find(( job ) => job.type === "flaky") as queue.Job;

        expect([limited.status, limited.available - before >= 2000, limited.available - before < 2500, flaky.status, flaky.available - before < 100]).toEqual(["failed", true, true, "failed", true]);
        expect(await box.next()).toBe(flaky.available);
        expect(await box.replay()).toBe(9);
        expect<unknown>((await box.jobs()).map(( job ) => [job.status, job.attempts])).toEqual([...codes.map(() => ["pending", 0]), ["pending", 1], ["pending", 1]]);
        expect(await box.replay()).toBe(0);
        expect(await box.flush()).toEqual({ done: 0, failed: 9 });
        expect(await box.prune("dead")).toBe(7);
        expect(await box.counts()).toEqual({ pending: 0, running: 0, done: 0, failed: 2, dead: 0 });
        expect(await box.get(flaky.id)).toMatchObject({ id: flaky.id, attempts: 2 });
        expect(await box.get("nope")).toBeUndefined();

        const judge = queue.create({ owner: "u", retries: 3, delay: 250, perform: async () => { throw error.fault("unavailable", "down"); }, when: () => { throw new Error("judge broke"); } });

        await judge.push("j", {});

        const at = Date.now();

        expect(await judge.flush().then(() => "settled", told)).toBe("Error: judge broke");
        expect((await judge.jobs()).map(( job ) => [job.status, job.attempts, job.available - at >= 200])).toEqual([["failed", 1, true]]);

        const paced = queue.create({ owner: "u", retries: 3, perform: async () => { throw error.fault("unavailable", "down"); }, backoff: () => { throw new Error("pace broke"); } });

        await paced.push("p", {});
        expect(await paced.flush().then(() => "settled", told)).toBe("Error: pace broke");
        expect((await paced.jobs())[0]?.available).toBeGreaterThanOrEqual(Date.now() + 900);

    });
    it("drop and clear abort live flights, retries refuse running jobs, and options are checked at the door", async () => {

        const reasons: string[] = [];
        const box = queue.create({ owner: "u", timeout: Number.POSITIVE_INFINITY, perform: ( job, signal ) => new Promise(( _, reject ) => { signal.addEventListener("abort", () => { reasons.push(`${job.type}:${told(signal.reason)}`); reject(signal.reason); }, { once: true }); }) });
        const dropped = await box.push("drop", {});

        await box.push("clear", {});

        const flushing = box.flush();

        await tick(2);
        expect([await box.retry(dropped.id), await box.drop(dropped.id), await box.drop(dropped.id)]).toEqual([false, true, false]);
        await tick(2);
        await box.clear();
        expect([await flushing, reasons]).toEqual([{ done: 0, failed: 0 }, ["drop:gone/queue.dropped", "clear:gone/queue.dropped"]]);
        expect(await box.jobs()).toEqual([]);

        const table: [Partial<queue.Options>, string][] = [
            [{ retries: 0 }, "RangeError: not a count"],
            [{ lanes: Number.NaN }, "RangeError: not a count"],
            [{ keep: -1 }, "RangeError: not a count"],
            [{ timeout: Number.NaN }, "RangeError: not a duration"],
            [{ delay: Number.NaN }, "RangeError: not a duration"],
            [{ delay: Number.POSITIVE_INFINITY }, "RangeError: not a duration"],
            [{ factor: 0 }, "RangeError: not a factor"],
            [{ factor: Number.POSITIVE_INFINITY }, "RangeError: not a factor"],
        ];

        for ( const [extra, expected] of table ) expect(told(() => queue.create({ owner: "u", perform: async () => undefined, ...extra }))).toBe(expected);

        expect(told(() => queue.create({ owner: "u", perform: async () => undefined, retries: 1.9, lanes: 70, keep: 1, timeout: Number.POSITIVE_INFINITY, delay: 0, factor: 1 }))).toBe("ok");

        const made = queue.create({ owner: "u", perform: async () => undefined });

        expect(await made.push("", {}).then(() => "ok", told)).toBe("internal/queue.type");
        expect(await made.push("t", {}, { delay: Number.NaN }).then(() => "ok", told)).toBe("RangeError: not a duration");
        expect(await made.push("t", {}, { delay: Number.POSITIVE_INFINITY }).then(() => "ok", told)).toBe("RangeError: not a duration");
        expect((await made.push("t", {}, { delay: -5 })).available).toBeLessThanOrEqual(Date.now());
        expect((await made.push("t", {}, { key: "" })).key).toBeUndefined();
        expect((await made.push("t", { n: 2 }, { key: "k" })).id).toBe((await made.push("t", { n: 3 }, { key: "k" })).id);
        expect((await made.push("other", { n: 4 }, { key: "k" })).id).not.toBe((await made.push("t", { n: 5 }, { key: "k" })).id);
        expect((await made.jobs()).map(( job ) => [job.type, job.payload])).toEqual([["t", {}], ["t", {}], ["t", { n: 5 }], ["other", { n: 4 }]]);

        for ( const [options, expected] of [[{ jitter: 2 }, "RangeError: not a ratio"], [{ jitter: -0.1 }, "RangeError: not a ratio"], [{ factor: 0 }, "RangeError: not a factor"], [{ delay: Number.NaN }, "RangeError: not a duration"], [{ delay: Number.POSITIVE_INFINITY }, "RangeError: not a duration"], [{ max: Number.NaN }, "RangeError: not a duration"]] as const ) expect(told(() => queue.backoff(options))).toBe(expected);

        const capped = queue.backoff({ delay: 1000, factor: 10, max: Number.POSITIVE_INFINITY });

        expect([capped(1), capped(3), capped(400), capped(Number.NaN), capped(0), capped(-3)]).toEqual([1000, 100_000, 86_400_000, 1000, 1000, 1000]);
        expect(queue.backoff({ delay: 0, factor: 10 })(400)).toBe(0);
        expect(queue.backoff({ delay: 100, factor: 1 })(50)).toBe(100);
        expect(told(() => queue.schedule(made, { every: 0.5 }))).toBe("RangeError: not a duration");

    });
    it("a schedule flushes on its interval, hands flush errors to fail, and stops cleanly; a throwing onChange reaches fail or the caller", async () => {

        await faked(async () => {

            const flushes: string[] = [];
            const failures: string[] = [];
            let online = false;
            let broken = false;
            const target = { flush: async (): Promise<queue.Outcome> => {

                flushes.push("flush");

                if ( broken ) throw new Error("store down");

                return { done: 1, failed: 0 };

            } };
            const results: number[] = [];
            const stop = queue.schedule(target, { every: 100, when: () => online, onFlush: ( result ) => { results.push(result.done); }, fail: ( cause ) => { failures.push(told(cause)); } });

            jest.advanceTimersByTime(250);
            await Promise.resolve();
            expect(flushes).toEqual([]);
            online = true;
            jest.advanceTimersByTime(100);
            await Promise.resolve();
            await Promise.resolve();
            expect([flushes, results]).toEqual([["flush"], [1]]);
            broken = true;
            jest.advanceTimersByTime(100);
            await Promise.resolve();
            await Promise.resolve();
            expect(failures).toEqual(["Error: store down"]);
            stop();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            expect(flushes).toHaveLength(2);

            const immediate = queue.schedule(target, { every: 100 });

            await Promise.resolve();
            await Promise.resolve();
            expect(flushes).toHaveLength(3);
            immediate();

        });

        const faults: string[] = [];
        const noisy = queue.create({ owner: "u", perform: async () => undefined, onChange: () => { throw new Error("listener broke"); }, fail: ( cause ) => { faults.push(told(cause)); } });

        expect([(await noisy.push("a", {})).type, faults]).toEqual(["a", ["Error: listener broke"]]);
        expect(await noisy.jobs()).toHaveLength(1);

        const loud = queue.create({ owner: "u", perform: async () => undefined, onChange: () => { throw new Error("listener broke"); } });

        expect(await loud.push("a", {}).then(() => "resolved", told)).toBe("Error: listener broke");
        expect(await loud.jobs()).toHaveLength(1);

        const box = queue.create({ owner: "u", perform: async () => undefined });

        box.start(50);
        box.start(50);
        box.stop();
        box.stop();

    });
    it("survivors: leases carry the grace, siblings never count or steal a live job, trimming spares other owners, lanes cap at 64", async () => {

        const store = cache.memory();
        const stuck = queue.create({ store, owner: "u", timeout: 50, perform: () => new Promise(() => undefined) });

        await stuck.push("hang", {});

        const flushing = stuck.flush();

        await tick(2);

        const [row] = await stuck.jobs();
        const left = (row?.available ?? 0) - Date.now();

        expect([row?.status, left >= 4900, left <= 5100]).toEqual(["running", true, true]);

        const sibling = queue.create({ store, owner: "u", retries: 1, perform: async () => undefined });

        expect([await sibling.flush(), await sibling.pending(), await sibling.next(), (await sibling.jobs()).map(( job ) => job.status)]).toEqual([{ done: 0, failed: 0 }, 0, undefined, ["running"]]);
        expect((await sibling.push("hang", {}, { key: "k" })).id).not.toBe(row?.id);
        expect(await flushing).toEqual({ done: 0, failed: 2 });
        expect((await stuck.jobs()).map(( job ) => job.status)).toEqual(["failed", "failed"]);

        const shared = cache.memory();
        const theirs = queue.create({ store: shared, owner: "v", keep: 10, perform: async () => undefined });
        const mine = queue.create({ store: shared, owner: "u", keep: 2, perform: async () => undefined });

        await theirs.push("t1", {});
        await theirs.flush();
        await mine.push("m1", {});
        await mine.push("m2", {});
        await mine.flush();
        await mine.push("m3", {});
        await mine.push("m4", {});
        expect([(await mine.jobs()).map(( job ) => job.type), (await theirs.jobs()).map(( job ) => [job.type, job.status])]).toEqual([["m3", "m4"], [["t1", "done"]]]);

        let peak = 0;
        let live = 0;
        const wide = queue.create({ owner: "u", lanes: 100, perform: async () => {

            live += 1;
            peak = Math.max(peak, live);
            await tick(3);
            live -= 1;

        } });

        for ( let at = 0; at < 70; at += 1 ) await wide.push("w", at);

        expect([(await wide.flush()).done, peak <= 64, peak >= 2]).toEqual([70, true, true]);

        let strictPeak = 0;
        let strictLive = 0;
        const strict = queue.create({ owner: "u", strict: true, lanes: 3, perform: async () => {

            strictLive += 1;
            strictPeak = Math.max(strictPeak, strictLive);
            await tick(1);
            strictLive -= 1;

        } });

        await strict.push("a", {});
        await strict.push("b", {});
        await strict.push("c", {});
        expect([(await strict.flush()).done, strictPeak]).toEqual([3, 1]);

    });
    it("survivors: read-only verbs never write, a sibling listener is announced once per write, and a late failure never overwrites a settled row", async () => {

        const inner = cache.memory();
        const calls = { set: 0 };
        const counted = cache.driver({
            get: ( key ) => inner.get(key),
            set: ( key, value ) => {

                calls.set += 1;

                return inner.set(key, value);

            },
            delete: ( key ) => inner.delete(key),
            keys: () => inner.keys(),
            lock: inner.lock,
        });
        const box = queue.create({ store: counted, owner: "u", perform: async () => undefined });

        await box.push("a", {});
        await box.flush();
        calls.set = 0;
        expect([await box.retry("missing"), await box.drop("missing"), await box.prune("dead"), await box.replay(), await box.flush(), await box.jobs(), await box.counts()]).toMatchObject([false, false, 0, 0, { done: 0, failed: 0 }, [{ type: "a" }], { done: 1 }]);
        expect(calls.set).toBe(0);
        await box.clear();
        await box.clear();
        expect(calls.set).toBe(1);

        const a = queue.create({ store: counted, owner: "u", perform: async () => undefined });
        const b = queue.create({ store: counted, owner: "u", perform: async () => undefined });
        const one: number[] = [];
        const two: number[] = [];

        b.watch(( jobs ) => { one.push(jobs.length); });
        b.watch(( jobs ) => { two.push(jobs.length); });
        await a.push("x", {});
        await a.push("y", {});
        await tick(2);
        expect([one, two]).toEqual([[1, 2], [1, 2]]);

        const store = cache.memory();
        const typed = cache.typed<unknown[]>(store);
        const slow = queue.create({ store, owner: "u", timeout: 10, retries: 5, perform: () => new Promise(() => undefined) });

        await slow.push("job", {});

        const flushing = slow.flush();

        await tick(2);

        const rows = (await typed.read("outbox")) as Record<string, unknown>[];

        await typed.write("outbox", rows.map(( found ) => ({ ...found, status: "done", attempts: 9 })));
        expect(await flushing).toEqual({ done: 0, failed: 0 });
        expect((await slow.jobs()).map(( job ) => [job.status, job.attempts])).toEqual([["done", 9]]);

    });
});
