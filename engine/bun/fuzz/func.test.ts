import { describe, expect, test as it, jest } from "bun:test";
import * as error from "engine/error";
import * as func from "engine/func";
import * as fc from "fast-check";

const origin = 1_000_000;
const json = fc.jsonValue({ maxDepth: 3 });
const quiet = fc.integer({ min: 1, max: 50 });
const gaps = fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 1, maxLength: 30 });

function canon ( value: unknown ): string {

    if ( Array.isArray(value) ) return `[${value.map(canon).join(",")}]`;
    if ( typeof value !== "object" || value === null ) return typeof value === "string" ? JSON.stringify(value) : Object.is(value, -0) ? "-0" : String(value);

    const held = value as Record<string, unknown>;

    return `{${Object.keys(held).sort().map(( name ) => `${JSON.stringify(name)}:${canon(held[name])}`).join(",")}}`;

}
function load ( value: unknown ): number {

    if ( typeof value !== "object" || value === null ) return 0;

    const items: unknown[] = Array.isArray(value) ? value : Object.values(value);

    return items.reduce<number>(( sum, item ) => sum + load(item), items.length);

}
function clone ( value: unknown ): unknown {

    if ( Array.isArray(value) ) return value.map(clone);
    if ( typeof value !== "object" || value === null ) return value;

    return Object.fromEntries(Object.entries(value).reverse().map(( [name, item] ) => [name, clone(item)]));

}
function settled<T> ( work: Promise<T> ): Promise<unknown> {

    return work.then(( value ) => value, ( failure: unknown ) => failure);

}
async function settle (): Promise<void> {

    for ( let round = 0; round < 20; round += 1 ) await Promise.resolve();

}

describe("fuzz func", () => {

    it("memo joins equal shapes and tells every other value apart", () => {

        fc.assert(
            fc.property(json, json, ( left, right ) => {

                fc.pre(load(left) <= 200 && load(right) <= 200);

                let computed = 0;
                const seen = func.memo(( ..._args: unknown[] ) => {

                    computed += 1;

                    return computed;

                });
                const equal = canon(left) === canon(right);

                expect(seen(left)).toBe(seen(clone(left)));
                expect(seen(left) === seen(right)).toBe(equal);
                expect(seen(left, right) === seen(right, left)).toBe(equal);
                expect(seen(left, right)).toBe(seen(clone(left), clone(right)));
                expect(seen([left, right])).not.toBe(seen(left, right));
                expect(seen([left])).not.toBe(seen(left));
                expect(seen.size()).toBe(computed);

            }),
            { numRuns: 5000 },
        );

    });
    it("memo keeps the keys read last and computes the rest again", () => {

        fc.assert(
            fc.property(fc.integer({ min: 1, max: 6 }), fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 80 }), ( size, keys ) => {

                const model = new Set<number>();
                let computed = 0;
                let expected = 0;
                const cached = func.memo(( key: number ) => {

                    computed += 1;

                    return key * 2;

                }, { size });

                for ( const key of keys ) {

                    expected += model.delete(key) ? 0 : 1;
                    model.add(key);

                    for ( const oldest of model ) {

                        if ( model.size > size ) model.delete(oldest);

                        break;

                    }

                    expect([cached(key), computed, cached.size()]).toEqual([key * 2, expected, model.size]);

                }

                for ( const key of model ) expect(cached.forget(key)).toBe(true);

                expect(cached.size()).toBe(0);

            }),
            { numRuns: 5000 },
        );

    });
    it("debounce fires the last call of every burst, once", () => {

        jest.useFakeTimers();

        try {

            fc.assert(
                fc.property(quiet, gaps, fc.boolean(), ( wait, list, leading ) => {

                    const seen: number[] = [];
                    const expected: number[] = [];
                    const bounced = func.debounce(( value: number ) => { seen.push(value); }, wait, leading);
                    let open = leading;
                    let held: number | undefined;

                    for ( const [at, gap] of list.entries() ) {

                        bounced(at);

                        if ( open ) expected.push(at);
                        else held = at;

                        open = false;
                        expect(bounced.pending()).toBe(held !== undefined);
                        if ( gap > 0 ) jest.advanceTimersByTime(gap);

                        if ( gap < wait ) continue;
                        if ( held !== undefined ) expected.push(held);

                        held = undefined;
                        open = leading;

                    }

                    jest.advanceTimersByTime(wait);

                    if ( held !== undefined ) expected.push(held);

                    expect(seen).toEqual(expected);
                    expect([bounced.pending(), jest.getTimerCount()]).toEqual([false, 0]);

                }),
                { numRuns: 3000 },
            );

        } finally {

            jest.useRealTimers();

        }

    });
    it("throttle fires the first call at once, the last in the end and never twice in a window", () => {

        jest.useFakeTimers();

        try {

            fc.assert(
                fc.property(quiet, gaps, ( wait, list ) => {

                    const hits: { value: number; at: number }[] = [];
                    const limited = func.throttle(( value: number ) => { hits.push({ value, at: Date.now() }); }, wait);

                    for ( const [at, gap] of list.entries() ) {

                        limited(at);
                        if ( gap > 0 ) jest.advanceTimersByTime(gap);

                    }

                    jest.advanceTimersByTime(wait);
                    expect([hits[0]?.value, hits.at(-1)?.value]).toEqual([0, list.length - 1]);
                    expect(hits.every(( hit, at ) => at === 0 || (hit.value > (hits[at - 1]?.value ?? -1) && hit.at - (hits[at - 1]?.at ?? 0) >= wait))).toBe(true);
                    expect([limited.pending(), jest.getTimerCount()]).toEqual([false, 0]);

                }),
                { numRuns: 3000 },
            );

        } finally {

            jest.useRealTimers();

        }

    });
    it("timeout answers the work that beats the clock and aborts the one that does not", async () => {

        jest.useFakeTimers();
        jest.setSystemTime(origin);

        try {

            await fc.assert(
                fc.asyncProperty(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 1, max: 1000 }), async ( limit, takes ) => {

                    fc.pre(limit !== takes);

                    const signals: AbortSignal[] = [];
                    const raced = settled(func.timeout(( signal ) => {

                        signals.push(signal);

                        return new Promise<number>(( resolve ) => setTimeout(() => resolve(takes), takes));

                    }, limit, "late"));

                    jest.advanceTimersByTime(Math.min(limit, takes));
                    await settle();
                    jest.advanceTimersByTime(1000);

                    const outcome = await raced;

                    expect(takes < limit ? outcome === takes : error.isFault(outcome) && outcome.code === "timeout" && outcome.reason === "late").toBe(true);
                    expect([signals[0]?.aborted, jest.getTimerCount()]).toEqual([takes > limit, 0]);

                }),
                { numRuns: 1000 },
            );

        } finally {

            jest.useRealTimers();

        }

    });
    it("retry tries until the work succeeds or the attempts run out", async () => {

        jest.useFakeTimers();

        try {

            await fc.assert(
                fc.asyncProperty(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 0, max: 8 }), fc.boolean(), async ( times, fails, jitter ) => {

                    const waits: number[] = [];
                    let attempts = 0;
                    const raced = settled(func.retry(async ( attempt ) => {

                        attempts += 1;

                        if ( attempt <= fails ) throw error.fault("unavailable", `try.${attempt}`);

                        return attempt;

                    }, { times, delay: 8, factor: 2, max: 50, jitter, onRetry: ( _failure, _attempt, wait ) => { waits.push(wait); } }));

                    for ( let round = 0; round < times; round += 1 ) {

                        await settle();
                        jest.advanceTimersByTime(50);

                    }

                    const outcome = await raced;

                    expect(attempts).toBe(Math.min(times, fails + 1));
                    expect(fails < times ? outcome === fails + 1 : error.isFault(outcome) && outcome.reason === `try.${times}`).toBe(true);
                    expect(waits).toHaveLength(attempts - 1);
                    expect(waits.every(( wait, at ) => wait <= Math.min(50, 8 * 2 ** at) && wait >= Math.min(50, 8 * 2 ** at) / (jitter ? 2 : 1))).toBe(true);
                    expect(jest.getTimerCount()).toBe(0);

                }),
                { numRuns: 1000 },
            );

        } finally {

            jest.useRealTimers();

        }

    });
    it("a lane runs every job once, in order, never wider than asked", async () => {

        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 1, max: 6 }), fc.array(fc.record({ hops: fc.integer({ min: 1, max: 4 }), fails: fc.boolean() }), { maxLength: 40 }), async ( width, plan ) => {

                const lane = func.lane(width);
                const started: number[] = [];
                let active = 0;
                let peak = 0;
                const jobs = plan.map(( step, at ) => lane.run(async () => {

                    started.push(at);
                    active += 1;
                    peak = Math.max(peak, active);

                    for ( let hop = 0; hop < step.hops; hop += 1 ) await Promise.resolve();

                    active -= 1;

                    if ( step.fails ) throw error.fault("conflict", `job.${at}`);

                    return at;

                }));

                expect([lane.active(), lane.waiting()]).toEqual([Math.min(width, plan.length), Math.max(0, plan.length - width)]);

                const results = await Promise.allSettled(jobs);

                expect(started).toEqual(plan.map(( _, at ) => at));
                expect(peak).toBe(Math.min(width, plan.length));
                expect(results.map(( result ) => result.status === "rejected")).toEqual(plan.map(( step ) => step.fails));
                expect(results.flatMap(( result ) => (result.status === "fulfilled" ? [result.value] : []))).toEqual(plan.flatMap(( step, at ) => (step.fails ? [] : [at])));
                await lane.idle();
                expect([lane.active(), lane.waiting(), lane.size()]).toEqual([0, 0, 0]);

            }),
            { numRuns: 2000 },
        );

    });
    it("a lane gives a place only to the waiters that stayed", async () => {

        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 1, max: 4 }), fc.array(fc.boolean(), { maxLength: 60 }), async ( width, plan ) => {

                const lane = func.lane(width);
                const leaving = new AbortController();
                const gate = func.deferred<void>();
                const started: number[] = [];
                const jobs = plan.map(( leaves, at ) => lane.run(async () => {

                    started.push(at);
                    await gate.promise;

                    return at;

                }, leaves ? leaving.signal : undefined));
                const stays = plan.flatMap(( leaves, at ) => (leaves && at >= width ? [] : [at]));

                leaving.abort();
                expect([lane.active(), lane.waiting()]).toEqual([Math.min(width, plan.length), stays.length - Math.min(width, plan.length)]);
                gate.resolve();

                const results = await Promise.allSettled(jobs);

                expect(started).toEqual(stays);
                expect(results.flatMap(( result ) => (result.status === "fulfilled" ? [result.value] : []))).toEqual(stays);
                expect(results.every(( result ) => result.status === "fulfilled" || (error.isFault(result.reason) && result.reason.reason === "lane.aborted"))).toBe(true);
                expect(lane.size()).toBe(0);

            }),
            { numRuns: 2000 },
        );

    });
    it("a breaker follows its model for any run of outcomes", async () => {

        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 1, max: 5 }), fc.array(fc.boolean(), { maxLength: 40 }), async ( limit, plan ) => {

                const guard = func.breaker({ failures: limit, cooldown: 1e9 });
                let streak = 0;
                let open = false;
                let ran = 0;

                for ( const [at, ok] of plan.entries() ) {

                    const before = ran;
                    const outcome = await settled(guard.run(async () => {

                        ran += 1;

                        if ( !ok ) throw error.fault("unavailable", `step.${at}`);

                        return at;

                    }));

                    if ( open ) expect([ran, error.isFault(outcome) && outcome.reason]).toEqual([before, "breaker.open"]);
                    else if ( ok ) expect([ran, outcome]).toEqual([before + 1, at]);
                    else expect([ran, error.isFault(outcome) && outcome.reason]).toEqual([before + 1, `step.${at}`]);

                    streak = open ? streak : ok ? 0 : streak + 1;
                    open = open || streak >= limit;
                    expect([guard.state(), guard.failures()]).toEqual([open ? "open" : "closed", streak]);

                }

                guard.reset();
                expect([guard.state(), guard.failures(), await guard.run(async () => "back")]).toEqual(["closed", 0, "back"]);

            }),
            { numRuns: 2000 },
        );

    });
    it("single flies once per key however many ask", async () => {

        await fc.assert(
            fc.asyncProperty(fc.array(fc.constantFrom("a", "b", "c", "d"), { minLength: 1, maxLength: 30 }), async ( keys ) => {

                let flights = 0;
                const load = func.single(async ( key: string ) => {

                    flights += 1;
                    await Promise.resolve();

                    return `${key}.${flights}`;

                });
                const asked = keys.map(( key ) => load(key));
                const answers = await Promise.all(asked);
                const distinct = new Set(keys).size;

                expect([flights, new Set(asked).size, new Set(answers).size]).toEqual([distinct, distinct, distinct]);
                expect(answers.every(( answer, at ) => answer.startsWith(`${keys[at]}.`))).toBe(true);
                await load(keys[0] ?? "a");
                expect(flights).toBe(distinct + 1);

            }),
            { numRuns: 2000 },
        );

    });
    it("pipe equals folding its steps", () => {

        fc.assert(
            fc.property(fc.integer(), fc.array(fc.tuple(fc.integer({ min: -9, max: 9 }), fc.integer({ min: -9, max: 9 })), { maxLength: 30 }), ( start, plan ) => {

                const steps = plan.map(( [times, plus] ) => ( value: number ) => (value * times + plus) | 0);

                expect(func.pipe(start, ...steps)).toBe(steps.reduce(( value, step ) => step(value), start));

            }),
            { numRuns: 5000 },
        );

    });

});
