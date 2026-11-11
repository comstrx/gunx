import { describe, expect, test as it } from "bun:test";
import * as adapter from "engine/adapter";
import * as error from "engine/error";

type Clock = { now: () => number };

describe("adapter", () => {

    it("a port binds, falls back, restores in order and refuses what fails its check", async () => {

        const clock = adapter.port<Clock>("clock", { fallback: () => ({ now: () => 0 }), check: ( value ) => typeof value.now === "function" });
        const seen: boolean[] = [];
        const stop = clock.watch(() => { seen.push(clock.bound()); });

        expect(clock.get().now()).toBe(0);
        expect(clock.has() && !clock.bound()).toBe(true);

        const first = clock.use({ now: () => 1 });
        const second = clock.use({ now: () => 2 });

        expect(clock.get().now()).toBe(2);
        expect(clock.bound()).toBe(true);
        first();
        expect(clock.get().now()).toBe(2);
        second();
        expect(clock.get().now()).toBe(0);
        expect(clock.with({ now: () => 7 }, () => clock.get().now())).toBe(7);
        expect(await clock.with({ now: () => 8 }, async () => clock.get().now())).toBe(8);
        expect(clock.get().now()).toBe(0);
        expect(() => clock.with({ now: () => 9 }, () => { throw new Error("boom"); })).toThrow("boom");
        expect(clock.bound()).toBe(false);
        expect(() => clock.use({ now: "x" } as unknown as Clock)).toThrow(error.Fault);

        let made = 0;

        clock.lazy(() => { made += 1; return { now: () => 5 }; });
        expect(made).toBe(0);
        expect(clock.get().now()).toBe(5);
        expect(clock.peek()?.now()).toBe(5);
        expect(made).toBe(1);
        clock.reset();
        expect(clock.bound()).toBe(false);
        expect(seen).toEqual([true, true, true, false, true, false, true, false, true, false, true, false]);
        stop();

        const bare = adapter.port<Clock>("bare");

        expect(bare.has()).toBe(false);
        expect(bare.peek()).toBeUndefined();
        expect(() => bare.get()).toThrow(error.Fault);

        const caught = error.attemptSync(() => bare.get());

        expect(caught.ok ? undefined : caught.fault.reason).toBe("bare.unbound");

    });
    it("a family registers kinds, prefers one and resolves lazily", () => {

        const drivers = adapter.family<{ name: string }>("drivers");
        let made = 0;

        expect(() => drivers.pick()).toThrow(error.Fault);

        const undo = drivers.lazy("memory", () => { made += 1; return { name: "memory" }; });

        drivers.add("local", { name: "local" });
        expect(drivers.kinds()).toEqual(["local", "memory"]);
        expect(drivers.preferred()).toBe("memory");
        expect(made).toBe(0);
        expect(drivers.pick().name).toBe("memory");
        expect(drivers.pick().name).toBe("memory");
        expect(made).toBe(1);
        drivers.prefer("local");
        expect(drivers.pick().name).toBe("local");
        expect(drivers.pick("memory").name).toBe("memory");
        expect(drivers.peek("nope")).toBeUndefined();
        expect(() => drivers.pick("nope")).toThrow(error.Fault);
        expect(drivers.has("local") && !drivers.has("nope")).toBe(true);
        undo();
        expect(drivers.kinds()).toEqual(["local"]);
        drivers.reset();
        expect(drivers.kinds()).toEqual([]);

    });
    it("a lazy adapter is checked, retried after a failed make and may decorate the one beneath it", () => {

        const clock = adapter.port<Clock>("lazy.clock", { fallback: () => ({ now: () => 1 }), check: ( value ) => typeof value.now === "function" });
        const wrong = clock.lazy(() => ({ now: "x" }) as unknown as Clock);
        const refused = error.attemptSync(() => clock.get());

        expect(refused.ok ? undefined : refused.fault.reason).toBe("lazy.clock.rejected");
        wrong();
        expect(clock.get().now()).toBe(1);

        const strict = adapter.port<Clock>("lazy.strict", { check: () => { throw new Error("bad check"); } });
        const thrown = error.attemptSync(() => strict.use({ now: () => 1 }));

        expect(thrown.ok ? undefined : thrown.fault.reason).toBe("lazy.strict.rejected");
        expect(strict.bound()).toBe(false);

        let tries = 0;
        const cold = clock.lazy(() => {

            tries += 1;

            if ( tries === 1 ) throw new Error("cold");

            return { now: () => 3 };

        });

        expect(() => clock.get()).toThrow("cold");
        expect(clock.get().now()).toBe(3);
        expect(clock.get().now()).toBe(3);
        expect(tries).toBe(2);
        cold();

        const base = clock.use({ now: () => 10 });
        const top = clock.lazy(() => {

            const under = clock.get();

            return { now: () => under.now() + 1 };

        });

        expect(clock.get().now()).toBe(11);
        top();
        expect(clock.get().now()).toBe(10);
        base();

        const over = clock.lazy(() => {

            const under = clock.get();

            return { now: () => under.now() + 100 };

        });

        expect(clock.get().now()).toBe(101);
        over();

        const alone = adapter.port<Clock>("lazy.alone");

        alone.lazy(() => alone.get());

        const lonely = error.attemptSync(() => alone.get());

        expect(lonely.ok ? undefined : lonely.fault.reason).toBe("lazy.alone.unbound");

        const looped: adapter.Port<Clock> = adapter.port<Clock>("lazy.looped", { fallback: () => looped.get() });
        const circular = error.attemptSync(() => looped.get());

        expect(circular.ok ? undefined : circular.fault.reason).toBe("lazy.looped.unbound");

    });
    it("a throwing watcher never leaves a port half bound and never silences the others", async () => {

        const clock = adapter.port<Clock>("watch.clock");
        const seen: boolean[] = [];
        const stopBad = clock.watch(() => { throw new Error("watcher"); });
        const stopGood = clock.watch(() => { seen.push(clock.bound()); });

        expect(() => clock.use({ now: () => 1 })).toThrow("watcher");
        expect(clock.bound()).toBe(false);
        expect(seen).toEqual([true, false]);
        expect(() => clock.with({ now: () => 2 }, () => 0)).toThrow("watcher");
        expect(clock.bound()).toBe(false);
        stopBad();

        const undo = clock.use({ now: () => 3 });
        const stopLate = clock.watch(() => { throw new Error("late"); });

        expect(() => undo()).toThrow("late");
        expect(clock.bound()).toBe(false);
        expect(() => undo()).not.toThrow();
        stopLate();
        stopGood();
        await expect(clock.with({ now: () => 4 }, async () => { throw new Error("async"); })).rejects.toThrow("async");
        expect(clock.bound()).toBe(false);

        const slow = clock.with({ now: () => 5 }, () => Promise.resolve().then(() => clock.get().now()));

        expect(clock.bound()).toBe(true);
        expect(await slow).toBe(5);
        expect(clock.bound()).toBe(false);

    });
    it("a family holds function adapters, stacks a kind and forgets stale restores", () => {

        const makers = adapter.family<() => number>("makers");

        makers.add("one", () => 1);
        makers.lazy("two", () => () => 2);
        expect(makers.pick("one")()).toBe(1);
        expect(makers.pick("two")()).toBe(2);

        const first = makers.add("one", () => 10);
        const second = makers.add("one", () => 20);

        expect(makers.pick("one")()).toBe(20);
        first();
        expect(makers.pick("one")()).toBe(20);
        second();
        expect(makers.pick("one")()).toBe(1);
        second();
        expect(makers.pick("one")()).toBe(1);

        const stale = makers.add("three", () => 3);

        makers.reset();
        makers.add("three", () => 30);
        stale();
        expect(makers.pick("three")()).toBe(30);
        expect(makers.preferred()).toBe("three");

        const self = adapter.family<{ name: string }>("self");

        self.lazy("loop", () => self.pick("loop"));

        const looped = error.attemptSync(() => self.pick("loop"));

        expect(looped.ok ? undefined : looped.fault.reason).toBe("self.unknown");
        self.add("base", { name: "base" });
        self.lazy("base", () => ({ name: `${self.pick("base").name}+` }));
        expect(self.pick("base").name).toBe("base+");

    });
    it("a bundle installs many ports at once and reports its matrix", () => {

        const clock = adapter.port<Clock>("b.clock", { fallback: () => ({ now: () => 0 }) });
        const name = adapter.port<string>("b.name");
        const all = adapter.bundle({ clock, name });

        expect(all.names()).toEqual(["clock", "name"]);
        expect(all.matrix()).toEqual({ clock: "fallback", name: "unbound" });
        expect(all.missing()).toEqual(["name"]);

        const restore = all.use({ clock: { now: () => 3 }, name: "web" });

        expect(all.matrix()).toEqual({ clock: "bound", name: "bound" });
        expect(name.get()).toBe("web");
        restore();
        expect(all.missing()).toEqual(["name"]);
        all.use({ name: "x" });
        all.reset();
        expect(all.matrix()).toEqual({ clock: "fallback", name: "unbound" });

    });
    it("a bundle binds all or nothing, scopes a binding and watches every port", async () => {

        const name = adapter.port<string>("r.name");
        const clock = adapter.port<Clock>("r.clock", { check: ( value ) => typeof value.now === "function" });
        const all = adapter.bundle({ name, clock });
        let changes = 0;

        expect(() => all.use({ name: "x", clock: { now: "x" } as unknown as Clock })).toThrow(error.Fault);
        expect(all.matrix()).toEqual({ clock: "unbound", name: "unbound" });
        expect(all.with({ name: "scoped" }, () => name.get())).toBe("scoped");
        expect(await all.with({ name: "later" }, async () => name.get())).toBe("later");
        expect(() => all.with({ name: "thrown" }, () => { throw new Error("boom"); })).toThrow("boom");
        expect(name.bound()).toBe(false);
        all.use(Object.create({ name: "ghost" }) as { name?: string });
        expect(name.bound()).toBe(false);

        const stop = all.watch(() => { changes += 1; });
        const undo = all.use({ name: "a", clock: { now: () => 1 } });

        expect(changes).toBe(2);
        undo();
        expect(changes).toBe(4);
        undo();
        expect(changes).toBe(4);
        stop();
        all.use({ name: "b" });
        expect(changes).toBe(4);
        all.reset();
        expect(all.missing()).toEqual(["clock", "name"]);

    });
    it("runtime facts, probes and capability helpers read the host without throwing", () => {

        const here = adapter.runtime();

        expect(here.runtime).toBe("bun");
        expect(here.server).toBe(true);
        expect(adapter.runtime({ navigator: { product: "ReactNative" }, HermesInternal: {} })).toMatchObject({ runtime: "native", server: false, hermes: true });
        expect(adapter.runtime({ document: {}, window: {} }).runtime).toBe("browser");
        expect(adapter.runtime({ importScripts: () => undefined }).runtime).toBe("worker");
        expect(adapter.runtime({ process: { versions: { node: "24" } } }).runtime).toBe("node");
        expect(adapter.runtime({}).runtime).toBe("unknown");
        expect(adapter.probe(() => { throw new Error("x"); })).toBeUndefined();
        expect(adapter.probe(() => 1)).toBe(1);
        expect(adapter.available("Bun") && !adapter.available("definitelyNotAGlobal")).toBe(true);

        const unit = { info: () => 1, copy: async () => true, share: undefined };

        expect(adapter.capabilities(unit)).toEqual(["copy", "info"]);
        expect(adapter.can(unit, "copy") && !adapter.can(unit, "share")).toBe(true);
        expect(() => adapter.ensure(unit, "share", "device")).toThrow(error.Fault);
        expect(adapter.fill<{ a: number; b: number }>({ a: 1, b: undefined }, { a: 0, b: 2 })).toEqual({ a: 1, b: 2 });

    });
    it("an edge host, async probes, inherited capabilities and hostile keys are read as they are", async () => {

        expect(adapter.runtime({ EdgeRuntime: "edge-runtime" })).toMatchObject({ runtime: "edge", server: true });
        expect(adapter.runtime({ navigator: { userAgent: "Cloudflare-Workers" }, process: { versions: { node: "22" } } }).runtime).toBe("edge");
        expect(adapter.runtime({ EdgeRuntime: {} }).runtime).toBe("unknown");
        expect(adapter.runtime({ Bun: {}, EdgeRuntime: "edge-runtime" }).runtime).toBe("bun");
        expect(await adapter.probeAsync(async () => { throw new Error("x"); })).toBeUndefined();
        expect(await adapter.probeAsync(() => { throw new Error("sync"); })).toBeUndefined();
        expect(await adapter.probeAsync(() => Promise.reject(new Error("late")))).toBeUndefined();
        expect(await adapter.probeAsync(() => Promise.resolve(2))).toBe(2);
        expect(await adapter.probeAsync(() => 3)).toBe(3);

        const unit = Object.assign(Object.create({ info: () => 1, gone: undefined }) as adapter.Members, { copy: async () => true });
        const trapped = Object.defineProperty({ fine: 1 }, "broken", { enumerable: true, get: () => { throw new Error("getter"); } }) as adapter.Members;

        expect(adapter.capabilities(unit)).toEqual(["copy", "info"]);
        expect(adapter.can(unit, "info") && adapter.can(unit, "copy") && !adapter.can(unit, "gone")).toBe(true);
        expect(adapter.can(unit, "constructor") || adapter.can({}, "toString") || adapter.can({}, "__proto__")).toBe(false);
        expect(adapter.can({ toString: () => "x" }, "toString")).toBe(true);
        expect(adapter.capabilities({ toString: () => "x", valueOf: undefined })).toEqual(["toString"]);
        expect(adapter.capabilities(Object.create(null) as adapter.Members)).toEqual([]);
        expect(adapter.capabilities(trapped)).toEqual(["fine"]);
        expect(adapter.can(trapped, "broken")).toBe(false);
        expect(() => adapter.ensure(unit, "info", "device")).not.toThrow();

        const hostile = JSON.parse('{"a":1,"__proto__":{"evil":true}}') as { a: number };
        const filled = adapter.fill<{ a: number; b: number }>(hostile, { a: 0, b: 2 });

        expect(filled).toEqual({ a: 1, b: 2 });
        expect(Object.getPrototypeOf(filled)).toBe(Object.prototype);
        expect("evil" in filled).toBe(false);

    });
    it("the host door answers from the host, falls back, or refuses with a named fault", () => {

        expect(typeof adapter.host()).toBe("object");
        expect(adapter.web("x.fetch", ( host ) => host.fetch)()).toBeInstanceOf(Function);
        expect(adapter.web("x.none", ( host ) => host.document?.visibilityState, () => "fallback")()).toBe("fallback");
        expect(() => adapter.web("x.none", ( host ) => host.document?.visibilityState)()).toThrow(error.Fault);
        expect(adapter.web("x.throws", () => { throw new Error("boom"); }, () => 1)()).toBe(1);

    });
});
