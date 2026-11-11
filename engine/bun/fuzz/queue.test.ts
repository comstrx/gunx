import { describe, expect, test as it } from "bun:test";
import * as cache from "engine/cache";
import * as error from "engine/error";
import * as queue from "engine/queue";
import * as fc from "fast-check";

type Kind = "ok" | "flaky" | "final";
type Act =
    | { kind: "push"; type: Kind; key: string | undefined }
    | { kind: "flush" }
    | { kind: "retry"; at: number }
    | { kind: "drop"; at: number }
    | { kind: "replay" }
    | { kind: "prune"; status: "done" | "dead" }
    | { kind: "clear" };
type Row = { id: string; type: Kind; status: queue.Status; attempts: number; key: string | undefined; payload: number };

const runs = 300;
const act: fc.Arbitrary<Act> = fc.oneof(
    { weight: 5, arbitrary: fc.record({ kind: fc.constant("push" as const), type: fc.constantFrom<Kind>("ok", "flaky", "final"), key: fc.option(fc.constantFrom("k1", "k2"), { nil: undefined }) }) },
    { weight: 4, arbitrary: fc.constant<Act>({ kind: "flush" }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("retry" as const), at: fc.nat({ max: 6 }) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("drop" as const), at: fc.nat({ max: 6 }) }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "replay" }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("prune" as const), status: fc.constantFrom<"done" | "dead">("done", "dead") }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "clear" }) },
);
const junk = fc.oneof(
    fc.constant(null),
    fc.constant("row"),
    fc.constant(5),
    fc.constant([]),
    fc.record({
        id: fc.constantFrom<unknown>("a", "", 1, undefined),
        type: fc.constantFrom<unknown>("t", "", 2, undefined),
        owner: fc.constantFrom<unknown>("u", "v", 3, undefined),
        status: fc.constantFrom<unknown>("pending", "running", "done", "failed", "dead", "odd", 4, undefined),
        attempts: fc.constantFrom<unknown>(0, 2, -1, 1.5, "3", Number.NaN, undefined),
        at: fc.constantFrom<unknown>(0, 100, "x", undefined),
        available: fc.constantFrom<unknown>(0, 100, Number.POSITIVE_INFINITY, undefined),
        key: fc.constantFrom<unknown>("k", 7, undefined),
        error: fc.constantFrom<unknown>("boom", 8, undefined),
        code: fc.constantFrom<unknown>("timeout", 9, undefined),
        payload: fc.constantFrom<unknown>({ n: 1 }, null, undefined),
    }, { requiredKeys: [] }),
);

function waiting ( row: Row ): boolean {

    return row.status === "pending" || row.status === "failed";

}

describe("fuzz queue", () => {

    it("an outbox follows its job model through pushes, flushes, retries, drops, replays, prunes and clears", async () => {

        await fc.assert(fc.asyncProperty(fc.array(act, { maxLength: 16 }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 2, max: 20 }), async ( acts, retries, keep ) => {

            let serial = 0;
            const box = queue.create({ owner: "u", retries, keep, delay: 0, perform: async ( job ) => {

                if ( job.type === "flaky" ) throw error.fault("unavailable", "down");
                if ( job.type === "final" ) throw error.fault("forbidden", "no");

            } });
            let rows: Row[] = [];
            const live = (): number => rows.filter(( row ) => row.status !== "done" && row.status !== "dead").length;
            const trim = (): void => {

                let extra = rows.length - keep;

                for ( const status of ["done", "dead"] as const ) {

                    for ( const row of [...rows] ) {

                        if ( extra <= 0 ) break;

                        if ( row.status === status ) {

                            rows = rows.filter(( other ) => other !== row);
                            extra -= 1;

                        }

                    }

                }

            };

            for ( const step of acts ) {

                if ( step.kind === "push" ) {

                    serial += 1;

                    const existing = step.key === undefined ? undefined : rows.find(( row ) => row.type === step.type && row.key === step.key && waiting(row));
                    const made = await box.push(step.type, serial, { key: step.key }).then(( job ) => job, ( cause: unknown ) => cause);

                    if ( existing ) {

                        existing.payload = serial;
                        expect((made as queue.Job).id).toBe(existing.id);

                    } else if ( live() >= keep ) {

                        expect(error.is(made) && made.reason === "queue.full").toBe(true);

                    } else {

                        rows.push({ id: (made as queue.Job).id, type: step.type, status: "pending", attempts: 0, key: step.key, payload: serial });
                        trim();

                    }

                } else if ( step.kind === "flush" ) {

                    const out = await box.flush();
                    const tally = { done: 0, failed: 0 };

                    for ( const row of rows ) {

                        if ( !waiting(row) ) continue;

                        row.attempts += 1;

                        if ( row.type === "ok" ) {

                            row.status = "done";
                            tally.done += 1;

                        } else {

                            row.status = row.type === "final" || row.attempts >= retries ? "dead" : "failed";
                            tally.failed += 1;

                        }

                    }

                    trim();
                    expect(out).toEqual(tally);

                } else if ( step.kind === "retry" ) {

                    const row = rows[step.at];
                    const answered = await box.retry(row?.id ?? "missing");

                    if ( row && row.status !== "done" ) {

                        expect(answered).toBe(true);

                        if ( row.status === "dead" ) row.attempts = 0;

                        row.status = "pending";

                    } else expect(answered).toBe(false);

                } else if ( step.kind === "drop" ) {

                    const row = rows[step.at];

                    expect(await box.drop(row?.id ?? "missing")).toBe(row !== undefined);
                    rows = rows.filter(( other ) => other !== row);

                } else if ( step.kind === "replay" ) {

                    const revived = rows.filter(( row ) => row.status === "failed" || row.status === "dead");

                    expect(await box.replay()).toBe(revived.length);

                    for ( const row of revived ) {

                        if ( row.status === "dead" ) row.attempts = 0;

                        row.status = "pending";

                    }

                } else if ( step.kind === "prune" ) {

                    const gone = rows.filter(( row ) => row.status === step.status);

                    expect(await box.prune(step.status)).toBe(gone.length);
                    rows = rows.filter(( row ) => row.status !== step.status);

                } else {

                    await box.clear();
                    rows = [];

                }

                const seen = await box.jobs();

                expect(seen.map(( job ) => [job.id, job.type, job.status, job.attempts, job.key, job.payload])).toEqual(rows.map(( row ) => [row.id, row.type, row.status, row.attempts, row.key, row.payload]));
                expect(await box.pending()).toBe(rows.filter(waiting).length);

                const counts = await box.counts();

                expect(Object.values(counts).reduce(( sum, part ) => sum + part, 0)).toBe(rows.length);

            }

        }), { numRuns: runs });

    });
    it("backoff is monotone, integral, capped at max and a day, and jittered inside its band", () => {

        fc.assert(fc.property(fc.integer({ min: 0, max: 10_000 }), fc.double({ min: 1.01, max: 4, noNaN: true }), fc.integer({ min: 0, max: 1_000_000_000 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.array(fc.integer({ min: -2, max: 500 }), { minLength: 1, maxLength: 6 }), ( delay, factor, max, jitter, attempts ) => {

            const plain = queue.backoff({ delay, factor, max });
            const spread = queue.backoff({ delay, factor, max, jitter });
            const cap = Math.min(max, 86_400_000);
            let last = -1;

            for ( const attempt of [...attempts].sort(( a, b ) => a - b) ) {

                const wait = plain(attempt);
                const loose = spread(attempt);
                const base = Math.min(delay === 0 ? 0 : delay * factor ** Math.max(0, (Math.trunc(attempt) || 1) - 1), cap);

                expect([Number.isInteger(wait), wait >= 0, wait <= cap, wait >= last]).toEqual([true, true, true, true]);
                expect(wait).toBe(Math.round(base));
                expect([loose >= Math.floor(base * (1 - jitter)) - 1, loose <= Math.ceil(Math.min(cap, base * (1 + jitter))) + 1, Number.isInteger(loose)]).toEqual([true, true, true]);
                last = wait;

            }

        }), { numRuns: 2000 });

    });
    it("junk rows in the store never throw and only sound rows of the owner come back", async () => {

        await fc.assert(fc.asyncProperty(fc.array(junk, { maxLength: 6 }), async ( saved ) => {

            const store = cache.memory();

            await cache.typed<unknown>(store).write("outbox", saved);

            const box = queue.create({ store, owner: "u", perform: async () => undefined });
            const jobs = await box.jobs();
            const sound = saved.filter(( row ): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row)).filter(( row ) => typeof row.id === "string" && row.id !== "" && typeof row.type === "string" && row.owner === "u" && ["pending", "running", "done", "failed", "dead"].includes(row.status as string));

            expect<unknown[]>(jobs.map(( job ) => job.id)).toEqual(sound.map(( row ) => row.id));

            for ( const job of jobs ) expect([Number.isInteger(job.attempts) && job.attempts >= 0, Number.isFinite(job.at), Number.isFinite(job.available), job.key === undefined || typeof job.key === "string", job.error === undefined || typeof job.error === "string"]).toEqual([true, true, true, true, true]);

            const counts = await box.counts();

            expect(Object.values(counts).reduce(( sum, part ) => sum + part, 0)).toBe(jobs.length);
            expect(await box.flush().then(() => "settled", () => "rejected")).toBe("settled");

        }), { numRuns: 400 });

    });

});
