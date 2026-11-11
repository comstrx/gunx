import { describe, expect, test as it } from "bun:test";
import * as cache from "engine/cache";
import * as error from "engine/error";
import * as event from "engine/event";
import * as state from "engine/state";
import * as fc from "fast-check";

type Bag = { items: string[]; user: { id: number } | null; n: number };
type Moves = { add: ( sku: string ) => void; put: ( n: number ) => void; sign: ( user: { id: number } | null ) => void };
type Slice = { items: string[]; user: { id: number } | null; n: number };
type Saved = { version: number; state: Slice };
type Change = { kind: "add"; sku: string } | { kind: "put"; n: number } | { kind: "sign"; id: number | null };
type Deed = Change | { kind: "flush" } | { kind: "forget" } | { kind: "reset" };
type Turn = { who: 0 | 1; deed: Deed };
type Page = { ids: string[]; next: string | null; fail: boolean };
type FeedAct = { kind: "more" } | { kind: "refresh" } | { kind: "put"; id: string; at: "start" | "end" } | { kind: "drop"; id: string } | { kind: "reset" };
type ActionAct = { kind: "run"; input: number } | { kind: "resolve"; at: number } | { kind: "reject"; at: number } | { kind: "abort" } | { kind: "reset" };
type ResourceAct = { kind: "ensure" } | { kind: "refresh" } | { kind: "resolve"; at: number } | { kind: "reject"; at: number } | { kind: "set"; value: number } | { kind: "update" } | { kind: "abort" } | { kind: "reset" };
type Flight<T> = { promise: Promise<T>; resolve: ( value: T ) => void; reject: ( cause: unknown ) => void; run: Promise<unknown> };
type ActionModel = { status: string; result: number | undefined; failed: boolean; runs: number; current: number | undefined };
type ResourceModel = { status: string; data: number | undefined; failed: boolean; current: number | undefined };
type Verdict = "empty" | "corrupt" | "older" | "same" | "newer";

const runs = 300;
const quick = 1500;
const skus = ["a", "b", "c"] as const;
const change: fc.Arbitrary<Change> = fc.oneof(
    fc.record({ kind: fc.constant("add" as const), sku: fc.constantFrom(...skus) }),
    fc.record({ kind: fc.constant("put" as const), n: fc.integer({ min: -3, max: 3 }) }),
    fc.record({ kind: fc.constant("sign" as const), id: fc.option(fc.nat({ max: 3 }), { nil: null }) }),
);
const deed: fc.Arbitrary<Deed> = fc.oneof(
    { weight: 5, arbitrary: change },
    { weight: 3, arbitrary: fc.constant<Deed>({ kind: "flush" }) },
    { weight: 1, arbitrary: fc.constant<Deed>({ kind: "forget" }) },
    { weight: 1, arbitrary: fc.constant<Deed>({ kind: "reset" }) },
);
const junk = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant("junk"),
    fc.constant(7),
    fc.constant([]),
    fc.constant({}),
    fc.constant({ version: 1 }),
    fc.constant({ state: {} }),
    fc.record({ version: fc.constantFrom<unknown>("1", 1.5, Number.NaN, -1, 2 ** 53), state: fc.constant({}) }),
    fc.record({ version: fc.nat({ max: 4 }), state: fc.constantFrom<unknown>(null, [], "x", 3) }),
);
const slice = fc.record({
    items: fc.constantFrom<unknown>(["s"], [], "not a list", 3, undefined),
    user: fc.constantFrom<unknown>({ id: 9 }, null, "me", [1], undefined),
    n: fc.constantFrom<unknown>(5, "5", null, undefined),
}, { requiredKeys: [] });
const saved = fc.oneof({ weight: 1, arbitrary: junk }, { weight: 4, arbitrary: fc.record({ version: fc.nat({ max: 4 }), state: slice }) });

function told ( failure: unknown ): string {

    if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

    return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

}
function tick ( ms = 0 ): Promise<void> {

    return new Promise(( done ) => setTimeout(done, ms));

}
function flight<T> (): Flight<T> {

    const { promise, resolve, reject } = Promise.withResolvers<T>();

    return { promise, resolve, reject, run: Promise.resolve() };

}
function kind ( value: unknown ): string {

    if ( value === null ) return "null";

    return Array.isArray(value) ? "array" : typeof value;

}
function judge ( found: unknown, version: number ): Verdict {

    if ( found === undefined ) return "empty";
    if ( typeof found !== "object" || found === null || Array.isArray(found) ) return "corrupt";

    const row = found as { version?: unknown; state?: unknown };

    if ( typeof row.state !== "object" || row.state === null || Array.isArray(row.state) ) return "corrupt";
    if ( typeof row.version !== "number" || !Number.isSafeInteger(row.version) ) return "corrupt";
    if ( row.version === version ) return "same";

    return row.version > version ? "newer" : "older";

}
function accepted ( found: Record<string, unknown>, initial: Slice ): Partial<Slice> {

    const out: Partial<Slice> = {};

    for ( const key of ["items", "user", "n"] as const ) {

        if ( !Object.hasOwn(found, key) ) continue;

        const model: unknown = initial[key];

        if ( model === null || kind(model) === kind(found[key]) ) (out as Record<string, unknown>)[key] = found[key];

    }

    return out;

}
function stripped ( found: unknown ): Saved | undefined {

    if ( found === undefined ) return undefined;

    const { version, state: kept } = found as Saved;

    return { version, state: kept };

}
function sliceOf ( made: state.Instance<Bag, Moves> ): Slice {

    const { items, user, n } = made.getState();

    return { items, user, n };

}
function define ( box: cache.Box, persist: Partial<state.Persist<Bag>> = {}, faults: string[] = [] ): state.Instance<Bag, Moves> {

    return state.define<Bag, Moves>({
        name: "bag",
        initial: { items: [], user: null, n: 0 },
        actions: ( set, get ) => ({ add: ( sku ) => set({ items: [...get().items, sku] }), put: ( n ) => set({ n }), sign: ( user ) => set({ user }) }),
        persist: { box, fail: ( fault ) => faults.push(told(fault)), ...persist },
    }).create();

}
function act ( made: state.Instance<Bag, Moves>, step: Change ): void {

    if ( step.kind === "add" ) made.getState().add(step.sku);
    else if ( step.kind === "put" ) made.getState().put(step.n);
    else made.getState().sign(step.id === null ? null : { id: step.id });

}
function moved ( current: Slice, step: Change ): boolean {

    if ( step.kind === "add" ) return true;
    if ( step.kind === "put" ) return step.n !== current.n;

    return !(step.id === null && current.user === null);

}
function model ( current: Slice, step: Change ): Slice {

    if ( step.kind === "add" ) return { ...current, items: [...current.items, step.sku] };
    if ( step.kind === "put" ) return { ...current, n: step.n };

    return { ...current, user: step.id === null ? null : { id: step.id } };

}

describe("fuzz state", () => {

    it("hydration judges any saved copy as the model does: reads never write, a newer copy freezes, an older one migrates or waits", async () => {

        await fc.assert(fc.asyncProperty(saved, fc.nat({ max: 4 }), fc.boolean(), fc.array(change, { maxLength: 2 }), async ( found, version, migrating, early ) => {

            const box = cache.open({ storage: cache.memory() });
            const faults: string[] = [];
            const initial: Slice = { items: [], user: null, n: 0 };
            const stored: unknown = found === undefined ? undefined : JSON.parse(JSON.stringify(found));

            if ( found !== undefined ) await box.set("bag@2", found);

            const made = define(box, { version, migrate: migrating ? ( old ) => old as Partial<Bag> : undefined }, faults);
            const touchedKeys = new Set<keyof Slice>();
            let touched: Slice = initial;

            for ( const step of early ) {

                act(made, step);

                if ( moved(touched, step) ) touchedKeys.add(step.kind === "add" ? "items" : step.kind === "put" ? "n" : "user");

                touched = model(touched, step);

            }

            await made.hydrate();
            await made.flush();

            const verdict = judge(stored, version);
            const usable = verdict === "same" || (verdict === "older" && migrating);
            const kept = usable ? accepted((stored as Saved).state as unknown as Record<string, unknown>, initial) : {};
            const expected: Slice = { ...initial, ...kept };

            if ( touchedKeys.has("items") ) expected.items = touched.items;
            if ( touchedKeys.has("n") ) expected.n = touched.n;
            if ( touchedKeys.has("user") ) expected.user = touched.user;

            expect(made.getState().ready).toBe(true);

            if ( verdict === "newer" ) {

                expect([made.getState().kept, faults, await box.get("bag@2")]).toEqual([false, ["conflict/state.newer"], stored]);
                expect(sliceOf(made)).toEqual({ ...initial, ...touched });
                made.getState().add("z");
                await made.flush();
                expect(await box.get("bag@2")).toEqual(stored);

                return;

            }

            expect([made.getState().kept, faults]).toEqual([true, []]);
            expect(sliceOf(made)).toEqual(expected);

            const writes = touchedKeys.size > 0 || (verdict === "older" && migrating);

            expect(await box.get("bag@2")).toEqual(writes ? { version, state: expected } : stored);
            made.getState().add("z");
            await made.flush();
            expect(await box.get("bag@2")).toEqual({ version, state: { ...expected, items: [...expected.items, "z"] } });

        }), { numRuns: runs });

    });
    it("a persisted instance leaves the box equal to its slice after every flush and empty after a forget", async () => {

        await fc.assert(fc.asyncProperty(fc.array(deed, { maxLength: 14 }), fc.boolean(), async ( deeds, sync ) => {

            const box = cache.open({ storage: cache.memory() });
            const made = define(box, { sync });
            let current: Slice = { items: [], user: null, n: 0 };
            let added = false;
            let written = false;
            const expected = (): Saved | undefined => (written ? { version: 1, state: current } : undefined);

            await made.hydrate();

            for ( const step of deeds ) {

                if ( step.kind === "flush" ) {

                    await made.flush();
                    expect(stripped(await box.get("bag@2"))).toEqual(expected());
                    expect(made.getState().kept).toBe(true);

                } else if ( step.kind === "forget" ) {

                    await made.forget();
                    written = false;
                    expect(await box.get("bag@2")).toBeUndefined();

                } else if ( step.kind === "reset" ) {

                    made.reset();

                    if ( added || current.user !== null || current.n !== 0 ) written = true;

                    added = false;
                    current = { items: [], user: null, n: 0 };

                } else {

                    act(made, step);

                    if ( moved(current, step) ) written = true;
                    if ( step.kind === "add" ) added = true;

                    current = model(current, step);

                }

                expect(sliceOf(made)).toEqual(current);

            }

            await made.flush();
            expect(stripped(await box.get("bag@2"))).toEqual(expected());
            made.stop();

        }), { numRuns: runs });

    });
    it("two synced instances on one storage converge on the box after every settled turn", async () => {

        const turn: fc.Arbitrary<Turn> = fc.record({ who: fc.constantFrom<0 | 1>(0, 1), deed });

        await fc.assert(fc.asyncProperty(fc.array(turn, { maxLength: 12 }), async ( turns ) => {

            const storage = cache.memory();
            const initial: Slice = { items: [], user: null, n: 0 };
            const pair = [define(cache.open({ storage }), { sync: true }), define(cache.open({ storage }), { sync: true })] as const;
            const slices: [Slice, Slice] = [initial, initial];
            const dirty: [boolean, boolean] = [false, false];
            const added: [boolean, boolean] = [false, false];
            let box: Slice | undefined;

            await Promise.all([pair[0].hydrate(), pair[1].hydrate()]);

            for ( const { who, deed: step } of turns ) {

                const made = pair[who];
                const other = (1 - who) as 0 | 1;

                if ( step.kind === "forget" ) {

                    await made.forget();
                    box = undefined;
                    dirty[who] = false;

                    if ( JSON.stringify(slices[other]) !== JSON.stringify(initial) ) added[other] = false;

                    slices[other] = initial;
                    dirty[other] = false;

                } else {

                    if ( step.kind === "reset" ) {

                        made.reset();

                        if ( added[who] || slices[who].user !== null || slices[who].n !== 0 ) dirty[who] = true;

                        added[who] = false;
                        slices[who] = initial;

                    } else if ( step.kind !== "flush" ) {

                        act(made, step);

                        if ( moved(slices[who], step) ) dirty[who] = true;
                        if ( step.kind === "add" ) added[who] = true;

                        slices[who] = model(slices[who], step);

                    }

                    await made.flush();

                    if ( dirty[who] ) {

                        box = slices[who];
                        dirty[who] = false;

                        if ( JSON.stringify(slices[other]) !== JSON.stringify(box) ) added[other] = true;

                        slices[other] = box;
                        dirty[other] = false;

                    }

                }

                await tick();
                expect((await cache.open({ storage }).get<Saved>("bag@2"))?.state).toEqual(box);
                expect([sliceOf(pair[0]), sliceOf(pair[1])]).toEqual(slices);

            }

            pair[0].stop();
            pair[1].stop();

        }), { numRuns: runs });

    });
    it("under a shared lock the lock sections never overlap and the box version never goes down", async () => {

        const hold = fc.array(fc.nat({ max: 2 }), { maxLength: 6 });

        await fc.assert(fc.asyncProperty(hold, fc.array(fc.tuple(fc.constantFrom(0, 1, 2), change), { maxLength: 8 }), async ( holds, moves ) => {

            const inner = cache.memory();
            const log: string[] = [];
            const turns = new Map<string, Promise<unknown>>();
            let pending = 0;
            const lock: cache.Lock = ( key, work ) => {

                const run = (turns.get(key) ?? Promise.resolve()).then(async () => {

                    pending += 1;
                    log.push(`in ${pending}`);
                    await tick(holds.length > 0 ? (holds[log.length % holds.length] ?? 0) : 0);

                    try {

                        return await work();

                    } finally {

                        log.push(`out ${pending}`);
                        pending -= 1;

                    }

                });
                const tail = run.then(() => undefined, () => undefined);

                turns.set(key, tail);

                return run;

            };
            const written: number[] = [];
            const storage = cache.driver({
                get: ( key ) => inner.get(key),
                set: ( key, value ) => {

                    written.push((JSON.parse(value) as { v: Saved }).v.version);

                    return inner.set(key, value);

                },
                delete: ( key ) => inner.delete(key),
                keys: () => inner.keys(),
                watch: ( key, onChange ) => inner.watch(key, onChange),
                lock,
            });
            const versions = [1, 2, 3];
            const made = versions.map(( version ) => define(cache.open({ storage }), { version, migrate: ( old ) => old as Partial<Bag> }));

            const slices: Slice[] = versions.map(() => ({ items: [], user: null, n: 0 }));
            const changed = versions.map(() => false);

            await Promise.all(made.map(( one ) => one.hydrate()));

            for ( const [who, step] of moves ) {

                act(made[who] as state.Instance<Bag, Moves>, step);

                if ( moved(slices[who] as Slice, step) ) changed[who] = true;

                slices[who] = model(slices[who] as Slice, step);

            }

            await Promise.all(made.map(( one ) => one.flush()));

            for ( const [who, one] of made.entries() ) if ( changed[who] ) one.getState().put((slices[who] as Slice).n + 10);

            await Promise.all(made.map(( one ) => one.flush()));

            for ( const line of log ) expect(line).toMatch(/^(in|out) 1$/);
            for ( let at = 1; at < written.length; at += 1 ) expect(written[at] as number).toBeGreaterThanOrEqual(written[at - 1] as number);

            const kept = await cache.open({ storage }).get<Saved>("bag@2");

            if ( kept ) {

                expect(kept.version).toBe(Math.max(...written));

                for ( const [who, one] of made.entries() ) if ( changed[who] ) expect(one.getState().kept).toBe(versions[who] === kept.version);

            } else expect(written).toEqual([]);

        }), { numRuns: 120 });

    });
    it("a feed holds what an ordered set holds through pages, duplicates, failures, puts, drops and refreshes", async () => {

        const id = fc.constantFrom("a", "b", "c", "d");
        const page: fc.Arbitrary<Page> = fc.record({ ids: fc.array(id, { maxLength: 4 }), next: fc.option(fc.constantFrom("p", "q"), { nil: null }), fail: fc.nat({ max: 5 }).map(( roll ) => roll === 0) });
        const feedAct: fc.Arbitrary<FeedAct> = fc.oneof(
            { weight: 4, arbitrary: fc.constant<FeedAct>({ kind: "more" }) },
            { weight: 1, arbitrary: fc.constant<FeedAct>({ kind: "refresh" }) },
            { weight: 2, arbitrary: fc.record({ kind: fc.constant("put" as const), id, at: fc.constantFrom<"start" | "end">("start", "end") }) },
            { weight: 2, arbitrary: fc.record({ kind: fc.constant("drop" as const), id }) },
            { weight: 1, arbitrary: fc.constant<FeedAct>({ kind: "reset" }) },
        );

        await fc.assert(fc.asyncProperty(fc.array(page, { minLength: 1, maxLength: 6 }), fc.array(feedAct, { maxLength: 12 }), async ( pages, acts ) => {

            let served = 0;
            const made = state.feed<{ id: string; tag: number }>({
                key: ( item ) => item.id,
                load: async () => {

                    const found = pages[served % pages.length] as Page;

                    served += 1;

                    if ( found.fail ) throw new Error("down");

                    return { items: found.ids.map(( one ) => ({ id: one, tag: served })), next: found.next };

                },
            });
            let items: { id: string; tag: number }[] = [];
            let ended = false;
            let status = "idle";

            for ( const step of acts ) {

                if ( step.kind === "more" || step.kind === "refresh" ) {

                    if ( step.kind === "more" && ended ) {

                        await made.more();

                    } else {

                        const found = pages[served % pages.length] as Page;
                        const tag = served + 1;

                        await (step.kind === "more" ? made.more() : made.refresh());

                        if ( found.fail ) status = "failed";
                        else {

                            const fresh = step.kind === "refresh" ? [] : items;
                            const known = new Set(fresh.map(( one ) => one.id));
                            const added = found.ids.filter(( one ) => {

                                if ( known.has(one) ) return false;

                                known.add(one);

                                return true;

                            }).map(( one ) => ({ id: one, tag }));

                            items = [...fresh, ...added];
                            ended = found.next === null;
                            status = "done";

                        }

                    }

                } else if ( step.kind === "put" ) {

                    made.put({ id: step.id, tag: -1 }, step.at);

                    if ( items.some(( one ) => one.id === step.id) ) items = items.map(( one ) => (one.id === step.id ? { id: step.id, tag: -1 } : one));
                    else items = step.at === "end" ? [...items, { id: step.id, tag: -1 }] : [{ id: step.id, tag: -1 }, ...items];

                } else if ( step.kind === "drop" ) {

                    made.drop(step.id);
                    items = items.filter(( one ) => one.id !== step.id);

                } else {

                    made.reset();
                    items = [];
                    ended = false;
                    status = "idle";

                }

                expect(made.getState().items).toEqual(items);
                expect<unknown[]>([made.getState().ended, made.getState().status]).toEqual([ended, status]);
                expect(new Set(made.getState().items.map(( one ) => one.id)).size).toBe(made.getState().items.length);

            }

        }), { numRuns: runs });

    });
    it("an action follows its model through runs, settlements, aborts and resets in both modes", async () => {

        const actionAct: fc.Arbitrary<ActionAct> = fc.oneof(
            { weight: 4, arbitrary: fc.record({ kind: fc.constant("run" as const), input: fc.nat({ max: 9 }) }) },
            { weight: 4, arbitrary: fc.record({ kind: fc.constant("resolve" as const), at: fc.nat({ max: 10 }) }) },
            { weight: 2, arbitrary: fc.record({ kind: fc.constant("reject" as const), at: fc.nat({ max: 10 }) }) },
            { weight: 1, arbitrary: fc.constant<ActionAct>({ kind: "abort" }) },
            { weight: 1, arbitrary: fc.constant<ActionAct>({ kind: "reset" }) },
        );

        await fc.assert(fc.asyncProperty(fc.array(actionAct, { maxLength: 14 }), fc.constantFrom<"latest" | "first">("latest", "first"), async ( acts, mode ) => {

            const flights: Flight<number>[] = [];
            const made = state.action<number, number>(( input, signal ) => {

                const mine = flight<number>();

                signal.addEventListener("abort", () => mine.reject(new Error("aborted")), { once: true });
                flights.push(mine);

                return mine.promise.then(() => input);

            }, { mode });
            const expected: ActionModel = { status: "idle", result: undefined, failed: false, runs: 0, current: undefined };

            for ( const step of acts ) {

                if ( step.kind === "run" ) {

                    if ( mode === "first" && expected.current !== undefined ) {

                        const before = flights.length;

                        void made.run(step.input);
                        expect(flights.length).toBe(before);

                    } else {

                        const run = made.run(step.input);

                        expected.current = flights.length - 1;
                        (flights[expected.current] as Flight<number>).run = run;
                        expected.runs += 1;
                        expected.status = "running";
                        expected.failed = false;

                    }

                } else if ( step.kind === "resolve" || step.kind === "reject" ) {

                    const target = flights[step.at % Math.max(1, flights.length)];

                    if ( target ) {

                        if ( step.kind === "resolve" ) target.resolve(1);
                        else target.reject(new Error("boom"));

                        await tick();

                        if ( flights.indexOf(target) === expected.current ) {

                            expected.current = undefined;
                            expected.status = step.kind === "resolve" ? "done" : "failed";
                            expected.failed = step.kind === "reject";

                            if ( step.kind === "resolve" ) expected.result = acts.filter(( one ) => one.kind === "run").length > 0 ? made.getState().result : undefined;

                        }

                    }

                } else if ( step.kind === "abort" ) {

                    made.abort();

                    if ( expected.current !== undefined ) {

                        expected.current = undefined;
                        expected.status = expected.result === undefined ? "idle" : "done";

                    }

                } else {

                    made.reset();
                    expected.current = undefined;
                    expected.status = "idle";
                    expected.result = undefined;
                    expected.failed = false;

                }

                await tick();

                const seen = made.getState();

                expect<unknown[]>([seen.status, seen.runs, seen.error !== undefined]).toEqual([expected.status, expected.runs, expected.failed]);

                if ( expected.status === "done" ) expect(seen.result).toBe(expected.result as number);
                if ( expected.status === "idle" ) expect(seen.result).toBeUndefined();

            }

            for ( const one of flights ) one.resolve(0);

            await Promise.all(flights.map(( one ) => one.run));

        }), { numRuns: runs });

    });
    it("a resource follows its model through ensures, refreshes, settlements, writes, aborts and resets", async () => {

        const resourceAct: fc.Arbitrary<ResourceAct> = fc.oneof(
            { weight: 3, arbitrary: fc.constant<ResourceAct>({ kind: "ensure" }) },
            { weight: 2, arbitrary: fc.constant<ResourceAct>({ kind: "refresh" }) },
            { weight: 4, arbitrary: fc.record({ kind: fc.constant("resolve" as const), at: fc.nat({ max: 10 }) }) },
            { weight: 2, arbitrary: fc.record({ kind: fc.constant("reject" as const), at: fc.nat({ max: 10 }) }) },
            { weight: 1, arbitrary: fc.record({ kind: fc.constant("set" as const), value: fc.nat({ max: 9 }) }) },
            { weight: 1, arbitrary: fc.constant<ResourceAct>({ kind: "update" }) },
            { weight: 1, arbitrary: fc.constant<ResourceAct>({ kind: "abort" }) },
            { weight: 1, arbitrary: fc.constant<ResourceAct>({ kind: "reset" }) },
        );

        await fc.assert(fc.asyncProperty(fc.array(resourceAct, { maxLength: 14 }), fc.option(fc.nat({ max: 3 }), { nil: undefined }), async ( acts, seed ) => {

            const flights: Flight<number>[] = [];
            let served = 100;
            const made = state.resource<number>({ seed, load: ( signal ) => {

                const mine = flight<number>();

                served += 1;

                const value = served;

                signal.addEventListener("abort", () => mine.reject(new Error("aborted")), { once: true });
                flights.push(mine);

                return mine.promise.then(() => value);

            } });
            const expected: ResourceModel = { status: seed === undefined ? "idle" : "done", data: seed, failed: false, current: undefined };
            let stale = seed !== undefined;
            const open = (): void => {

                expected.current = flights.length - 1;
                expected.status = "pending";
                expected.failed = false;

            };

            for ( const step of acts ) {

                if ( step.kind === "ensure" ) {

                    const before = flights.length;

                    void made.ensure();

                    if ( expected.current === undefined && !(expected.status === "done" && !stale) ) {

                        expect(flights.length).toBe(before + 1);
                        open();

                    } else expect(flights.length).toBe(before);

                } else if ( step.kind === "refresh" ) {

                    void made.refresh();
                    open();

                } else if ( step.kind === "resolve" || step.kind === "reject" ) {

                    const target = flights[step.at % Math.max(1, flights.length)];

                    if ( target ) {

                        if ( step.kind === "resolve" ) target.resolve(0);
                        else target.reject(new Error("boom"));

                        await tick();

                        if ( flights.indexOf(target) === expected.current ) {

                            expected.current = undefined;

                            if ( step.kind === "resolve" ) {

                                expected.status = "done";
                                expected.data = 100 + flights.indexOf(target) + 1;
                                stale = false;

                            } else {

                                expected.status = "failed";
                                expected.failed = true;

                            }

                        }

                    }

                } else if ( step.kind === "set" || step.kind === "update" ) {

                    if ( step.kind === "set" ) made.set(step.value);
                    else made.update(( current ) => (current ?? 0) + 1);

                    expected.data = step.kind === "set" ? step.value : (expected.data ?? 0) + 1;
                    expected.current = undefined;
                    expected.status = "done";
                    expected.failed = false;
                    stale = false;

                } else if ( step.kind === "abort" ) {

                    made.abort();

                    if ( expected.current !== undefined ) {

                        expected.current = undefined;
                        expected.status = expected.data === undefined ? "idle" : "done";

                    }

                } else {

                    made.reset();
                    expected.current = undefined;
                    expected.status = seed === undefined ? "idle" : "done";
                    expected.data = seed;
                    expected.failed = false;
                    stale = seed !== undefined;

                }

                await tick();

                const seen = made.getState();

                expect<unknown[]>([seen.status, seen.data, seen.error !== undefined, seen.stale]).toEqual([expected.status, expected.data, expected.failed, stale]);

            }

            for ( const one of flights ) one.resolve(0);

            await tick();

        }), { numRuns: runs });

    });
    it("combine and derive answer the picks of the sources, keep one snapshot per state and fire once per real change", () => {

        fc.assert(fc.property(fc.array(fc.oneof(change, fc.record({ kind: fc.constant("flag" as const), on: fc.boolean() })), { maxLength: 20 }), ( steps ) => {

            const bag = define(cache.open({ storage: cache.memory() }));
            const flag = event.signal(false);
            const count = state.derive(bag, ( current ) => current.items.length);
            const both = state.combine({ count, flag, user: state.derive(bag, ( current ) => current.user?.id ?? -1) });
            let fired = 0;
            let countFired = 0;
            const stop = both.subscribe(() => { fired += 1; });
            const stopCount = count.subscribe(() => { countFired += 1; });
            let expected = { count: 0, flag: false, user: -1 };
            let changes = 0;
            let countChanges = 0;
            let last = both.getState();

            for ( const step of steps ) {

                if ( step.kind === "flag" ) flag.set(step.on);
                else act(bag, step);

                const next = { count: bag.getState().items.length, flag: flag.get(), user: bag.getState().user?.id ?? -1 };

                if ( JSON.stringify(next) !== JSON.stringify(expected) ) changes += 1;
                if ( next.count !== expected.count ) countChanges += 1;

                expected = next;

                const seen = both.getState();

                expect(seen).toEqual(expected);
                expect(both.getState()).toBe(seen);

                if ( JSON.stringify(seen) === JSON.stringify(last) ) expect(seen).toBe(last);

                last = seen;

            }

            expect([fired, countFired, count.getState()]).toEqual([changes, countChanges, expected.count]);
            stop();
            stopCount();

        }), { numRuns: quick });

    });
    it("shallow equality agrees with a one-level reference comparison", () => {

        const leaf = fc.oneof(fc.integer({ min: -2, max: 2 }), fc.constantFrom("a", "b", ""), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.constant(Number.NaN));
        const shared = { s: 1 };
        const value = fc.oneof(
            leaf,
            fc.constant(shared),
            fc.array(fc.oneof(leaf, fc.constant(shared)), { maxLength: 3 }),
            fc.dictionary(fc.constantFrom("a", "b", "c"), fc.oneof(leaf, fc.constant(shared)), { maxKeys: 3 }),
        );
        const reference = ( a: unknown, b: unknown ): boolean => {

            if ( Object.is(a, b) ) return true;
            if ( typeof a !== "object" || typeof b !== "object" || a === null || b === null ) return false;
            if ( Array.isArray(a) !== Array.isArray(b) ) return false;

            const left = Object.entries(a as Record<string, unknown>);
            const right = b as Record<string, unknown>;

            return left.length === Object.keys(right).length && left.every(([key, one]) => Object.hasOwn(right, key) && Object.is(one, right[key]));

        };

        fc.assert(fc.property(value, value, ( a, b ) => {

            expect(state.shallow(a, b)).toBe(reference(a, b));
            expect(state.shallow(a, a)).toBe(true);
            expect(state.shallow(a, b)).toBe(state.shallow(b, a));

        }), { numRuns: quick });

    });
});
