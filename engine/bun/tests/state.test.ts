import { describe, expect, test as it, jest } from "bun:test";
import * as cache from "engine/cache";
import * as error from "engine/error";
import * as event from "engine/event";
import * as state from "engine/state";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Cart = { items: string[]; coupon: string | undefined };
type CartActions = { add: ( sku: string ) => void; clear: () => void; apply: ( code: string ) => void };
type Bag = { items: string[]; user: { id: number } | null; n: number };
type BagActions = { add: ( sku: string ) => void; put: ( n: number ) => void; sign: ( user: { id: number } | null ) => void };
type Counted = { storage: cache.Storage; calls: { get: number; set: number; delete: number } };
type Gate = { storage: cache.Storage; log: string[]; hold: ( key: string ) => void; release: ( key: string ) => void };

const cart = state.define<Cart, CartActions>({
    name: "cart",
    initial: { items: [], coupon: undefined },
    actions: ( set, get ) => ({
        add: ( sku ) => set({ items: [...get().items, sku] }),
        clear: () => set({ items: [], coupon: undefined }),
        apply: ( code ) => set(( current ) => ({ coupon: current.items.length ? code : undefined })),
    }),
});

function told ( failure: unknown ): string {

    if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

    return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

}
async function rejected ( work: Promise<unknown> ): Promise<string> {

    try {

        await work;

        return "settled";

    } catch ( failure ) {

        return told(failure);

    }

}
function tick ( ms = 0 ): Promise<void> {

    return new Promise(( done ) => setTimeout(done, ms));

}
function bag ( box: cache.Box, persist: Partial<state.Persist<Bag>> = {}, faults: string[] = [] ): state.Instance<Bag, BagActions> {

    return state.define<Bag, BagActions>({
        name: "bag",
        initial: { items: [], user: null, n: 0 },
        actions: ( set, get ) => ({ add: ( sku ) => set({ items: [...get().items, sku] }), put: ( n ) => set({ n }), sign: ( user ) => set({ user }) }),
        persist: { box, fail: ( fault ) => faults.push(told(fault)), ...persist },
    }).create();

}
function counted ( inner: cache.Storage = cache.memory() ): Counted {

    const calls = { get: 0, set: 0, delete: 0 };
    const storage = cache.driver({
        get: ( key ) => {

            calls.get += 1;

            return inner.get(key);

        },
        set: ( key, value ) => {

            calls.set += 1;

            return inner.set(key, value);

        },
        delete: ( key ) => {

            calls.delete += 1;

            return inner.delete(key);

        },
        keys: () => inner.keys(),
        watch: ( key, onChange ) => inner.watch(key, onChange),
        lock: inner.lock,
    });

    return { storage, calls };

}
function refusing ( inner: cache.Storage, deny: () => boolean ): cache.Storage {

    return cache.driver({
        get: ( key ) => inner.get(key),
        set: ( key, value ) => {

            if ( deny() ) throw new Error("full");

            return inner.set(key, value);

        },
        delete: ( key ) => {

            if ( deny() ) throw new Error("locked");

            return inner.delete(key);

        },
        keys: () => inner.keys(),
        watch: ( key, onChange ) => inner.watch(key, onChange),
        lock: inner.lock,
    });

}
function gated (): Gate {

    const inner = cache.memory();
    const log: string[] = [];
    const held = new Map<string, Promise<void>>();
    const opens = new Map<string, () => void>();
    const turns = new Map<string, Promise<unknown>>();
    const lock: cache.Lock = ( key, work ) => {

        const run = (turns.get(key) ?? Promise.resolve()).then(async () => {

            log.push(`acquire ${key}`);
            await held.get(key);

            try {

                return await work();

            } finally {

                log.push(`release ${key}`);

            }

        });
        const tail = run.then(() => undefined, () => undefined);

        turns.set(key, tail);

        return run;

    };

    return {
        log,
        storage: cache.driver({ get: ( key ) => inner.get(key), set: ( key, value ) => inner.set(key, value), delete: ( key ) => inner.delete(key), keys: () => inner.keys(), watch: ( key, onChange ) => inner.watch(key, onChange), lock }),
        hold: ( key ) => {

            const { promise, resolve } = Promise.withResolvers<void>();

            held.set(key, promise);
            opens.set(key, resolve);

        },
        release: ( key ) => {

            opens.get(key)?.();
            held.delete(key);
            opens.delete(key);

        },
    };

}
async function faked ( work: () => void | Promise<void> ): Promise<void> {

    jest.useFakeTimers();

    try {

        await work();

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

}

describe("state", () => {

    it("defined stores act, persist chosen keys, hydrate and migrate", async () => {

        const instance = cart.create();

        expect(instance.name).toBe("cart");
        expect(instance.getState().ready).toBe(true);
        instance.getState().add("a");
        instance.getState().apply("SAVE");
        expect(instance.getState().items).toEqual(["a"]);
        expect(instance.getState().coupon).toBe("SAVE");
        instance.reset();
        expect(instance.getState().items).toEqual([]);

        const box = cache.open({ kind: "memory" });
        const actions: state.Actions<Cart, CartActions> = ( set, get ) => ({ add: ( sku ) => set({ items: [...get().items, sku] }), clear: () => set({ items: [] }), apply: ( code ) => set({ coupon: code }) });
        const persisted = state.define<Cart, CartActions>({ name: "cart", initial: { items: [], coupon: undefined }, actions, persist: { box, keys: ["items"], version: 2, migrate: ( saved ) => ({ items: (saved as { old: string[] }).old }) } });

        await box.set("cart", { version: 1, state: { old: ["legacy"] } });

        const first = persisted.create();

        expect(first.getState().ready).toBe(false);
        await first.hydrate();
        expect(first.getState().ready).toBe(true);
        expect(first.getState().items).toEqual(["legacy"]);

        const live = state.define<Cart, CartActions>({
            name: "cart",
            initial: { items: [], coupon: undefined },
            actions: ( set, get ) => ({ add: ( sku ) => set({ items: [...get().items, sku] }), clear: () => set({ items: [] }), apply: ( code ) => set({ coupon: code }) }),
            persist: { box, keys: ["items"], version: 2 },
        }).create();

        await live.hydrate();
        live.getState().add("b");
        live.getState().apply("X");
        await new Promise(( resolve ) => setTimeout(resolve, 5));
        expect(await box.get("cart@2")).toEqual({ version: 2, state: { items: ["legacy", "b"] } });
        expect(await box.get("cart")).toEqual({ version: 1, state: { old: ["legacy"] } });

    });
    it("bindings select for React and plain code", () => {

        const instance = cart.create();
        const bound = state.bind(instance);

        instance.getState().add("x");
        expect(bound.select(( current ) => current.items.length)).toBe(1);

        function Count (): string {

            const count = bound.useSelect(( current ) => current.items.length);
            const all = bound.useState();

            return `${count}:${all.items.join(",")}`;

        }

        expect(renderToStaticMarkup(createElement(Count))).toBe("1:x");

        const flag = event.signal<{ on: boolean } | undefined>(undefined);
        const watched: state.Binding<{ on: boolean } | undefined> = state.bind(flag satisfies state.Watched<{ on: boolean } | undefined>);
        const seen: (boolean | undefined)[] = [];

        function Flag (): string {

            return String(watched.useSelect(( value ) => value?.on));

        }

        expect(renderToStaticMarkup(createElement(Flag))).toBe("undefined");
        flag.watch(() => seen.push(watched.select(( value ) => value?.on)));
        flag.set({ on: true });
        expect(seen).toEqual([true]);
        expect(renderToStaticMarkup(createElement(Flag))).toBe("true");
        expect(renderToStaticMarkup(createElement(() => String(state.bind(flag, () => ({ on: false })).useState()?.on)))).toBe("false");

        const shapes: { count: number }[] = [];

        function Shape (): string {

            const [turn, setTurn] = useState(0);

            shapes.push(bound.useSelect(( current ) => ({ count: current.items.length }), ( a, b ) => a.count === b.count));

            if ( turn < 2 ) setTurn(turn + 1);

            return String(turn);

        }

        expect(renderToStaticMarkup(createElement(Shape))).toBe("2");
        expect(shapes).toHaveLength(3);
        expect(shapes[1]).toBe(shapes[0]);
        expect(shapes[2]).toBe(shapes[0]);

    });
    it("resources and actions guard races and aborts", async () => {

        let calls = 0;
        const users = state.resource<string[]>({ load: async ( signal ) => {

            calls += 1;
            await new Promise(( resolve ) => setTimeout(resolve, calls === 1 ? 20 : 1));

            if ( signal.aborted ) throw new Error("aborted");

            return [`load-${calls}`];

        }, staleAfter: 30 });

        expect(users.getState().status).toBe("idle");

        const slow = users.refresh();
        const fast = users.refresh();

        expect(users.getState().status).toBe("pending");
        expect(await fast).toEqual(["load-2"]);
        expect(await slow).toBeUndefined();
        expect(users.getState().data).toEqual(["load-2"]);
        expect(users.getState().stale).toBe(false);
        await new Promise(( resolve ) => setTimeout(resolve, 40));
        expect(users.getState().stale).toBe(true);
        users.set(["manual"]);
        expect(users.getState().data).toEqual(["manual"]);

        const failing = state.resource<number>({ load: async () => { throw new Error("nope"); } });

        await failing.refresh();
        expect(failing.getState().status).toBe("failed");
        failing.reset();
        expect(failing.getState().status).toBe("idle");

        const seeded = state.resource<number>({ load: async () => 2, seed: 1 });

        expect(seeded.getState()).toMatchObject({ status: "done", data: 1, stale: true });

        const pending = state.resource<number>({ load: () => new Promise(() => undefined) });

        void pending.refresh();
        pending.abort();
        expect(pending.getState().status).toBe("idle");

        const save = state.action<string, string>(async ( input, signal ) => {

            await new Promise(( resolve ) => setTimeout(resolve, input === "slow" ? 20 : 1));

            if ( signal.aborted ) throw new Error("aborted");
            if ( input === "bad" ) throw new Error("bad");

            return input.toUpperCase();

        });
        const first = save.run("slow");
        const second = save.run("quick");

        expect(save.getState().status).toBe("running");
        expect(await second).toBe("QUICK");
        expect(await first).toBeUndefined();
        expect(save.getState()).toMatchObject({ status: "done", result: "QUICK", runs: 2 });
        expect(await save.run("bad")).toBeUndefined();
        expect(save.getState().status).toBe("failed");
        save.reset();
        expect(save.getState().status).toBe("idle");

    });
    it("feeds page by cursor, dedupe by key, run one load at a time and refresh safely", async () => {

        const pages: Record<string, { items: { id: string }[]; next: string | null }> = {
            start: { items: [{ id: "1" }, { id: "2" }], next: "p2" },
            p2: { items: [{ id: "2" }, { id: "3" }], next: null },
        };
        let loads = 0;
        const made = state.feed<{ id: string }>({
            key: ( item ) => item.id,
            load: async ( cursor ) => {

                loads += 1;

                return pages[cursor ?? "start"] as { items: { id: string }[]; next: string | null };

            },
        });

        await Promise.all([made.more(), made.more()]);
        expect(loads).toBe(1);
        expect(made.getState().items.map(( item ) => item.id)).toEqual(["1", "2"]);
        await made.more();
        expect(made.getState().items.map(( item ) => item.id)).toEqual(["1", "2", "3"]);
        expect(made.getState().ended && made.getState().status === "done").toBe(true);
        await made.more();
        expect(loads).toBe(2);
        made.put({ id: "0" });
        made.put({ id: "2" });
        made.drop("3");
        made.drop("zz");
        expect(made.getState().items.map(( item ) => item.id)).toEqual(["0", "1", "2"]);

        let release: (() => void) | undefined;
        const slow = state.feed<{ id: string }>({ key: ( item ) => item.id, load: ( cursor ) => new Promise(( resolve ) => { release = () => resolve({ items: [{ id: `${cursor ?? "s"}` }], next: null }); }) });
        const first = slow.more();
        const second = slow.refresh();

        release?.();
        await second;
        await first;
        expect(slow.getState().items.map(( item ) => item.id)).toEqual(["s"]);
        expect(slow.getState().status).toBe("done");

        const failing = state.feed<{ id: string }>({ key: ( item ) => item.id, load: async () => { throw new Error("down"); } });

        await failing.more();
        expect(failing.getState().status).toBe("failed");
        expect(failing.getState().failure?.message).toBe("down");

    });
    it("derive and combine make cheap readables that only fire on real change", () => {

        const cart = state.define<Cart, CartActions>({ name: "cart", initial: { items: [], coupon: undefined }, actions: ( set, get ) => ({ add: ( sku ) => set({ items: [...get().items, sku] }), clear: () => set({ items: [] }), apply: ( code ) => set({ coupon: code }) }) }).create();
        const count = state.derive(cart, ( current ) => current.items.length);
        const both = state.combine({ count, coupon: state.derive(cart, ( current ) => current.coupon) });
        const seen: number[] = [];
        const pairs: string[] = [];
        const stopCount = count.subscribe(( value ) => { seen.push(value); });
        const stopBoth = both.subscribe(( value ) => { pairs.push(`${value.count}:${value.coupon ?? "-"}`); });

        expect(count.getState()).toBe(0);
        cart.getState().add("a");
        cart.getState().apply("SAVE");
        cart.getState().apply("SAVE");
        cart.getState().add("b");
        expect(seen).toEqual([1, 2]);
        expect(pairs).toEqual(["1:-", "1:SAVE", "2:SAVE"]);
        expect(both.getState()).toEqual({ count: 2, coupon: "SAVE" });
        stopCount();
        stopBoth();

    });
    it("hydration reads the legacy key once, writes the new key and never the legacy one", async () => {

        const { storage, calls } = counted();
        const box = cache.open({ storage });

        await box.set("bag", { version: 1, state: { items: ["legacy"], n: 7 } });
        calls.get = 0;
        calls.set = 0;

        const made = bag(box);

        expect(made.key).toBe("bag@2");
        expect(state.keyOf("bag")).toBe("bag@2");
        expect(made.getState()).toMatchObject({ ready: false, kept: false, items: [] });
        await Promise.all([made.hydrate(), made.hydrate()]);
        expect(made.getState()).toMatchObject({ ready: true, kept: true, items: ["legacy"], n: 7 });
        expect(calls).toEqual({ get: 2, set: 1, delete: 0 });
        expect(await box.get("bag")).toEqual({ version: 1, state: { items: ["legacy"], n: 7 } });
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["legacy"], user: null, n: 7 } });

        const again = bag(box);

        calls.get = 0;
        await again.hydrate();
        await again.flush();
        expect(calls).toEqual({ get: 1, set: 1, delete: 0 });

    });
    it("a saved copy is left untouched by reading: nothing saved, junk, an older copy without migrate, a refused accept", async () => {

        for ( const saved of [undefined, "junk", { version: "1", state: {} }, { version: 1.5, state: {} }, { version: 1, state: [] }, { version: 0, state: { items: ["old"] } }] ) {

            const { storage, calls } = counted();
            const box = cache.open({ storage });

            if ( saved !== undefined ) await box.set("bag@2", saved);

            calls.set = 0;

            const faults: string[] = [];
            const made = bag(box, {}, faults);

            await made.hydrate();
            await made.flush();
            expect([saved, made.getState().items, made.getState().kept, calls.set, faults]).toEqual([saved, [], true, 0, []]);
            expect(await box.get("bag@2")).toEqual(saved);
            made.getState().add("first");
            await made.flush();
            expect([saved, calls.set]).toEqual([saved, 1]);
            expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["first"], user: null, n: 0 } });

        }

        const box = cache.open({ storage: cache.memory() });

        await box.set("bag@2", { version: 1, state: { items: ["kept"], n: 3 } });

        const picky = bag(box, { accept: ( found ) => (found.n === 3 ? undefined : found) });

        await picky.hydrate();
        await picky.flush();
        expect(picky.getState()).toMatchObject({ items: [], n: 0, kept: true });
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["kept"], n: 3 } });

    });
    it("a migration runs on the copy read inside the lock and writes the new version back; a throwing migrate or accept is a saved fault", async () => {

        const box = cache.open({ storage: cache.memory() });
        const seen: unknown[] = [];

        await box.set("bag@2", { version: 1, state: { items: ["v1"], n: 1 } });

        const made = bag(box, { version: 2, migrate: ( saved, version ) => {

            seen.push(version);

            return { items: [...(saved as Bag).items, "migrated"] };

        } });

        await made.hydrate();
        expect([seen, made.getState().items, made.getState().n]).toEqual([[1], ["v1", "migrated"], 0]);
        expect(await box.get("bag@2")).toEqual({ version: 2, state: { items: ["v1", "migrated"], user: null, n: 0 } });

        const faults: string[] = [];

        await box.set("bag@2", { version: 1, state: { items: ["v1"] } });

        const broken = bag(box, { version: 2, migrate: () => { throw new Error("no"); } }, faults);

        await broken.hydrate();
        expect([broken.getState().items, faults]).toEqual([[], ["internal/state.saved"]]);
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["v1"] } });

        const silent = bag(box, { version: 2, accept: () => { throw new Error("no"); }, fail: undefined });

        await box.set("bag@2", { version: 2, state: { items: ["v2"] } });
        await silent.hydrate();
        expect(await rejected(silent.flush())).toBe("internal/state.saved");
        expect(await rejected(silent.flush())).toBe("settled");

        await box.set("bag@2", { version: 2, state: { items: "not a list", user: { id: 1 }, n: "9" } });

        const typed = bag(box, { version: 2 });

        await typed.hydrate();
        expect(typed.getState()).toMatchObject({ items: [], user: { id: 1 }, n: 0 });

    });
    it("a newer saved version freezes the instance: it keeps working in memory, never writes, and says why", async () => {

        const { storage, calls } = counted();
        const box = cache.open({ storage });
        const faults: string[] = [];

        await box.set("bag@2", { version: 3, state: { items: ["future"] } });
        calls.set = 0;

        const old = bag(box, { version: 2 }, faults);

        await old.hydrate();
        expect(old.getState()).toMatchObject({ ready: true, kept: false, items: [] });
        old.getState().add("mine");
        await old.flush();
        old.reset();
        await old.flush();
        expect([calls.set, faults]).toEqual([0, ["conflict/state.newer"]]);
        expect(await box.get("bag@2")).toEqual({ version: 3, state: { items: ["future"] } });

        const quiet = state.define<Bag, BagActions>({ name: "bag", initial: { items: [], user: null, n: 0 }, actions: ( set ) => ({ add: () => undefined, put: ( n ) => set({ n }), sign: () => undefined }), persist: { box, version: 2 } }).create();

        await quiet.hydrate();
        expect(await rejected(quiet.flush())).toBe("conflict/state.newer");
        expect(await rejected(quiet.flush())).toBe("settled");
        await quiet.forget();
        expect([quiet.getState().kept, await box.get("bag@2")]).toEqual([true, undefined]);
        quiet.getState().put(4);
        await quiet.flush();
        expect(await box.get("bag@2")).toEqual({ version: 2, state: { items: [], user: null, n: 4 } });

    });
    it("a newer version arriving after hydration freezes through sync and through the write-path recheck, and a removal thaws", async () => {

        const storage = cache.memory();
        const faults: string[] = [];
        const a = bag(cache.open({ storage }), { version: 2, sync: true }, faults);
        const b = bag(cache.open({ storage }), { version: 3, sync: true });

        await a.hydrate();
        a.getState().add("a1");
        await a.flush();
        await b.hydrate();
        expect(b.getState().items).toEqual([]);
        b.getState().add("b1");
        await b.flush();
        await tick(2);
        expect([a.getState().items, a.getState().kept, faults]).toEqual([["a1"], false, ["conflict/state.newer"]]);
        a.getState().add("a2");
        await a.flush();
        expect(await cache.open({ storage }).get("bag@2")).toMatchObject({ version: 3, state: { items: ["b1"], user: null, n: 0 } });
        await b.forget();
        await tick(2);
        expect([a.getState().items, a.getState().kept, await cache.open({ storage }).get("bag@2")]).toEqual([[], true, undefined]);
        a.getState().add("a3");
        await a.flush();
        expect(await cache.open({ storage }).get("bag@2")).toMatchObject({ version: 2, state: { items: ["a3"] } });
        a.stop();
        b.stop();

        const c = bag(cache.open({ storage }), { version: 2 }, faults);
        const d = bag(cache.open({ storage }), { version: 3 });

        await c.hydrate();
        await d.hydrate();
        d.getState().add("d1");
        await d.flush();
        c.getState().add("c1");
        await c.flush();
        expect([c.getState().items, c.getState().kept, faults.slice(1)]).toEqual([["a3", "c1"], false, ["conflict/state.newer"]]);
        expect(await cache.open({ storage }).get("bag@2")).toEqual({ version: 3, state: { items: ["d1"], user: null, n: 0 } });

    });
    it("a storage without a shared lock refuses exclusive persistence and keeps the state in memory; guard local accepts it", async () => {

        const bare = cache.driver({ get: () => null, set: () => undefined, delete: () => undefined, keys: () => [] });
        const box = cache.open({ storage: bare });
        const faults: string[] = [];
        const strict = bag(box, {}, faults);

        await strict.hydrate();
        strict.getState().add("x");
        await strict.flush();
        expect([strict.getState().ready, strict.getState().kept, strict.getState().items, faults]).toEqual([true, false, ["x"], ["unavailable/state.unguarded"]]);

        const local = bag(box, { guard: "local" }, faults);

        await local.hydrate();
        local.getState().add("y");
        await local.flush();
        expect([local.getState().kept, faults]).toEqual([true, ["unavailable/state.unguarded"]]);
        expect(await rejected(box.update("k", () => 1, { exclusive: true }))).toBe("unavailable/cache.unguarded");
        expect(await rejected(cache.open({ storage: cache.lazy(() => bare) }).update("k", () => 1, { exclusive: true }))).toBe("unavailable/cache.unguarded");

    });
    it("two contexts on one storage take turns under the shared lock: read, verdict and write never interleave", async () => {

        const gate = gated();
        const boxA = cache.open({ storage: gate.storage });
        const boxB = cache.open({ storage: gate.storage });

        await boxA.set("bag@2", { version: 2, state: { items: ["old"] } });
        gate.log.length = 0;

        const a = bag(boxA, { version: 2 });
        const b = bag(boxB, { version: 3, migrate: ( saved ) => saved as Partial<Bag> });

        gate.hold("bag@2");

        const loads = Promise.all([a.hydrate(), b.hydrate()]);

        await tick(2);
        expect(gate.log).toEqual(["acquire bag@2"]);
        gate.release("bag@2");
        await loads;
        expect(gate.log).toEqual(["acquire bag@2", "release bag@2", "acquire bag@2", "release bag@2"]);
        expect([a.getState().items, b.getState().items, b.getState().kept]).toEqual([["old"], ["old"], true]);
        a.getState().add("a1");
        b.getState().add("b1");
        await Promise.all([a.flush(), b.flush()]);
        expect(a.getState().kept).toBe(false);
        expect(await boxB.get("bag@2")).toEqual({ version: 3, state: { items: ["old", "b1"], user: null, n: 0 } });
        expect(gate.log.filter(( line ) => line.startsWith("acquire")).length).toBe(gate.log.filter(( line ) => line.startsWith("release")).length);

        for ( let at = 0; at < gate.log.length; at += 2 ) expect([gate.log[at]?.split(" ")[0], gate.log[at + 1]?.split(" ")[0]]).toEqual(["acquire", "release"]);

    });
    it("changes made before hydration win over the saved keys they touched, and a reset before hydration drops the saved copy", async () => {

        const box = cache.open({ storage: cache.memory() });

        await box.set("bag@2", { version: 1, state: { items: ["saved"], n: 5 } });

        const early = bag(box);

        early.getState().add("boot");
        expect(early.getState()).toMatchObject({ ready: false, items: ["boot"], n: 0 });
        await early.hydrate();
        expect(early.getState()).toMatchObject({ ready: true, kept: true, items: ["boot"], n: 5 });
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["boot"], user: null, n: 5 } });

        await box.set("bag@2", { version: 1, state: { items: ["saved"], n: 5 } });

        const wiped = bag(box);

        wiped.getState().add("boot");
        wiped.reset();
        await wiped.hydrate();
        expect(wiped.getState()).toMatchObject({ items: [], n: 0 });
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: [], user: null, n: 0 } });

        const plain = cart.create();

        expect(plain.getState()).toMatchObject({ ready: true, kept: false });
        plain.getState().add("a");
        plain.reset();
        await plain.hydrate();
        await plain.flush();
        await plain.forget();
        plain.stop();
        expect(plain.getState()).toMatchObject({ ready: true, kept: false, items: [] });

    });
    it("only a change to a persisted key writes, one write per settled change, and the chain never writes twice for one state", async () => {

        const { storage, calls } = counted();
        const box = cache.open({ storage });
        const made = bag(box, { keys: ["items"] });

        await made.hydrate();
        expect(calls.set).toBe(0);

        for ( let turn = 0; turn < 1000; turn += 1 ) made.getState().put(turn);

        await made.flush();
        expect(calls.set).toBe(0);
        made.getState().add("a");
        made.getState().add("b");
        made.getState().add("c");
        await made.flush();
        expect(calls.set).toBeLessThanOrEqual(2);
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["a", "b", "c"] } });
        made.getState().add("d");
        await made.flush();
        await made.flush();
        expect(calls.set).toBeLessThanOrEqual(3);
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["a", "b", "c", "d"] } });
        made.stop();
        made.getState().add("e");
        await made.flush();
        expect(await box.get("bag@2")).toEqual({ version: 1, state: { items: ["a", "b", "c", "d"] } });

    });
    it("a refused write reaches fail or the next flush, marks the instance unkept, and the next flush retries it", async () => {

        let deny = false;
        const inner = cache.memory();
        const box = cache.open({ storage: refusing(inner, () => deny) });
        const faults: string[] = [];
        const made = bag(box, {}, faults);
        const quiet = bag(cache.open({ storage: refusing(inner, () => deny) }), { fail: undefined });

        await made.hydrate();
        await quiet.hydrate();
        deny = true;
        made.getState().add("x");
        quiet.getState().add("y");
        await made.flush();
        expect([faults, made.getState().kept]).toEqual([["unavailable/state.refused"], false]);
        expect(await rejected(quiet.flush())).toBe("unavailable/state.refused");
        expect(await rejected(quiet.flush())).toBe("unavailable/state.refused");
        expect(await cache.open({ storage: inner }).get("bag@2")).toBeUndefined();
        deny = false;
        await made.flush();
        expect([faults, made.getState().kept]).toEqual([["unavailable/state.refused"], true]);
        expect(await cache.open({ storage: inner }).get("bag@2")).toEqual({ version: 1, state: { items: ["x"], user: null, n: 0 } });
        deny = true;
        expect(await rejected(made.forget())).toBe("unavailable/state.refused");
        deny = false;
        await made.forget();
        expect(await cache.open({ storage: inner }).get("bag@2")).toBeUndefined();

    });
    it("a refused read hydrates from the initial state without writing, and a later change writes", async () => {

        const inner = cache.memory();
        let deny = true;
        const storage = cache.driver({
            get: ( key ) => {

                if ( deny ) throw new Error("unreadable");

                return inner.get(key);

            },
            set: ( key, value ) => inner.set(key, value),
            delete: ( key ) => inner.delete(key),
            keys: () => inner.keys(),
            lock: inner.lock,
        });
        const faults: string[] = [];

        await inner.set("bag@2", JSON.stringify({ v: { version: 1, state: { items: ["saved"] } } }));

        const made = bag(cache.open({ storage }), {}, faults);

        await made.hydrate();
        await made.flush();
        expect([made.getState().ready, made.getState().items, faults]).toEqual([true, [], ["unavailable/state.refused"]]);
        expect(await cache.open({ storage: inner }).get("bag@2")).toEqual({ version: 1, state: { items: ["saved"] } });
        deny = false;
        made.getState().add("x");
        await made.flush();
        expect(await cache.open({ storage: inner }).get("bag@2")).toEqual({ version: 1, state: { items: ["x"], user: null, n: 0 } });

    });
    it("synced instances hear each other's writes and removals, skip their own echoes, and stop listening on stop", async () => {

        const storage = cache.memory();
        const a = bag(cache.open({ storage }), { sync: true });
        const b = bag(cache.open({ storage }), { sync: true });
        const c = bag(cache.open({ storage }), {});
        let heardA = 0;

        await Promise.all([a.hydrate(), b.hydrate(), c.hydrate()]);
        a.subscribe(() => { heardA += 1; });
        a.getState().add("z");
        a.getState().put(1);
        await a.flush();
        await tick(2);
        expect([heardA, b.getState().items, b.getState().n, c.getState().items]).toEqual([2, ["z"], 1, []]);
        b.getState().add("y");
        await b.flush();
        await tick(2);
        expect([a.getState().items, b.getState().items]).toEqual([["z", "y"], ["z", "y"]]);

        for ( let turn = 0; turn < 40; turn += 1 ) a.getState().put(100 + turn);

        await a.flush();
        await tick(2);
        expect([a.getState().n, b.getState().n]).toEqual([139, 139]);
        b.stop();
        a.getState().add("x");
        await a.flush();
        await tick(2);
        expect([a.getState().items, b.getState().items]).toEqual([["z", "y", "x"], ["z", "y"]]);
        await a.forget();
        await tick(2);
        expect([a.getState().items, b.getState().items, await cache.open({ storage }).get("bag@2")]).toEqual([["z", "y", "x"], ["z", "y"], undefined]);

        const d = bag(cache.open({ storage }), { sync: true });

        await d.hydrate();
        await tick(2);
        expect([d.getState().items, a.getState().items]).toEqual([[], ["z", "y", "x"]]);
        a.getState().put(7);
        await a.flush();
        await tick(2);
        expect([d.getState().n, d.getState().items]).toEqual([7, ["z", "y", "x"]]);
        a.stop();
        d.stop();

    });
    it("a sibling write that equals a refused own write is still heard, and a sibling removal after a refused forget still resets", async () => {

        const inner = cache.memory();
        let deny = false;
        const a = bag(cache.open({ storage: refusing(inner, () => deny) }), { sync: true });
        const b = bag(cache.open({ storage: inner }), { sync: true });

        await Promise.all([a.hydrate(), b.hydrate()]);
        deny = true;
        a.getState().put(5);
        await a.flush();
        deny = false;
        b.getState().put(6);
        await b.flush();
        await tick(2);
        expect([a.getState().n, b.getState().n]).toEqual([6, 6]);
        b.getState().put(5);
        await b.flush();
        await tick(2);
        expect([a.getState().n, b.getState().n]).toEqual([5, 5]);
        deny = true;
        expect(await rejected(a.forget())).toBe("unavailable/state.refused");
        deny = false;
        await b.forget();
        await tick(2);
        expect([a.getState().n, b.getState().n]).toEqual([0, 5]);
        a.stop();
        b.stop();

    });
    it("a definition refuses shadowed keys and bad versions at the door", async () => {

        const box = cache.open({ storage: cache.memory() });

        expect(told(await rejected(Promise.resolve().then(() => state.define<{ ready: boolean }, { x: () => void }>({ name: "s", initial: { ready: false }, actions: () => ({ x: () => undefined }) }).create())))).toBe("internal/state.shadow");
        expect(told(await rejected(Promise.resolve().then(() => state.define<{ kept: boolean }, { x: () => void }>({ name: "s", initial: { kept: false }, actions: () => ({ x: () => undefined }) }).create())))).toBe("internal/state.shadow");
        expect(told(await rejected(Promise.resolve().then(() => state.define<{ n: number }, { n: () => void }>({ name: "s", initial: { n: 1 }, actions: () => ({ n: () => undefined }) }).create())))).toBe("internal/state.shadow");
        expect(told(await rejected(Promise.resolve().then(() => state.define<{ n: number }, { ready: () => void }>({ name: "s", initial: { n: 1 }, actions: () => ({ ready: () => undefined }) }).create())))).toBe("internal/state.shadow");

        for ( const version of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY, 2 ** 53] ) expect(told(await rejected(Promise.resolve().then(() => state.define<Bag, BagActions>({ name: "s", initial: { items: [], user: null, n: 0 }, actions: () => ({ add: () => undefined, put: () => undefined, sign: () => undefined }), persist: { box, version } }))))).toBe("RangeError: not a version");

        expect(state.define<Bag, BagActions>({ name: "s", initial: { items: [], user: null, n: 0 }, actions: () => ({ add: () => undefined, put: () => undefined, sign: () => undefined }), persist: { box, version: 0 } }).create().key).toBe("s@2");

    });
    it("an action joins its own flight from inside a notification, settles superseded callers, aborts and resets", async () => {

        let calls = 0;
        let depth = 0;
        const save = state.action<string, string>(async ( input, signal ) => {

            calls += 1;
            await tick(1);

            if ( signal.aborted ) throw new Error("aborted");

            return input.toUpperCase();

        }, { mode: "first" });

        save.subscribe(( current ) => {

            depth += 1;

            if ( current.status === "running" ) void save.run("inner");

        });

        expect(await save.run("outer")).toBe("OUTER");
        expect([calls, depth, save.getState()]).toEqual([1, 2, { status: "done", result: "OUTER", error: undefined, runs: 1 }]);

        const joined = save.run("one");

        expect(await Promise.all([joined, save.run("two")])).toEqual(["ONE", "ONE"]);
        expect([calls, save.getState().runs]).toEqual([2, 2]);

        const latest = state.action<string, string>(async ( input, signal ) => {

            await tick(input === "slow" ? 10 : 1);

            if ( signal.aborted ) throw new Error("aborted");
            if ( input === "bad" ) throw error.fault("conflict", "x");

            return input;

        });
        const slow = latest.run("slow");
        const quick = latest.run("quick");

        expect([await quick, await slow]).toEqual(["quick", undefined]);
        expect(latest.getState()).toMatchObject({ status: "done", result: "quick", runs: 2 });
        expect(await latest.run("bad")).toBeUndefined();
        expect([latest.getState().status, told(latest.getState().error)]).toEqual(["failed", "conflict/x"]);

        const pending = latest.run("slow");

        latest.abort();
        expect([await pending, latest.getState().status]).toEqual([undefined, "done"]);
        latest.reset();
        expect(latest.getState()).toEqual({ status: "idle", result: undefined, error: undefined, runs: 4 });
        latest.abort();
        expect(latest.getState().status).toBe("idle");

        const running = latest.run("slow");

        latest.reset();
        expect([await running, latest.getState().status]).toEqual([undefined, "idle"]);

        const thrower = state.action<number, number>(( input ) => { throw new RangeError(`${input}`); });

        expect(await thrower.run(1)).toBeUndefined();
        expect(told(thrower.getState().error)).toBe("internal/undefined");

    });
    it("a resource loads once for many ensures, including from inside its own notification, goes stale on the clock and bends to set and update", async () => {

        await faked(async () => {

            let loads = 0;
            let depth = 0;
            const now = { at: 1000 };
            const users = state.resource<string[]>({ load: async () => { loads += 1; return [`load-${loads}`]; }, staleAfter: 50, now: () => now.at });

            users.subscribe(( current ) => {

                depth += 1;

                if ( current.status === "pending" ) void users.ensure();

            });
            expect(users.getState()).toEqual({ status: "idle", data: undefined, error: undefined, at: 0, stale: false });

            const first = users.ensure();
            const second = users.ensure();

            expect(users.getState().status).toBe("pending");
            expect([await first, await second, loads, depth]).toEqual([["load-1"], ["load-1"], 1, 2]);
            expect(users.getState()).toMatchObject({ status: "done", data: ["load-1"], at: 1000, stale: false });
            expect(await users.ensure()).toEqual(["load-1"]);
            expect(loads).toBe(1);
            jest.advanceTimersByTime(50);
            expect(users.getState().stale).toBe(true);
            now.at = 2000;
            expect(await users.ensure()).toEqual(["load-2"]);
            expect(users.getState()).toMatchObject({ status: "done", data: ["load-2"], at: 2000, stale: false });
            users.set(["manual"]);
            expect(users.getState()).toMatchObject({ status: "done", data: ["manual"], stale: false });
            users.update(( current ) => [...(current ?? []), "more"]);
            expect(users.getState().data).toEqual(["manual", "more"]);
            jest.advanceTimersByTime(49);
            expect(users.getState().stale).toBe(false);
            jest.advanceTimersByTime(1);
            expect(users.getState().stale).toBe(true);

            const refreshing = users.refresh();

            users.set(["won"]);
            expect([await refreshing, users.getState().data, loads]).toEqual([undefined, ["won"], 3]);
            users.reset();
            jest.advanceTimersByTime(100);
            expect(users.getState()).toEqual({ status: "idle", data: undefined, error: undefined, at: 0, stale: false });

        });

        const failing = state.resource<number>({ load: async () => { throw new Error("nope"); } });

        expect(await failing.refresh()).toBeUndefined();
        expect([failing.getState().status, told(failing.getState().error)]).toEqual(["failed", "internal/undefined"]);
        failing.reset();
        expect(failing.getState().status).toBe("idle");

        const seeded = state.resource<number>({ load: async () => 2, seed: 1 });

        expect(seeded.getState()).toMatchObject({ status: "done", data: 1, stale: true });
        expect(await seeded.ensure()).toBe(2);

        const hanging = state.resource<number>({ load: () => new Promise(() => undefined) });
        const stuck = hanging.refresh();

        hanging.abort();
        expect([await stuck, hanging.getState().status]).toEqual([undefined, "idle"]);
        hanging.abort();
        expect(hanging.getState().status).toBe("idle");

        for ( const bad of [Number.NaN, -1] ) expect(() => state.resource<number>({ load: async () => 1, staleAfter: bad })).toThrow(new RangeError("not a duration"));

        expect(state.resource<number>({ load: async () => 1, staleAfter: Number.POSITIVE_INFINITY, seed: 3 }).getState().stale).toBe(true);

    });
    it("a feed refuses a malformed page or a throwing key without losing a page, and recovers on the next load", async () => {

        let turn = 0;
        const made = state.feed<{ id: string }>({
            key: ( item ) => {

                if ( item.id === "bad" ) throw new Error("no key");

                return item.id;

            },
            load: async () => {

                turn += 1;

                if ( turn === 1 ) return { items: [{ id: "a" }, { id: "bad" }], next: "n" };
                if ( turn === 2 ) return { items: [{ id: "a" }], next: null } as unknown as { items: { id: string }[]; next: string | null; } & { next: number };
                if ( turn === 3 ) return undefined as unknown as state.Page<{ id: string }>;

                return { items: [{ id: "a" }, { id: "b" }], next: null };

            },
        });

        await made.more();
        expect([made.getState().status, made.getState().items, told(made.getState().failure)]).toEqual(["failed", [], "internal/undefined"]);
        await made.more();
        expect(made.getState().items.map(( item ) => item.id)).toEqual(["a"]);
        made.reset();
        turn = 2;
        await made.more();
        expect([made.getState().status, made.getState().items, told(made.getState().failure)]).toEqual(["failed", [], "internal/feed.page"]);
        await made.more();
        expect(made.getState().items.map(( item ) => item.id)).toEqual(["a", "b"]);
        expect(made.getState()).toMatchObject({ ended: true, status: "done", next: null, failure: undefined });

        const numeric = state.feed<{ id: string }>({ key: ( item ) => item.id, load: async () => ({ items: [{ id: "a" }], next: 5 }) as unknown as state.Page<{ id: string }> });

        await numeric.more();
        expect([numeric.getState().status, numeric.getState().items, told(numeric.getState().failure)]).toEqual(["failed", [], "internal/feed.page"]);

        const partial = state.feed<{ id: string }>({ key: ( item ) => item.id, load: async () => ({ items: [{ id: "a" }, { id: "b" }], next: "x" }) });

        await partial.more();
        turn = 0;

        const dupes = state.feed<{ id: string }>({ key: ( item ) => item.id, load: async () => ({ items: [{ id: "a" }, { id: "a" }, { id: "b" }], next: null }) });

        await dupes.more();
        expect(dupes.getState().items.map(( item ) => item.id)).toEqual(["a", "b"]);

    });
    it("a feed asked for more from inside its own notification loads one page, keeps items while refreshing, and restores on abort", async () => {

        let loads = 0;
        let depth = 0;
        const made = state.feed<{ id: string }>({ key: ( item ) => item.id, load: async ( cursor ) => { loads += 1; return { items: [{ id: `${cursor ?? "s"}-${loads}` }], next: loads < 3 ? `c${loads}` : null }; } });

        made.subscribe(( current ) => {

            depth += 1;

            if ( current.status === "loading" && depth < 20 ) void made.more();

        });
        await made.more();
        expect([loads, depth, made.getState().items.length, made.getState().status]).toEqual([1, 2, 1, "done"]);

        let release: (() => void) | undefined;
        const slow = state.feed<{ id: string }>({ key: ( item ) => item.id, load: ( cursor ) => new Promise(( resolve ) => { release = () => resolve({ items: [{ id: `${cursor ?? "s"}` }], next: cursor === null ? "p2" : null }); }) });

        await Promise.all([slow.more(), (release?.(), Promise.resolve())]);
        expect(slow.getState().items.map(( item ) => item.id)).toEqual(["s"]);

        const refreshing = slow.refresh();

        expect([slow.getState().status, slow.getState().items.length]).toEqual(["refreshing", 1]);
        slow.put({ id: "extra" }, "end");
        expect(slow.getState().items.map(( item ) => item.id)).toEqual(["s", "extra"]);
        release?.();
        await refreshing;
        expect([slow.getState().status, slow.getState().items.map(( item ) => item.id)]).toEqual(["done", ["s"]]);

        const more = slow.more();

        expect(slow.getState().status).toBe("loading");
        slow.abort();
        await more;
        expect([slow.getState().status, slow.getState().items.length, slow.getState().next]).toEqual(["done", 1, "p2"]);
        slow.abort();
        expect(slow.getState().status).toBe("done");
        slow.drop("s");
        slow.drop("s");
        slow.put({ id: "z" });
        slow.put({ id: "z" });
        expect(slow.getState().items.map(( item ) => item.id)).toEqual(["z"]);
        slow.reset();
        expect(slow.getState()).toEqual({ items: [], next: null, ended: false, status: "idle", failure: undefined });

        const racing = slow.more();

        release?.();
        await racing;
        expect(slow.getState().items.map(( item ) => item.id)).toEqual(["s"]);

    });
    it("derive and combine read stores and signals alike, keep snapshot identity and fire once per real change", () => {

        const bagged = bag(cache.open({ storage: cache.memory() }));
        const flag = event.signal(false);
        const count = state.derive(bagged, ( current ) => current.items.length);
        const on = state.derive(flag, ( value ) => value);
        const both = state.combine({ count, on, n: state.derive(bagged, ( current ) => current.n) });
        const fired: string[] = [];
        const stop = both.subscribe(( value, before ) => { fired.push(`${before.count}${before.on ? "+" : "-"}${before.n}>${value.count}${value.on ? "+" : "-"}${value.n}`); });
        const first = both.getState();

        expect(first).toEqual({ count: 0, on: false, n: 0 });
        expect(both.getState()).toBe(first);
        bagged.getState().sign({ id: 1 });
        expect(both.getState()).toBe(first);
        bagged.getState().add("a");
        flag.set(true);
        flag.set(true);
        bagged.getState().put(2);
        expect(fired).toEqual(["0-0>1-0", "1-0>1+0", "1+0>1+2"]);
        expect(both.getState()).toEqual({ count: 1, on: true, n: 2 });
        stop();
        flag.set(false);
        expect(fired).toHaveLength(3);
        expect(both.getState().on).toBe(false);

        const squared = state.derive(count, ( value ) => ({ value: value * value }), ( a, b ) => a.value === b.value);
        const seen: { value: number }[] = [];
        const off = squared.subscribe(( value ) => { seen.push(value); });
        const snapshot = squared.getState();

        bagged.getState().put(9);
        expect(squared.getState()).toBe(snapshot);
        bagged.getState().add("b");
        expect([seen, squared.getState()]).toEqual([[{ value: 4 }], { value: 4 }]);
        off();
        expect(state.readable(flag).getState()).toBe(false);
        expect(state.readable(bagged)).toBe(bagged);
        expect([state.shallow({ a: 1 }, { a: 1 }), state.shallow([1, 2], [1, 2]), state.shallow({ a: 1 }, { a: 1, b: 2 }), state.shallow([1], { 0: 1 }), state.shallow(new Map(), new Map()), state.shallow(Number.NaN, Number.NaN), state.shallow({ a: {} }, { a: {} })]).toEqual([true, true, false, false, false, true, false]);

    });
    it("bindings pick shallow slices, serve a server snapshot and memoize per selector", () => {

        const bagged = bag(cache.open({ storage: cache.memory() }));
        const server: state.State<Bag, BagActions> = { items: ["server"], user: null, n: -1, ready: true, kept: false, add: () => undefined, put: () => undefined, sign: () => undefined };
        const bound = state.bind(bagged, () => server);
        const picks: Pick<state.State<Bag, BagActions>, "items" | "n">[] = [];

        bagged.getState().add("a");

        function Picked (): string {

            const [turn, setTurn] = useState(0);

            picks.push(bound.usePick("items", "n"));

            if ( turn < 1 ) setTurn(1);

            return `${picks[picks.length - 1]?.items.join(",")}:${picks[picks.length - 1]?.n}`;

        }

        expect(renderToStaticMarkup(createElement(Picked))).toBe("server:-1");
        expect(picks[1]).toBe(picks[0]);
        expect(bound.select(( current ) => current.items)).toEqual(["a"]);
        expect(bound.select(( current ) => current.n)).toBe(0);

        const plain = state.bind(bagged);

        expect(renderToStaticMarkup(createElement(() => plain.useSelect(( current ) => current.items.join("|"))))).toBe("a");
        expect(renderToStaticMarkup(createElement(() => String(plain.usePick("n").n)))).toBe("0");

    });
    it("survivors: frozen instances stay quiet and cheap, a null saved state is junk, a reset before hydration holds against a refused write", async () => {

        const { storage, calls } = counted();
        const faults: string[] = [];
        const a = bag(cache.open({ storage }), { version: 2, sync: true }, faults);
        const b = bag(cache.open({ storage }), { version: 3, sync: true });

        await Promise.all([a.hydrate(), b.hydrate()]);
        b.getState().add("b1");
        await b.flush();
        await tick(2);
        expect([a.getState().kept, faults]).toEqual([false, ["conflict/state.newer"]]);
        b.getState().add("b2");
        await b.flush();
        await tick(2);

        const reads = calls.get;

        a.getState().add("a1");
        a.getState().put(3);
        await a.flush();
        a.reset();
        await a.flush();
        expect([faults, calls.get, a.getState().kept]).toEqual([["conflict/state.newer"], reads, false]);
        a.stop();
        b.stop();

        const box = cache.open({ storage: cache.memory() });

        await box.set("bag@2", { version: 1, state: null });

        const junk = bag(box, {}, faults);

        await junk.hydrate();
        await junk.flush();
        expect([junk.getState().items, junk.getState().kept, faults.slice(1), await box.get("bag@2")]).toEqual([[], true, [], { version: 1, state: null }]);
        await box.set("bag@2", { version: 9, state: null });

        const tall = bag(box, {}, faults);

        await tall.hydrate();
        tall.getState().add("over");
        await tall.flush();
        expect([tall.getState().kept, faults.slice(1), await box.get("bag@2")]).toEqual([true, [], { version: 1, state: { items: ["over"], user: null, n: 0 } }]);
        expect((await cache.open({ storage }).get<{ by?: string }>("bag@2"))?.by).toMatch(/^[0-9a-z]{8,}$/);

        let deny = true;
        const inner = cache.memory();
        const guarded = cache.open({ storage: refusing(inner, () => deny) });

        await cache.open({ storage: inner }).set("bag@2", { version: 1, state: { items: ["saved"], n: 5 } });

        const early = bag(guarded, {}, faults);

        early.getState().add("boot");
        early.reset();
        await tick(2);
        deny = false;
        await early.hydrate();
        expect(early.getState()).toMatchObject({ items: [], n: 0, ready: true });
        await early.flush();
        expect(await cache.open({ storage: inner }).get("bag@2")).toEqual({ version: 1, state: { items: [], user: null, n: 0 } });

        const bare = cache.driver({ get: () => null, set: () => undefined, delete: () => undefined, keys: () => [] });
        const unguarded = bag(cache.open({ storage: bare }), {}, faults);

        unguarded.reset();
        unguarded.getState().add("x");
        await unguarded.flush();
        expect([unguarded.getState().kept, faults.slice(-1)]).toEqual([false, ["unavailable/state.unguarded"]]);

    });
    it("survivors: own echoes delivered late never move the instance, and a prefixed box locks under its prefixed key", async () => {

        const data = new Map<string, string>();
        const listeners = new Map<string, Set<cache.Change>>();
        const queued: (() => void)[] = [];
        const fire = ( key: string, value: string | null ): void => {

            for ( const onChange of listeners.get(key) ?? [] ) queued.push(() => onChange(value));

        };
        const delayed: cache.Storage = {
            get: async ( key ) => data.get(key) ?? null,
            set: async ( key, value ) => {

                data.set(key, value);
                fire(key, value);

            },
            delete: async ( key ) => {

                data.delete(key);
                fire(key, null);

            },
            keys: async () => [...data.keys()],
            lock: cache.serial(),
            watch: ( key, onChange ) => {

                const set = listeners.get(key) ?? new Set<cache.Change>();

                set.add(onChange);
                listeners.set(key, set);

                return () => set.delete(onChange);

            },
        };
        const a = bag(cache.open({ storage: delayed }), { sync: true });
        const b = bag(cache.open({ storage: delayed }), { sync: true });
        const moves: number[] = [];

        await Promise.all([a.hydrate(), b.hydrate()]);
        a.subscribe(( current ) => { moves.push(current.n); });

        for ( let turn = 1; turn <= 20; turn += 1 ) {

            a.getState().put(turn);
            await a.flush();

        }

        expect([moves.length, queued.length, b.getState().n]).toEqual([20, 40, 0]);

        for ( const deliver of queued.splice(0) ) deliver();

        await tick(2);
        expect([moves.length, a.getState().n, b.getState().n]).toEqual([20, 20, 20]);
        b.getState().put(7);
        await b.flush();

        for ( const deliver of queued.splice(0) ) deliver();

        await tick(2);
        expect([moves.length, a.getState().n, queued.length]).toEqual([21, 7, 0]);
        a.getState().sign({ id: 1 });
        await a.flush();

        for ( const deliver of queued.splice(0) ) deliver();

        await tick(2);
        b.getState().sign({ id: 1 });
        await b.flush();
        expect(queued.length).toBe(2);

        for ( const deliver of queued.splice(0) ) deliver();

        await tick(2);
        await a.flush();
        expect([moves.length, a.getState().user, queued.length]).toEqual([22, { id: 1 }, 0]);
        a.stop();
        b.stop();

        const gate = gated();
        const prefixed = cache.open({ storage: gate.storage, prefix: "app" });

        await prefixed.update("k", () => 1, { exclusive: true });
        expect(gate.log).toEqual(["acquire app.k", "release app.k"]);

    });
    it("survivors: actions superseded from inside their own notification settle undefined and a reset clears a failure", async () => {

        let calls = 0;
        const latest = state.action<string, string>(async ( input ) => {

            calls += 1;
            await tick(1);

            if ( input === "bad" ) throw new Error("bad");

            return input;

        });
        let inner: Promise<string | undefined> | undefined;
        let asked = false;

        latest.subscribe(( current ) => {

            if ( current.status === "running" && !asked ) {

                asked = true;
                inner = latest.run("inner");

            }

        });

        const outer = latest.run("outer");

        expect([await outer, await inner, calls, latest.getState().runs]).toEqual([undefined, "inner", 1, 2]);
        expect(latest.getState()).toMatchObject({ status: "done", result: "inner" });
        await latest.run("bad");
        expect([latest.getState().status, latest.getState().error?.code]).toEqual(["failed", "internal"]);
        latest.reset();
        expect(latest.getState()).toEqual({ status: "idle", result: undefined, error: undefined, runs: 3 });

    });
    it("survivors: a resource restarts its stale clock on set, keeps done on an abort with data, and a feed replaces and revives by key", async () => {

        await faked(async () => {

            const made = state.resource<number>({ load: async () => 1, staleAfter: 50 });

            await made.refresh();
            jest.advanceTimersByTime(40);
            made.set(2);
            jest.advanceTimersByTime(10);
            expect(made.getState().stale).toBe(false);
            jest.advanceTimersByTime(40);
            expect(made.getState().stale).toBe(true);

            const hanging = made.refresh();

            expect(made.getState().status).toBe("pending");
            made.abort();
            expect([await hanging, made.getState().status, made.getState().data]).toEqual([undefined, "done", 2]);

        });

        const feed = state.feed<{ id: string; tag: number }>({ key: ( item ) => item.id, load: async () => ({ items: [{ id: "a", tag: 1 }, { id: "b", tag: 1 }], next: null }) });

        await feed.more();
        feed.put({ id: "a", tag: 2 });
        expect(feed.getState().items).toEqual([{ id: "a", tag: 2 }, { id: "b", tag: 1 }]);
        feed.drop("a");
        feed.put({ id: "a", tag: 3 }, "end");
        expect(feed.getState().items).toEqual([{ id: "b", tag: 1 }, { id: "a", tag: 3 }]);

    });
    it("survivors: derived picks run once per source state, equal picks keep identity, and combined listeners stay quiet on unchanged parts", () => {

        const bagged = bag(cache.open({ storage: cache.memory() }));
        let picks = 0;
        const shape = state.derive(bagged, ( current ) => {

            picks += 1;

            return { count: current.items.length };

        }, ( a, b ) => a.count === b.count);
        const first = shape.getState();

        expect([shape.getState(), picks]).toEqual([first, 1]);
        expect(shape.getState()).toBe(first);
        bagged.getState().put(5);
        expect([shape.getState(), picks]).toEqual([first, 2]);
        expect(shape.getState()).toBe(first);

        const count = state.derive(bagged, ( current ) => current.items.length);
        const only = state.combine({ count });
        let fired = 0;
        const stop = only.subscribe(() => { fired += 1; });

        bagged.getState().sign({ id: 1 });
        bagged.getState().put(7);
        expect(fired).toBe(0);
        bagged.getState().add("a");
        expect(fired).toBe(1);
        stop();

        const listeners = new Set<( state: number, previous: number ) => void>();
        const noisy: state.Readable<number> = { getState: () => 1, subscribe: ( listener ) => {

            listeners.add(listener);

            return () => listeners.delete(listener);

        } };
        const mixed = state.combine({ noisy, count });
        let heard = 0;
        const quiet = mixed.subscribe(() => { heard += 1; });

        for ( const listener of listeners ) listener(1, 1);

        expect([heard, listeners.size]).toEqual([0, 1]);
        quiet();
        expect(listeners.size).toBe(0);
        expect([state.shallow({ length: 1, 0: 1 }, [1]), state.shallow([1], { length: 1, 0: 1 })]).toEqual([false, false]);

    });
});
