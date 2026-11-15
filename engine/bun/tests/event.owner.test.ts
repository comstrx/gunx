import { expect, test as it } from "bun:test";
import { getEventListeners } from "node:events";
import * as event from "engine/event";

it("until notices cancellation inside its predicate and releases the subscription", async () => {

    const controller = new AbortController();
    const source = event.signal(0);
    const pending = source.until(() => { controller.abort(); return false; }, { signal: controller.signal, timeout: 10 });
    let reason: unknown;

    try { await pending; } catch ( failure ) { reason = failure; }

    expect(reason).toMatchObject({ reason: "event.aborted" });
    expect(source.count()).toBe(0);

});

it("throwing thenable acquisition releases the abort listener", async () => {

    const controller = new AbortController();
    const failure = new Error("then getter");
    // biome-ignore lint/suspicious/noThenProperty: Hostile thenables are the behavior under test.
    const work = Object.defineProperty({}, "then", { get: () => { throw failure; } }) as PromiseLike<number>;

    await expect(event.race(work, controller.signal)).rejects.toBe(failure);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

});

it("a pre-aborted race consumes hostile thenables without a synchronous throw", async () => {

    const controller = new AbortController();
    // biome-ignore lint/suspicious/noThenProperty: Hostile thenables are the behavior under test.
    const work = Object.defineProperty({}, "then", { get: () => { throw new Error("then getter"); } }) as PromiseLike<number>;

    controller.abort();
    await expect(event.race(work, controller.signal)).rejects.toMatchObject({ reason: "event.aborted" });

});

it("releasing a deadline removes its owned abort listener", () => {

    const parent = new AbortController();
    const owned = event.deadline(1000, parent.signal);

    expect(getEventListeners(owned.signal, "abort")).toHaveLength(1);
    owned.release();
    expect(getEventListeners(owned.signal, "abort")).toHaveLength(0);

});

it("a failing disposer rejects an event wait and does not leave it pending", async () => {

    const base = event.signal(0);
    const failure = new Error("dispose failed");
    const source: event.Readable<number> = {
        get: base.get,
        until: base.until,
        watch: ( listener, options ) => {

            const stop = base.watch(listener, options);

            return () => { stop(); throw failure; };

        },
    };
    const derived = event.derive(source, ( value ) => value);
    const pending = derived.until(( value ) => value > 0, { timeout: 5 }).catch(( cause: unknown ) => cause);

    base.set(1);
    expect(await Promise.race([pending, new Promise(( resolve ) => setTimeout(() => resolve("unsettled"), 10))])).toBe(failure);
    expect(base.count()).toBe(0);

});
