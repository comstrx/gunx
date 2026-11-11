import { describe, expect, test as it, jest } from "bun:test";
import * as error from "engine/error";
import * as event from "engine/event";

type Tally = { signal: AbortSignal; fire: ( reason?: unknown ) => void; held: () => number };

function refused ( run: () => unknown ): unknown {

    try {

        run();

    } catch ( failure ) {

        return failure;

    }

    return undefined;

}
async function rejected ( work: PromiseLike<unknown> ): Promise<unknown> {

    try {

        await work;

    } catch ( failure ) {

        return failure;

    }

    return undefined;

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
function tick (): Promise<void> {

    return new Promise(( resolve ) => {

        setTimeout(resolve, 0);

    });

}
function tally (): Tally {

    const heard = new Set<() => void>();
    const state: { aborted: boolean; reason: unknown } = { aborted: false, reason: undefined };
    const signal = {
        get aborted (): boolean {

            return state.aborted;

        },
        get reason (): unknown {

            return state.reason;

        },
        addEventListener: ( _: string, listener: () => void ): void => { heard.add(listener); },
        removeEventListener: ( _: string, listener: () => void ): void => { heard.delete(listener); },
    };

    return {
        signal: signal as unknown as AbortSignal,
        fire: ( reason ) => {

            state.aborted = true;
            state.reason = reason;

            for ( const listener of [...heard] ) {

                heard.delete(listener);
                listener();

            }

        },
        held: () => heard.size,
    };

}

describe("event", () => {

    it("emitters type their payloads and count their listeners", () => {

        const made = event.emitter<{ hit: number; done: string }>();
        const seen: unknown[] = [];
        const stop = made.on("hit", ( n ) => { seen.push(n); });

        made.once("done", ( text ) => { seen.push(text); });
        expect(made.emit("hit", 1)).toBe(1);
        expect(made.emit("done", "a")).toBe(1);
        expect(made.emit("done", "b")).toBe(0);
        expect(made.count()).toBe(1);
        expect(made.names()).toEqual(["hit"]);
        stop();
        expect(made.emit("hit", 2)).toBe(0);
        made.on("hit", () => undefined);
        made.off("hit");
        expect(made.count("hit")).toBe(0);
        expect(seen).toEqual([1, "a"]);
        made.clear();

    });
    it("a bus routes topics by pattern, replays the last message and waits once", async () => {

        const bus = event.bus({ replay: 2, now: () => 7 });
        const seen: string[] = [];

        bus.subscribe("orders.*", ( _, message ) => { seen.push(`a:${message.topic}`); });
        bus.subscribe("**", ( _, message ) => { seen.push(`b:${message.topic}`); });
        bus.subscribe("orders.created", ( payload ) => { seen.push(`c:${JSON.stringify(payload)}`); });
        expect(bus.publish("orders.created", { id: 1 })).toBe(3);
        expect(bus.publish("orders.items.added", { id: 2 })).toBe(1);
        expect(bus.publish("users.created", {})).toBe(1);
        expect(seen).toEqual(["a:orders.created", "b:orders.created", 'c:{"id":1}', "b:orders.items.added", "b:users.created"]);
        expect(bus.last<{ id: number }>("orders.created")?.payload.id).toBe(1);
        expect(bus.last("nope")).toBeUndefined();
        expect(bus.history("orders.**").map(( message ) => message.topic)).toEqual(["orders.created", "orders.items.added"]);
        expect(bus.topics()).toEqual(["orders.created", "orders.items.added", "users.created"]);
        expect(bus.count("orders.created")).toBe(3);

        const replayed: unknown[] = [];

        bus.subscribe("orders.created", ( payload ) => { replayed.push(payload); }, { replay: true });
        expect(replayed).toEqual([{ id: 1 }]);

        const waiting = bus.once<{ ok: boolean }>("jobs.done", 500);

        bus.publish("jobs.done", { ok: true });
        expect((await waiting).payload.ok).toBe(true);
        await expect(bus.once("never", 5)).rejects.toThrow("never");
        expect(event.matches("a.*", "a.b") && !event.matches("a.*", "a.b.c") && event.matches("a.**", "a.b.c") && event.matches("*", "x")).toBe(true);
        bus.clear();
        expect(bus.topics()).toEqual([]);

    });
    it("signals change once per distinct value and resolve until a test holds", async () => {

        const count = event.signal(0);
        const seen: number[] = [];
        const stop = count.watch(( value, previous ) => { seen.push(value - previous); });

        count.set(1);
        count.set(1);
        count.set(( current ) => current + 2);
        expect(count.get()).toBe(3);
        expect(seen).toEqual([1, 2]);

        const reached = count.until(( value ) => value >= 5, 500);

        count.set(5);
        expect(await reached).toBe(5);
        expect(await count.until(( value ) => value === 5)).toBe(5);
        await expect(count.until(( value ) => value > 100, 5)).rejects.toMatchObject({ code: "timeout" });
        stop();

        const controller = event.abortable(undefined, AbortSignal.abort("gone"));

        expect(controller.signal.aborted).toBe(true);

        const parent = new AbortController();
        const child = event.abortable(parent.signal);
        const failing = event.aborted(child.signal);

        parent.abort();
        await expect(failing).rejects.toBeInstanceOf(error.Fault);
        expect(child.signal.aborted).toBe(true);

    });
    it("a scope prefixes topics and a pipe forwards one bus into another", async () => {

        const inner = event.bus();
        const outer = event.bus();
        const orders = event.scope(inner, "orders");
        const heard: string[] = [];
        const piped: string[] = [];

        orders.subscribe("*", ( _, message ) => { heard.push(message.topic); });

        const stop = event.pipe(inner, outer, "orders.**", ( topic ) => `remote.${topic}`);

        outer.subscribe("remote.**", ( _, message ) => { piped.push(message.topic); });
        orders.publish("created", { id: 1 });
        inner.publish("orders.paid", {});
        inner.publish("users.created", {});
        expect(heard).toEqual(["orders.created", "orders.paid"]);
        expect(piped).toEqual(["remote.orders.created", "remote.orders.paid"]);
        expect(orders.topics()).toEqual(["created", "paid"]);
        expect(orders.prefix).toBe("orders");

        const waited = orders.once("shipped", 50);

        orders.publish("shipped", 1);
        expect((await waited).topic).toBe("orders.shipped");
        expect(piped).toHaveLength(3);
        stop();
        inner.publish("orders.late", {});
        expect(piped).toHaveLength(3);

    });
    it("an emitter keeps every registration its own and counts what it holds", () => {

        const made = event.emitter<{ hit: number; done: string }>();
        const seen: string[] = [];
        const handler = ( n: number ): void => { seen.push(`h${n}`); };
        const first = made.on("hit", handler);
        const second = made.on("hit", handler, { once: true });
        const every = made.any(( payload, name ) => { seen.push(`${name}:${payload}`); });

        expect([made.count("hit"), made.count("done"), made.count(), made.has("hit"), made.has("done")]).toEqual([2, 0, 3, true, false]);
        expect(made.emit("hit", 1)).toBe(3);
        expect(seen).toEqual(["h1", "h1", "hit:1"]);
        expect(made.count("hit")).toBe(1);
        second();
        expect(made.emit("hit", 2)).toBe(2);
        first();
        first();
        expect([made.emit("hit", 3), made.has("hit"), made.count()]).toEqual([1, false, 1]);
        made.on("done", () => undefined);
        made.on("hit", handler);
        made.on("hit", handler);
        made.on("hit", () => { seen.push("other"); });
        expect(made.names()).toEqual(["done", "hit"]);
        made.off("hit", handler);
        expect(made.count("hit")).toBe(1);
        made.off("hit");
        made.off("hit");
        expect([made.count("hit"), made.names(), made.count()]).toEqual([0, ["done"], 2]);
        expect(made.emit("done", "x")).toBe(2);
        every();
        every();
        expect(made.emit("done", "z")).toBe(1);
        made.any(() => undefined);
        made.clear();
        expect([made.count(), made.names(), made.emit("done", "y")]).toEqual([0, [], 0]);
        expect(seen).toEqual(["h1", "h1", "hit:1", "h2", "hit:2", "hit:3", "done:x"]);

    });
    it("an emitter delivers past a throw, honours a stop mid-delivery and names a loop", async () => {

        const first = new Error("first");
        const plain = event.emitter<{ hit: number }>();
        const seen: string[] = [];

        plain.on("hit", () => { seen.push("a"); throw first; });
        plain.on("hit", () => { seen.push("b"); throw new Error("second"); });
        plain.on("hit", () => { seen.push("c"); });
        plain.any(() => { seen.push("d"); });
        expect(refused(() => plain.emit("hit", 1))).toBe(first);
        expect(seen).toEqual(["a", "b", "c", "d"]);

        const sunk: unknown[] = [];
        const late = new Error("late");
        const safe = event.emitter<{ hit: number }>({ fail: ( cause ) => { sunk.push(cause); } });

        safe.on("hit", () => { throw first; });
        safe.on("hit", async () => { await Promise.resolve(); throw late; });
        safe.any(() => { throw late; });
        expect(safe.emit("hit", 1)).toBe(3);
        expect(sunk).toEqual([first, late]);
        await tick();
        expect(sunk).toEqual([first, late, late]);

        const heard: string[] = [];
        const broken = new Error("sink");
        const leaky = event.emitter<{ hit: number }>({ fail: () => { throw broken; } });

        leaky.on("hit", () => { heard.push("a"); throw first; });
        leaky.on("hit", () => { heard.push("b"); });
        expect(refused(() => leaky.emit("hit", 1))).toBe(broken);
        expect(heard).toEqual(["a", "b"]);

        const mid = event.emitter<{ hit: number }>();
        const order: string[] = [];
        const stops: (() => void)[] = [];

        mid.on("hit", () => {

            order.push("a");

            for ( const stop of stops ) stop();

            mid.on("hit", () => { order.push("new"); });

        });
        stops.push(mid.on("hit", () => { order.push("b"); }));
        stops.push(mid.any(() => { order.push("any"); }));
        expect(mid.emit("hit", 1)).toBe(1);
        expect(order).toEqual(["a"]);
        expect(mid.emit("hit", 2)).toBe(2);
        expect(order).toEqual(["a", "a", "new"]);

        const nest = event.emitter<{ hit: number }>();
        const turns: number[] = [];

        nest.once("hit", ( n ) => {

            turns.push(n);

            if ( n < 3 ) nest.emit("hit", n + 1);

        });
        nest.on("hit", ( n ) => { turns.push(n * 10); });
        expect(nest.emit("hit", 1)).toBe(2);
        expect(turns).toEqual([1, 20, 10]);

        const deep = event.emitter<{ hit: number }>();
        let reached = 0;

        deep.on("hit", ( n ) => {

            reached = n;

            if ( n < 256 ) deep.emit("hit", n + 1);

        });
        expect(deep.emit("hit", 1)).toBe(1);
        expect(reached).toBe(256);

        const spun = event.emitter<{ hit: number }>();
        let spins = 0;
        let looping = true;

        spun.on("hit", () => {

            spins += 1;

            if ( looping ) spun.emit("hit", 1);

        });
        expect(refused(() => spun.emit("hit", 1))).toMatchObject({ code: "internal", reason: "event.loop" });
        expect(spins).toBe(256);
        looping = false;
        expect(spun.emit("hit", 1)).toBe(1);

        const reports: unknown[] = [];
        const told = event.emitter<{ hit: number }>({ fail: ( cause ) => { reports.push(cause); } });
        let rounds = 0;

        told.on("hit", () => {

            rounds += 1;
            told.emit("hit", 1);

        });
        expect(told.emit("hit", 1)).toBe(1);
        expect([rounds, reports.length]).toEqual([256, 1]);
        expect(reports[0]).toMatchObject({ code: "internal", reason: "event.loop" });

    });
    it("an emitter waits for an event, a timeout or an abort and leaves nothing behind", async () => {

        await faked(async () => {

            const made = event.emitter<{ hit: number }>();
            const arrived = made.wait("hit");
            const timed = made.wait("hit", 50);
            const endless = made.wait("hit", { timeout: Number.POSITIVE_INFINITY });

            expect([made.count("hit"), jest.getTimerCount()]).toEqual([3, 1]);
            expect(made.emit("hit", 7)).toBe(3);
            expect(await Promise.all([arrived, timed, endless])).toEqual([7, 7, 7]);
            expect([made.count("hit"), jest.getTimerCount()]).toEqual([0, 0]);

            const slow = rejected(made.wait("hit", 50));

            jest.advanceTimersByTime(49);
            expect(made.count("hit")).toBe(1);
            jest.advanceTimersByTime(1);

            const late = await slow;

            expect(late).toBeInstanceOf(error.Fault);
            expect(late).toMatchObject({ code: "timeout", reason: "event.wait", message: "hit did not arrive within 50ms" });
            expect(made.count("hit")).toBe(0);

            const gate = tally();
            const waiting = rejected(made.wait("hit", { timeout: 50, signal: gate.signal }));

            expect([made.count("hit"), gate.held(), jest.getTimerCount()]).toEqual([1, 1, 1]);
            gate.fire("left");
            expect(await waiting).toMatchObject({ code: "timeout", reason: "event.aborted", cause: "left" });
            expect([made.count("hit"), gate.held(), jest.getTimerCount()]).toEqual([0, 0, 0]);
            expect(await rejected(made.wait("hit", { signal: AbortSignal.abort("early") }))).toMatchObject({ reason: "event.aborted", cause: "early" });
            expect(await rejected(made.wait("hit", Number.NaN))).toEqual(new RangeError("not a duration"));
            expect(await rejected(made.wait("hit", { timeout: Number.NaN }))).toBeInstanceOf(RangeError);
            expect([made.count("hit"), jest.getTimerCount()]).toEqual([0, 0]);

            const kept = tally();
            const won = made.wait("hit", { signal: kept.signal, timeout: 50 });

            made.emit("hit", 9);
            expect(await won).toBe(9);
            expect([kept.held(), jest.getTimerCount()]).toEqual([0, 0]);

            const instant = rejected(made.wait("hit", -5));

            jest.advanceTimersByTime(1);
            expect(await instant).toMatchObject({ reason: "event.wait" });

            const door = tally();
            const heard: number[] = [];
            const off = made.on("hit", ( n ) => { heard.push(n); }, { signal: door.signal });

            made.emit("hit", 1);
            door.fire();
            made.emit("hit", 2);
            off();
            expect([heard, made.count("hit"), door.held()]).toEqual([[1], 0, 0]);
            made.on("hit", () => undefined, { signal: AbortSignal.abort() });
            expect(made.count("hit")).toBe(0);

            const open = tally();
            const stop = made.on("hit", () => undefined, { signal: open.signal });

            expect([made.count("hit"), open.held()]).toEqual([1, 1]);
            stop();
            expect([made.count("hit"), open.held()]).toEqual([0, 0]);

        });

    });
    it("matches reads one filled segment per star and one or more of any shape per double star", () => {

        const table: [string, string, boolean][] = [
            ["a.b", "a.b", true], ["a.b", "a.c", false], ["", "", true], ["", "a", false], ["a", "", false],
            ["*", "x", true], ["*", "a.b", false], ["*", "", false], ["*.*", "a.b", true], ["*.*", "a", false],
            ["a.*", "a.b", true], ["a.*", "a.b.c", false], ["a.*", "a", false], ["a.*", "a.", false], ["a.*.c", "a.b.c", true], ["a.*.c", "a..c", false], ["a.*.c", "a.b.d", false],
            ["**", "", true], ["**", "a", true], ["**", "a.b.c", true], ["**", "a..b", true],
            ["a.**", "a", false], ["a.**", "a.b", true], ["a.**", "a.b.c", true], ["a.**", "a.", true], ["a.**", "a..", true], ["a.**", "b.a", false],
            ["**.x", "x", false], ["**.x", "a.x", true], ["**.x", "a.b.x", true], ["**.x", "a.x.b", false],
            ["a.**.b", "a.b", false], ["a.**.b", "a.c.b", true], ["a.**.b", "a.c.d.b", true], ["a.**.b", "a..b", true], ["a.**.b", "a.c.d", false],
            ["**.**", "a", false], ["**.**", "a.b", true], ["*.**", "a", false], ["*.**", "a.b.c", true], ["*.**", ".a", false],
            ["a.**.c.**", "a.b.c.d", true], ["a.**.c.**", "a.c.d", false], ["**.b.**.b", "a.b.c.b", true], ["**.b.**.b", "a.b.b", false], ["**.b.**.b", "b.b.b.b", true],
            ["a*", "a*", true], ["a*", "ab", false], ["a.*", "a.*", true], ["a.**", "a.**", true], ["a.***", "a.b", false], ["a.***", "a.***", true],
        ];

        for ( const [pattern, topic, verdict] of table ) expect([pattern, topic, event.matches(pattern, topic)]).toEqual([pattern, topic, verdict]);

        expect(event.matches(`${"**.".repeat(14)}x`, `${"a.".repeat(40)}y`)).toBe(false);
        expect(event.matches(`${"**.".repeat(14)}y`, `${"a.".repeat(40)}y`)).toBe(true);

    });
    it("a bus hears in subscription order, keeps what it is told to keep and evicts the oldest topic", () => {

        const bus = event.bus({ replay: 2, topics: 2, now: () => 7 });
        const seen: string[] = [];
        const same = ( _: unknown, message: event.Message ): void => { seen.push(`s:${message.id}`); };

        bus.subscribe("a.*", () => { seen.push("1"); });
        bus.subscribe("a.b", () => { seen.push("2"); });
        bus.subscribe("**", () => { seen.push("3"); });
        bus.subscribe("a.b", () => { seen.push("4"); });
        bus.subscribe("a.*", () => { seen.push("5"); });

        const one = bus.subscribe("a.b", same);
        const two = bus.subscribe("a.b", same);

        expect(bus.publish("a.b", "x")).toBe(7);
        expect(seen).toEqual(["1", "2", "3", "4", "5", "s:1", "s:1"]);
        one();
        one();
        expect(bus.publish("a.b", "y")).toBe(6);
        two();
        expect(bus.publish("a.c", "z")).toBe(3);
        expect(seen.slice(7)).toEqual(["1", "2", "3", "4", "5", "s:2", "1", "3", "5"]);
        expect([bus.count(), bus.count("a.b"), bus.count("a.c"), bus.count("b"), bus.count("a.**"), bus.count("*.b"), bus.count("x.*"), bus.count("*"), bus.count("**")]).toEqual([5, 5, 3, 1, 5, 5, 1, 1, 5]);
        expect(bus.history().map(( message ) => message.id)).toEqual([1, 2, 3]);
        expect(bus.last("a.b")).toEqual({ topic: "a.b", payload: "y", at: 7, id: 2 });
        bus.publish("a.b", "w");
        expect(bus.history("a.b").map(( message ) => message.payload)).toEqual(["y", "w"]);
        bus.publish("a.d", 1);
        expect(bus.topics()).toEqual(["a.b", "a.d"]);
        bus.publish("a.b", "v");
        bus.publish("a.e", 2);
        expect(bus.topics()).toEqual(["a.b", "a.e"]);
        expect(bus.history().map(( message ) => message.id)).toEqual([4, 6, 7]);
        expect(bus.history("a.e").map(( message ) => message.id)).toEqual([7]);

        const replayed: unknown[] = [];
        const push = ( payload: unknown ): void => { replayed.push(payload); };

        bus.subscribe("a.*", push, { replay: true })();
        bus.subscribe("a.*", push, { replay: 1 })();
        bus.subscribe("a.*", push, { replay: 2 })();
        bus.subscribe("a.*", push, { replay: 99 })();
        bus.subscribe("a.*", push, { replay: 0 })();
        bus.subscribe("a.*", push, { replay: false })();
        bus.subscribe("a.*", push, { replay: -1 })();
        bus.subscribe("a.*", push, { replay: Number.NaN })();
        bus.subscribe("a.*", push, { replay: true, signal: AbortSignal.abort() })();
        bus.subscribe("a.*", push)();
        expect(replayed).toEqual(["w", "v", 2, 2, "v", 2, "w", "v", 2]);
        expect([bus.forget("a.b"), bus.forget("nope"), bus.topics()]).toEqual([2, 0, ["a.e"]]);
        bus.publish("b", 1);
        expect([bus.forget(), bus.topics(), bus.last("b"), bus.count()]).toEqual([2, [], undefined, 5]);

        const single = event.bus();
        const blank = event.bus({ replay: 0 });
        const capless = event.bus({ topics: 0 });
        const wide = event.bus({ replay: Number.POSITIVE_INFINITY, topics: Number.POSITIVE_INFINITY });

        for ( const made of [single, blank, capless, wide] ) for ( const payload of [1, 2, 3] ) made.publish("t", payload);

        expect([single.history().length, single.last("t")?.payload, single.last("t")?.id]).toEqual([1, 3, 3]);
        expect([blank.topics(), capless.topics(), blank.last("t"), capless.last("t")]).toEqual([[], [], undefined, undefined]);
        expect(wide.history().map(( message ) => message.payload)).toEqual([1, 2, 3]);
        expect(typeof single.last("t")?.at).toBe("number");

    });
    it("a bus delivers past a throw, drops a subscription whose replay throws and names a loop", async () => {

        const first = new Error("first");
        const late = new Error("late");
        const plain = event.bus();
        const seen: string[] = [];

        plain.subscribe("x", () => { seen.push("a"); throw first; });
        plain.subscribe("*", () => { seen.push("b"); throw late; });
        plain.subscribe("x", () => { seen.push("c"); });
        expect(refused(() => plain.publish("x", 1))).toBe(first);
        expect(seen).toEqual(["a", "b", "c"]);
        expect(plain.last("x")?.id).toBe(1);
        expect(refused(() => plain.subscribe("x", () => { throw late; }, { replay: true }))).toBe(late);
        expect(plain.count()).toBe(3);

        const sunk: unknown[] = [];
        const safe = event.bus({ fail: ( cause ) => { sunk.push(cause); } });

        safe.subscribe("x", () => { throw first; });
        safe.subscribe("x", async () => { await Promise.resolve(); throw late; });
        expect(safe.publish("x", 1)).toBe(2);
        await tick();
        expect(sunk).toEqual([first, late]);

        const kept = safe.subscribe("x", () => { throw first; }, { replay: true });

        expect([sunk.length, safe.count()]).toEqual([3, 3]);
        kept();
        expect(safe.count()).toBe(2);

        const broken = new Error("sink");
        const leaky = event.bus({ fail: () => { throw broken; } });
        const heard: string[] = [];

        leaky.subscribe("x", () => { heard.push("a"); throw first; });
        leaky.subscribe("x", () => { heard.push("b"); });
        expect(refused(() => leaky.publish("x", 1))).toBe(broken);
        expect(heard).toEqual(["a", "b"]);

        const mid = event.bus();
        const order: string[] = [];
        const stops: (() => void)[] = [];

        mid.subscribe("x", () => {

            order.push("a");

            for ( const stop of stops ) stop();

            mid.subscribe("x", () => { order.push("new"); });

        });
        stops.push(mid.subscribe("*", () => { order.push("b"); }));
        stops.push(mid.subscribe("x", () => { order.push("c"); }));
        expect(mid.publish("x", 1)).toBe(1);
        expect(mid.publish("x", 2)).toBe(2);
        expect(order).toEqual(["a", "a", "new"]);

        const nested = event.bus();
        const told: string[] = [];

        nested.subscribe("made", () => { nested.publish("paid", 1); });
        nested.subscribe("**", ( _, message ) => { told.push(`${message.id}:${message.topic}`); });
        nested.publish("made", 1);
        expect(told).toEqual(["2:paid", "1:made"]);

        const looped = event.bus();
        let rounds = 0;
        let looping = true;

        looped.subscribe("x", () => {

            rounds += 1;

            if ( looping ) looped.publish("x", 1);

        });
        expect(refused(() => looped.publish("x", 1))).toMatchObject({ code: "internal", reason: "event.loop" });
        expect([rounds, looped.last("x")?.id]).toEqual([256, 256]);
        looping = false;
        expect([looped.publish("x", 1), looped.last("x")?.id]).toEqual([1, 257]);

        const left = event.bus();
        const right = event.bus();

        event.pipe(left, right);
        event.pipe(right, left);
        expect(refused(() => left.publish("x", 1))).toMatchObject({ code: "internal", reason: "event.loop" });

    });
    it("a bus waits once for a pattern, a timeout or an abort and leaves no subscriber", async () => {

        await faked(async () => {

            const bus = event.bus({ now: () => 3 });
            const waiting = bus.once<number>("jobs.*", 50);

            expect([bus.count(), jest.getTimerCount()]).toEqual([1, 1]);
            bus.publish("users.done", 0);
            bus.publish("jobs.done", 4);
            bus.publish("jobs.more", 5);
            expect(await waiting).toEqual({ topic: "jobs.done", payload: 4, at: 3, id: 2 });
            expect([bus.count(), jest.getTimerCount()]).toEqual([0, 0]);

            const slow = rejected(bus.once("never", 5));

            jest.advanceTimersByTime(5);
            expect(await slow).toMatchObject({ code: "timeout", reason: "event.once", message: "never did not arrive within 5ms" });

            const gate = tally();
            const left = rejected(bus.once("never", { signal: gate.signal }));

            expect([bus.count(), gate.held(), jest.getTimerCount()]).toEqual([1, 1, 0]);
            gate.fire("gone");
            expect(await left).toMatchObject({ reason: "event.aborted", cause: "gone" });
            expect([bus.count(), gate.held()]).toEqual([0, 0]);
            expect(await rejected(bus.once("never", Number.NaN))).toBeInstanceOf(RangeError);

            const door = tally();
            const heard: unknown[] = [];
            const off = bus.subscribe("t", ( payload ) => { heard.push(payload); }, { signal: door.signal });

            bus.publish("t", 1);
            door.fire();
            bus.publish("t", 2);
            off();
            expect([heard, bus.count(), door.held()]).toEqual([[1], 0, 0]);

        });

    });
    it("a signal queues a change made while it tells, compares as told and resets", () => {

        const made = event.signal(0);
        const log: string[] = [];

        made.watch(( value, previous ) => {

            log.push(`a:${previous}>${value}`);

            if ( value === 1 ) made.set(2);

        });
        made.watch(( value, previous ) => { log.push(`b:${previous}>${value}:${made.get()}`); });
        made.set(1);
        expect(log).toEqual(["a:0>1", "b:0>1:2", "a:1>2", "b:1>2:2"]);
        made.set(2);
        made.set(( current ) => current);
        expect(log.length).toBe(4);
        made.set(( current ) => current + 1);
        expect([made.get(), log.slice(4)]).toEqual([3, ["a:2>3", "b:2>3:3"]]);
        made.reset();
        expect([made.get(), log.slice(6)]).toEqual([0, ["a:3>0", "b:3>0:0"]]);
        made.reset();
        expect([log.length, made.count()]).toEqual([8, 2]);
        expect(Object.keys(made.read).sort()).toEqual(["get", "until", "watch"]);
        expect([made.read.get(), made.read.watch === made.watch, made.read.until === made.until]).toEqual([0, true, true]);

        const odd = event.signal(Number.NaN);
        let told = 0;

        odd.watch(() => { told += 1; });
        odd.set(Number.NaN);
        odd.set(0);
        odd.set(-0);
        odd.set(-0);
        expect([told, Object.is(odd.get(), -0)]).toEqual([2, true]);

        const same = ( a: { id: number; at: number }, b: { id: number; at: number } ): boolean => a.id === b.id;

        for ( const one of [event.signal({ id: 1, at: 0 }, same), event.signal({ id: 1, at: 0 }, { equal: same })] ) {

            const heard: number[] = [];

            one.watch(( value ) => { heard.push(value.at); });
            one.set({ id: 1, at: 5 });
            one.set({ id: 2, at: 6 });
            expect([heard, one.get()]).toEqual([[6], { id: 2, at: 6 }]);

        }

        const kept = event.signal<() => number>(() => 1);

        kept.set(() => () => 2);
        expect(kept.get()()).toBe(2);
        kept.reset();
        expect(kept.get()()).toBe(1);

    });
    it("a signal tells past a throw, replays on demand, honours a stop mid-turn and names a loop", async () => {

        const first = new Error("first");
        const late = new Error("late");
        const plain = event.signal(0);
        const seen: string[] = [];

        plain.watch(() => { seen.push("a"); throw first; });
        plain.watch(() => { seen.push("b"); throw late; });
        plain.watch(( value ) => { seen.push(`c${value}`); });
        expect(refused(() => plain.set(1))).toBe(first);
        expect([plain.get(), seen]).toEqual([1, ["a", "b", "c1"]]);

        const replayed: [number, number][] = [];
        const stop = plain.watch(( value, previous ) => { replayed.push([value, previous]); }, { replay: true });

        expect([replayed, plain.count()]).toEqual([[[1, 1]], 4]);
        stop();
        stop();
        expect(plain.count()).toBe(3);
        expect(refused(() => plain.watch(() => { throw late; }, { replay: true }))).toBe(late);
        plain.watch(() => { throw late; }, { replay: true, signal: AbortSignal.abort() });
        expect(plain.count()).toBe(3);

        const door = tally();
        const heard: number[] = [];
        const off = plain.watch(( value ) => { heard.push(value); }, { signal: door.signal });

        expect([plain.count(), door.held()]).toEqual([4, 1]);
        off();
        expect([plain.count(), door.held()]).toEqual([3, 0]);
        plain.watch(( value ) => { heard.push(value); }, { signal: door.signal });
        door.fire();
        expect(refused(() => plain.set(2))).toBe(first);
        expect([heard, plain.count()]).toEqual([[], 3]);

        const sunk: unknown[] = [];
        const safe = event.signal(0, { fail: ( cause ) => { sunk.push(cause); } });

        safe.watch(() => { throw first; });
        safe.watch(async () => { await Promise.resolve(); throw late; });
        safe.set(1);
        await tick();
        expect(sunk).toEqual([first, late]);

        const kept = safe.watch(() => { throw first; }, { replay: true });

        expect([sunk.length, safe.count()]).toEqual([3, 3]);
        kept();
        expect(safe.count()).toBe(2);

        const broken = new Error("sink");
        const leaky = event.signal(0, { fail: () => { throw broken; } });
        const told: string[] = [];

        leaky.watch(() => { told.push("a"); throw first; });
        leaky.watch(() => { told.push("b"); });
        expect(refused(() => leaky.set(1))).toBe(broken);
        expect([told, leaky.get()]).toEqual([["a", "b"], 1]);

        const mid = event.signal(0);
        const order: string[] = [];
        const stops: (() => void)[] = [];

        mid.watch(( value ) => {

            order.push(`a${value}`);

            for ( const end of stops.splice(0) ) end();

            if ( value !== 1 ) return;

            mid.watch(( next ) => { order.push(`new${next}`); });
            mid.set(2);

        });
        stops.push(mid.watch(( value ) => { order.push(`b${value}`); }));
        mid.set(1);
        expect([order, mid.count()]).toEqual([["a1", "a2", "new2"], 2]);

        const looped = event.signal(0);
        let looping = true;
        let turns = 0;

        looped.watch(( value ) => {

            turns += 1;

            if ( looping ) looped.set(value + 1);

        });
        expect(refused(() => looped.set(1))).toMatchObject({ code: "internal", reason: "event.loop" });
        expect([looped.get(), turns]).toEqual([1024, 1024]);
        looping = false;
        looped.set(0);
        expect([looped.get(), turns]).toEqual([0, 1025]);

        const faults: unknown[] = [];
        const guarded = event.signal(0, { fail: ( cause ) => { faults.push(cause); } });

        guarded.watch(( value ) => { guarded.set(value + 1); });
        guarded.set(1);
        expect([guarded.get(), faults.length]).toEqual([1024, 1]);
        expect(faults[0]).toMatchObject({ code: "internal", reason: "event.loop" });

    });
    it("a signal resolves until a test holds, times out, aborts and never throws at the setter", async () => {

        await faked(async () => {

            const made = event.signal(1);

            expect(await made.until(( value ) => value === 1)).toBe(1);
            expect([made.count(), jest.getTimerCount()]).toEqual([0, 0]);

            const later = made.until(( value ) => value > 2, 50);

            expect([made.count(), jest.getTimerCount()]).toEqual([1, 1]);
            made.set(2);
            made.set(3);
            made.set(4);
            expect(await later).toBe(3);
            expect([made.count(), jest.getTimerCount()]).toEqual([0, 0]);

            const slow = rejected(made.until(( value ) => value > 99, 5));

            jest.advanceTimersByTime(4);
            expect(made.count()).toBe(1);
            jest.advanceTimersByTime(1);
            expect(await slow).toMatchObject({ code: "timeout", reason: "event.until" });
            expect(made.count()).toBe(0);

            const past = rejected(made.read.until(( value ) => value > 99, -5));

            jest.advanceTimersByTime(1);
            expect(await past).toMatchObject({ code: "timeout", reason: "event.until" });

            const gate = tally();
            const left = rejected(made.until(( value ) => value > 99, { signal: gate.signal, timeout: Number.POSITIVE_INFINITY }));

            expect([made.count(), gate.held(), jest.getTimerCount()]).toEqual([1, 1, 0]);
            gate.fire("gone");
            expect(await left).toMatchObject({ code: "timeout", reason: "event.aborted", cause: "gone" });
            expect([made.count(), gate.held()]).toEqual([0, 0]);

            const broke = new Error("test");
            let asked = 0;

            expect(await rejected(made.until(() => { throw broke; }))).toBe(broke);
            expect(await rejected(made.until(() => { asked += 1; return true; }, { signal: AbortSignal.abort("early") }))).toMatchObject({ reason: "event.aborted", cause: "early" });
            expect(await rejected(made.until(() => { asked += 1; return true; }, Number.NaN))).toBeInstanceOf(RangeError);
            expect([asked, made.count()]).toEqual([0, 0]);

            const failing = rejected(made.until(( value ) => {

                if ( value === 5 ) throw broke;

                return false;

            }, 50));

            expect(refused(() => made.set(5))).toBeUndefined();
            expect(await failing).toBe(broke);
            expect([made.get(), made.count(), jest.getTimerCount()]).toEqual([5, 0, 0]);

        });

    });
    it("a derived value follows its source only while watched and answers fresh when idle", async () => {

        const source = event.signal({ n: 1, noise: 0 });
        let picks = 0;
        const doubled = event.derive(source, ( value ) => {

            picks += 1;

            return value.n * 2;

        });

        expect([picks, source.count(), doubled.get(), picks]).toEqual([1, 0, 2, 2]);
        source.set({ n: 2, noise: 0 });
        expect(doubled.get()).toBe(4);

        const heard: [number, number][] = [];
        const listener = ( value: number, previous: number ): void => { heard.push([value, previous]); };
        const one = doubled.watch(listener);
        const two = doubled.watch(listener);

        expect(source.count()).toBe(1);
        source.set({ n: 2, noise: 1 });
        expect(heard).toEqual([]);
        source.set({ n: 3, noise: 1 });
        expect([heard, doubled.get()]).toEqual([[[6, 4], [6, 4]], 6]);
        one();
        one();
        source.set({ n: 4, noise: 1 });
        expect([heard.slice(2), source.count()]).toEqual([[[8, 6]], 1]);
        two();
        expect(source.count()).toBe(0);
        source.set({ n: 5, noise: 1 });
        expect([heard.length, doubled.get()]).toEqual([3, 10]);

        const replayed: [number, number][] = [];
        const stop = doubled.watch(( value, previous ) => { replayed.push([value, previous]); }, { replay: true });

        expect(replayed).toEqual([[10, 10]]);
        stop();

        const late = new Error("late");

        expect(refused(() => doubled.watch(() => { throw late; }, { replay: true }))).toBe(late);
        expect(source.count()).toBe(0);

        const gate = tally();

        doubled.watch(listener, { signal: gate.signal });
        expect([source.count(), gate.held()]).toEqual([1, 1]);
        gate.fire();
        expect([source.count(), gate.held()]).toEqual([0, 0]);
        picks = 0;
        doubled.watch(listener, { replay: true, signal: AbortSignal.abort() })();
        expect([source.count(), heard.length, picks]).toEqual([0, 3, 0]);

        const parity = event.derive(doubled, ( value ) => value % 4 === 0);
        const flips: boolean[] = [];
        const end = parity.watch(( value ) => { flips.push(value); });

        expect([source.count(), parity.get()]).toEqual([1, false]);
        source.set({ n: 6, noise: 0 });
        source.set({ n: 8, noise: 0 });
        source.set({ n: 9, noise: 0 });
        expect(flips).toEqual([true, false]);
        end();
        expect(source.count()).toBe(0);

        const waiting = doubled.until(( value ) => value >= 40);

        expect(source.count()).toBe(1);
        source.set({ n: 15, noise: 0 });
        source.set({ n: 20, noise: 0 });
        expect(await waiting).toBe(40);
        expect(source.count()).toBe(0);
        expect(await doubled.until(( value ) => value === 40)).toBe(40);

        const tens: number[] = [];
        const rounded = event.derive(source, ( value ) => ({ tens: Math.floor(value.n / 10) }), ( a, b ) => a.tens === b.tens);

        rounded.watch(( value ) => { tens.push(value.tens); });
        source.set({ n: 25, noise: 0 });
        source.set({ n: 31, noise: 0 });
        expect([tens, rounded.get()]).toEqual([[3], { tens: 3 }]);

        const raw = event.signal(1);
        const picky = event.derive(raw, ( value ) => {

            if ( value < 0 ) throw late;

            return value;

        });

        picky.watch(() => undefined);
        expect(refused(() => raw.set(-1))).toBe(late);
        expect([raw.get(), picky.get()]).toEqual([-1, 1]);

    });
    it("an abortable follows its parents, with or without the host's any, and lets go on release", () => {

        const lone = event.abortable();
        const blank = event.abortable(undefined, undefined);

        expect([lone.signal.aborted, blank.signal.aborted]).toEqual([false, false]);
        lone.abort("mine");
        lone.abort("again");
        lone.release();
        expect([lone.signal.aborted, lone.signal.reason]).toEqual([true, "mine"]);

        const other = tally();
        const dead = event.abortable(undefined, AbortSignal.abort("p"), other.signal);

        expect([dead.signal.aborted, dead.signal.reason, other.held()]).toEqual([true, "p", 0]);

        const parent = new AbortController();
        const second = new AbortController();
        const child = event.abortable(parent.signal, undefined, second.signal);
        const own = event.abortable(parent.signal);

        own.abort("own");
        expect([own.signal.reason, parent.signal.aborted, child.signal.aborted]).toEqual(["own", false, false]);
        second.abort("why");
        parent.abort("later");
        expect([child.signal.aborted, child.signal.reason, own.signal.reason]).toEqual([true, "why", "own"]);

        const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");

        expect(typeof any?.value).toBe("function");

        if ( !any ) return;

        Object.defineProperty(AbortSignal, "any", { ...any, value: undefined });

        try {

            const one = tally();
            const two = tally();
            const made = event.abortable(one.signal, undefined, two.signal);

            expect([one.held(), two.held(), made.signal.aborted]).toEqual([1, 1, false]);
            two.fire("two");
            expect([made.signal.aborted, made.signal.reason, one.held(), two.held()]).toEqual([true, "two", 0, 0]);
            one.fire("one");
            expect(made.signal.reason).toBe("two");

            const three = tally();
            const four = tally();
            const freed = event.abortable(three.signal, four.signal);

            freed.release();
            freed.release();
            expect([three.held(), four.held()]).toEqual([0, 0]);
            three.fire("gone");
            expect(freed.signal.aborted).toBe(false);
            freed.abort("hand");
            expect(freed.signal.reason).toBe("hand");

            const five = tally();
            const hand = event.abortable(five.signal);

            hand.abort("first");
            expect([hand.signal.reason, five.held()]).toEqual(["first", 0]);

            const six = tally();
            const gone = event.abortable(AbortSignal.abort("early"), six.signal);

            expect([gone.signal.reason, six.held()]).toEqual(["early", 0]);

        } finally {

            Object.defineProperty(AbortSignal, "any", any);

        }

        expect(typeof AbortSignal.any).toBe("function");

    });
    it("a deadline aborts on time, never on a refused duration, and clears its timer every way out", async () => {

        await faked(() => {

            expect(refused(() => event.deadline(Number.NaN))).toBeInstanceOf(RangeError);
            expect(jest.getTimerCount()).toBe(0);

            const timed = event.deadline(50);

            jest.advanceTimersByTime(49);
            expect([timed.signal.aborted, jest.getTimerCount()]).toEqual([false, 1]);
            jest.advanceTimersByTime(1);
            expect(timed.signal.aborted).toBe(true);
            expect(timed.signal.reason).toBeInstanceOf(error.Fault);
            expect(timed.signal.reason).toMatchObject({ code: "timeout", reason: "event.deadline" });
            timed.abort("late");
            timed.release();
            expect([timed.signal.reason === "late", jest.getTimerCount()]).toEqual([false, 0]);

            const open = event.deadline(Number.POSITIVE_INFINITY);

            expect([open.signal.aborted, jest.getTimerCount()]).toEqual([false, 0]);
            open.abort("hand");
            open.release();
            expect(open.signal.reason).toBe("hand");

            const freed = event.deadline(50);

            freed.release();
            freed.release();
            expect(jest.getTimerCount()).toBe(0);
            jest.advanceTimersByTime(60);
            expect(freed.signal.aborted).toBe(false);

            const hand = event.deadline(50);

            hand.abort("mine");
            expect([hand.signal.reason, jest.getTimerCount()]).toEqual(["mine", 0]);

            const parent = new AbortController();
            const child = event.deadline(50, undefined, parent.signal);

            expect(jest.getTimerCount()).toBe(1);
            parent.abort("p");
            expect([child.signal.aborted, child.signal.reason, jest.getTimerCount()]).toEqual([true, "p", 0]);

            const slow = new AbortController();
            const first = event.deadline(5, slow.signal);

            jest.advanceTimersByTime(5);
            slow.abort("after");
            expect(first.signal.reason).toMatchObject({ reason: "event.deadline" });

            const dead = event.deadline(50, AbortSignal.abort("early"));

            expect([dead.signal.reason, jest.getTimerCount()]).toEqual(["early", 0]);
            dead.release();

            const past = event.deadline(-5);

            expect(past.signal.aborted).toBe(false);
            jest.advanceTimersByTime(1);
            expect(past.signal.aborted).toBe(true);

            const far = event.deadline(1e12);

            jest.advanceTimersByTime(2_147_483_646);
            expect(far.signal.aborted).toBe(false);
            jest.advanceTimersByTime(1);
            expect([far.signal.aborted, jest.getTimerCount()]).toEqual([true, 0]);

        });

    });
    it("race settles with the work or the abort and leaves no listener, aborted only ever rejects", async () => {

        const thenable: PromiseLike<number> = { then: ( done ) => Promise.resolve(7).then(done) };

        expect([await event.race(Promise.resolve(1), undefined), await event.race(thenable, undefined)]).toEqual([1, 7]);

        const gate = tally();
        let finish: ( value: string ) => void = () => undefined;
        const work = new Promise<string>(( resolve ) => { finish = resolve; });
        const raced = event.race(work, gate.signal);

        expect(gate.held()).toBe(1);
        finish("done");
        expect([await raced, gate.held()]).toEqual(["done", 0]);

        const broke = new Error("work");
        const door = tally();

        expect([await rejected(event.race(Promise.reject(broke), door.signal)), door.held()]).toEqual([broke, 0]);

        const cut = tally();
        let fail: ( cause: unknown ) => void = () => undefined;
        const doomed = new Promise<string>(( _, reject ) => { fail = reject; });
        const lost = rejected(event.race(doomed, cut.signal));

        cut.fire("stop");
        expect(await lost).toMatchObject({ code: "timeout", reason: "event.aborted", cause: "stop" });
        fail(broke);
        await tick();
        expect(cut.held()).toBe(0);
        expect(await rejected(event.race(Promise.reject(broke), AbortSignal.abort("early")))).toMatchObject({ reason: "event.aborted", cause: "early" });
        expect(await rejected(event.race(Promise.resolve(1), AbortSignal.abort("early")))).toMatchObject({ reason: "event.aborted" });
        await tick();
        expect(await Promise.race([event.aborted(undefined), tick().then(() => "idle")])).toBe("idle");
        expect(await rejected(event.aborted(AbortSignal.abort("was")))).toMatchObject({ code: "timeout", reason: "event.aborted", cause: "was" });

        const live = new AbortController();
        const pending = rejected(event.aborted(live.signal));

        expect(await Promise.race([pending, tick().then(() => "idle")])).toBe("idle");
        live.abort("now");
        expect(await pending).toBeInstanceOf(error.Fault);
        expect(await pending).toMatchObject({ reason: "event.aborted", cause: "now" });

    });
    it("a scope prefixes every verb and nests, a pipe forwards under the name it is given", async () => {

        const bus = event.bus({ replay: 3 });
        const shop = event.scope(bus, "shop");
        const orders = event.scope(shop, "orders.");
        const bare = event.scope(bus, "");
        const seen: string[] = [];

        expect([shop.prefix, orders.prefix, bare.prefix, "clear" in shop]).toEqual(["shop", "orders", "", false]);
        bus.subscribe("**", ( _, message ) => { seen.push(message.topic); });
        expect([shop.publish("opened", 1), orders.publish("made", 2), bare.publish("root", 3), bus.publish("shopping.cart", 4)]).toEqual([1, 1, 1, 1]);
        expect(seen).toEqual(["shop.opened", "shop.orders.made", "root", "shopping.cart"]);
        expect([shop.topics(), orders.topics(), bare.topics()]).toEqual([["opened", "orders.made"], ["made"], ["root", "shop.opened", "shop.orders.made", "shopping.cart"]]);
        expect([shop.last("opened")?.payload, orders.last("made")?.topic, shop.last("root"), shop.last("shop.opened")]).toEqual([1, "shop.orders.made", undefined, undefined]);
        expect([shop.history().map(( message ) => message.topic), orders.history("*").length, shop.history("opened").length, bare.history().length]).toEqual([["shop.opened", "shop.orders.made"], 1, 1, 4]);

        const heard: unknown[] = [];
        const stop = orders.subscribe("*", ( payload, message ) => { heard.push([payload, message.topic]); }, { replay: true });

        expect(heard).toEqual([[2, "shop.orders.made"]]);
        orders.publish("paid", 5);
        shop.publish("orders.sent", 6);
        bus.publish("orders.made", 7);
        shop.publish("orders.deep.er", 8);
        expect(heard.slice(1)).toEqual([[5, "shop.orders.paid"], [6, "shop.orders.sent"]]);
        expect([bus.count(), shop.count(), orders.count(), orders.count("made"), shop.count("opened"), bare.count(), event.scope(bus, "other").count()]).toEqual([2, 2, 2, 2, 1, 2, 1]);

        const waiting = orders.once<number>("done");

        orders.publish("done", 9);
        expect(await waiting).toMatchObject({ topic: "shop.orders.done", payload: 9 });
        stop();
        expect([orders.forget("made"), shop.forget(), bus.topics(), bare.forget(), bus.topics()]).toEqual([1, 5, ["orders.made", "root", "shopping.cart"], 3, []]);

        const left = event.bus();
        const right = event.bus();
        const got: string[] = [];

        right.subscribe("**", ( payload, message ) => { got.push(`${message.id}:${message.topic}=${String(payload)}`); });

        const all = event.pipe(left, right);

        left.publish("a.b", 1);
        all();
        all();
        left.publish("a.b", 2);

        const some = event.pipe(left, right, "a.*", ( topic ) => `in.${topic}`);

        left.publish("a.c", 3);
        left.publish("b.c", 4);
        some();

        const scoped = event.pipe(event.scope(left, "a"), event.scope(right, "from"));

        left.publish("a.d", 5);
        left.publish("z", 6);
        scoped();
        left.publish("a.e", 7);
        expect(got).toEqual(["1:a.b=1", "2:in.a.c=3", "3:from.a.d=5"]);
        expect([left.count(), right.count()]).toEqual([0, 1]);

    });
    it("an emitter tells only who was listening when the emit began", () => {

        const made = event.emitter<{ a: number; b: number }>();
        const heard: string[] = [];
        const stops: (() => void)[] = [];

        made.once("a", () => {

            heard.push("first");
            made.on("a", () => { heard.push("named late"); });
            stops.push(made.any(( _, name ) => {

                heard.push(`any late:${name}`);

                if ( stops.length < 2 ) stops.push(made.any(( __, own ) => { heard.push(`any later:${own}`); }));

            }));

        });

        expect(made.emit("a", 1)).toBe(1);
        expect(heard).toEqual(["first"]);
        expect([made.count(), made.count("a")]).toEqual([2, 1]);
        expect(made.emit("a", 2)).toBe(2);
        expect(heard).toEqual(["first", "named late", "any late:a"]);
        expect(made.count()).toBe(3);
        expect(made.emit("b", 3)).toBe(2);
        expect(heard.slice(3)).toEqual(["any late:b", "any later:b"]);

        made.on("b", () => {

            for ( const stop of stops.splice(0) ) stop();

        });

        expect(made.emit("b", 4)).toBe(1);
        expect(heard).toHaveLength(5);
        expect([made.count(), made.names()]).toEqual([2, ["a", "b"]]);

    });
});
