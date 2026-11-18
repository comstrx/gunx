import { expect, test as it } from "bun:test";
import type * as device from "engine/device";
import * as geo from "engine/geo";

it("a canceled position request never acquires the provider", async () => {

    let calls = 0;
    const controller = new AbortController();
    const unit: Pick<device.Device, "position" | "follow"> = {
        position: async () => { calls += 1; return undefined; },
        follow: () => { calls += 1; return () => undefined; },
    };
    const pending = geo.locate(unit, { signal: controller.signal });

    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: "geo.aborted" });
    await Promise.resolve();
    expect(calls).toBe(0);

});

it("pre-aborted following does not acquire or emit from a synchronous provider", () => {

    let calls = 0;
    const stop = geo.follow({ follow: () => { calls += 1; return () => undefined; } }, { signal: AbortSignal.abort() }, () => undefined);

    stop();
    expect(calls).toBe(0);

});

it("position settlement rejects cleanup failure instead of stranding the promise", async () => {

    const failure = new Error("release");
    let emit: ((position: device.Position) => void) | undefined;
    const found: device.Position = { lat: 0, lng: 0, accuracy: 1, at: 0 };
    const pending = geo.locate({
        position: async () => undefined,
        follow: (_, listener) => { emit = listener; return () => { throw failure; }; },
    }, { within: 25 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = pending.then(() => "resolved", cause => cause);
    let thrown: unknown;
    try { emit?.(found); } catch (cause) { thrown = cause; }
    expect(thrown).toBeUndefined();
    expect(await Promise.race([result, new Promise(resolve => setTimeout(() => resolve("hung"), 50))])).toBe(failure);

});

it("synchronous provider settlement also owns its acquired cleanup", async () => {

    const failure = new Error("sync release");
    await expect(geo.locate({
        position: async () => undefined,
        follow: (_, listener) => {
            listener({ lat: 0, lng: 0, accuracy: 1, at: 0 });
            return () => { throw failure; };
        },
    })).rejects.toBe(failure);

});

it("near cannot discard a point accepted by distance at a microscopic radius", () => {

    const from = { lat: 30, lng: 31 };
    const point = { lat: 30.000000000125905, lng: 31 };
    const radius = 0.000014;

    expect(geo.distance(from, point)).toBeLessThanOrEqual(radius);
    expect(geo.near(from, [point], radius)).toHaveLength(1);

});
