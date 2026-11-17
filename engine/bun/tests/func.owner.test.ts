import { describe, expect, test as it } from "bun:test";
import * as exception from "engine/exception";
import * as func from "engine/func";

describe("lane ownership", () => {

    it("cancellation after handoff prevents work and releases the acquired slot", async () => {

        const made = func.lane(1);
        const held = Promise.withResolvers<void>();
        const controller = new AbortController();
        let ran = false;
        const first = made.run(() => held.promise);
        const second = made.run(async () => { ran = true; }, controller.signal);
        const checked = second.then(() => undefined, ( fault: unknown ) => fault);

        held.resolve();
        queueMicrotask(() => controller.abort());
        await first;
        expect(await checked).toMatchObject({ reason: "lane.aborted" });

        expect(ran).toBe(false);
        expect(made.size()).toBe(0);
        expect(await made.run(async () => 7)).toBe(7);

    });
    it("a bounded lane refuses excess admission and recovers when a waiter leaves", async () => {

        const made = func.lane(1, { pending: 2 });
        const held = Promise.withResolvers<void>();
        const controller = new AbortController();
        const first = made.run(() => held.promise);
        const second = made.run(async () => 2, controller.signal);
        const checked = second.then(() => undefined, ( fault: unknown ) => fault);
        const third = made.run(async () => 3);

        try {

            const excess = made.run(async () => 4).then(() => undefined, ( fault: unknown ) => fault);

            expect(made.waiting()).toBe(2);
            expect(await excess).toMatchObject({ code: "too_many_requests", reason: "lane.full" });
            controller.abort();
            expect(await checked).toMatchObject({ reason: "lane.aborted" });

            const replacement = made.run(async () => 5);
            const idle = made.idle();

            expect(made.idle()).toBe(idle);
            held.resolve();
            expect(await Promise.all([first, third, replacement])).toEqual([undefined, 3, 5]);
            await idle;
            expect(made.size()).toBe(0);

        } finally {

            controller.abort();
            held.resolve();

        }

    }, 2000);
    it("sustained aborted arrivals release their places without displacing a live waiter", async () => {

        const made = func.lane(1, { pending: 2 });
        const held = Promise.withResolvers<void>();
        const first = made.run(() => held.promise);
        const survivor = made.run(async () => "survivor");
        let ran = 0;

        try {

            for ( let at = 0; at < 5000; at += 1 ) {

                const controller = new AbortController();
                const stopped = made.run(async () => { ran += 1; }, controller.signal).catch(() => undefined);

                controller.abort();
                await stopped;

            }

            expect([made.active(), made.waiting(), ran]).toEqual([1, 1, 0]);
            held.resolve();
            expect(await survivor).toBe("survivor");
            await first;
            expect(made.size()).toBe(0);

        } finally {

            held.resolve();

        }

    });
    it("zero pending means no queue and invalid bounds fail before admission", async () => {

        expect(() => func.lane(Number.POSITIVE_INFINITY)).toThrow(exception.Fault);

        for ( const pending of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY] ) expect(() => func.lane(1, { pending })).toThrow(exception.Fault);

        const made = func.lane(1, { pending: 0 });
        const held = Promise.withResolvers<void>();
        const first = made.run(() => held.promise);

        try {

            await expect(made.run(async () => 1)).rejects.toMatchObject({ reason: "lane.full" });

        } finally {

            held.resolve();
            await first;

        }

        expect(await made.run(async () => 2)).toBe(2);

    });
});

it("retry never invokes a pre-aborted operation", async () => {

    let calls = 0;

    await expect(func.retry(async () => { calls += 1; return 1; }, { signal: AbortSignal.abort("left") })).rejects.toMatchObject({ reason: "retry.aborted" });
    expect(calls).toBe(0);

});

it("single publishes ownership before a synchronous subscriber can reenter", async () => {

    let calls = 0;
    let joined: Promise<number> | undefined;
    const work = func.single(async () => {

        calls += 1;

        if ( calls === 1 ) joined = work();

        return 7;

    });
    const first = work();

    expect(calls).toBe(1);
    expect(joined).toBe(first);
    expect(await first).toBe(7);

});
