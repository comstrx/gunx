import { expect, test as it, jest } from "bun:test";
import * as log from "engine/log";

const entry: log.Entry = { at: 0, level: "info", name: "proof", message: "item", facts: {} };

it("batch sending publishes its flight before a sender can reenter", async () => {

    const held = Promise.withResolvers<void>();
    let calls = 0;
    let active = 0;
    let peak = 0;
    const sink = log.batchSink(async () => {

        calls += 1;
        active += 1;
        peak = Math.max(peak, active);

        if ( calls === 1 ) sink(entry);

        await held.promise;
        active -= 1;

    }, { size: 1 });
    sink(entry);
    await Promise.resolve();
    expect(peak).toBe(1);
    held.resolve();
    await sink.flush();
    expect(calls).toBe(2);

});

it("a destroyed batch drops queued entries and owns no timer", async () => {

    jest.useFakeTimers();
    try {

        let calls = 0;
        const sink = log.batchSink(() => { calls += 1; }, { wait: 50 });
        sink(entry);
        sink.destroy();
        sink.destroy();
        await sink.flush();
        jest.advanceTimersByTime(1000);
        expect([calls, sink.size(), jest.getTimerCount()]).toEqual([0, 0, 0]);
        expect(() => sink(entry)).toThrow();

    } finally {

        jest.useRealTimers();

    }

});

it("a late rejected send cannot resurrect a destroyed batch", async () => {

    jest.useFakeTimers();
    try {

        const held = Promise.withResolvers<void>();
        let calls = 0;
        let failures = 0;
        const sink = log.batchSink(() => { calls += 1; return held.promise; }, { size: 1, onFail: () => { failures += 1; } });
        sink(entry);
        await Promise.resolve();
        sink.destroy();
        held.reject(new Error("offline"));
        await sink.flush();
        await Promise.resolve();
        expect([calls, failures, sink.size(), jest.getTimerCount()]).toEqual([1, 0, 0, 0]);

    } finally {

        jest.useRealTimers();

    }

});
