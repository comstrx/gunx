import { describe, expect, test as it, jest } from "bun:test";
import * as cache from "engine/cache";
import * as crypto from "engine/crypto";
import * as error from "engine/error";

type Fired = { key: string | null; newValue: string | null; storageArea?: unknown };
type Shelf = cache.WebStorage & { data: Map<string, string> };

const origin = 1_700_000_000_000;
const secret = "s".repeat(32);

function pass ( ms: number ): void {

    if ( ms > 0 ) jest.advanceTimersByTime(ms);

}
function shape ( failure: unknown ): unknown {

    if ( error.isFault(failure) ) return [failure.code, failure.reason];

    return failure instanceof Error ? `${failure.name}: ${failure.message}` : failure;

}
function shelf ( limit = Number.POSITIVE_INFINITY, refusal = "QuotaExceededError" ): Shelf {

    const data = new Map<string, string>();

    return {
        data,
        getItem: ( key ) => data.get(key) ?? null,
        setItem: ( key, value ) => {

            if ( value.length > limit ) throw Object.assign(new Error("refused"), { name: refusal });

            data.set(key, value);

        },
        removeItem: ( key ) => { data.delete(key); },
        key: ( index ) => [...data.keys()][index] ?? null,
        get length () { return data.size; },
    };

}
function page (): cache.CookieDocument & { lines: string[] } {

    const held = new Map<string, string>();
    const lines: string[] = [];

    return {
        lines,
        get cookie () { return [...held].map(( [name, value] ) => `${name}=${value}`).join("; "); },
        set cookie ( line: string ) {

            const pair = line.split(";")[0] ?? "";
            const at = pair.indexOf("=");

            lines.push(line);

            if ( line.includes("Max-Age=0") ) held.delete(pair.slice(0, at));
            else held.set(pair.slice(0, at), pair.slice(at + 1));

        },
    };

}
async function caught ( work: () => unknown ): Promise<unknown> {

    try {

        await work();

    } catch ( failure ) {

        return failure;

    }

    return undefined;

}
async function settle (): Promise<void> {

    for ( let round = 0; round < 20; round += 1 ) await Promise.resolve();

}
async function reached ( done: () => boolean ): Promise<void> {

    for ( let round = 0; round < 500 && !done(); round += 1 ) await new Promise(( resolve ) => setTimeout(resolve, 1));

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
function tabs (): { host: NonNullable<Parameters<typeof cache.web>[1]>; fire: ( event: Fired ) => void; count: () => number } {

    const handlers = new Set<( event: Fired ) => void>();

    return {
        host: {
            addEventListener: ( name, handler ) => {

                if ( name === "storage" ) handlers.add(handler as ( event: Fired ) => void);

            },
            removeEventListener: ( name, handler ) => {

                if ( name === "storage" ) handlers.delete(handler as ( event: Fired ) => void);

            },
        },
        fire: ( event ) => {

            for ( const handler of [...handlers] ) handler(event);

        },
        count: () => handlers.size,
    };

}
function thrown ( work: () => unknown ): unknown {

    try {

        return work();

    } catch ( failure ) {

        return shape(failure);

    }

}

describe("cache", () => {

    it("lru evicts the oldest and refreshes on read", () => {

        const kept = cache.lru<string, number>(2);

        kept.set("a", 1);
        kept.set("b", 2);
        expect(kept.get("a")).toBe(1);
        kept.set("c", 3);
        expect(kept.has("b")).toBe(false);
        expect(kept.keys()).toEqual(["a", "c"]);
        expect(kept.size).toBe(2);
        expect(kept.delete("a") && !kept.delete("zz")).toBe(true);
        kept.clear();
        expect(kept.size).toBe(0);
        expect(kept.get("x")).toBeUndefined();

    });
    it("expiring entries vanish and prune", async () => {

        const store = cache.expiring<number>(20, 5);

        store.set("a", 1);
        store.set("b", 2, 1000);
        expect(store.get("a")).toBe(1);
        store.set("c", 3);
        expect(store.size).toBe(3);
        await new Promise(( resolve ) => setTimeout(resolve, 30));
        expect(store.get("a")).toBeUndefined();
        expect(store.has("b")).toBe(true);
        store.set("d", 4, 1);
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        expect(store.prune()).toBe(2);
        store.clear();
        expect(store.size).toBe(0);

    });
    it("remember dedupes concurrent loads and swr serves stale while refreshing", async () => {

        let loads = 0;
        const memo = cache.remember<number>(1000);
        const load = async (): Promise<number> => { loads += 1; await new Promise(( resolve ) => setTimeout(resolve, 5)); return loads; };
        const [a, b] = await Promise.all([memo.get("k", load), memo.get("k", load)]);

        expect(a).toBe(1);
        expect(b).toBe(1);
        expect(await memo.get("k", load)).toBe(1);
        expect(memo.peek("k")).toBe(1);
        memo.forget("k");
        expect(await memo.get("k", load)).toBe(2);
        memo.clear();
        expect(memo.peek("k")).toBeUndefined();

        const once = cache.dedupe();
        let runs = 0;
        const work = async (): Promise<number> => { runs += 1; await new Promise(( resolve ) => setTimeout(resolve, 2)); return runs; };

        await Promise.all([once("x", work), once("x", work)]);
        expect(runs).toBe(1);
        await once("x", work);
        expect(runs).toBe(2);

        const fresh = cache.swr<number>(20, 200);
        let served = 0;
        const loader = async (): Promise<number> => { served += 1; return served; };

        expect(await fresh.get("k", loader)).toBe(1);
        expect(fresh.state("k")).toBe("fresh");
        await new Promise(( resolve ) => setTimeout(resolve, 30));
        expect(fresh.state("k")).toBe("stale");
        expect(await fresh.get("k", loader)).toBe(1);
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        expect(await fresh.get("k", loader)).toBe(2);
        fresh.forget("k");
        expect(fresh.state("k")).toBe("missing");

    });
    it("tags invalidate groups", () => {

        const store = cache.tagged<string>(1000);

        store.set("u:1", "ann", ["users", "u:1"]);
        store.set("u:2", "bob", ["users"]);
        store.set("p:1", "post", ["posts"]);
        expect(store.get("u:1")).toBe("ann");
        expect(store.invalidate("users")).toBe(2);
        expect(store.get("u:1")).toBeUndefined();
        expect(store.get("p:1")).toBe("post");
        store.set("p:1", "again", ["posts", "x"]);
        store.delete("p:1");
        expect(store.invalidate("x")).toBe(0);
        store.clear();
        expect(store.get("p:1")).toBeUndefined();

    });
    it("limiter counts a window and raises a fault", () => {

        const limit = cache.limiter(2, 1000);

        expect(limit.take("ip")).toEqual({ allowed: true, remaining: 1, retryAfter: 0, limit: 2 });
        expect(limit.take("ip").allowed).toBe(true);

        const refused = limit.take("ip");

        expect(refused.allowed).toBe(false);
        expect(refused.remaining).toBe(0);
        expect(refused.retryAfter).toBe(1);
        expect(limit.peek("ip").remaining).toBe(0);
        expect(() => limit.assert("ip")).toThrow(error.Fault);
        limit.reset("ip");
        expect(limit.assert("ip", 2).remaining).toBe(0);
        expect(limit.take("other", 3).allowed).toBe(false);

    });
    it("cookies parse, serialize, jar and sign with a stamp", async () => {

        expect(cache.parseCookies('a=1; b="two"; c=%D8%B9; bad; a=9; __proto__=x')).toEqual({ a: "1", b: "two", c: "ع" });
        expect(cache.parseCookies(undefined)).toEqual({});
        expect(cache.serializeCookie("s", "v w", { maxAge: 60, httpOnly: true })).toBe("s=v%20w; Max-Age=60; Path=/; HttpOnly; SameSite=Lax");
        expect(cache.serializeCookie("s", "v", { sameSite: "none" })).toBe("s=v; Path=/; Secure; SameSite=None");
        expect(cache.serializeCookie("s", "v", { partitioned: true, domain: "a.io", path: "/x" })).toBe("s=v; Path=/x; Domain=a.io; Secure; SameSite=Lax; Partitioned");
        expect(() => cache.serializeCookie("bad name", "v")).toThrow(RangeError);

        const document = { cookie: "a=1" };
        const jar = cache.documentCookies(document);

        jar.set("b", "2");
        expect(document.cookie.startsWith("b=2")).toBe(true);
        expect(jar.get("b")).toBe("2");
        jar.remove("b");
        expect(document.cookie).toContain("Max-Age=0");

        const header = cache.headerCookies("a=1; b=2");

        header.set("c", "3", { httpOnly: true });
        header.remove("a");
        expect(header.get("c")).toBe("3");
        expect(header.get("a")).toBeUndefined();
        expect(header.names()).toEqual(["b", "c"]);
        expect(header.outgoing()).toHaveLength(2);

        const signed = await cache.signCookie("user:1", "secret", 1_000_000);

        expect(await cache.unsignCookie(signed, "secret", 60, 1_030_000)).toBe("user:1");
        expect(await cache.unsignCookie(signed, "secret", 10, 1_030_000)).toBeUndefined();
        expect(await cache.unsignCookie(signed, "other")).toBeUndefined();
        expect(await cache.unsignCookie(`${signed}x`, "secret")).toBeUndefined();
        expect(await cache.unsignCookie(undefined, "secret")).toBeUndefined();

    });
    it("storages share one port across memory, web, cookies, drivers, lazy, namespaced and typed, and watch changes", async () => {

        const memory = cache.memory();
        const seen: (string | null)[] = [];
        const stop = memory.watch("a", ( value ) => { seen.push(value); });

        await memory.set("a", "1");
        expect(await memory.get("a")).toBe("1");
        expect(await memory.get("b")).toBeNull();
        expect(await memory.keys()).toEqual(["a"]);
        await memory.delete("a");
        expect(await memory.keys()).toEqual([]);
        expect(seen).toEqual(["1", null]);
        stop();

        const data = new Map<string, string>();
        const web = cache.web({ getItem: ( key ) => data.get(key) ?? null, setItem: ( key, value ) => { data.set(key, value); }, removeItem: ( key ) => { data.delete(key); }, key: ( index ) => [...data.keys()][index] ?? null, get length () { return data.size; } }, {});

        await web.set("x", "y");
        expect(await web.get("x")).toBe("y");
        expect(await web.keys()).toEqual(["x"]);

        const jar = cache.cookies(cache.headerCookies("k=v"));

        expect(await jar.get("k")).toBe("v");
        await jar.set("n", "1");
        expect((await jar.keys()).sort()).toEqual(["k", "n"]);

        let made = 0;
        const lazy = cache.lazy(() => { made += 1; return cache.memory(); });

        expect(made).toBe(0);
        await lazy.set("k", "v");
        expect(await lazy.get("k")).toBe("v");
        expect(made).toBe(1);

        const spaced = cache.namespaced(memory, "app");
        const spacedSeen: (string | null)[] = [];
        const stopSpaced = spaced.watch("one", ( value ) => { spacedSeen.push(value); });

        await spaced.set("one", "1");
        await memory.set("other", "2");
        expect(await memory.keys()).toEqual(["app.one", "other"]);
        expect(await spaced.keys()).toEqual(["one"]);
        expect(spacedSeen).toEqual(["1"]);
        stopSpaced();

        const typed = cache.typed<{ n: number }>(memory);

        await typed.write("t", { n: 1 });
        expect(await typed.read("t")).toEqual({ n: 1 });
        expect(await typed.read("nope")).toBeUndefined();
        await typed.remove("t");
        expect(await typed.read("t")).toBeUndefined();
        expect(cache.driver(memory)).toBe(memory);
        expect(cache.storages.kinds()).toEqual(expect.arrayContaining(["local", "memory", "session"]));
        expect(cache.storages.preferred()).toBe("memory");

        try {

            cache.use("native", { get: ( key ) => data.get(key) ?? null, set: ( key, value ) => { data.set(key, value); }, delete: ( key ) => { data.delete(key); }, keys: () => [...data.keys()] });
            expect(cache.storages.preferred()).toBe("native");
            expect(await cache.storage().get("x")).toBe("y");
            expect(await cache.storage("memory").get("x")).toBeNull();

        } finally {

            cache.storages.prefer("memory");

        }

    });
    it("boxes keep json with ttl, seal and sign, remember, count and watch", async () => {

        const box = cache.open({ kind: "memory", prefix: "t", ttl: 60 });
        const seen: unknown[] = [];
        const stop = box.watch<number>("n", ( value ) => { seen.push(value); });

        await box.set("a", { x: 1 });
        expect(await box.get("a")).toEqual({ x: 1 });
        expect(await box.has("a") && !(await box.has("b"))).toBe(true);
        expect(await box.remember("b", () => 2)).toBe(2);
        expect(await box.remember("b", () => 3)).toBe(2);
        expect(await box.increment("n")).toBe(1);
        expect(await box.increment("n", 4)).toBe(5);
        expect(await box.touch("n", { ttl: 1 }) && !(await box.touch("zz"))).toBe(true);
        expect(await box.all()).toEqual({ a: { x: 1 }, b: 2, n: 5 });
        expect((await box.keys()).sort()).toEqual(["a", "b", "n"]);
        await box.set("gone", 1, { ttl: -1 });
        expect(await box.get("gone")).toBeUndefined();
        await box.remove("a");
        await box.clear();
        expect(await box.keys()).toEqual([]);
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(seen).toEqual([1, 5, 5, undefined]);
        stop();

        const sealed = cache.open({ kind: "memory", prefix: "s", secret: "k".repeat(16), sign: "sig" });

        await sealed.set("token", "abc");
        expect(await sealed.storage.get("token")).not.toContain("abc");
        expect(await sealed.get("token")).toBe("abc");
        await sealed.storage.set("token", "tampered");
        expect(await sealed.get("token")).toBeUndefined();
        expect(cache.place({ kind: "memory" })).toBeDefined();

        const early = cache.open({ kind: "late", prefix: "e" });
        const data = new Map<string, string>();

        try {

            cache.use("late", { get: ( key ) => data.get(key) ?? null, set: ( key, value ) => { data.set(key, value); }, delete: ( key ) => { data.delete(key); }, keys: () => [...data.keys()] });
            await early.set("k", 1);
            expect([...data.keys()]).toEqual(["e.k"]);

        } finally {

            cache.storages.prefer("memory");

        }

    });
    it("the json codec round trips any value and refuses broken text", () => {

        const codec = cache.jsonCodec<{ a: number[] }>();

        expect(codec.decode(codec.encode({ a: [1, 2] }))).toEqual({ a: [1, 2] });
        expect(codec.decode("{nope")).toBeUndefined();

    });
    it("lru keeps recency through get and set, leaves it on peek and bounds every limit", () => {

        const kept = cache.lru<string, number | undefined>(3);

        kept.set("a", 1);
        kept.set("b", 2);
        kept.set("c", 3);
        expect([kept.peek("a"), kept.keys()]).toEqual([1, ["a", "b", "c"]]);
        kept.set("a", 10);
        expect(kept.keys()).toEqual(["b", "c", "a"]);
        expect([kept.get("b"), kept.keys()]).toEqual([2, ["c", "a", "b"]]);
        kept.set("d", 4);
        expect([kept.keys(), kept.has("c"), kept.peek("c"), kept.get("c"), kept.size]).toEqual([["a", "b", "d"], false, undefined, undefined, 3]);
        expect([kept.delete("b"), kept.keys()]).toEqual([true, ["a", "d"]]);
        expect([kept.delete("a"), kept.delete("d"), kept.delete("d"), kept.keys(), kept.size]).toEqual([true, true, false, [], 0]);
        kept.set("u", undefined);
        expect([kept.has("u"), kept.get("u"), kept.size]).toEqual([true, undefined, 1]);
        kept.clear();
        kept.set("z", 1);
        kept.set("y", 2);
        expect([kept.keys(), kept.size]).toEqual([["z", "y"], 2]);

        for ( const [limit, cap] of [[0, 1], [-4, 1], [Number.NaN, 256], [2.9, 2], [undefined, 256], [Number.POSITIVE_INFINITY, 300]] as const ) {

            const sized = cache.lru<number, number>(limit);

            for ( let index = 0; index < 300; index += 1 ) sized.set(index, index);

            expect([limit, sized.size, sized.keys()[0]]).toEqual([limit, cap, 300 - cap]);

        }

    });
    it("expiring entries live to the millisecond, fall back on a bad life and stay bounded", async () => {

        await faked(() => {

            const store = cache.expiring<number>(100, 3);

            store.set("a", 1);
            store.set("zero", 2, 0);
            store.set("neg", 3, -5);
            expect([store.size, store.get("zero"), store.has("neg"), store.size]).toEqual([3, undefined, false, 1]);
            store.set("nan", 4, Number.NaN);
            store.set("long", 5, Number.POSITIVE_INFINITY);
            pass(99);
            expect([store.get("a"), store.get("nan")]).toEqual([1, 4]);
            pass(1);
            expect([store.get("a"), store.has("nan"), store.get("long"), store.size]).toEqual([undefined, false, 5, 1]);
            jest.setSystemTime(origin + 10 ** 12);
            expect(store.get("long")).toBe(5);

            const small = cache.expiring<number>(1000, 2);

            small.set("a", 1);
            small.set("b", 2);
            small.set("a", 3);
            small.set("c", 4);
            expect([small.get("a"), small.get("b"), small.get("c"), small.size]).toEqual([3, undefined, 4, 2]);
            small.set("d", 5, 10);
            expect([small.has("a"), small.size]).toEqual([false, 2]);
            pass(10);
            expect([small.size, small.prune(), small.size, small.prune()]).toEqual([2, 1, 1, 0]);
            expect([small.delete("c"), small.delete("c"), small.size]).toEqual([true, false, 0]);
            small.set("e", 6);
            small.clear();
            expect([small.size, small.get("e")]).toEqual([0, undefined]);

            const loose = cache.expiring<number>(Number.NaN, Number.NaN);

            for ( let index = 0; index < 1100; index += 1 ) loose.set(`k${index}`, index);

            expect([loose.size, loose.has("k75"), loose.get("k76")]).toEqual([1024, false, 76]);
            pass(59_999);
            expect(loose.get("k1099")).toBe(1099);
            pass(1);
            expect([loose.get("k1099"), loose.prune(), loose.size]).toEqual([undefined, 1023, 0]);

        });

    });
    it("remember loads once per key, keeps undefined, never keeps a failure and forgets in flight", async () => {

        await faked(async () => {

            const memo = cache.remember<number | undefined>(100, 2);
            const gate = Promise.withResolvers<number>();
            let loads = 0;
            const load = (): Promise<number> => {

                loads += 1;

                return gate.promise;

            };
            const first = memo.get("a", load);

            expect(memo.get("a", load)).toBe(first);
            expect([memo.has("a"), memo.peek("a"), loads]).toEqual([false, undefined, 1]);
            gate.resolve(7);
            expect([await first, memo.has("a"), memo.peek("a"), await memo.get("a", load), loads]).toEqual([7, true, 7, 7, 1]);
            pass(99);
            expect(memo.has("a")).toBe(true);
            pass(1);
            expect([memo.has("a"), memo.peek("a")]).toEqual([false, undefined]);
            expect([await memo.get("b", async () => 1, 10), memo.peek("b")]).toEqual([1, 1]);
            pass(10);
            expect(memo.has("b")).toBe(false);
            expect([await memo.get("u", async () => undefined), memo.has("u"), await memo.get("u", async () => 5)]).toEqual([undefined, true, undefined]);
            expect(shape(await caught(() => memo.get("f", async () => { throw new Error("down"); })))).toBe("Error: down");
            expect(shape(await caught(() => memo.get("f", () => { throw new Error("sync"); })))).toBe("Error: sync");
            expect([memo.has("f"), await memo.get("f", async () => 3)]).toEqual([false, 3]);

            const slow = Promise.withResolvers<number>();
            const flying = memo.get("g", () => slow.promise);

            memo.forget("g");

            const again = memo.get("g", async () => 2);

            slow.resolve(9);
            expect([await flying, await again, memo.peek("g")]).toEqual([9, 2, 2]);

            const late = Promise.withResolvers<number>();
            const pending = memo.get("h", () => late.promise);

            memo.clear();
            late.resolve(4);
            expect([await pending, memo.has("h"), memo.has("g")]).toEqual([4, false, false]);

            const small = cache.remember<number>(1000, 2);

            await small.get("a", async () => 1);
            await small.get("b", async () => 2);
            await small.get("c", async () => 3);
            expect([small.has("a"), small.peek("b"), small.peek("c")]).toEqual([false, 2, 3]);
            small.forget("b");
            expect([small.has("b"), await small.get("b", async () => 20)]).toEqual([false, 20]);

        });

    });
    it("swr serves fresh, then stale while one refresh flies, then waits once too old", async () => {

        await faked(async () => {

            const kept = cache.swr<number>(100, 300, 2);
            let version = 0;
            const load = async (): Promise<number> => {

                version += 1;

                return version;

            };

            expect([kept.state("a"), kept.peek("a")]).toEqual(["missing", undefined]);
            expect([await kept.get("a", load), kept.state("a"), kept.peek("a")]).toEqual([1, "fresh", 1]);
            pass(99);
            expect([await kept.get("a", load), version]).toEqual([1, 1]);
            pass(1);
            expect([kept.state("a"), await kept.get("a", load)]).toEqual(["stale", 1]);
            await settle();
            expect([version, kept.peek("a"), kept.state("a")]).toEqual([2, 2, "fresh"]);
            pass(299);
            expect(kept.state("a")).toBe("stale");
            pass(1);
            expect([kept.state("a"), kept.peek("a"), await kept.get("a", load), kept.state("a")]).toEqual(["missing", 2, 3, "fresh"]);
            pass(150);
            expect(await kept.get("a", async () => { throw new Error("down"); })).toBe(3);
            await settle();
            expect([kept.peek("a"), kept.state("a")]).toEqual([3, "stale"]);

            const gate = Promise.withResolvers<number>();
            let calls = 0;
            const slow = (): Promise<number> => {

                calls += 1;

                return gate.promise;

            };

            expect([await kept.get("a", slow), await kept.get("a", slow), calls]).toEqual([3, 3, 1]);
            gate.resolve(50);
            await settle();
            expect([kept.peek("a"), kept.state("a")]).toEqual([50, "fresh"]);
            expect(shape(await caught(() => kept.get("none", async () => { throw new Error("down"); })))).toBe("Error: down");
            expect(shape(await caught(() => kept.get("none", () => { throw new Error("sync"); })))).toBe("Error: sync");
            expect([kept.state("none"), kept.peek("none")]).toEqual(["missing", undefined]);

            const late = Promise.withResolvers<number>();
            const flying = kept.get("f", () => late.promise);

            kept.forget("f");
            late.resolve(8);
            expect([await flying, kept.peek("f"), kept.state("f")]).toEqual([8, undefined, "missing"]);
            await kept.get("b", load);
            await kept.get("c", load);
            expect([kept.peek("a"), kept.state("a"), kept.peek("b") !== undefined, kept.peek("c") !== undefined]).toEqual([undefined, "missing", true, true]);
            jest.setSystemTime(origin - 60_000);
            expect([kept.state("c"), await kept.get("c", async () => 77)]).toEqual(["stale", version]);
            await settle();
            expect(kept.peek("c")).toBe(77);
            kept.clear();
            expect([kept.peek("b"), kept.state("c")]).toEqual([undefined, "missing"]);

        });
        await faked(async () => {

            const narrow = cache.swr<number>(100, 50);
            const loose = cache.swr<number>(Number.NaN, Number.NaN, Number.NaN);

            await narrow.get("k", async () => 1);
            await loose.get("k", async () => 1);
            pass(99);
            expect(narrow.state("k")).toBe("fresh");
            pass(1);
            expect(narrow.state("k")).toBe("missing");
            pass(9899);
            expect(loose.state("k")).toBe("fresh");
            pass(1);
            expect(loose.state("k")).toBe("stale");
            pass(49_999);
            expect(loose.state("k")).toBe("stale");
            pass(1);
            expect(loose.state("k")).toBe("missing");

        });

    });
    it("tagged keys follow their tags through retagging, eviction, expiry, delete and clear", async () => {

        await faked(() => {

            const kept = cache.tagged<number>(100, 3);

            kept.set("a", 1, ["x", "x", "y"]);
            kept.set("b", 2, ["x"]);
            kept.set("c", 3, []);
            expect([kept.get("a"), kept.has("b"), kept.get("c"), kept.has("zz"), kept.get("zz")]).toEqual([1, true, 3, false, undefined]);
            kept.set("a", 10, ["z"]);
            expect([kept.invalidate("y"), kept.get("a")]).toEqual([0, 10]);
            expect([kept.invalidate("x"), kept.has("b"), kept.get("a")]).toEqual([1, false, 10]);
            expect([kept.invalidate("z"), kept.has("a"), kept.invalidate("z"), kept.invalidate("never"), kept.get("c")]).toEqual([1, false, 0, 0, 3]);
            kept.set("d", 4, ["t"]);
            kept.set("e", 5, ["t"]);
            kept.set("f", 6, ["t"]);
            kept.set("g", 7, ["t"]);
            expect([kept.has("c"), kept.has("d"), kept.invalidate("t"), kept.has("g")]).toEqual([false, false, 3, false]);
            kept.set("h", 8, ["t"], 10);
            kept.set("i", 9, ["t"]);
            pass(10);
            expect([kept.has("h"), kept.invalidate("t"), kept.has("i")]).toEqual([false, 1, false]);
            kept.set("j", 1, ["t"]);
            kept.delete("j");
            kept.delete("j");
            expect([kept.has("j"), kept.invalidate("t")]).toEqual([false, 0]);
            kept.set("k", 1, ["t", "__proto__"]);
            expect([kept.invalidate("__proto__"), kept.invalidate("t")]).toEqual([1, 0]);
            kept.set("l", 1, ["t"]);
            kept.clear();
            expect([kept.has("l"), kept.invalidate("t")]).toEqual([false, 0]);

        });

    });
    it("dedupe shares one flight per key and starts again once it lands", async () => {

        const once = cache.dedupe();
        const gate = Promise.withResolvers<number>();
        let runs = 0;
        const work = (): Promise<number> => {

            runs += 1;

            return gate.promise;

        };
        const first = once("k", work);

        expect(once("k", work)).toBe(first);

        const other = once("j", async () => "other");

        gate.resolve(1);
        expect([await first, await other, runs]).toEqual([1, "other", 1]);
        expect([await once("k", async () => 2), runs]).toEqual([2, 1]);
        expect(shape(await caught(() => once("f", async () => { throw new Error("down"); })))).toBe("Error: down");
        expect(shape(await caught(() => once("f", () => { throw new Error("sync"); })))).toBe("Error: sync");
        expect(await once("f", async () => 3)).toBe(3);

        const shared = [once("r", () => Promise.reject(new Error("both"))), once("r", async () => 1)];

        expect((await Promise.allSettled(shared)).map(( result ) => result.status)).toEqual(["rejected", "rejected"]);

    });
    it("limiter windows roll to the millisecond, weigh every cost and bound their keys", async () => {

        await faked(() => {

            const limit = cache.limiter(3, 1000);

            expect(limit.peek("a")).toEqual({ allowed: true, limit: 3, remaining: 3, retryAfter: 0 });
            expect(limit.take("a")).toEqual({ allowed: true, limit: 3, remaining: 2, retryAfter: 0 });
            expect(limit.take("a", 2)).toEqual({ allowed: true, limit: 3, remaining: 0, retryAfter: 0 });
            expect(limit.peek("a")).toEqual({ allowed: false, limit: 3, remaining: 0, retryAfter: 1 });
            pass(400);
            expect(limit.take("a")).toEqual({ allowed: false, limit: 3, remaining: 0, retryAfter: 1 });
            pass(599);
            expect(limit.take("a").allowed).toBe(false);
            pass(1);
            expect(limit.peek("a")).toEqual({ allowed: true, limit: 3, remaining: 3, retryAfter: 0 });
            expect(limit.take("a")).toEqual({ allowed: true, limit: 3, remaining: 2, retryAfter: 0 });
            expect([limit.take("c", 0), limit.take("c", -5)].map(( taken ) => [taken.allowed, taken.remaining])).toEqual([[true, 3], [true, 3]]);
            expect([limit.take("c", 2.5), limit.take("c", 0.5), limit.take("c", 0.1)].map(( taken ) => [taken.allowed, taken.remaining])).toEqual([[true, 0.5], [true, 0], [false, 0]]);
            expect(limit.take("n", Number.NaN)).toEqual({ allowed: false, limit: 3, remaining: 3, retryAfter: 1 });
            expect(limit.take("n", Number.POSITIVE_INFINITY).allowed).toBe(false);
            expect(limit.take("n", 4)).toEqual({ allowed: false, limit: 3, remaining: 3, retryAfter: 1 });
            expect(limit.peek("n")).toEqual({ allowed: true, limit: 3, remaining: 3, retryAfter: 0 });
            limit.take("a", 2);
            limit.reset("a");
            limit.reset("never");
            expect(limit.take("a", 3).allowed).toBe(true);
            limit.clear();
            expect([limit.peek("a").remaining, limit.peek("c").remaining]).toEqual([3, 3]);

            const fault = (() => {

                try {

                    limit.assert("z", 3);
                    limit.assert("z");

                } catch ( failure ) {

                    return failure;

                }

                return undefined;

            })();

            expect(error.isFault(fault) && [fault.code, fault.reason, fault.status, fault.retryAfter]).toEqual(["too_many_requests", "throttle", 429, 1]);
            expect(limit.assert("y", 2)).toEqual({ allowed: true, limit: 3, remaining: 1, retryAfter: 0 });

            const long = cache.limiter(1, 90_000);

            long.take("k");
            expect(long.take("k").retryAfter).toBe(90);
            pass(30_500);
            expect([long.take("k").retryAfter, long.peek("k").retryAfter]).toEqual([60, 60]);
            pass(59_499);
            expect(long.take("k").retryAfter).toBe(1);
            jest.setSystemTime(origin - 5000);
            expect(long.take("k")).toEqual({ allowed: true, limit: 1, remaining: 0, retryAfter: 0 });

            const few = cache.limiter(1, 1000, 2);

            few.take("a");
            few.take("b");
            expect([few.take("a").allowed, few.take("c").allowed, few.take("b").allowed, few.take("a").allowed]).toEqual([false, true, false, true]);

        });

        expect(["3", Number.NaN, undefined].map(( given ) => shape((() => { try { return cache.limiter(given as number, 1000); } catch ( failure ) { return failure; } })()))).toEqual(Array(3).fill("RangeError: not a limit"));
        expect(shape((() => { try { return cache.limiter(3, Number.NaN); } catch ( failure ) { return failure; } })())).toBe("RangeError: not a limit");
        expect([cache.limiter(0.2, 0.2).take("a").limit, cache.limiter(-9, 5).take("a").remaining, cache.limiter(2.9, 5).peek("a").limit, cache.limiter(Number.POSITIVE_INFINITY, 5).take("a", 10 ** 9).allowed]).toEqual([1, 0, 2, true]);
        expect([cache.limiter(1, 1000, Number.NaN).take("a").allowed, cache.limiter(1, 1000, 0).take("a").allowed]).toEqual([true, true]);

    });
    it("cookie lines are lenient on the way in, strict on the way out and never split by a value", () => {

        const parsed = cache.parseCookies("a=1; a=2; __proto__=x; =y; z; q=\"quoted\"; bad=%E0%A4%A; eq=a=b;  sp = v ");
        const values = ["%41", "a;b", "é", "a=b", "\"q\"", "x,y", "a b", "\\", "", "line\r\nSet-Cookie: x=1"];
        const header = values.map(( value, at ) => cache.serializeCookie(`k${at}`, value).split(";")[0]).join("; ");

        expect(parsed).toEqual({ a: "1", q: "quoted", bad: "%E0%A4%A", eq: "a=b", sp: "v" });
        expect([Object.hasOwn(parsed, "__proto__"), Object.getPrototypeOf(parsed) === Object.prototype]).toEqual([false, true]);
        expect([cache.parseCookies(null), cache.parseCookies(undefined), cache.parseCookies(""), cache.parseCookies('a="')]).toEqual([{}, {}, {}, { a: '"' }]);
        expect(Object.values(cache.parseCookies(header))).toEqual(values);
        expect(cache.serializeCookie("a", "1")).toBe("a=1; Path=/; SameSite=Lax");
        expect(cache.serializeCookie("sid", "x y", { maxAge: 60.9, expires: new Date(0), path: "/app", domain: ".example.com", secure: true, httpOnly: true, sameSite: "strict", partitioned: true })).toBe("sid=x%20y; Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/app; Domain=.example.com; Secure; HttpOnly; SameSite=Strict; Partitioned");
        expect([
            cache.serializeCookie("a", "1", { sameSite: "none" }),
            cache.serializeCookie("a", "1", { partitioned: true }),
            cache.serializeCookie("__Secure-a", "1"),
            cache.serializeCookie("__Host-a", "1"),
            cache.serializeCookie("a", "1", { maxAge: -5 }),
            cache.serializeCookie("a", "1", { domain: "" }),
        ]).toEqual([
            "a=1; Path=/; Secure; SameSite=None",
            "a=1; Path=/; Secure; SameSite=Lax; Partitioned",
            "__Secure-a=1; Path=/; Secure; SameSite=Lax",
            "__Host-a=1; Path=/; Secure; SameSite=Lax",
            "a=1; Max-Age=0; Path=/; SameSite=Lax",
            "a=1; Path=/; SameSite=Lax",
        ]);
        expect(["%41", "a;b", "é", "a=b", "\"q\"", ""].map(( value ) => cache.serializeCookie("a", value).split(";")[0])).toEqual(["a=%2541", "a=a%3Bb", "a=%C3%A9", "a=a=b", "a=%22q%22", "a="]);
        expect(cache.serializeCookie("a", "line\r\nSet-Cookie: x=1")).toBe("a=line%0D%0ASet-Cookie%3A%20x%3D1; Path=/; SameSite=Lax");
        expect([
            thrown(() => cache.serializeCookie("", "1")),
            thrown(() => cache.serializeCookie("a b", "1")),
            thrown(() => cache.serializeCookie("a=b", "1")),
            thrown(() => cache.serializeCookie("a;b", "1")),
            thrown(() => cache.serializeCookie("a", "1", { path: "x" })),
            thrown(() => cache.serializeCookie("a", "1", { path: "/a;b" })),
            thrown(() => cache.serializeCookie("a", "1", { path: "/a\nb" })),
            thrown(() => cache.serializeCookie("a", "1", { domain: "a b" })),
            thrown(() => cache.serializeCookie("a", "1", { domain: "ex.com; Secure" })),
            thrown(() => cache.serializeCookie("a", "1", { sameSite: "Lax" as cache.SameSite })),
            thrown(() => cache.serializeCookie("a", "1", { maxAge: Number.NaN })),
            thrown(() => cache.serializeCookie("a", "1", { maxAge: Number.POSITIVE_INFINITY })),
            thrown(() => cache.serializeCookie("a", "1", { expires: new Date(Number.NaN) })),
            thrown(() => cache.serializeCookie("__Host-a", "1", { domain: "example.com" })),
            thrown(() => cache.serializeCookie("__Host-a", "1", { path: "/x" })),
        ]).toEqual([
            "RangeError: not a cookie name: ",
            "RangeError: not a cookie name: a b",
            "RangeError: not a cookie name: a=b",
            "RangeError: not a cookie name: a;b",
            "RangeError: not a cookie path",
            "RangeError: not a cookie path",
            "RangeError: not a cookie path",
            "RangeError: not a cookie domain",
            "RangeError: not a cookie domain",
            "RangeError: not a cookie site",
            "RangeError: not a cookie age",
            "RangeError: not a cookie age",
            "RangeError: not a cookie expiry",
            "RangeError: not a host cookie",
            "RangeError: not a host cookie",
        ]);
        expect(cache.serializeCookie("a", "x".repeat(4094)).split(";")[0]).toHaveLength(4096);
        expect([thrown(() => cache.serializeCookie("a", "x".repeat(4095))), thrown(() => cache.serializeCookie("a", "é".repeat(700)))]).toEqual(["RangeError: cookie too large", "RangeError: cookie too large"]);

    });
    it("cookie jars read one document or one request and write only checked lines", () => {

        const doc = page();
        const jar = cache.documentCookies(doc);

        jar.set("a", "1");
        jar.set("b", "x y", { maxAge: 10 });
        expect([jar.get("a"), jar.get("b"), jar.get("zz"), jar.get("__proto__"), jar.get("constructor"), jar.names()]).toEqual(["1", "x y", undefined, undefined, undefined, ["a", "b"]]);
        jar.remove("a", { path: "/app" });
        expect([doc.lines.at(-1), jar.names(), jar.get("a")]).toEqual(["a=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/app; SameSite=Lax", ["b"], undefined]);
        expect([thrown(() => jar.set("a b", "1")), thrown(() => jar.remove("a b")), doc.lines.length]).toEqual(["RangeError: not a cookie name: a b", "RangeError: not a cookie name: a b", 3]);

        const request = cache.headerCookies("a=1; b=2");
        const empty = cache.headerCookies(null);

        request.set("c", "3", { httpOnly: true });
        request.remove("a");
        request.set("b", "9");
        expect([request.get("a"), request.get("b"), request.get("c"), request.get("zz"), request.get("__proto__"), request.names()]).toEqual([undefined, "9", "3", undefined, undefined, ["b", "c"]]);
        expect(request.outgoing()).toEqual(["c=3; Path=/; HttpOnly; SameSite=Lax", "a=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax", "b=9; Path=/; SameSite=Lax"]);
        request.outgoing().push("x=1");
        request.set("a", "back");
        expect([request.outgoing().length, request.get("a"), request.names()]).toEqual([4, "back", ["a", "b", "c"]]);
        expect([thrown(() => request.set("bad name", "1")), request.outgoing().length, request.get("bad name")]).toEqual(["RangeError: not a cookie name: bad name", 4, undefined]);
        expect([empty.names(), empty.get("a"), empty.outgoing()]).toEqual([[], undefined, []]);

    });
    it("a signed cookie carries its stamp, ages out to the millisecond and survives one minute of clock skew", async () => {

        const signed = await cache.signCookie("v|1", secret, origin);
        const forged = ( payload: string ): Promise<string> => crypto.sign(payload, secret);

        expect(signed.split(".")).toHaveLength(2);
        expect(await cache.unsignCookie(signed, secret)).toBe("v|1");
        expect([
            await cache.unsignCookie(signed, secret, 10, origin + 10_000),
            await cache.unsignCookie(signed, secret, 10, origin + 10_001),
            await cache.unsignCookie(signed, secret, 10, origin - 60_000),
            await cache.unsignCookie(signed, secret, 10, origin - 60_001),
            await cache.unsignCookie(signed, secret, 0, origin),
            await cache.unsignCookie(signed, secret, 0, origin + 1),
            await cache.unsignCookie(signed, secret, Number.NaN, origin),
        ]).toEqual(["v|1", undefined, "v|1", undefined, "v|1", undefined, undefined]);
        expect([
            await cache.unsignCookie(signed, "t".repeat(32)),
            await cache.unsignCookie(`${signed}x`, secret),
            await cache.unsignCookie(signed.replace(".", ""), secret),
            await cache.unsignCookie(undefined, secret),
            await cache.unsignCookie("", secret),
            await cache.unsignCookie("a.b", secret),
        ]).toEqual(Array(6).fill(undefined));
        expect([
            await cache.unsignCookie(await forged("v|abc"), secret),
            await cache.unsignCookie(await forged("v"), secret),
            await cache.unsignCookie(await forged("v|"), secret),
            await cache.unsignCookie(await forged("v|-5"), secret),
            await cache.unsignCookie(await forged("v|1e3"), secret),
            await cache.unsignCookie(await forged("v|12345678901234567"), secret),
            await cache.unsignCookie(await forged("|5"), secret),
            await cache.unsignCookie(await cache.signCookie("", secret, 5.9), secret, 0, 5),
        ]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, "", ""]);
        expect(await cache.unsignCookie(await cache.signCookie("now", secret), secret, 60)).toBe("now");

    });
    it("storage watchers hear every change in order, outlive a throwing peer and stop on demand", async () => {

        const memory = cache.memory();
        const seen: string[] = [];
        const stopFirst = memory.watch("k", ( value ) => { seen.push(`a:${value}`); });
        const stopBroken = memory.watch("k", () => { throw new Error("listener"); });
        const stopLast = memory.watch("k", ( value ) => { seen.push(`b:${value}`); });
        const stopOther = memory.watch("j", ( value ) => { seen.push(`j:${value}`); });

        expect(shape(await caught(() => memory.set("k", "1")))).toBe("Error: listener");
        expect([await memory.get("k"), seen]).toEqual(["1", ["a:1", "b:1"]]);
        stopBroken();
        stopBroken();
        await memory.set("k", "2");
        await memory.delete("k");
        stopFirst();
        await memory.set("k", "3");
        stopLast();
        stopLast();
        await memory.set("k", "4");
        await memory.set("j", "5");
        stopOther();
        await memory.set("j", "6");
        expect(seen).toEqual(["a:1", "b:1", "a:2", "b:2", "a:null", "b:null", "b:3", "j:5"]);
        expect([await memory.get("k"), await memory.get("j"), await memory.keys()]).toEqual(["4", "6", ["k", "j"]]);

        const late: string[] = [];
        const stopSelf = memory.watch("s", ( value ) => {

            late.push(`first:${value}`);
            stopSelf();
            memory.watch("s", ( next ) => { late.push(`added:${next}`); });

        });

        await memory.set("s", "1");
        await memory.set("s", "2");
        expect(late).toEqual(["first:1", "added:2"]);

    });
    it("web storage turns a full or refusing host into faults and hears other tabs", async () => {

        const stage = tabs();
        const local = shelf(5);
        const web = cache.web(local, stage.host);
        const seen: (string | null)[] = [];
        const full = await caught(() => web.set("k", "123456"));

        await web.set("k", "12345");
        expect([shape(full), error.isFault(full) && full.status, full instanceof Error && (full.cause as Error).name]).toEqual([["too_large", "storage.full"], 413, "QuotaExceededError"]);
        expect(shape(await caught(() => cache.web(shelf(1, "NS_ERROR_DOM_QUOTA_REACHED"), {}).set("k", "12")))).toEqual(["too_large", "storage.full"]);
        expect(shape(await caught(() => cache.web(shelf(1, "SecurityError"), {}).set("k", "12")))).toEqual(["unavailable", "storage.refused"]);
        expect([await web.get("k"), await web.get("none"), await web.keys(), local.data.get("k")]).toEqual(["12345", null, ["k"], "12345"]);

        const stop = web.watch("k", ( value ) => { seen.push(value); });

        expect(stage.count()).toBe(1);
        stage.fire({ key: "k", newValue: "9" });
        stage.fire({ key: "other", newValue: "8" });
        stage.fire({ key: null, newValue: null });
        stage.fire({ key: "k", newValue: "7", storageArea: local });
        stage.fire({ key: "k", newValue: "6", storageArea: shelf() });
        stage.fire({ key: null, newValue: null, storageArea: shelf() });
        stage.fire({ key: "k", newValue: null });
        await web.set("k", "1");
        expect(seen).toEqual(["9", null, "7", null, "1"]);
        stop();
        stop();
        stage.fire({ key: "k", newValue: "5" });
        await web.delete("k");
        expect([seen.length, stage.count(), await web.keys(), await web.get("k")]).toEqual([5, 0, [], null]);

        const bare = cache.web(shelf(), {});
        const heard: (string | null)[] = [];
        const quiet = bare.watch("k", ( value ) => { heard.push(value); });

        await bare.set("k", "v");
        quiet();
        await bare.set("k", "w");
        expect(heard).toEqual(["v"]);

    });
    it("cookie storage writes one year by default, takes the jar's options and refuses what a cookie cannot hold", async () => {

        const doc = page();
        const baked = cache.cookies(cache.documentCookies(doc), { path: "/app", secure: true });
        const brief = cache.cookies(cache.documentCookies(doc), { maxAge: 60 });
        const box = cache.open({ storage: cache.cookies(cache.documentCookies(doc)), prefix: "app" });

        await baked.set("k", "v");
        await brief.set("s", "v");
        await baked.delete("k");
        expect(doc.lines).toEqual([
            "k=v; Max-Age=31536000; Path=/app; Secure; SameSite=Lax",
            "s=v; Max-Age=60; Path=/; SameSite=Lax",
            "k=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/app; Secure; SameSite=Lax",
        ]);
        expect([await baked.get("s"), await baked.get("k"), await baked.keys()]).toEqual(["v", null, ["s"]]);
        expect(shape(await caught(() => baked.set("a b", "v")))).toBe("RangeError: not a cookie name: a b");
        expect(shape(await caught(() => baked.set("big", "x".repeat(5000))))).toBe("RangeError: cookie too large");
        await box.set("user", { id: 7 });
        expect([doc.lines.at(-1), await box.get("user"), await box.keys()]).toEqual(["app.user=%7B%22v%22%3A%7B%22id%22%3A7%7D%7D; Max-Age=31536000; Path=/; SameSite=Lax", { id: 7 }, ["user"]]);

    });
    it("lazy, namespaced, typed and driver storages wrap one storage without changing what it holds", async () => {

        const memory = cache.memory();
        let made = 0;
        const late = cache.lazy(() => {

            made += 1;

            if ( made === 1 ) throw new Error("not yet");

            return memory;

        });
        const refused = late.get("k");

        expect(shape(await caught(() => refused))).toBe("Error: not yet");
        expect(thrown(() => late.watch("k", () => undefined))).toBeInstanceOf(Function);
        await Promise.all([late.set("k", "v"), late.set("j", "w"), late.keys()]);
        expect([made, await late.get("k"), await memory.get("j"), await late.keys()]).toEqual([2, "v", "w", ["k", "j"]]);
        await late.delete("j");
        expect([await memory.keys(), cache.driver(late), cache.driver(memory)]).toEqual([["k"], late, memory]);

        const outer = cache.namespaced(memory, "a");
        const inner = cache.namespaced(outer, "b");
        const seen: (string | null)[] = [];
        const stop = inner.watch("k", ( value ) => { seen.push(value); });

        await inner.set("k", "1");
        await outer.set("k", "2");
        await memory.set("a.bk", "3");
        await memory.set("ab.k", "4");
        expect([await memory.get("a.b.k"), await inner.keys(), await outer.keys(), await inner.get("k"), cache.namespaced(memory, "")]).toEqual(["1", ["k"], ["b.k", "k", "bk"], "1", memory]);
        await memory.set("a.b.k", "5");
        await inner.delete("k");
        stop();
        await inner.set("k", "6");
        expect([seen, cache.driver(inner)]).toEqual([["1", "5", null], inner]);

        const stamps = cache.typed<Date>(memory, { encode: ( value ) => String(value.getTime()), decode: ( text ) => (/^\d+$/.test(text) ? new Date(Number(text)) : undefined) });
        const loose = cache.typed<unknown>(memory);

        await stamps.write("at", new Date(5));
        await memory.set("junk", "{bad");
        expect([await memory.get("at"), (await stamps.read("at"))?.getTime(), await stamps.read("junk"), await stamps.read("none"), await loose.read("junk")]).toEqual(["5", 5, undefined, undefined, undefined]);
        await loose.write("list", [1, { a: null }]);
        expect([await loose.read("list"), await memory.get("list")]).toEqual([[1, { a: null }], "[1,{\"a\":null}]"]);
        await stamps.remove("at");
        await stamps.remove("at");
        expect(await stamps.read("at")).toBeUndefined();

        const data = new Map<string, string>();
        const heard: (string | null)[] = [];
        const wired: string[] = [];
        const custom = cache.driver({
            get: async ( key ) => data.get(key) ?? null,
            set: ( key, value ) => { data.set(key, value); },
            delete: async ( key ) => { data.delete(key); },
            keys: () => [...data.keys()],
            watch: ( key ) => {

                wired.push(`on:${key}`);

                return () => { wired.push(`off:${key}`); };

            },
        });
        const failing = cache.driver({ get: () => null, set: () => { throw new Error("disk"); }, delete: () => Promise.reject(new Error("gone")), keys: () => [] });
        const end = custom.watch("k", ( value ) => { heard.push(value); });
        const silent = failing.watch("k", ( value ) => { heard.push(value); });

        await custom.set("k", "v");
        await custom.delete("k");
        end();
        await custom.set("k", "w");
        expect([heard, wired, await custom.keys(), cache.driver(custom)]).toEqual([["v", null], ["on:k", "off:k"], ["k"], custom]);
        expect([shape(await caught(() => failing.set("k", "v"))), shape(await caught(() => failing.delete("k"))), heard.length]).toEqual(["Error: disk", "Error: gone", 2]);
        silent();

    });
    it("the storage port prefers one kind, serves any other by name and refuses a kind nobody bound", async () => {

        const data = new Map<string, string>();

        try {

            cache.use("stage-five", { get: ( key ) => data.get(key) ?? null, set: ( key, value ) => { data.set(key, value); }, delete: ( key ) => { data.delete(key); }, keys: () => [...data.keys()] });
            expect([cache.storages.preferred(), cache.storages.has("stage-five"), cache.storage()]).toEqual(["stage-five", true, cache.storage("stage-five")]);
            await cache.storage().set("k", "v");
            await cache.open({ prefix: "p" }).set("k", 1);
            expect([[...data.keys()], await cache.storage("memory").get("k"), cache.storage("memory")]).toEqual([["k", "p.k"], null, cache.storage("memory")]);
            cache.use("memory");
            expect([cache.storages.preferred(), await cache.storage().get("p.k")]).toEqual(["memory", null]);
            expect(thrown(() => cache.storage("stage-five-missing"))).toEqual(["unavailable", "cache.storage.unknown"]);

            const lost = cache.open({ kind: "stage-five-missing" });
            const verbs = [lost.get("k"), lost.set("k", 1), lost.has("k"), lost.remove("k"), lost.keys(), lost.clear(), lost.all(), lost.increment("k"), lost.touch("k"), lost.pull("k")];

            expect((await Promise.allSettled(verbs)).map(( result ) => result.status === "rejected" && shape(result.reason))).toEqual(Array(10).fill(["unavailable", "cache.storage.unknown"]));

        } finally {

            cache.storages.prefer("memory");

        }

    });
    it("a box runs each key's verbs in call order and never loses a concurrent count", async () => {

        const box = cache.open({ storage: cache.memory(), prefix: "order" });
        const gate = Promise.withResolvers<number>();
        let made = 0;

        await Promise.all([box.set("k", 1), box.set("k", 2), box.remove("k"), box.set("k", 3)]);
        expect(await box.get("k")).toBe(3);

        const written = box.set("late", "v");

        expect([await box.get("late"), await box.has("late")]).toEqual(["v", true]);
        await written;

        const counts = await Promise.all(Array.from({ length: 50 }, () => box.increment("n")));
        const both = await Promise.all([
            box.remember("r", async () => {

                made += 1;

                return "first";

            }),
            box.remember("r", () => {

                made += 1;

                return "second";

            }),
        ]);
        const sums = await Promise.all([1, 2, 3].map(( add ) => box.update<number>("u", ( current ) => (current ?? 0) + add)));

        expect([counts, await box.get("n")]).toEqual([Array.from({ length: 50 }, ( _, at ) => at + 1), 50]);
        expect([both, made, sums, await box.get("u")]).toEqual([["first", "first"], 1, [1, 3, 6], 6]);
        expect(shape(await caught(() => box.update("u", () => { throw new Error("change"); })))).toBe("Error: change");
        expect(shape(await caught(() => box.remember("m", () => { throw new Error("make"); })))).toBe("Error: make");
        expect([await box.increment("u"), await box.has("m"), await box.remember("m", () => "again")]).toEqual([7, false, "again"]);
        expect([await box.pull("u"), await box.pull("u"), await box.has("u")]).toEqual([7, undefined, false]);

        const slow = box.update<number>("slow", () => gate.promise);
        const queued = box.increment("slow");

        await box.set("quick", 1);
        expect(await box.get("quick")).toBe(1);
        gate.resolve(9);
        expect([await slow, await queued, await box.get("slow")]).toEqual([9, 10, 10]);
        expect((await box.keys()).sort()).toEqual(["k", "late", "m", "n", "quick", "r", "slow"]);

    });
    it("a box counts ttl in seconds, sweeps what expired on read and keeps an expiry through counts and updates", async () => {

        await faked(async () => {

            const inner = cache.memory();
            const box = cache.open({ storage: inner, ttl: 10 });

            await box.set("a", 1);
            await box.set("b", 2, { ttl: 1 });
            await box.set("c", 3, { ttl: Number.POSITIVE_INFINITY });
            await box.set("d", 4, { ttl: 0 });
            await box.set("e", 5, { ttl: 0.5 });
            expect([await box.keys(), JSON.parse((await inner.get("a")) ?? ""), JSON.parse((await inner.get("c")) ?? "")]).toEqual([["a", "b", "c", "e"], { v: 1, e: origin + 10_000 }, { v: 3 }]);
            pass(499);
            expect(await box.get("e")).toBe(5);
            pass(1);
            expect([await box.get("e"), await inner.get("e")]).toEqual([undefined, null]);
            pass(500);
            expect([await box.all(), await box.keys()]).toEqual([{ a: 1, c: 3 }, ["a", "c"]]);
            await box.set("n", 1, { ttl: 5 });
            pass(4000);
            expect([await box.increment("n"), await box.update<number>("n", ( current ) => (current ?? 0) * 10)]).toEqual([2, 20]);
            pass(999);
            expect(await box.get("n")).toBe(20);
            pass(1);
            expect([await box.get("n"), await box.has("n")]).toEqual([undefined, false]);
            expect(await box.increment("m", 2, { ttl: 2 })).toBe(2);
            pass(1999);
            expect(await box.increment("m", 1, { ttl: 2 })).toBe(3);
            pass(1999);
            expect(await box.decrement("m")).toBe(2);
            pass(1);
            expect([await box.has("m"), await box.decrement("m", 2)]).toEqual([false, -2]);
            pass(9999);
            expect(await box.get("m")).toBe(-2);
            pass(1);
            expect(await box.get("m")).toBeUndefined();
            await box.set("t", "v", { ttl: 1 });
            expect([await box.touch("t", { ttl: 3 }), await box.touch("none")]).toEqual([true, false]);
            pass(2999);
            expect([await box.get("t"), await box.touch("t")]).toEqual(["v", true]);
            pass(9999);
            expect(await box.get("t")).toBe("v");
            pass(1);
            expect([await box.get("t"), await box.touch("t")]).toEqual([undefined, false]);
            await box.set("r", "old", { ttl: 1 });
            pass(1000);
            expect([await box.remember("r", () => "new"), await box.update<string>("r", ( current ) => `${current}!`), await box.pull("r")]).toEqual(["new", "new!", "new!"]);
            await box.set("p", 1, { ttl: 1 });
            pass(1000);
            expect([await box.pull("p"), await inner.get("p")]).toEqual([undefined, null]);
            await box.set("back", 1, { ttl: 1 });
            jest.setSystemTime(origin - 60_000);
            expect(await box.get("back")).toBe(1);
            expect(shape(await caught(() => box.set("x", 1, { ttl: Number.NaN })))).toBe("RangeError: not a ttl");
            expect(shape(await caught(() => box.set("x", 1, { ttl: "5" as unknown as number })))).toBe("RangeError: not a ttl");
            expect(shape(await caught(() => box.touch("c", { ttl: Number.NaN })))).toBe("RangeError: not a ttl");
            expect(shape(await caught(() => cache.open({ storage: inner, ttl: Number.NaN }).set("x", 1)))).toBe("RangeError: not a ttl");
            expect([await box.has("x"), await box.get("c")]).toEqual([false, 3]);

        });

    });
    it("a box keeps json values only, drops what json cannot hold and counts over numbers alone", async () => {

        const inner = cache.memory();
        const box = cache.open({ storage: inner });
        const shared = cache.memory();
        const left = cache.open({ storage: shared, prefix: "left" });
        const right = cache.open({ storage: shared, prefix: "right" });

        for ( const nothing of [undefined, () => 1, Symbol("s")] ) {

            await box.set("gone", 1);
            await box.set("gone", nothing);
            expect([await box.has("gone"), await box.keys()]).toEqual([false, []]);

        }

        await box.set("date", new Date(0));
        await box.set("nan", Number.NaN);
        await box.set("null", null);
        await box.set("big", 10n);
        await box.set("deep", { a: [1, { b: undefined, c: null }], f: () => 1 });
        await box.set("zero", 0);
        await box.set("blank", "");
        await box.set("off", false);
        expect(await box.all()).toEqual({ date: "1970-01-01T00:00:00.000Z", nan: null, null: null, big: "10", deep: { a: [1, { c: null }] }, zero: 0, blank: "", off: false });
        expect<unknown[]>([await box.has("null"), await box.has("zero"), await box.remember("null", () => 5), await box.remember("off", () => true)]).toEqual([true, true, null, false]);
        expect([await box.remember("void", () => undefined), await box.has("void"), await box.update("zero", () => undefined), await box.has("zero")]).toEqual([undefined, false, undefined, false]);
        await box.set("text", "abc");
        expect(shape(await caught(() => box.increment("text")))).toBe("RangeError: not a counter");
        expect(shape(await caught(() => box.decrement("null")))).toBe("RangeError: not a counter");
        expect(shape(await caught(() => box.increment("n", Number.NaN)))).toBe("RangeError: not a step");
        expect(shape(await caught(() => box.increment("n", Number.POSITIVE_INFINITY)))).toBe("RangeError: not a step");
        await box.set("max", Number.MAX_VALUE);
        expect(shape(await caught(() => box.increment("max", Number.MAX_VALUE)))).toBe("RangeError: not a step");
        expect([await box.get("text"), await box.get("null"), await box.has("n"), await box.get("max")]).toEqual(["abc", null, false, Number.MAX_VALUE]);
        expect([await box.increment("f", 0.5), await box.decrement("f", 0.25), await box.increment("f", 0), await box.decrement("fresh", 2)]).toEqual([0.5, 0.25, 0.25, -2]);
        await inner.set("junk", "{bad");
        await inner.set("bare", "5");
        await inner.set("list", "[1]");
        await inner.set("shapeless", "{\"x\":1}");
        await inner.set("stamp", "{\"v\":1,\"e\":\"soon\"}");
        await inner.set("__proto__", "{\"v\":1}");
        expect(await Promise.all(["junk", "bare", "list", "shapeless", "stamp"].map(( key ) => box.get(key)))).toEqual(Array(5).fill(undefined));
        expect([await box.has("junk"), await inner.get("junk"), await box.increment("junk"), await box.get("__proto__")]).toEqual([false, "{bad", 1, 1]);

        const everything = await box.all();

        expect([Object.hasOwn(everything, "__proto__"), Object.getPrototypeOf(everything) === Object.prototype, Object.hasOwn(everything, "bare"), everything.junk]).toEqual([false, true, false, 1]);
        await left.set("k", 1);
        await right.set("k", 2);
        await shared.set("bare", "x");
        await left.clear();
        expect([await left.keys(), await right.keys(), await shared.keys(), await right.get("k")]).toEqual([[], ["k"], ["right.k", "bare"], 2]);
        await box.clear();
        expect([await inner.keys(), cache.place({ storage: shared }), cache.place({ storage: shared, prefix: "" }), left.storage === right.storage]).toEqual([[], shared, shared, false]);
        await cache.place({ storage: shared, prefix: "p" }).set("k", "v");
        expect(await shared.get("p.k")).toBe("v");

    });
    it("a guarded box hides its values, binds each envelope to its own key and refuses anything forged", async () => {

        const inner = cache.memory();
        const sealed = cache.open({ storage: inner, prefix: "app", secret });
        const signed = cache.open({ storage: inner, prefix: "sig", sign: secret });
        const both = cache.open({ storage: inner, prefix: "both", secret, sign: "t".repeat(32) });

        await sealed.set("token", "hunter2-value");
        await signed.set("token", "hunter2-value");
        await both.set("token", { deep: ["hunter2-value"] });

        const text = (await inner.get("app.token")) ?? "";
        const mark = (await inner.get("sig.token")) ?? "";
        const pair = (await inner.get("both.token")) ?? "";
        const cut = mark.indexOf(".") + 1;

        expect([text.includes("hunter2"), pair.includes("hunter2"), text.startsWith("v1."), mark.split(".").length]).toEqual([false, false, true, 2]);
        expect([await sealed.get("token"), await signed.get("token"), await both.get("token")]).toEqual(["hunter2-value", "hunter2-value", { deep: ["hunter2-value"] }]);
        await sealed.set("again", "hunter2-value");
        expect((await inner.get("app.again")) === text).toBe(false);
        await inner.set("app.other", text);
        await inner.set("web.token", text);
        await inner.set("sig.other", mark);
        expect([
            await sealed.get("other"),
            await cache.open({ storage: inner, prefix: "web", secret }).get("token"),
            await cache.open({ storage: inner, prefix: "app", secret: "t".repeat(32) }).get("token"),
            await cache.open({ storage: inner, prefix: "app" }).get("token"),
            await signed.get("other"),
            await cache.open({ storage: inner, prefix: "sig", sign: "t".repeat(32) }).get("token"),
            await cache.open({ storage: inner, prefix: "both", secret }).get("token"),
            await cache.open({ storage: inner, prefix: "both", sign: "t".repeat(32) }).get("token"),
        ]).toEqual(Array(8).fill(undefined));
        await inner.set("app.forged", "{\"v\":\"forged\"}");
        await inner.set("sig.forged", "{\"v\":\"forged\",\"k\":\"sig.forged\"}");
        await inner.set("sig.bent", `${mark.slice(0, cut)}${mark[cut] === "A" ? "B" : "A"}${mark.slice(cut + 1)}`);
        expect([await sealed.get("forged"), await sealed.has("forged"), await signed.get("forged"), await signed.get("bent"), await inner.get("app.forged")]).toEqual([undefined, false, undefined, undefined, "{\"v\":\"forged\"}"]);
        expect([await sealed.remember("forged", () => "real"), await sealed.get("forged"), ((await inner.get("app.forged")) ?? "").includes("real")]).toEqual(["real", "real", false]);
        expect([await sealed.increment("count"), await sealed.increment("count", 2), await sealed.all()]).toEqual([1, 3, { token: "hunter2-value", again: "hunter2-value", forged: "real", count: 3 }]);
        await sealed.set("brief", 1, { ttl: -1 });
        expect([await sealed.has("brief"), await inner.get("app.brief")]).toEqual([false, null]);

    });
    it("a box watcher hears each change in order through the guard and nothing after it stops", async () => {

        const inner = cache.memory();
        const box = cache.open({ storage: inner, prefix: "app", secret });
        const plain = cache.open({ storage: inner, prefix: "plain" });
        const seen: unknown[] = [];
        const twin: unknown[] = [];
        const loose: unknown[] = [];
        const stop = box.watch<number>("n", ( value ) => { seen.push(value); });
        const stopTwin = box.watch<number>("n", ( value ) => { twin.push(value); });
        const stopPlain = plain.watch<number[]>("n", ( value ) => { loose.push(value); });

        await box.set("n", 1);
        await box.set("n", 2);
        await box.set("other", 9);
        await box.remove("n");
        await inner.set("app.n", "garbage");
        await box.set("n", 5);
        await box.set("n", 6, { ttl: -1 });
        await plain.set("n", [1]);
        await plain.update<number[]>("n", ( current ) => [...(current ?? []), 2]);
        await reached(() => seen.length >= 6 && twin.length >= 6 && loose.length >= 2);
        expect([seen, twin, loose]).toEqual([[1, 2, undefined, undefined, 5, undefined], [1, 2, undefined, undefined, 5, undefined], [[1], [1, 2]]]);
        stop();
        stop();
        await box.set("n", 7);
        await reached(() => twin.length >= 7);
        stopTwin();
        stopPlain();
        await box.set("n", 8);
        await plain.remove("n");
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        expect([seen.length, twin, loose.length]).toEqual([6, [1, 2, undefined, undefined, 5, undefined, 7], 2]);

    });

    it("a cookie line refuses a name it cannot read back, text that is not text and spells any age in digits", () => {

        const lone = String.fromCharCode(0xd800);
        const document = page();

        expect(["__proto__", "constructor", "prototype"].map(( name ) => thrown(() => cache.serializeCookie(name, "1")))).toEqual([
            "RangeError: not a cookie name: __proto__",
            "RangeError: not a cookie name: constructor",
            "RangeError: not a cookie name: prototype",
        ]);
        expect([thrown(() => cache.serializeCookie("k", `a${lone}b`)), thrown(() => cache.documentCookies(document).set("k", lone)), thrown(() => cache.headerCookies("").set("k", lone)), document.lines]).toEqual([
            "RangeError: not a cookie value",
            "RangeError: not a cookie value",
            "RangeError: not a cookie value",
            [],
        ]);
        expect([1e21, 1e300, Number.MAX_VALUE, 2 ** 53, 12.9, -3].map(( maxAge ) => cache.serializeCookie("k", "v", { maxAge }))).toEqual([
            "k=v; Max-Age=9007199254740991; Path=/; SameSite=Lax",
            "k=v; Max-Age=9007199254740991; Path=/; SameSite=Lax",
            "k=v; Max-Age=9007199254740991; Path=/; SameSite=Lax",
            "k=v; Max-Age=9007199254740991; Path=/; SameSite=Lax",
            "k=v; Max-Age=12; Path=/; SameSite=Lax",
            "k=v; Max-Age=0; Path=/; SameSite=Lax",
        ]);
        expect(cache.parseCookies(cache.serializeCookie("toString", `a${String.fromCodePoint(0x1f600)}b`).split(";")[0])).toEqual({ toString: `a${String.fromCodePoint(0x1f600)}b` });

    });

});
