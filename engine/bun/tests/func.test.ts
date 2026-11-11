import { describe, expect, test as it, jest, spyOn } from "bun:test";
import * as error from "engine/error";
import * as func from "engine/func";

type Outcome<T> = { done: boolean; value?: T | undefined; failure?: unknown };

const origin = 1_000_000;

function watch<T> ( work: Promise<T> ): Outcome<T> {

    const out: Outcome<T> = { done: false };

    void work.then(
        ( value ) => {

            out.done = true;
            out.value = value;

        },
        ( failure: unknown ) => {

            out.done = true;
            out.failure = failure;

        },
    );

    return out;

}
function failureOf ( work: Promise<unknown> ): Promise<unknown> {

    return work.then(() => undefined, ( failure: unknown ) => failure);

}
async function settle (): Promise<void> {

    for ( let round = 0; round < 20; round += 1 ) await Promise.resolve();

}
async function pass ( ms: number ): Promise<void> {

    await settle();
    jest.advanceTimersByTime(ms);
    await settle();

}
async function faked ( work: () => void | Promise<void> ): Promise<void> {

    jest.useFakeTimers();
    jest.setSystemTime(origin);

    try {

        await work();

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

}

describe("func", () => {

    it("once, memo, pipe and friends", () => {

        let calls = 0;
        const init = func.once(() => { calls += 1; return calls; });

        expect(init() + init()).toBe(2);
        expect(func.identity(3)).toBe(3);
        expect(func.tap(4, ( value ) => { calls += value; })).toBe(4);
        expect(calls).toBe(5);
        expect(func.pipe(2, ( value ) => value + 1, ( value ) => value * 3)).toBe(9);
        expect(func.noop()).toBeUndefined();

        let computed = 0;
        const square = func.memo(( value: number ) => { computed += 1; return value * value; }, { size: 2 });

        expect(square(3) + square(3) + square(4)).toBe(34);
        expect(computed).toBe(2);
        expect(square.size()).toBe(2);
        square(5);
        expect(square.size()).toBe(2);
        square.clear();
        expect(square.size()).toBe(0);

        const stale = func.memo(( value: number ) => Math.random() + value, { ttl: -1 });

        expect(stale(1)).not.toBe(stale(1));

    });
    it("debounce and throttle respect their windows", async () => {

        const seen: number[] = [];
        const bounced = func.debounce(( value: number ) => { seen.push(value); }, 20);

        bounced(1);
        bounced(2);
        expect(bounced.pending()).toBe(true);
        await new Promise(( resolve ) => setTimeout(resolve, 40));
        expect(seen).toEqual([2]);
        bounced(3);
        bounced.flush();
        expect(seen).toEqual([2, 3]);
        bounced(4);
        bounced.cancel();
        await new Promise(( resolve ) => setTimeout(resolve, 30));
        expect(seen).toEqual([2, 3]);

        const leading = func.debounce(( value: number ) => { seen.push(value); }, 20, true);

        leading(5);
        leading(6);
        expect(seen).toEqual([2, 3, 5]);
        await new Promise(( resolve ) => setTimeout(resolve, 30));
        expect(seen).toEqual([2, 3, 5, 6]);

        const hits: number[] = [];
        const limited = func.throttle(( value: number ) => { hits.push(value); }, 30);

        limited(1);
        limited(2);
        limited(3);
        expect(hits).toEqual([1]);
        await new Promise(( resolve ) => setTimeout(resolve, 45));
        expect(hits).toEqual([1, 3]);
        limited(4);
        limited.cancel();

    });
    it("retry, timeout, deferred", async () => {

        let attempts = 0;
        const value = await func.retry(async () => {

            attempts += 1;

            if ( attempts < 3 ) throw error.fault("unavailable");

            return "ok";

        }, { delay: 1, jitter: false });

        expect(value).toBe("ok");
        expect(attempts).toBe(3);
        await expect(func.retry(async () => { throw error.fault("forbidden"); }, { delay: 1 })).rejects.toMatchObject({ code: "forbidden" });

        attempts = 0;
        await expect(func.retry(async () => { attempts += 1; throw error.fault("network"); }, { times: 2, delay: 1, jitter: false })).rejects.toMatchObject({ code: "network" });
        expect(attempts).toBe(2);

        const quick = await func.timeout(Promise.resolve(1), 50);

        expect(quick).toBe(1);
        await expect(func.timeout(new Promise(() => undefined), 5, "slow")).rejects.toMatchObject({ code: "timeout", reason: "slow" });

        let aborted = false;

        await expect(func.timeout(( signal ) => new Promise(( _, reject ) => { signal.addEventListener("abort", () => { aborted = true; reject(new Error("x")); }); }), 5)).rejects.toBeInstanceOf(error.Fault);
        expect(aborted).toBe(true);

        const gate = func.deferred<number>();

        expect(gate.settled).toBe(false);
        gate.resolve(9);
        expect(await gate.promise).toBe(9);
        expect(gate.settled).toBe(true);

    });
    it("breaker opens after failures and probes after the cooldown", async () => {

        const guard = func.breaker({ failures: 2, cooldown: 30 });
        const fail = async (): Promise<never> => { throw error.fault("unavailable"); };

        await expect(guard.run(fail)).rejects.toMatchObject({ code: "unavailable" });
        expect(guard.state()).toBe("closed");
        await expect(guard.run(fail)).rejects.toMatchObject({ code: "unavailable" });
        expect(guard.state()).toBe("open");
        await expect(guard.run(async () => 1)).rejects.toMatchObject({ reason: "breaker.open" });
        await new Promise(( resolve ) => setTimeout(resolve, 40));
        expect(guard.state()).toBe("half");
        expect(await guard.run(async () => 1)).toBe(1);
        expect(guard.state()).toBe("closed");
        expect(guard.failures()).toBe(0);

        const ignoring = func.breaker({ failures: 1, when: () => false });

        await expect(ignoring.run(fail)).rejects.toBeDefined();
        expect(ignoring.state()).toBe("closed");
        guard.reset();
        expect(guard.state()).toBe("closed");

    });
    it("lanes bound concurrency and report idle", async () => {

        const lane = func.lane(2);
        let active = 0;
        let peak = 0;
        const work = async (): Promise<number> => {

            active += 1;
            peak = Math.max(peak, active);
            await new Promise(( resolve ) => setTimeout(resolve, 5));
            active -= 1;

            return active;

        };
        const all = Promise.all([lane.run(work), lane.run(work), lane.run(work), lane.run(work)]);

        expect(lane.size()).toBe(4);
        await all;
        expect(peak).toBe(2);
        await lane.idle();
        expect(lane.size()).toBe(0);
        await expect(lane.run(async () => { throw new Error("x"); })).rejects.toThrow("x");
        expect(lane.size()).toBe(0);

    });
    it("memo keys tell every argument apart and join equal shapes", () => {

        let computed = 0;
        const seen = func.memo(( ..._args: unknown[] ) => {

            computed += 1;

            return computed;

        });
        const loop: Record<string, unknown> = { name: "loop" };
        const mark = Symbol("x");
        const map = new Map<string, number>();
        const wide = Array.from({ length: 600 }, ( _, at ) => at);

        loop.self = loop;

        const distinct: unknown[][] = [
            [], [undefined], [null], [Number.NaN], [0], [-0], [1], ["1"], [1n], [true], ["true"], ["a,b"], ["a", "b"], [["a,b"]], [["a", "b"]], [[1, 2]], [[[1, 2]]],
            [{}], [[]], [map], [new Set()], [new Date(5)], [5], [mark], [Symbol("x")], [func.noop], [func.identity], [loop], [wide], [[...wide]],
            [{ a: 1, b: 2 }], [{ a: 1, b: "2" }], [{ a: undefined }], [{ ab: 1 }], [{ a: { b: 1 } }], [Object.create({ a: 1 })], [Object.create({ a: 1 })],
        ];
        const answers = distinct.map(( args ) => seen(...args));

        expect(new Set(answers).size).toBe(distinct.length);
        expect(computed).toBe(distinct.length);

        const same: [unknown[], unknown[]][] = [
            [[{ a: 1, b: 2 }], [{ b: 2, a: 1 }]],
            [[new Date(5)], [new Date(5)]],
            [[[1, [2, { c: 3 }]]], [[1, [2, { c: 3 }]]]],
            [[Object.assign(Object.create(null), { a: 1, b: 2 })], [{ a: 1, b: 2 }]],
            [["x", 1, null, undefined], ["x", 1, null, undefined]],
            [[loop], [loop]], [[map], [map]], [[mark], [mark]], [[wide], [wide]], [[func.noop], [func.noop]], [[Number.NaN], [Number.NaN]],
        ];

        for ( const [left, right] of same ) expect(seen(...left)).toBe(seen(...right));

        expect(computed).toBe(distinct.length + 2);

        const flat = func.memo(( left: number, right: number ) => left + right, { key: ( left ) => String(left) });

        expect([flat(1, 2), flat(1, 9), flat(2, 9), flat.size()]).toEqual([3, 3, 11, 2]);
        expect([flat.forget(1, 100), flat.forget(1, 100), flat.forget(7, 0), flat.size()]).toEqual([true, false, false, 1]);

    });
    it("memo bounds its size, keeps what was just read and expires by its clock", async () => {

        let computed = 0;
        const count = ( value: number ): number => {

            computed += 1;

            return value;

        };
        const open = func.memo(count, { size: Number.NaN });
        const none = func.memo(count, { size: 0 });
        const recent = func.memo(count, { size: 2.9 });

        for ( let value = 0; value < 300; value += 1 ) open(value);

        expect(open.size()).toBe(256);
        computed = 0;
        expect([none(1), none(1), computed, none.size(), func.memo(count, { size: -4 })(1), computed]).toEqual([1, 1, 2, 0, 1, 3]);
        computed = 0;
        recent(1);
        recent(2);
        recent(1);
        recent(3);
        expect([computed, recent.size()]).toEqual([3, 2]);
        recent(1);
        expect(computed).toBe(3);
        recent(2);
        expect(computed).toBe(4);
        recent(1);
        expect(computed).toBe(4);
        recent(3);
        expect(computed).toBe(5);
        expect([recent.forget(3), recent.forget(3), recent.size()]).toEqual([true, false, 1]);
        recent.clear();
        expect([recent.size(), recent(1), computed]).toEqual([0, 1, 6]);

        await faked(() => {

            const fresh = func.memo(count, { ttl: 100 });

            computed = 0;
            fresh(1);
            jest.setSystemTime(origin + 99);
            fresh(1);
            expect(computed).toBe(1);
            jest.setSystemTime(origin + 100);
            fresh(1);
            expect(computed).toBe(2);
            jest.setSystemTime(origin + 199);
            fresh(1);
            expect(computed).toBe(2);
            jest.setSystemTime(origin - 5000);
            fresh(1);
            expect([computed, fresh.size()]).toEqual([3, 1]);

        });

        expect(Date.now()).toBeGreaterThan(origin * 1000);

    });
    it("a failed promise is never kept by memo, once or single", async () => {

        let calls = 0;
        const flaky = async ( value: number ): Promise<number> => {

            calls += 1;

            if ( calls === 1 ) throw error.fault("unavailable");

            return value + calls;

        };
        const kept = func.memo(flaky);

        await expect(kept(1)).rejects.toMatchObject({ code: "unavailable" });
        expect(kept.size()).toBe(0);
        expect(await kept(1)).toBe(3);
        expect(kept(1)).toBe(kept(1));
        expect([calls, kept.size()]).toEqual([2, 1]);
        calls = 0;

        const start = func.once(() => flaky(1));

        await expect(start()).rejects.toMatchObject({ code: "unavailable" });
        expect(await start()).toBe(3);
        expect(start()).toBe(start());
        expect(calls).toBe(2);

        let tries = 0;
        const strict = func.once(() => {

            tries += 1;

            if ( tries === 1 ) throw new RangeError("first");

            return tries;

        });

        expect(() => strict()).toThrow(RangeError);
        expect([strict(), strict(), tries]).toEqual([2, 2, 2]);

    });
    it("single shares one flight per key and flies again once it lands", async () => {

        const gates = new Map<string, func.Deferred<string>>();
        let flights = 0;
        const load = func.single(( id: string ) => {

            const gate = func.deferred<string>();

            flights += 1;
            gates.set(id, gate);

            return gate.promise;

        });
        const first = load("a");
        const second = load("a");
        const other = load("b");

        expect(first).toBe(second);
        expect(first).not.toBe(other);
        expect(flights).toBe(2);
        gates.get("a")?.resolve("A");
        gates.get("b")?.reject(error.fault("not_found"));
        expect(await first).toBe("A");
        await expect(other).rejects.toMatchObject({ code: "not_found" });

        const again = load("a");
        const failed = load("b");

        expect(again).not.toBe(first);
        expect(failed).not.toBe(other);
        expect(flights).toBe(4);
        gates.get("a")?.resolve("A2");
        gates.get("b")?.resolve("B2");
        expect([await again, await failed]).toEqual(["A2", "B2"]);

        const keyed = func.single(async ( left: number, right: number ) => left + right, ( left ) => String(left));
        const one = keyed(1, 2);

        expect(keyed(1, 9)).toBe(one);
        expect(keyed(2, 9)).not.toBe(one);
        expect([await one, await keyed(1, 9)]).toEqual([3, 10]);

        const broken = func.single(( _id: string ): Promise<string> => {

            throw new RangeError("sync");

        });
        const thrown = broken("x");

        expect(thrown).toBeInstanceOf(Promise);
        await expect(thrown).rejects.toBeInstanceOf(RangeError);
        await expect(broken("x")).rejects.toBeInstanceOf(RangeError);

    });
    it("debounce leads, caps its wait and reads odd waits as none", async () => {

        await faked(() => {

            const seen: number[] = [];
            const keep = ( value: number ): void => { seen.push(value); };
            const options: func.DebounceOptions = { leading: true };
            const leading = func.debounce(keep, 20, options);

            leading(1);
            expect([seen, leading.pending()]).toEqual([[1], false]);
            leading(2);
            leading(3);
            expect([seen, leading.pending()]).toEqual([[1], true]);
            jest.advanceTimersByTime(19);
            expect(seen).toEqual([1]);
            jest.advanceTimersByTime(1);
            expect([seen, leading.pending()]).toEqual([[1, 3], false]);
            leading(4);
            expect(seen).toEqual([1, 3, 4]);
            jest.advanceTimersByTime(20);
            expect([seen, jest.getTimerCount()]).toEqual([[1, 3, 4], 0]);

            const capped = func.debounce(keep, 20, { max: 50 });

            seen.length = 0;

            for ( let value = 0; value < 9; value += 1 ) {

                capped(value);
                jest.advanceTimersByTime(10);

            }

            expect(seen).toEqual([4]);
            jest.advanceTimersByTime(10);
            expect([seen, capped.pending(), jest.getTimerCount()]).toEqual([[4, 8], false, 0]);

            const tight = func.debounce(keep, 20, { max: 5 });
            const loose = func.debounce(keep, 20, { max: Number.NaN });

            seen.length = 0;
            tight(1);
            loose(7);
            jest.advanceTimersByTime(10);
            tight(2);
            loose(8);
            jest.advanceTimersByTime(9);
            expect(seen).toEqual([]);
            jest.advanceTimersByTime(1);
            expect(seen).toEqual([2]);
            jest.advanceTimersByTime(10);
            expect(seen).toEqual([2, 8]);

            const eager = func.debounce(keep, Number.NaN);
            const early = func.debounce(keep, -5);
            const patient = func.debounce(keep, Number.POSITIVE_INFINITY);

            seen.length = 0;
            eager(1);
            early(2);
            patient(3);
            expect(seen).toEqual([]);
            jest.advanceTimersByTime(1);
            expect(seen).toEqual([1, 2]);
            jest.advanceTimersByTime(2_147_483_645);
            expect(seen).toEqual([1, 2]);
            jest.advanceTimersByTime(1);
            expect(seen).toEqual([1, 2, 3]);

            const plain = func.debounce(keep, 20);

            seen.length = 0;
            plain.flush();
            plain.cancel();
            plain(1);
            plain.cancel();
            plain.flush();
            jest.advanceTimersByTime(40);
            expect([seen, plain.pending(), jest.getTimerCount()]).toEqual([[], false, 0]);

            const again: func.Debounced<( value: number ) => void> = func.debounce(( value: number ): void => {

                seen.push(value);

                if ( value < 2 ) again(value + 1);

            }, 20);

            again(0);
            jest.advanceTimersByTime(20);
            expect([seen, again.pending()]).toEqual([[0], true]);
            jest.advanceTimersByTime(40);
            expect([seen, again.pending()]).toEqual([[0, 1, 2], false]);
            jest.advanceTimersByTime(40);
            expect([seen, jest.getTimerCount()]).toEqual([[0, 1, 2], 0]);

        });

    });
    it("throttle keeps the first and the last call of a window", async () => {

        await faked(() => {

            const hits: number[] = [];
            const keep = ( value: number ): void => { hits.push(value); };
            const limited = func.throttle(keep, 30);

            limited(1);
            limited(2);
            limited(3);
            expect([hits, limited.pending()]).toEqual([[1], true]);
            jest.advanceTimersByTime(29);
            expect(hits).toEqual([1]);
            jest.advanceTimersByTime(1);
            expect([hits, limited.pending()]).toEqual([[1, 3], false]);
            limited(4);
            expect(hits).toEqual([1, 3]);
            jest.advanceTimersByTime(30);
            expect(hits).toEqual([1, 3, 4]);
            limited(5);
            jest.setSystemTime(Date.now() + 100);
            limited(6);
            expect([hits, limited.pending()]).toEqual([[1, 3, 4, 6], false]);
            jest.advanceTimersByTime(100);
            expect(hits).toEqual([1, 3, 4, 6]);
            jest.setSystemTime(origin - 60_000);
            limited(7);
            expect(hits).toEqual([1, 3, 4, 6, 7]);
            limited(8);
            limited.cancel();
            expect(limited.pending()).toBe(false);
            jest.advanceTimersByTime(100);
            expect(hits).toEqual([1, 3, 4, 6, 7]);
            jest.setSystemTime(origin - 60_000);
            limited(9);
            limited.flush();
            limited.flush();
            expect([hits, limited.pending(), jest.getTimerCount()]).toEqual([[1, 3, 4, 6, 7, 9], false, 0]);

            const open = func.throttle(keep, Number.NaN);
            const wide = func.throttle(keep, -3);

            hits.length = 0;
            open(1);
            open(2);
            wide(3);
            wide(4);
            expect([hits, open.pending(), wide.pending()]).toEqual([[1, 2, 3, 4], false, false]);

            const again: func.Throttled<( value: number ) => void> = func.throttle(( value: number ): void => {

                hits.push(value);

                if ( value < 2 ) again(value + 1);

            }, 30);

            hits.length = 0;
            again(0);
            expect([hits, again.pending()]).toEqual([[0], true]);
            jest.advanceTimersByTime(30);
            expect(hits).toEqual([0, 1]);
            jest.advanceTimersByTime(30);
            expect([hits, again.pending()]).toEqual([[0, 1, 2], false]);
            jest.advanceTimersByTime(90);
            expect([hits, jest.getTimerCount()]).toEqual([[0, 1, 2], 0]);

        });

    });
    it("retry counts its attempts, backs off and stops as told", async () => {

        await faked(async () => {

            const attempts: number[] = [];
            const waits: number[] = [];
            const noted: [unknown, number][] = [];
            const down = async ( attempt: number ): Promise<never> => {

                attempts.push(attempt);

                throw error.fault("unavailable", `try.${attempt}`);

            };
            const told = ( seconds: number ) => async ( attempt: number ): Promise<never> => {

                attempts.push(attempt);

                throw error.fault("too_many_requests", "slow.down", { retryAfter: seconds });

            };
            const onRetry = ( failure: unknown, attempt: number, wait: number ): void => {

                waits.push(wait);
                noted.push([failure, attempt]);

            };
            const first = watch(func.retry(down, { times: 3, delay: 4, factor: 3, max: 10, jitter: false, onRetry }));

            await pass(3);
            expect(attempts).toEqual([1]);
            await pass(1);
            expect(attempts).toEqual([1, 2]);
            await pass(9);
            expect([attempts, first.done]).toEqual([[1, 2], false]);
            await pass(1);
            expect([attempts, waits, first.done]).toEqual([[1, 2, 3], [4, 10], true]);
            expect(first.failure).toMatchObject({ code: "unavailable", reason: "try.3" });
            expect(noted.map(( [failure, attempt] ) => [error.isFault(failure) && failure.reason, attempt])).toEqual([["try.1", 1], ["try.2", 2]]);

            for ( const [times, expected] of [[Number.NaN, 3], [undefined, 3], [0, 1], [-2, 1], [2.9, 2], [1, 1]] as const ) {

                attempts.length = 0;

                const counted = watch(func.retry(down, { times, delay: 1, jitter: false }));

                await pass(1);
                await pass(2);
                expect([attempts.length, counted.done]).toEqual([expected, true]);

            }

            const random = spyOn(Math, "random");

            try {

                for ( const [roll, expected] of [[0, [50, 100]], [0.5, [75, 150]]] as const ) {

                    random.mockReturnValue(roll);
                    waits.length = 0;

                    const jittered = watch(func.retry(down, { delay: 100, onRetry }));

                    await pass(200);
                    await pass(200);
                    expect([waits, jittered.done]).toEqual([[...expected], true]);

                }

            } finally {

                random.mockRestore();

            }

            const asked: [string, number][] = [];

            attempts.length = 0;

            const picky = watch(func.retry(down, {
                times: 5,
                delay: 1,
                jitter: false,
                when: ( failure, attempt ) => {

                    asked.push([error.isFault(failure) ? (failure.reason ?? "") : "", attempt]);

                    return attempt < 2;

                },
            }));

            await pass(1);
            await pass(5);
            expect([attempts, asked, picky.done]).toEqual([[1, 2], [["try.1", 1], ["try.2", 2]], true]);

            let plain = 0;
            const strange = watch(func.retry(async () => {

                plain += 1;

                throw new Error("x");

            }));

            await pass(1000);
            expect([plain, strange.done]).toEqual([1, true]);
            attempts.length = 0;
            waits.length = 0;

            const patient = watch(func.retry(told(2), { times: 2, delay: 1, onRetry }));

            await pass(1999);
            expect(attempts).toEqual([1]);
            await pass(1);
            expect([attempts, waits, patient.done]).toEqual([[1, 2], [2000], true]);
            attempts.length = 0;
            waits.length = 0;

            const hopeless = watch(func.retry(told(3600), { onRetry }));

            await settle();
            expect([attempts, waits, hopeless.done, jest.getTimerCount()]).toEqual([[1], [], true, 0]);
            expect(hopeless.failure).toMatchObject({ code: "too_many_requests", retryAfter: 3600 });

            const instant = watch(func.retry(told(0), { times: 2, delay: 5000, onRetry }));

            await pass(1);
            expect([waits, instant.done]).toEqual([[0], true]);

            const gone = new AbortController();
            const leaving = new AbortController();

            gone.abort();
            attempts.length = 0;

            const stopped = watch(func.retry(down, { signal: gone.signal, delay: 1 }));

            await settle();
            expect([attempts, stopped.done]).toEqual([[1], true]);
            expect(stopped.failure).toMatchObject({ reason: "try.1" });
            attempts.length = 0;

            const waiting = watch(func.retry(down, { signal: leaving.signal, delay: 60_000, jitter: false }));

            await pass(1000);
            expect([attempts, waiting.done, jest.getTimerCount()]).toEqual([[1], false, 1]);
            leaving.abort();
            await settle();
            expect([attempts, waiting.done, jest.getTimerCount()]).toEqual([[1], true, 0]);
            expect(waiting.failure).toMatchObject({ code: "unavailable", reason: "try.1" });
            waits.length = 0;

            const healed = watch(func.retry(async ( attempt ) => {

                if ( attempt < 2 ) throw error.fault("network", "blip");

                return `ok.${attempt}`;

            }, { delay: 1, jitter: false, onRetry }));

            await pass(1);
            expect([healed.value, waits]).toEqual(["ok.2", [1]]);
            expect(await func.retry(async ( attempt ) => attempt)).toBe(1);

        });

    });
    it("timeout races the clock and aborts only the work that lost", async () => {

        await faked(async () => {

            const never = new Promise<number>(() => undefined);
            const held: AbortSignal[] = [];
            const slow = watch(func.timeout(never, 50, "slow"));

            await pass(49);
            expect(slow.done).toBe(false);
            await pass(1);
            expect(slow.failure).toMatchObject({ code: "timeout", reason: "slow" });

            const lost = watch(func.timeout(( signal ) => {

                held.push(signal);

                return never;

            }, 20));

            await pass(19);
            expect(held[0]?.aborted).toBe(false);
            await pass(1);
            expect(lost.failure).toMatchObject({ code: "timeout", reason: "timeout" });
            expect([held[0]?.aborted, held[0]?.reason === lost.failure]).toEqual([true, true]);

            const quick = watch(func.timeout(( signal ) => {

                held.push(signal);

                return Promise.resolve(7);

            }, 20));

            await settle();
            expect([quick.value, held[1]?.aborted, jest.getTimerCount()]).toEqual([7, false, 0]);

            const refused = watch(func.timeout(Promise.reject(error.fault("forbidden")), 20));

            await settle();
            expect(refused.failure).toMatchObject({ code: "forbidden" });
            expect(jest.getTimerCount()).toBe(0);
            expect(await func.timeout(Promise.resolve(1), 0)).toBe(1);

            const odd = [Number.NaN, -5, 0].map(( ms ) => watch(func.timeout(never, ms)));

            await pass(1);
            expect(odd.map(( outcome ) => error.isFault(outcome.failure) && outcome.failure.code)).toEqual(["timeout", "timeout", "timeout"]);

            const forever = watch(func.timeout(never, Number.POSITIVE_INFINITY));
            const long = watch(func.timeout(never, 3e9));

            await pass(2_147_483_646);
            expect([forever.done, long.done]).toEqual([false, false]);
            await pass(1);
            expect([forever.done, long.done, jest.getTimerCount()]).toEqual([false, true, 0]);

        });

    });
    it("a breaker opens on a streak, admits one probe and ignores stragglers", async () => {

        await faked(async () => {

            const states: func.BreakerState[] = [];
            const guard = func.breaker({ failures: 2, cooldown: 2500, onChange: ( state ) => { states.push(state); } });
            const fail = async (): Promise<never> => { throw error.fault("unavailable", "down"); };
            const early = func.deferred<number>();
            const straggler = guard.run(() => early.promise);
            let ran = 0;
            const work = async (): Promise<number> => {

                ran += 1;

                return ran;

            };

            await failureOf(guard.run(fail));
            expect([await guard.run(work), guard.failures()]).toEqual([1, 0]);
            await failureOf(guard.run(fail));
            expect([guard.state(), guard.failures()]).toEqual(["closed", 1]);
            await failureOf(guard.run(fail));
            expect([guard.state(), guard.failures(), states]).toEqual(["open", 2, ["open"]]);
            early.resolve(9);
            expect([await straggler, guard.state(), guard.failures()]).toEqual([9, "open", 2]);
            expect(await failureOf(guard.run(work))).toMatchObject({ code: "unavailable", reason: "breaker.open", retryAfter: 3 });
            jest.advanceTimersByTime(600);
            expect(await failureOf(guard.run(work))).toMatchObject({ retryAfter: 2 });
            jest.advanceTimersByTime(1899);
            expect(await failureOf(guard.run(work))).toMatchObject({ retryAfter: 1 });
            expect(guard.state()).toBe("open");
            jest.advanceTimersByTime(1);
            expect([guard.state(), ran, states]).toEqual(["half", 1, ["open"]]);

            const trial = func.deferred<number>();
            const probe = guard.run(() => trial.promise);

            expect(states).toEqual(["open", "half"]);
            expect(await failureOf(guard.run(work))).toMatchObject({ reason: "breaker.open", retryAfter: 1 });
            trial.reject(error.fault("unavailable", "still.down"));
            expect(await failureOf(probe)).toMatchObject({ reason: "still.down" });
            expect([guard.state(), ran, states]).toEqual(["open", 1, ["open", "half", "open"]]);
            jest.advanceTimersByTime(2500);
            expect(await guard.run(work)).toBe(2);
            expect([guard.state(), guard.failures(), states]).toEqual(["closed", 0, ["open", "half", "open", "half", "closed"]]);

            const late = func.deferred<number>();
            const slow = guard.run(() => late.promise);

            guard.reset();
            late.reject(error.fault("unavailable", "late"));
            expect(await failureOf(slow)).toMatchObject({ reason: "late" });
            expect([guard.failures(), states.length]).toEqual([0, 5]);
            await failureOf(guard.run(fail));
            await failureOf(guard.run(fail));
            guard.reset();
            expect([guard.state(), guard.failures(), states.slice(5)]).toEqual(["closed", 0, ["open", "closed"]]);
            await failureOf(guard.run(fail));
            await failureOf(guard.run(fail));
            jest.setSystemTime(origin - 60_000);
            expect(guard.state()).toBe("open");
            jest.advanceTimersByTime(2499);
            expect(guard.state()).toBe("open");
            jest.advanceTimersByTime(1);
            expect(guard.state()).toBe("half");

        });

    });
    it("a breaker reads odd settings as its defaults and counts only what it is told", async () => {

        await faked(async () => {

            const fail = async (): Promise<never> => { throw error.fault("unavailable", "down"); };
            const odd = async (): Promise<never> => { throw new Error("plain"); };
            const loose = func.breaker({ failures: Number.NaN, cooldown: Number.NaN });
            const strict = func.breaker({ failures: 0, cooldown: 0 });
            const sealed = func.breaker({ failures: 1, cooldown: Number.POSITIVE_INFINITY });
            const picky = func.breaker({ failures: 1, cooldown: 10, when: error.isFault });

            for ( let round = 0; round < 4; round += 1 ) await failureOf(loose.run(fail));

            expect([loose.state(), loose.failures()]).toEqual(["closed", 4]);
            await failureOf(loose.run(fail));
            expect(loose.state()).toBe("open");
            expect(await failureOf(loose.run(fail))).toMatchObject({ reason: "breaker.open", retryAfter: 30 });
            jest.advanceTimersByTime(29_999);
            expect(loose.state()).toBe("open");
            jest.advanceTimersByTime(1);
            expect(loose.state()).toBe("half");
            await failureOf(strict.run(fail));
            expect(strict.state()).toBe("half");
            expect(await strict.run(async () => "back")).toBe("back");
            expect(strict.state()).toBe("closed");
            await failureOf(sealed.run(fail));

            const refusal = await failureOf(sealed.run(fail));

            expect(error.isFault(refusal) && [refusal.reason, refusal.retryAfter]).toEqual(["breaker.open", undefined]);
            jest.advanceTimersByTime(2_000_000_000);
            expect(sealed.state()).toBe("open");
            await failureOf(picky.run(odd));
            expect([picky.state(), picky.failures()]).toEqual(["closed", 0]);
            await failureOf(picky.run(fail));
            expect(picky.state()).toBe("open");
            jest.advanceTimersByTime(10);
            expect(await failureOf(picky.run(odd))).toMatchObject({ message: "plain" });
            expect(picky.state()).toBe("half");
            expect(await picky.run(async () => "back")).toBe("back");
            expect([picky.state(), picky.failures()]).toEqual(["closed", 0]);

        });

    });
    it("a lane starts work in order and never runs wider than asked", async () => {

        for ( const [width, expected] of [[1, 1], [0, 1], [-3, 1], [Number.NaN, 1], [2.9, 2], [3, 3], [50, 12]] as const ) {

            const lane = func.lane(width);
            const started: number[] = [];
            let active = 0;
            let peak = 0;
            const jobs = Array.from({ length: 12 }, ( _, at ) => lane.run(async () => {

                started.push(at);
                active += 1;
                peak = Math.max(peak, active);
                await Promise.resolve();
                active -= 1;

                return at;

            }));

            expect([lane.active(), lane.waiting(), lane.size()]).toEqual([expected, 12 - expected, 12]);
            expect(await Promise.all(jobs)).toEqual(started);
            expect([started, peak]).toEqual([Array.from({ length: 12 }, ( _, at ) => at), expected]);
            await lane.idle();
            expect([lane.active(), lane.waiting(), lane.size()]).toEqual([0, 0, 0]);

        }

        const single = func.lane();
        const block = func.deferred<string>();
        const busy = single.run(() => block.promise);
        let woke = 0;
        const waiters = [single.idle().then(() => { woke += 1; }), single.idle().then(() => { woke += 1; })];

        await settle();
        expect([woke, single.active()]).toEqual([0, 1]);
        block.resolve("free");
        await Promise.all([busy, ...waiters]);
        expect([woke, single.size()]).toEqual([2, 0]);

    });
    it("a lane lets a waiter leave and keeps the place of the rest", async () => {

        const lane = func.lane(1);
        const gate = func.deferred<string>();
        const hold = func.deferred<number>();
        const ran: string[] = [];
        const leaving = new AbortController();
        const gone = new AbortController();
        const running = new AbortController();
        const job = ( name: string ) => async (): Promise<string> => {

            ran.push(name);

            return name;

        };

        gone.abort("gone");

        const first = lane.run(() => gate.promise);
        const second = lane.run(job("second"), leaving.signal);
        const third = lane.run(job("third"));

        expect(await failureOf(lane.run(job("never"), gone.signal))).toMatchObject({ code: "timeout", reason: "lane.aborted", cause: "gone" });
        expect([lane.active(), lane.waiting()]).toEqual([1, 2]);
        leaving.abort(new Error("left"));
        expect(await failureOf(second)).toMatchObject({ code: "timeout", reason: "lane.aborted" });
        expect([lane.active(), lane.waiting(), lane.size()]).toEqual([1, 1, 2]);
        gate.resolve("first");
        expect(await Promise.all([first, third])).toEqual(["first", "third"]);
        expect([ran, lane.size()]).toEqual([["third"], 0]);

        const started = lane.run(() => hold.promise, running.signal);

        running.abort();
        hold.resolve(4);
        expect([await started, lane.size()]).toEqual([4, 0]);
        await expect(lane.run(async () => { throw new Error("x"); })).rejects.toThrow("x");
        expect(await lane.run(job("after"))).toBe("after");

    });
    it("a crowded lane compacts its queue and skips the ones that left", async () => {

        const lane = func.lane(3);
        const started: number[] = [];
        const leaving = new AbortController();
        let active = 0;
        let peak = 0;
        const jobs = Array.from({ length: 3000 }, ( _, at ) => lane.run(async () => {

            started.push(at);
            active += 1;
            peak = Math.max(peak, active);
            await Promise.resolve();
            active -= 1;

            return at;

        }, at % 7 === 5 ? leaving.signal : undefined));

        expect([lane.active(), lane.waiting()]).toEqual([3, 2997]);
        leaving.abort();
        expect(lane.waiting()).toBe(2997 - 428);

        const results = await Promise.allSettled(jobs);
        const kept = results.flatMap(( result ) => (result.status === "fulfilled" ? [result.value] : []));

        expect(kept).toEqual(started);
        expect(kept).toEqual(Array.from({ length: 3000 }, ( _, at ) => at).filter(( at ) => at % 7 !== 5));
        expect(results.filter(( result ) => result.status === "rejected" && error.isFault(result.reason) && result.reason.reason === "lane.aborted")).toHaveLength(428);
        expect([peak, lane.active(), lane.waiting(), lane.size()]).toEqual([3, 0, 0, 0]);
        expect(await lane.run(async () => "open")).toBe("open");

    });
    it("pipe threads typed steps and a deferred settles once", async () => {

        const order: string[] = [];
        const lost = func.deferred<number>();
        const won = func.deferred<number>();

        expect(func.pipe(5)).toBe(5);
        expect(func.pipe("7", Number, ( value ) => value + 1, String, ( text ) => text.padStart(3, "0"), ( text ) => [text])).toEqual(["008"]);
        expect(func.pipe(1, ...Array.from({ length: 40 }, () => ( value: number ) => value * 2))).toBe(2 ** 40);
        expect(func.tap(order, ( list ) => { list.push("seen"); })).toBe(order);
        expect(order).toEqual(["seen"]);
        expect([lost.settled, won.settled]).toEqual([false, false]);
        lost.reject(error.fault("gone"));
        lost.resolve(3);
        won.resolve(1);
        won.resolve(2);
        won.reject(new Error("late"));
        expect([lost.settled, won.settled, await won.promise]).toEqual([true, true, 1]);
        await expect(lost.promise).rejects.toMatchObject({ code: "gone" });

    });

});
