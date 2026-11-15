import { describe, expect, test as it, jest } from "bun:test";
import * as cache from "engine/cache";
import * as queue from "engine/queue";

describe("outbox subscription ownership", () => {

    it("the last observer releases the storage watcher and a later observer can subscribe again", async () => {

        const storage = cache.memory();
        const watch = storage.watch;
        let active = 0;
        let calls = 0;

        storage.watch = ( key, listener ) => {

            active += 1;
            const stop = watch(key, listener);

            return () => { active -= 1; stop(); };

        };

        const made = queue.create({ owner: "observer", store: storage, perform: async () => undefined });
        const first = made.watch(() => { calls += 1; });
        const second = made.watch(() => { calls += 1; });

        expect(active).toBe(1);
        first();
        expect(active).toBe(1);
        second();
        second();
        expect(active).toBe(0);

        const third = made.watch(() => { calls += 1; });

        expect(active).toBe(1);
        await made.push("work", {});
        expect(calls).toBe(1);
        third();
        expect(active).toBe(0);

    });
});

it("an expired worker cannot complete a replacement worker's lease", async () => {

    jest.useFakeTimers();
    jest.setSystemTime(1000);

    try {

        const storage = cache.memory();
        const older = Promise.withResolvers<void>();
        const newer = Promise.withResolvers<void>();
        const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()] as const;
        const first = queue.create({ owner: "shared", store: storage, timeout: Number.POSITIVE_INFINITY, perform: async () => { entered[0].resolve(); await older.promise; } });
        const second = queue.create({ owner: "shared", store: storage, timeout: Number.POSITIVE_INFINITY, perform: async () => { entered[1].resolve(); await newer.promise; } });
        const job = await first.push("work", {});
        const one = first.flush();

        await entered[0].promise;
        jest.setSystemTime(301001);

        const two = second.flush();

        await entered[1].promise;
        older.resolve();
        expect(await one).toEqual({ done: 0, failed: 0 });
        expect(await second.get(job.id)).toMatchObject({ status: "running", attempts: 2 });
        newer.resolve();
        expect(await two).toEqual({ done: 1, failed: 0 });
        expect(await second.get(job.id)).toMatchObject({ status: "done", attempts: 2 });

    } finally {

        jest.useRealTimers();

    }

});

it("destroy releases implicit and explicit observers and cancels an owned flight", async () => {

    const storage = cache.memory();
    const watch = storage.watch;
    let active = 0;
    let starts = 0;
    const entered = Promise.withResolvers<void>();

    storage.watch = ( key, listener ) => {

        active += 1;

        const stop = watch(key, listener);

        return () => { active -= 1; stop(); };

    };

    const made = queue.create({ owner: "lifetime", store: storage, onChange: () => undefined, perform: async () => {

        starts += 1;
        entered.resolve();
        await new Promise<void>(() => undefined);

    } });
    const stop = made.watch(() => undefined);
    const job = await made.push("work", {});
    const pending = made.flush();

    await entered.promise;
    expect(active).toBe(1);
    made.destroy();
    made.destroy();
    stop();
    await expect(pending).rejects.toMatchObject({ reason: "queue.aborted" });
    expect([active, starts]).toEqual([0, 1]);
    await expect(made.push("after", {})).rejects.toMatchObject({ reason: "queue.closed" });
    expect(() => made.watch(() => undefined)).toThrow();
    expect(() => made.start()).toThrow();
    expect(await queue.create({ owner: "lifetime", store: storage, perform: async () => undefined }).get(job.id)).toMatchObject({ status: "pending", attempts: 0 });

});


it("outboxes refuse unsupported shared persistence and require an explicit local-only choice", async () => {

    const inner = cache.memory();
    const store = cache.driver({ get: inner.get, set: inner.set, delete: inner.delete, keys: inner.keys });
    const first = queue.create({ store, owner: "first", perform: async () => undefined });
    const second = queue.create({ store, owner: "second", perform: async () => undefined });

    try {

        await expect(first.push("change", 1)).rejects.toMatchObject({ code: "unavailable", reason: "cache.unguarded" });
        await expect(second.push("change", 2)).rejects.toMatchObject({ code: "unavailable", reason: "cache.unguarded" });
        expect(await inner.keys()).toEqual([]);

    } finally {

        first.destroy();
        second.destroy();

    }

    const local = queue.create({ store, owner: "local", guard: "local", perform: async () => undefined });

    try {

        await local.push("change", 3);
        expect(await local.pending()).toBe(1);
        expect(await local.flush()).toEqual({ done: 1, failed: 0 });

    } finally {

        local.destroy();

    }

});
