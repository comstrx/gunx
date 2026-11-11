import { describe, expect, test as it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, sep } from "node:path";
import * as error from "engine/error";
import * as socket from "engine/socket";
import * as stage from "engine/test";

const reasonOf = ( work: () => unknown ): string => { try { work(); return "ok"; } catch ( caught ) { return error.isFault(caught) ? caught.reason ?? "?" : "?"; } };
const shared = globalThis as Record<string, unknown>;

function frames ( url: string, token: string | undefined ): { socket: WebSocket; seen: socket.Frame[]; ready: Promise<void>; closed: Promise<number> } {

    const raw = new WebSocket(url);
    const seen: socket.Frame[] = [];
    const ready = new Promise<void>(( resolve ) => { raw.onopen = () => { if ( token !== undefined ) raw.send(socket.encode({ event: "auth", data: { token } })); resolve(); }; });
    const closed = new Promise<number>(( resolve ) => { raw.onclose = ( event ) => resolve(event.code); });

    raw.onmessage = ( message ) => {

        const frame = socket.decode(String(message.data));

        if ( frame ) seen.push(frame);

    };

    return { socket: raw, seen, ready, closed };

}

describe("test.edges", () => {

    it("temp folders stay inside the system temp, refuse names that leave them and write nested files", () => {

        const temp = stage.tmp("../x y/");

        try {

            expect([dirname(temp.path), basename(temp.path).startsWith("..xy")]).toEqual([tmpdir(), true]);
            expect(["../x", "", "a/../../b", "/etc/passwd", "a\u0000b", ".", "a/..", `../${basename(temp.path)}x/y`, 7 as never].map(( name ) => reasonOf(() => temp.file(name)))).toEqual(Array.from({ length: 9 }, () => "test.path"));
            expect([temp.file("a/b/c.txt").slice(temp.path.length), temp.file("a/./b").slice(temp.path.length)]).toEqual([`${sep}a${sep}b${sep}c.txt`, `${sep}a${sep}b`]);

            const written = temp.write("deep/er/x.bin", new Uint8Array([1, 2]));

            expect([written.slice(temp.path.length), [...readFileSync(written)], reasonOf(() => temp.write("../out.txt", "x"))]).toEqual([`${sep}deep${sep}er${sep}x.bin`, [1, 2], "test.path"]);

        } finally {

            temp.remove();

        }

        temp.remove();
        expect(existsSync(temp.path)).toBe(false);

    });
    it("environment patches layer: any restore order lands on the original, a restore runs once, a later outside change is kept, junk keys are refused", () => {

        const key = "ENGINE_EDGE_ENV";

        expect([{ "": "x" }, { "A=B": "x" }, { "A\u0000": "x" }, { A: 5 as never }].map(( values ) => reasonOf(() => stage.env(values)))).toEqual(["test.env", "test.env", "test.env", "test.env"]);

        const a = stage.env({ [key]: "1" });
        const b = stage.env({ [key]: "2" });
        const c = stage.env({ [key]: undefined });

        expect(process.env[key]).toBeUndefined();
        b.restore();
        expect(process.env[key]).toBeUndefined();
        c.restore();
        expect(process.env[key]).toBe("1");
        a.restore();
        expect(process.env[key]).toBeUndefined();
        a.restore();
        process.env[key] = "later";

        const d = stage.env({ [key]: "3" });

        d.restore();
        expect(process.env[key]).toBe("later");
        d.restore();
        expect(process.env[key]).toBe("later");
        Reflect.deleteProperty(process.env, key);

    });
    it("global patches layer the same way, restore accessors and missing globals exactly, refuse sealed globals before touching any and set non-configurable writable ones in place", () => {

        Object.defineProperty(globalThis, "engineEdgeGetter", { get: () => 5, configurable: true, enumerable: false });
        Object.defineProperty(globalThis, "engineEdgeSealed", { value: 1, writable: false, configurable: false });
        Object.defineProperty(globalThis, "engineEdgeWritable", { value: 1, writable: true, configurable: false });

        const first = stage.globals({ engineEdgeLayer: 1 });
        const second = stage.globals({ engineEdgeLayer: 2 });

        first();
        expect(shared.engineEdgeLayer).toBe(2);
        second();
        expect("engineEdgeLayer" in globalThis).toBe(false);

        const getter = stage.globals({ engineEdgeGetter: 1 });

        expect(shared.engineEdgeGetter).toBe(1);
        getter();
        expect([shared.engineEdgeGetter, typeof Object.getOwnPropertyDescriptor(globalThis, "engineEdgeGetter")?.get]).toEqual([5, "function"]);

        const missing = stage.globals({ engineEdgeMissing: undefined });

        expect("engineEdgeMissing" in globalThis).toBe(false);
        missing();
        expect([reasonOf(() => stage.globals({ engineEdgeFresh: 2, engineEdgeSealed: 3 })), "engineEdgeFresh" in globalThis, shared.engineEdgeSealed]).toEqual(["test.global", false, 1]);

        const writable = stage.globals({ engineEdgeWritable: 2 });

        expect(shared.engineEdgeWritable).toBe(2);
        writable();
        expect(shared.engineEdgeWritable).toBe(1);

        const twice = stage.globals({ engineEdgeTwice: 1 });

        twice();
        shared.engineEdgeTwice = "later";
        twice();
        expect(shared.engineEdgeTwice).toBe("later");
        Reflect.deleteProperty(globalThis, "engineEdgeTwice");
        Reflect.deleteProperty(globalThis, "engineEdgeGetter");

    });
    it("spies keep this, calls, results and failures, and reset all three", () => {

        const made = stage.spy(function ( this: { k: number } | undefined, a: number ) {

            if ( a < 0 ) throw new Error("neg");

            return (this?.k ?? 0) + a;

        });
        const holder = { k: 10, made };

        expect(holder.made(1)).toBe(11);
        expect(() => made(-1)).toThrow("neg");
        expect([made.calls, made.results, made.failures.length]).toEqual([[[1], [-1]], [11], 1]);
        made.reset();
        expect([made.calls, made.results, made.failures]).toEqual([[], [], []]);

    });
    it("until waits for a truthy value, rejects with a thrown cause at once, times out on a pending or falsy check with its message, and junk spans fall back without timer warnings", async () => {

        const warned: string[] = [];
        const hear = ( warning: Error ): void => { warned.push(warning.name); };

        expect(await stage.until(() => "x", { timeout: 30 })).toBe("x");

        for ( const falsy of [0, "", null, false] ) await expect(stage.until(() => falsy, { timeout: 20, every: 2 })).rejects.toMatchObject({ reason: "test.until" });

        const started = performance.now();

        await expect(stage.until(() => { throw error.fault("conflict", "x.y"); }, { timeout: 1000 })).rejects.toMatchObject({ reason: "x.y" });
        expect(performance.now() - started < 500).toBe(true);
        await expect(stage.until(() => new Promise<boolean>(() => undefined), { timeout: 20 })).rejects.toMatchObject({ reason: "test.until" });
        await expect(stage.until(() => false, { timeout: 10, message: "custom" })).rejects.toMatchObject({ message: "custom" });
        process.on("warning", hear);

        try {

            await stage.tick(Number.NaN);
            await stage.tick(-5);
            await stage.until(() => true, { timeout: Number.NaN, every: -1 });
            await stage.tick(5);

        } finally {

            process.off("warning", hear);

        }

        expect(warned).toEqual([]);

        const logs = stage.logs("debug");

        for ( let at = 0; at < 1100; at += 1 ) logs.logger.debug(`m${at}`);

        expect([logs.entries.length, logs.messages()[0]]).toEqual([1000, "m100"]);

    });
    it("the live server gates channels, names a handler's fault, echoes unhandled requests, pongs, routes broadcasts only to members, forgets left channels and closes unauthenticated callers", async () => {

        const server = stage.live({ auth: ( token ) => token === "good", gate: ( channel ) => channel !== "secret", onFrame: async ( frame ) => { if ( frame.event === "boom" ) throw error.fault("conflict", "x.taken"); return false; } });
        const link = socket.open({ url: server.url, auth: "good", heartbeat: 0, reconnect: false });

        try {

            await link.connect();
            expect([await link.join("open").then(() => "ok"), await link.join("secret").then(() => "ok", ( caught: unknown ) => (error.isFault(caught) ? caught.reason : "?")), await link.request("boom", {}).then(() => "ok", ( caught: unknown ) => (error.isFault(caught) ? `${caught.code}/${caught.reason}` : "?")), await link.request("echo", 5)]).toEqual(["ok", "socket.forbidden", "conflict/x.taken", 5]);

            const raw = frames(server.url, "good");

            await raw.ready;
            raw.socket.send(socket.encode({ event: "join", channel: "news", id: "j1" }));
            raw.socket.send(socket.encode({ event: "ping", id: "p1" }));
            await stage.until(() => raw.seen.some(( frame ) => frame.event === "pong") && raw.seen.some(( frame ) => frame.event === "joined"), { timeout: 1000 });
            server.broadcast({ event: "for.news", channel: "news", data: 1 });
            server.broadcast({ event: "for.open", channel: "open", data: 2 });
            server.broadcast({ event: "for.all", data: 3 });
            await stage.until(() => raw.seen.some(( frame ) => frame.event === "for.all"), { timeout: 1000 });
            raw.socket.send(socket.encode({ event: "leave", channel: "news", id: "l1" }));
            await stage.until(() => raw.seen.some(( frame ) => frame.event === "left"), { timeout: 1000 });
            server.broadcast({ event: "after.leave", channel: "news", data: 4 });
            server.broadcast({ event: "marker", data: 5 });
            await stage.until(() => raw.seen.some(( frame ) => frame.event === "marker"), { timeout: 1000 });
            expect(raw.seen.map(( frame ) => frame.event).filter(( name ) => name.includes("."))).toEqual(["for.news", "for.all"]);
            raw.socket.close();

            const stranger = frames(server.url, undefined);

            await stranger.ready;
            stranger.socket.send(socket.encode({ event: "join", channel: "news", id: "1" }));
            expect(await stranger.closed).toBe(4001);

            const response = await fetch(server.url.replace("ws:", "http:"));

            expect([response.status, await response.text()]).toEqual([426, "websocket only"]);

        } finally {

            link.close();
            server.stop();
            server.stop();

        }

    });

});
