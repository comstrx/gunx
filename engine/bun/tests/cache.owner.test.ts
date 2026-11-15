import { expect, test as it } from "bun:test";
import * as cache from "engine/cache";
import * as crypto from "engine/crypto";

it("failed driver subscription rolls back the local listener", async () => {

    let delivered = 0;
    const broken = new Error("subscribe failed");
    const storage = cache.driver({
        get: () => null,
        set: () => undefined,
        delete: () => undefined,
        keys: () => [],
        watch: () => { throw broken; },
    });

    expect(() => storage.watch("key", () => { delivered += 1; })).toThrow(broken);
    await storage.set("key", "new");
    expect(delivered).toBe(0);

});

it("driver lock keeps its provider receiver", async () => {

    const provider: cache.Driver = {
        get: () => null,
        set: () => undefined,
        delete: () => undefined,
        keys: () => [],
        lock: async function ( _, work ) {

            expect(this).toBe(provider);

            return work();

        },
    };
    const storage = cache.driver(provider);

    expect(await storage.lock?.("key", async () => 17)).toBe(17);

});

it("unsubscription releases the provider exactly once", () => {

    let stops = 0;
    const storage = cache.driver({
        get: () => null,
        set: () => undefined,
        delete: () => undefined,
        keys: () => [],
        watch: () => () => { stops += 1; },
    });
    const stop = storage.watch("key", () => undefined);

    stop();
    stop();
    expect(stops).toBe(1);

});


it("committed writes survive synchronous and asynchronous observer failures, which flush reports once", async () => {

    const inner = cache.memory();
    const storage = cache.namespaced(cache.lazy(() => inner), "space");
    const seen: string[] = [];
    const first = new Error("observer failed");
    const stop = storage.watch("key", () => { throw first; });

    storage.watch("key", async ( value ) => { await Promise.resolve(); seen.push(value ?? ""); });

    await storage.set("key", "value");
    await expect(storage.flush()).rejects.toBe(first);
    expect(await storage.get("key")).toBe("value");
    expect(seen).toEqual(["value"]);
    await storage.flush();
    stop();

    const failure = new Error("async observer failed");
    const unsubscribe = storage.watch("key", async () => { throw failure; });

    await storage.delete("key");
    await expect(storage.flush()).rejects.toBe(failure);
    expect(await storage.get("key")).toBeNull();
    unsubscribe();
    await storage.flush();

});

it("guard failures and rejected box listeners are observed without an unhandled branch", async () => {

    const inner = cache.memory();
    const box = cache.open({ storage: inner, sign: "watch-failure-test" });
    const source = crypto.engine.get();
    const failure = new Error("injected import failure");
    const subtle = new Proxy(source.subtle, {
        get ( target, key ) {

            if ( key === "importKey" ) return async () => { throw failure; };

            const value: unknown = Reflect.get(target, key, target);

            return typeof value === "function" ? value.bind(target) : value;

        },
    });
    const restore = crypto.engine.use({ ...source, subtle });
    const stop = box.watch("key", () => undefined);

    try {

        await inner.set("key", "dGVzdA.signature");
        await expect(box.flush()).rejects.toBe(failure);
        await box.flush();

    } finally {

        stop();
        restore();

    }

    const plain = cache.open({ storage: cache.memory() });
    const seen: number[] = [];

    plain.watch<number>("key", async ( value ) => {

        seen.push(value ?? 0);

        if ( value === 1 ) throw failure;

    });

    await plain.set("key", 1);
    await plain.set("key", 2);
    await expect(plain.flush()).rejects.toBe(failure);
    expect(seen).toEqual([1, 2]);
    await plain.flush();

});

it("bulk storage work is bounded, preserves key order and drains active writes before rejection", async () => {

    let active = 0;
    let peak = 0;
    let writes = 0;
    let complete = 0;
    const keys = Array.from({ length: 100 }, ( _, index ) => `key${index}`);
    const storage = cache.driver({
        get: async ( key ) => {

            peak = Math.max(peak, ++active);
            await new Promise(( resolve ) => setTimeout(resolve, key === keys[0] ? 5 : 0));
            active -= 1;

            return JSON.stringify({ v: key });

        },
        set: () => undefined,
        delete: async ( key ) => {

            writes += 1;

            if ( key === keys[0] ) throw new Error("remove failed");

            await new Promise(( resolve ) => setTimeout(resolve, 5));
            complete += 1;

        },
        keys: () => keys,
    });
    const box = cache.open({ storage });

    expect(Object.keys(await box.all())).toEqual(keys);
    expect(peak).toBe(4);
    await expect(box.clear()).rejects.toThrow("remove failed");
    expect(writes).toBeLessThanOrEqual(4);
    expect(complete).toBe(writes - 1);

});


it("cache bindings restore both the preferred kind and the provider without reviving disposed scopes", async () => {

    const previous = cache.storage();
    const firstStorage = cache.memory();
    const secondStorage = cache.memory();
    const first = cache.use("scoped-storage", firstStorage);
    const second = cache.use("scoped-storage", secondStorage);

    expect(cache.storage()).toBe(secondStorage);
    first();
    expect(cache.storage()).toBe(secondStorage);
    second();
    second();
    expect(cache.storage()).toBe(previous);
    expect(cache.storages.has("scoped-storage")).toBe(false);

});


it("synchronous plain-envelope inspection shares box decoding and never accepts expired or malformed data", async () => {

    const raw = cache.memory();
    const box = cache.open({ storage: raw });

    await box.set("appearance", { scheme: "dark" });
    expect(cache.peek(await raw.get("appearance"))).toEqual(await box.get("appearance"));
    expect(cache.peek('{"v":"old","e":0}')).toBeUndefined();
    expect(cache.peek('{"v":"bad","e":"forever"}')).toBeUndefined();
    expect(cache.peek('{"v":"bad","e":1e999}')).toBeUndefined();
    expect(cache.peek(null)).toBeUndefined();
    expect(cache.peek("not json")).toBeUndefined();

});
