import { describe, expect, test as it } from "bun:test";
import { existsSync } from "node:fs";
import * as socket from "engine/socket";
import * as stage from "engine/test";

describe("test", () => {

    it("env, tmp, globals and spies restore themselves", () => {

        const before = process.env.ENGINE_PROBE;
        const restore = stage.env({ ENGINE_PROBE: "1", PATH_PROBE_MISSING: undefined });

        expect(process.env.ENGINE_PROBE).toBe("1");
        restore.restore();
        expect(process.env.ENGINE_PROBE).toBe(before);

        const temp = stage.tmp();

        expect(existsSync(temp.path)).toBe(true);
        expect(temp.file("a.txt").endsWith("/a.txt")).toBe(true);
        temp.remove();
        expect(existsSync(temp.path)).toBe(false);

        const undo = stage.globals({ engineProbe: 7, fetch: undefined });

        expect((globalThis as Record<string, unknown>).engineProbe).toBe(7);
        expect((globalThis as Record<string, unknown>).fetch).toBeUndefined();
        undo();
        expect((globalThis as Record<string, unknown>).engineProbe).toBeUndefined();
        expect(typeof (globalThis as Record<string, unknown>).fetch).toBe("function");

        const add = stage.spy(( a: number, b: number ) => a + b);

        expect(add(1, 2)).toBe(3);
        expect(add.calls).toEqual([[1, 2]]);
        expect(add.results).toEqual([3]);
        add.reset();
        expect(add.calls).toEqual([]);
        expect(stage.spy()()).toBeUndefined();

    });
    it("waits and logs", async () => {

        let ready = false;

        setTimeout(() => { ready = true; }, 10);
        await stage.until(() => ready);
        expect(ready).toBe(true);
        await expect(stage.until(() => false, { timeout: 20, every: 2 })).rejects.toThrow("until");
        await stage.tick(1);

        const logs = stage.logs("info");

        logs.logger.info("hello", { password: "kept" });
        logs.logger.debug("hidden");
        expect(logs.messages()).toEqual(["hello"]);
        expect(logs.entries[0]?.facts.password).toBe("kept");
        logs.clear();
        expect(logs.entries).toEqual([]);
        expect(typeof stage.bench).toBe("function");

    });
    it("a live socket server speaks the engine frames", async () => {

        const server = stage.live({ auth: ( token ) => token === "good", onFrame: ( frame, reply ) => {

            if ( frame.event !== "sum" ) return false;

            reply({ event: "ack", id: frame.id, data: (frame.data as number[]).reduce(( a, b ) => a + b, 0) });

            return true;

        } });
        const live = socket.open({ url: server.url, auth: "good", heartbeat: 0, reconnect: false });

        await live.connect();
        await live.join("orders");
        expect(server.clients()).toBe(1);
        expect(live.channels()).toEqual(["orders"]);
        expect(await live.request("sum", [1, 2, 3])).toBe(6);
        expect(await live.request("echo", { a: 1 })).toEqual({ a: 1 });

        const waiting = live.once("order.paid", "orders");

        server.broadcast({ event: "order.paid", channel: "orders", data: { id: 7 } });
        expect(await waiting).toEqual({ id: 7 });
        expect(server.received().some(( frame ) => frame.event === "auth")).toBe(true);
        live.close();

        const refused = socket.open({ url: server.url, auth: "bad", heartbeat: 0, reconnect: false });

        await refused.connect();
        await stage.until(() => refused.status() !== "open", { timeout: 1000 });
        expect(["closed", "failed"]).toContain(refused.status());
        server.stop();

    });
    it("the bench helpers are the mitata ones", () => {

        expect(typeof stage.bench).toBe("function");
        expect(typeof stage.do_not_optimize).toBe("function");
        expect(stage.do_not_optimize(1)).toBeUndefined();

    });
});
