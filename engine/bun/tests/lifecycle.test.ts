import { describe, expect, test as it } from "bun:test";
import * as exception from "engine/exception";
import * as search from "engine/search";
import * as state from "engine/state";

describe("operation ownership", () => {

    for ( const stop of ["reset", "abort"] as const ) {

        it(`action refuses a queued completion after ${stop}`, async () => {

            const pending = Promise.withResolvers<number>();
            const made = state.action<void, number>(() => pending.promise);
            const result = made.run();

            pending.resolve(7);
            queueMicrotask(() => made[stop]());

            expect(await result).toBeUndefined();
            expect(made.getState()).toMatchObject({ status: "idle", result: undefined });

        });
        it(`resource refuses a queued completion after ${stop}`, async () => {

            const pending = Promise.withResolvers<number>();
            const made = state.resource({ load: () => pending.promise, staleAfter: 1 });
            const result = made.refresh();

            pending.resolve(7);
            queueMicrotask(() => made[stop]());

            expect(await result).toBeUndefined();
            expect(made.getState()).toMatchObject({ status: "idle", data: undefined, stale: false });
            made.reset();

        });
        it(`feed refuses a queued completion after ${stop}`, async () => {

            const pending = Promise.withResolvers<state.Page<string>>();
            const made = state.feed({ load: () => pending.promise, key: ( item ) => item });
            const result = made.more();

            pending.resolve({ items: ["stale"], next: null });
            queueMicrotask(() => made[stop]());
            await result;

            expect(made.getState()).toMatchObject({ status: "idle", items: [], ended: false });

        });

    }
    it("resource clock callbacks cannot publish or arm a timer after reset", async () => {

        const made: ReturnType<typeof state.resource<number>> = state.resource({
            load: async () => 7,
            staleAfter: 1,
            now: () => { made.reset(); return 100; },
        });

        expect(await made.refresh()).toBeUndefined();
        expect(made.getState()).toMatchObject({ status: "idle", data: undefined, stale: false });

    });
    it("an invalidated feed never calls the item key callback", async () => {

        const pending = Promise.withResolvers<state.Page<string>>();
        let calls = 0;
        const made = state.feed({ load: () => pending.promise, key: ( item ) => { calls += 1; return item; } });
        const result = made.more();

        pending.resolve({ items: ["stale"], next: null });
        queueMicrotask(() => made.reset());
        await result;
        expect(calls).toBe(0);
        expect(made.getState().items).toEqual([]);

    });
    it("an old action cannot commit or clear its replacement", async () => {

        const old = Promise.withResolvers<number>();
        const next = Promise.withResolvers<number>();
        const made = state.action<number, number>(( input ) => input === 1 ? old.promise : next.promise);
        const first = made.run(1);
        let second: Promise<number | undefined> = Promise.resolve(undefined);

        old.resolve(1);
        queueMicrotask(() => { second = made.run(2); });

        expect(await first).toBeUndefined();
        expect(made.getState()).toMatchObject({ status: "running", result: undefined, runs: 2 });
        next.resolve(2);
        expect(await second).toBe(2);
        expect(made.getState().result).toBe(2);

    });
    it("an old resource cannot clear a replacement shared by ensure", async () => {

        const old = Promise.withResolvers<number>();
        const next = Promise.withResolvers<number>();
        let runs = 0;
        const made = state.resource({ load: () => ++runs === 1 ? old.promise : next.promise });
        const first = made.refresh();
        let second: Promise<number | undefined> = Promise.resolve(undefined);

        old.resolve(1);
        queueMicrotask(() => { second = made.refresh(); });

        expect(await first).toBeUndefined();
        expect(made.ensure()).toBe(second);
        expect(made.getState()).toMatchObject({ status: "pending", data: undefined });
        next.resolve(2);
        expect(await second).toBe(2);
        expect(runs).toBe(2);
        made.reset();

    });
    it("an old feed cannot clear a replacement or keep its deduplication keys", async () => {

        const old = Promise.withResolvers<state.Page<string>>();
        const next = Promise.withResolvers<state.Page<string>>();
        let runs = 0;
        const made = state.feed({ load: () => ++runs === 1 ? old.promise : next.promise, key: ( item ) => item });
        const first = made.more();
        let second: Promise<void> = Promise.resolve();

        old.resolve({ items: ["same"], next: null });
        queueMicrotask(() => { second = made.refresh(); });
        await first;

        expect(made.more()).toBe(second);
        expect(made.getState()).toMatchObject({ status: "refreshing", items: [] });
        next.resolve({ items: ["same"], next: null });
        await second;
        expect(made.getState().items).toEqual(["same"]);
        expect(runs).toBe(2);

    });
    it("feed key callbacks cannot publish after invalidating their operation", async () => {

        const made: state.Feed<string> = state.feed({
            load: async () => ({ items: ["stale"], next: null }),
            key: ( item ) => { made.reset(); return item; },
        });

        await made.more();
        expect(made.getState()).toMatchObject({ status: "idle", items: [], ended: false });

    });
});

describe("slot failure ownership", () => {

    it("a throwing then getter restores the slot", () => {

        const made = exception.slot<number>("scope", { fallback: () => 0 });
        // biome-ignore lint/suspicious/noThenProperty: exercise hostile promise assimilation and scope cleanup.
        const hostile = (): object => Object.defineProperty({}, "then", { get: () => { throw new Error("getter"); } });

        expect(() => made.with(1, hostile)).toThrow("getter");
        expect(made.bound()).toBe(false);
        expect(made.get()).toBe(0);

    });
    it("callable thenables keep the binding until settlement", async () => {

        const made = exception.slot<number>("callable", { fallback: () => 0 });
        const pending = Promise.withResolvers<number>();
        // biome-ignore lint/suspicious/noThenProperty: callable thenables must retain their scoped value.
        const callable = Object.assign(() => undefined, { then: pending.promise.then.bind(pending.promise) });
        const result = made.with(3, () => callable);

        expect(made.get()).toBe(3);
        pending.resolve(7);
        expect(await result).toBe(7);
        expect(made.bound()).toBe(false);

    });
    it("a fallback is validated lazily and a failure may be retried", () => {

        let value = -1;
        let calls = 0;
        const made = exception.slot<number>("fallback", { fallback: () => { calls += 1; return value; }, check: ( found ) => found >= 0 });

        expect(calls).toBe(0);
        expect(() => made.get()).toThrow("does not pass");
        expect(() => made.peek()).toThrow("does not pass");
        value = 4;
        expect(made.get()).toBe(4);
        expect(made.get()).toBe(4);
        expect(calls).toBe(3);
        value = -1;
        made.reset();
        expect(() => made.get()).toThrow("does not pass");
        expect(made.bound()).toBe(false);

    });
});

describe("search mutation ownership", () => {

    it("a failed replacement preserves the item, postings and ranking", () => {

        const made = search.index<{ id: string; text: string }>({
            key: ( item ) => item.id,
            fields: ["text"],
            tokenize: ( text ) => { if ( text === "bad" ) throw new Error("tokenizer"); return text.split(" "); },
        });

        made.addAll([{ id: "a", text: "good" }, { id: "b", text: "good better" }]);
        const before = made.query("good");

        expect(() => made.add({ id: "a", text: "bad" })).toThrow("tokenizer");
        expect(made.get("a")).toEqual({ id: "a", text: "good" });
        expect(made.size()).toBe(2);
        expect(made.query("good")).toEqual(before);
        made.clear();
        expect(made.size()).toBe(0);
        expect(made.terms()).toBe(0);
        made.add({ id: "c", text: "good" });
        expect(made.query("good").map(( hit ) => hit.key)).toEqual(["c"]);

    });
});
