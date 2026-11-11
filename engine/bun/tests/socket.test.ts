import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as socket from "engine/socket";

type Side = socket.Socket & { fire: ( frame: socket.Frame ) => void; sent: socket.Frame[]; openNow: () => void; dropNow: ( code?: number, reason?: string ) => void };

function fakeSocket ( acking = true, ponging = false ): Side {

    const made: Side = {
        readyState: 0,
        sent: [],
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: ( text ) => {

            const frame = socket.decode(text);

            if ( !frame ) return;

            made.sent.push(frame);

            if ( acking && (frame.event === "join" || frame.event === "leave") && frame.id ) queueMicrotask(() => made.fire({ event: "ack", id: frame.id }));
            if ( ponging && frame.event === "ping" ) queueMicrotask(() => made.fire({ event: "pong", id: frame.id }));

        },
        close: () => {

            made.readyState = 3;
            made.onclose?.({ code: 1000, reason: "" });

        },
        fire: ( frame ) => made.onmessage?.({ data: socket.encode(frame) }),
        openNow: () => {

            made.readyState = 1;
            made.onopen?.();

        },
        dropNow: ( code = 1006, reason = "lost" ) => {

            made.readyState = 3;
            made.onclose?.({ code, reason });

        },
    };

    return made;

}
function told ( failure: unknown ): string {

    if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

    return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

}
function tick ( ms = 0 ): Promise<void> {

    return new Promise(( done ) => setTimeout(done, ms));

}

describe("socket", () => {

    it("frames encode compactly and decode defensively", () => {

        expect(socket.encode({ event: "hi", data: { a: 1 }, channel: undefined })).toBe('{"event":"hi","data":{"a":1}}');
        expect(socket.decode('{"event":"x","channel":"c","id":"1","data":null}')).toEqual({ event: "x", data: null, channel: "c", id: "1" });
        expect(socket.decode("nope")).toBeUndefined();
        expect(socket.decode('{"no":"event"}')).toBeUndefined();
        expect(socket.decode(5)).toBeUndefined();
        expect(socket.factory.has() && !socket.factory.bound()).toBe(true);
        expect([socket.decode('{"event":""}'), socket.decode('{"event":"x","channel":"","id":""}'), socket.decode(new TextEncoder().encode('{"event":"b"}')), socket.decode(new TextEncoder().encode('{"event":"b"}').buffer), socket.decode('{"event":"x"}', 5), socket.decode(new Uint8Array(10), 5), socket.decode('{"event":"x","__proto__":{"polluted":1}}')]).toEqual([undefined, { event: "x", data: undefined, channel: undefined, id: undefined }, { event: "b", data: undefined, channel: undefined, id: undefined }, { event: "b", data: undefined, channel: undefined, id: undefined }, undefined, undefined, { event: "x", data: undefined, channel: undefined, id: undefined }]);
        expect(({} as { polluted?: unknown }).polluted).toBeUndefined();

    });
    it("a connection authenticates, joins, requests, dispatches and reconnects", async () => {

        const sockets: Side[] = [];
        const statuses: string[] = [];
        const live = socket.open({ url: "wss://x", auth: () => "tok", heartbeat: 0, reconnect: { min: 1, max: 2 }, factory: () => { const made = fakeSocket(); sockets.push(made); return made; }, onStatus: ( status, attempt ) => { statuses.push(`${status}:${attempt}`); } });
        const seen: string[] = [];

        live.on("message", ( data ) => { seen.push(`m:${String(data)}`); });
        live.on("message", ( data ) => { seen.push(`room:${String(data)}`); }, "room");
        live.on("*", ( _, frame ) => { seen.push(`*:${frame.event}`); });

        const joining = live.join("room");
        const connecting = live.connect();

        expect(live.status()).toBe("connecting");
        await tick(1);
        expect(sockets).toHaveLength(1);
        sockets[0]?.openNow();
        await connecting;
        await joining;
        expect(live.status()).toBe("open");
        expect(sockets[0]?.sent.slice(0, 2).map(( frame ) => ({ ...frame, id: frame.id === undefined ? undefined : "id" }))).toEqual([{ event: "auth", data: { token: "tok" }, id: undefined }, { event: "join", channel: "room", id: "id" }]);
        expect([live.channels(), live.joined("room"), live.joined("other")]).toEqual([["room"], true, false]);
        expect(live.emit("hello", { x: 1 })).toBe(true);
        expect(sockets[0]?.sent.at(-1)).toEqual({ event: "hello", data: { x: 1 } });

        sockets[0]?.fire({ event: "message", data: "a" });
        sockets[0]?.fire({ event: "message", data: "b", channel: "room" });
        sockets[0]?.fire({ event: "ping" });
        expect(seen.filter(( item ) => item.startsWith("m:"))).toEqual(["m:a", "m:b"]);
        expect(seen.filter(( item ) => item.startsWith("room:"))).toEqual(["room:b"]);
        expect(seen.filter(( item ) => item.startsWith("*:"))).toEqual(["*:message", "*:message"]);
        expect(sockets[0]?.sent.at(-1)).toEqual({ event: "pong" });

        const answer = live.request("sum", [1, 2]);
        const asked = sockets[0]?.sent.at(-1);

        expect(asked?.event).toBe("sum");
        expect(asked?.id).toBeDefined();
        sockets[0]?.fire({ event: "ack", id: asked?.id, data: 3 });
        expect(await answer).toBe(3);

        const refused = live.request("bad", {});
        const badId = sockets[0]?.sent.at(-1)?.id;

        sockets[0]?.fire({ event: "error", id: badId, data: { code: "forbidden", message: "no" } });
        await expect(refused).rejects.toMatchObject({ code: "forbidden" });
        await expect(live.request("slow", {}, { timeout: 5 })).rejects.toMatchObject({ code: "timeout", reason: "socket.request" });

        const later = live.once("later");

        sockets[0]?.fire({ event: "later", data: "ok" });
        expect(await later).toBe("ok");

        const hanging = live.request("never", {});

        sockets[0]?.dropNow();
        await expect(hanging).rejects.toMatchObject({ reason: "socket.closed" });
        await tick(15);
        expect(sockets).toHaveLength(2);
        sockets[1]?.openNow();
        await tick(1);
        expect(live.status()).toBe("open");
        expect(sockets[1]?.sent.map(( frame ) => ({ ...frame, id: frame.id === undefined ? undefined : "id" }))).toEqual([{ event: "auth", data: { token: "tok" }, id: undefined }, { event: "join", channel: "room", id: "id" }]);
        expect(live.joined("room")).toBe(true);

        const leaving = live.leave("room");

        await leaving;
        expect([live.channels(), sockets[1]?.sent.at(-1)?.event]).toEqual([[], "leave"]);
        await live.leave("unknown");
        expect(sockets[1]?.sent.at(-1)?.event).toBe("leave");
        live.close();
        expect(live.status()).toBe("closed");
        expect(live.emit("x")).toBe(false);
        await expect(live.request("x")).rejects.toMatchObject({ reason: "socket.closed" });
        expect(statuses[0]).toBe("connecting:1");
        expect(statuses.at(-1)).toBe("closed:2");
        expect(statuses).toContain("open:1");

    });
    it("a connection gives up after the reconnect limit", async () => {

        const made: Side[] = [];
        const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1, limit: 2 }, factory: () => { const next = fakeSocket(); made.push(next); return next; } });
        const connecting = live.connect();

        await tick(1);
        made[0]?.dropNow();
        await tick(10);
        made[1]?.dropNow();
        await expect(connecting).rejects.toMatchObject({ reason: "socket.closed" });
        expect(live.status()).toBe("failed");
        expect(live.attempts()).toBe(2);

        const none = socket.open({ url: "wss://x", reconnect: false, factory: () => { throw new Error("no socket"); } });

        await expect(none.connect()).rejects.toMatchObject({ reason: "socket.open" });

    });
    it("a channel scopes a connection and presence follows joins, leaves and syncs", async () => {

        const side = fakeSocket();
        const made = socket.open({ url: "wss://x", factory: () => side, reconnect: false, heartbeat: 0 });
        const room = socket.channel(made, "room-1");
        const who = socket.presence(made, "room-1");
        const counts: number[] = [];
        const stop = who.watch(( state ) => { counts.push(state.count); });
        const opened = made.connect();

        side.openNow();
        await opened;
        side.fire({ event: "presence.synced", channel: "room-1", data: ["ann", { id: "omar", data: { typing: true } }] });
        side.fire({ event: "presence.joined", channel: "room-1", data: "lina" });
        side.fire({ event: "presence.joined", channel: "room-1", data: "lina" });
        side.fire({ event: "presence.left", channel: "room-1", data: { id: "ann" } });
        expect(who.members().map(( member ) => member.id)).toEqual(["omar", "lina"]);
        expect(who.has("omar") && !who.has("ann")).toBe(true);
        expect(who.state().count).toBe(2);
        expect(counts).toEqual([2, 3, 2]);
        side.fire({ event: "presence.synced", channel: "room-1", data: "not a list" });
        expect(who.state().count).toBe(2);

        const heard: unknown[] = [];

        room.on("typed", ( data ) => { heard.push(data); });
        side.fire({ event: "typed", channel: "room-1", data: "hi" });
        side.fire({ event: "typed", channel: "other", data: "no" });
        expect(heard).toEqual(["hi"]);
        expect(room.emit("say", { text: "x" })).toBe(true);
        expect(side.sent.at(-1)).toEqual({ event: "say", data: { text: "x" }, channel: "room-1" });
        expect(room.name).toBe("room-1");
        stop();
        who.stop();
        made.close();

    });
    it("joins wait for an ack, time out on silence, are forgotten when refused, and a leave settles a pending join", async () => {

        const side = fakeSocket(false);
        const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, timeout: 20, factory: () => side });

        void live.connect();
        await tick(1);
        side.openNow();
        expect([await live.join("room").then(() => "joined", told), live.channels(), live.joined("room")]).toEqual(["timeout/socket.join", ["room"], false]);

        const joining = live.join("again");

        await tick(1);
        side.fire({ event: "error", id: side.sent.at(-1)?.id, data: { code: "forbidden", message: "no" } });
        expect([await joining.then(() => "joined", told), live.channels()]).toEqual(["forbidden/undefined", ["room"]]);

        const left = live.join("leaving");
        const leaving = live.leave("leaving");

        expect([await left.then(() => "joined", told), live.channels()]).toEqual(["conflict/socket.left", ["room"]]);
        side.fire({ event: "ack", id: side.sent.at(-1)?.id });
        await leaving;
        expect([await live.join("").then(() => "joined", told), await live.join("a b").then(() => "joined", told)]).toEqual(["internal/socket.channel", "internal/socket.channel"]);

        const twice = live.join("dup");
        const again = live.join("dup");

        await tick(1);
        expect(side.sent.filter(( frame ) => frame.channel === "dup").length).toBe(1);
        side.fire({ event: "ack", id: side.sent.at(-1)?.id });
        await Promise.all([twice, again]);
        expect([live.joined("dup"), await live.join("dup").then(() => "joined", told)]).toEqual([true, "joined"]);
        live.close();
        expect([live.channels(), live.joined("dup")]).toEqual([["room", "dup"].sort(), false]);

    });
    it("close codes decide the reconnect, attempts count until a steady link, and a failed link reports its cause", async () => {

        const sides: Side[] = [];
        const statuses: string[] = [];
        const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 2, limit: 5, steady: 5 }, factory: () => { const made = fakeSocket(); sides.push(made); return made; }, onStatus: ( status, attempt ) => { statuses.push(`${status}:${attempt}`); } });

        void live.connect();
        await tick(1);
        sides[0]?.openNow();
        sides[0]?.dropNow(1000, "bye");
        await tick(10);
        sides[1]?.openNow();
        await tick(10);
        expect([live.attempts(), live.status()]).toEqual([0, "open"]);
        sides[1]?.dropNow(1008, "policy");
        await tick(10);
        expect([statuses, sides.length, live.status(), told(live.cause()), live.attempts()]).toEqual([["connecting:1", "open:1", "connecting:1", "connecting:2", "open:2", "failed:0"], 2, "failed", "forbidden/socket.refused", 0]);

        const sides2: Side[] = [];
        const refusing = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1 }, factory: () => { const made = fakeSocket(); sides2.push(made); return made; } });

        void refusing.connect().catch(() => undefined);
        await tick(1);
        sides2[0]?.openNow();
        sides2[0]?.dropNow(4001, "token");
        await tick(5);
        expect([sides2.length, refusing.status(), told(refusing.cause())]).toEqual([1, "failed", "unauthorized/socket.refused"]);

        const sides3: Side[] = [];
        const custom = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1, when: ( code ) => code !== 4999 }, factory: () => { const made = fakeSocket(); sides3.push(made); return made; } });

        void custom.connect().catch(() => undefined);
        await tick(1);
        sides3[0]?.openNow();
        sides3[0]?.dropNow(4999, "custom");
        await tick(5);
        expect([sides3.length, custom.status(), told(custom.cause())]).toEqual([1, "failed", "unavailable/socket.closed"]);
        const again = custom.connect();

        await tick(1);
        expect([sides3.length, custom.status()]).toEqual([2, "connecting"]);
        custom.close();
        expect(await again.then(() => "connected", told)).toBe("unavailable/socket.closed");

    });
    it("requests made while connecting are held and answered after the link opens, sent ones die with the link, and backlog bounds hold", async () => {

        const sides: Side[] = [];
        const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1, limit: 3 }, buffer: 1, factory: () => { const made = fakeSocket(); sides.push(made); return made; } });

        void live.connect().catch(() => undefined);

        const held = live.request("early", 1, { timeout: 500 });

        expect([live.emit("buffered", 1), live.emit("dropped", 2)]).toEqual([true, false]);
        await tick(1);
        sides[0]?.openNow();
        await tick(1);
        expect(sides[0]?.sent.map(( frame ) => frame.event)).toEqual(["early", "buffered"]);
        sides[0]?.fire({ event: "ack", id: sides[0]?.sent[0]?.id, data: "ok" });
        expect(await held).toBe("ok");

        const pending = live.request("slow", 1, { timeout: 200 });
        const second = live.request("later", 2, { timeout: 200 });

        sides[0]?.dropNow();
        expect([await pending.then(() => "answered", told), await second.then(() => "answered", told), live.status()]).toEqual(["unavailable/socket.closed", "unavailable/socket.closed", "connecting"]);

        const controller = new AbortController();
        const aborted = live.request("hold", 3, { signal: controller.signal, timeout: 500 });

        controller.abort(new Error("leaving"));
        expect(await aborted.then(() => "answered", told)).toBe("timeout/socket.aborted");
        expect([await live.request("", 1).then(() => "answered", told), await live.request("x", 1, { timeout: -1 }).then(() => "answered", told), await live.request("x", "y".repeat(70_000)).then(() => "answered", told)]).toEqual(["internal/socket.event", "RangeError: not a duration", "too_large/socket.frame"]);
        await tick(5);
        sides[1]?.openNow();
        await tick(1);
        expect(sides[1]?.sent).toEqual([]);

        const flooded = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, backlog: 10, factory: () => { const made = fakeSocket(); made.bufferedAmount = 11; sides.push(made); return made; } });

        void flooded.connect();
        await tick(1);
        sides.at(-1)?.openNow();
        expect([flooded.emit("x", 1), await flooded.request("x", 1).then(() => "answered", told)]).toEqual([false, "unavailable/socket.busy"]);
        live.close();
        flooded.close();

    });
    it("frames are bounded and named, heard frames are counted, pings answer with their id, the greeting carries the id, and the heartbeat drops a silent peer", async () => {

        const side = fakeSocket();
        const live = socket.open({ url: "https://x/path", heartbeat: 0, reconnect: false, factory: ( url ) => { side.sent.push({ event: `dial ${url}` }); return side; }, maxFrame: 64 });

        void live.connect();
        await tick(1);
        side.openNow();
        expect(side.sent[0]?.event).toBe("dial wss://x/path");
        expect([told(( () => { try { return live.emit("x", "y".repeat(100)); } catch ( cause ) { return cause; } } )()), told(( () => { try { return live.emit("x y", 1); } catch ( cause ) { return cause; } } )()), told(( () => { try { return live.emit("x", 1, "bad room"); } catch ( cause ) { return cause; } } )()), told(( () => { try { return live.on("", () => undefined); } catch ( cause ) { return cause; } } )()), told(( () => { try { return live.on("x", () => undefined, "bad room"); } catch ( cause ) { return cause; } } )())]).toEqual(["too_large/socket.frame", "internal/socket.event", "internal/socket.channel", "internal/socket.event", "internal/socket.channel"]);
        expect([live.emit("ok", "é".repeat(20)), told(( () => { try { return live.emit("ok", "é".repeat(31)); } catch ( cause ) { return cause; } } )())]).toEqual([true, "too_large/socket.frame"]);
        side.fire({ event: "ping", id: "p1" });
        side.fire({ event: "connected", data: { id: "conn-9" } });
        side.fire({ event: "junk" });
        side.onmessage?.({ data: "not json" });
        side.onmessage?.({ data: new TextEncoder().encode(socket.encode({ event: "bytes", data: 1 })) });
        side.onmessage?.({ data: socket.encode({ event: "big", data: "x".repeat(100) }) });
        expect([side.sent.at(-1), live.id(), live.stats()]).toEqual([{ event: "pong", id: "p1" }, "conn-9", { sent: 2, received: 4, refused: 2, opens: 1 }]);
        live.close();

        const beating = fakeSocket();
        const faults: string[] = [];
        const pulse = socket.open({ url: "wss://x", heartbeat: 10, timeout: 50, reconnect: false, factory: () => beating, fail: ( cause ) => { faults.push(told(cause)); } });

        void pulse.connect().catch(( cause: unknown ) => { faults.push(`connect ${told(cause)}`); });
        await tick(1);
        beating.openNow();
        await tick(25);
        expect([beating.sent.map(( frame ) => frame.event), pulse.status(), faults, beating.readyState, told(pulse.cause())]).toEqual([["ping"], "failed", [], 3, "timeout/socket.heartbeat"]);

        const answered = fakeSocket(true, true);
        const alive = socket.open({ url: "wss://x", heartbeat: 10, reconnect: false, factory: () => answered });

        void alive.connect();
        await tick(1);
        answered.openNow();
        await tick(35);
        expect([alive.status(), answered.sent.filter(( frame ) => frame.event === "ping").length >= 2]).toEqual(["open", true]);
        alive.close();

    });
    it("the address and token are read per dial, a faulted token ends the link, a plain failure is retried, and options are checked at the door", async () => {

        const sides: Side[] = [];
        let tokens = 0;
        const live = socket.open({ url: async () => { await tick(1); return "wss://x"; }, auth: async () => { tokens += 1; return tokens === 1 ? "t1" : "t2"; }, heartbeat: 0, reconnect: { min: 1, max: 1 }, factory: () => { const made = fakeSocket(); sides.push(made); return made; } });

        void live.connect().catch(() => undefined);
        await tick(5);
        sides[0]?.openNow();
        sides[0]?.dropNow();
        await tick(10);
        sides[1]?.openNow();
        await tick(1);
        expect(sides.map(( side ) => side.sent[0]?.data)).toEqual([{ token: "t1" }, { token: "t2" }]);
        live.close();

        const failing = socket.open({ url: "wss://x", auth: () => { throw error.fault("unauthorized", "no token"); }, reconnect: { min: 1 }, factory: () => fakeSocket() });

        expect([await failing.connect().then(() => "connected", told), failing.status()]).toEqual(["unauthorized/no token", "failed"]);

        let asked = 0;
        const flaky: Side[] = [];
        const retrying = socket.open({ url: "wss://x", auth: () => { asked += 1; if ( asked < 3 ) throw new Error("network"); return "t"; }, heartbeat: 0, reconnect: { min: 1, max: 1 }, factory: () => { const made = fakeSocket(); flaky.push(made); return made; } });
        const connecting = retrying.connect();

        await tick(15);
        flaky[0]?.openNow();
        await connecting;
        expect([asked, flaky.length, retrying.status(), flaky[0]?.sent[0]?.data]).toEqual([3, 1, "open", { token: "t" }]);
        retrying.close();

        for ( const [options, expected] of [[{ url: "javascript:alert(1)" }, "internal/socket.url"], [{ url: "ws:/x" }, "internal/socket.url"], [{ url: "" }, "internal/socket.url"], [{ url: "//x" }, "internal/socket.url"], [{ url: "wss://x y" }, "internal/socket.url"], [{ url: async () => "ftp://x" }, "internal/socket.url"], [{ url: `wss://${"x".repeat(3000)}` }, "internal/socket.url"]] as const ) {

            const bad = socket.open({ ...options, reconnect: false, factory: () => fakeSocket() });

            expect(await bad.connect().then(() => "connected", told)).toBe(expected);

        }

        for ( const [options, expected] of [[{ heartbeat: Number.NaN }, "RangeError: not a duration"], [{ timeout: -1 }, "RangeError: not a duration"], [{ maxFrame: Number.NaN }, "RangeError: not a size"], [{ buffer: -1 }, "RangeError: not a size"], [{ backlog: Number.NaN }, "RangeError: not a size"], [{ reconnect: { factor: 0.5 } }, "RangeError: not a factor"], [{ reconnect: { limit: -1 } }, "RangeError: not a count"], [{ reconnect: { min: Number.NaN } }, "RangeError: not a duration"], [{ reconnect: { steady: -1 } }, "RangeError: not a duration"]] as const ) expect(told(( () => { try { socket.open({ url: "wss://x", factory: () => fakeSocket(), ...options }); return "accepted"; } catch ( cause ) { return cause; } } )())).toBe(expected);

    });
    it("listeners run to the end past a throwing peer, the failure reaches fail, once waits with a bound, and stale sockets are ignored", async () => {

        const sides: Side[] = [];
        const faults: string[] = [];
        const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1 }, factory: () => { const made = fakeSocket(); sides.push(made); return made; }, fail: ( cause ) => { faults.push(told(cause)); } });
        const heard: string[] = [];

        live.on("x", () => { throw new Error("boom"); });
        live.on("x", ( data ) => { heard.push(String(data)); });
        live.watch(() => { throw new Error("status boom"); });
        void live.connect();
        await tick(1);
        sides[0]?.openNow();
        sides[0]?.fire({ event: "x", data: "1" });
        expect([heard, faults]).toEqual([["1"], ["Error: status boom", "Error: status boom", "Error: boom"]]);

        const stale = sides[0] as Side;

        stale.dropNow();
        await tick(5);
        sides[1]?.openNow();
        stale.fire({ event: "x", data: "stale" });
        stale.onopen?.();
        stale.onclose?.({ code: 1006, reason: "late" });
        expect([heard, live.status(), sides.length]).toEqual([["1"], "open", 2]);
        expect([await live.once("never", undefined, 5).then(() => "heard", told), await live.once("never", undefined, { signal: AbortSignal.abort() }).then(() => "heard", told)]).toEqual(["timeout/socket.wait", "timeout/socket.aborted"]);

        const soon = live.once("soon", "room", 50);

        sides[1]?.fire({ event: "soon", data: "no room" });
        sides[1]?.fire({ event: "soon", data: "in room", channel: "room" });
        expect(await soon).toBe("in room");

        const twice: string[] = [];
        const handler = ( data: unknown ): void => { twice.push(String(data)); };
        const offA = live.on("dup", handler);
        const offB = live.on("dup", handler);

        sides[1]?.fire({ event: "dup", data: "d" });
        offA();
        sides[1]?.fire({ event: "dup", data: "e" });
        offB();
        sides[1]?.fire({ event: "dup", data: "f" });
        expect(twice).toEqual(["d", "d", "e"]);
        live.close();

        const loud = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => fakeSocket() });

        const quiet = loud.watch(() => { throw new Error("unhandled"); });

        expect(await loud.connect().then(() => "connected", told)).toBe("Error: unhandled");
        quiet();
        loud.close();
        expect(loud.status()).toBe("closed");

    });
    it("survivors: binary frames are bounded in bytes, backoff caps at max, a closing socket takes nothing, held asks move on, stale acks and stale sockets are ignored", async () => {

        expect([socket.decode(new TextEncoder().encode('{"event":"é"}'), 13), socket.decode('{"event":"é"}', 13)?.event]).toEqual([undefined, "é"]);

        const sides: Side[] = [];
        const quick = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1000, max: 1, factor: 10, limit: 5 }, factory: () => { const made = fakeSocket(); sides.push(made); return made; } });

        void quick.connect().catch(() => undefined);
        await tick(1);
        sides[0]?.openNow();
        sides[0]?.dropNow();
        await tick(30);
        expect(sides.length).toBe(2);
        sides[1]?.dropNow();
        await tick(30);
        expect(sides.length).toBe(3);
        quick.close();

        const closing = fakeSocket();
        const half = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => closing });

        void half.connect();
        await tick(1);
        closing.openNow();
        closing.readyState = 2;
        closing.fire({ event: "ping", id: "late" });
        expect([closing.sent.map(( frame ) => frame.event), half.stats().sent, half.emit("x", 1)]).toEqual([[], 0, false]);
        half.close();

        const holding: Side[] = [];
        const held = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1 }, factory: () => { const made = fakeSocket(); holding.push(made); return made; } });

        void held.connect().catch(() => undefined);

        const early = held.request("early", 1, { timeout: 500 });

        await tick(1);
        holding[0]?.openNow();
        await tick(1);
        holding[0]?.dropNow();
        expect(await early.then(() => "answered", told)).toBe("unavailable/socket.closed");
        await tick(5);
        holding[1]?.openNow();
        await tick(1);
        expect(holding[1]?.sent).toEqual([]);

        const racing = held.request("race", 1, { timeout: 5 }).then(() => "answered", told);

        await tick(10);
        expect(await racing).toBe("timeout/socket.request");
        holding[1]?.fire({ event: "ack", id: holding[1]?.sent.at(-1)?.id, data: "late" });
        expect(held.stats().received).toBe(1);
        held.close();

        const rooms = fakeSocket(false);
        const roomy = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, timeout: 500, factory: () => rooms });

        void roomy.connect();
        await tick(1);
        rooms.openNow();

        const first = roomy.join("r").then(() => "joined", told);

        await tick(1);

        const stale = rooms.sent.at(-1)?.id;
        const leaving = roomy.leave("r");

        await tick(1);
        rooms.fire({ event: "ack", id: rooms.sent.at(-1)?.id });
        await leaving;
        expect(await first).toBe("conflict/socket.left");

        const second = roomy.join("r").then(() => "joined", told);

        await tick(1);
        rooms.fire({ event: "ack", id: stale });
        expect([roomy.joined("r"), await Promise.race([second, tick(5).then(() => "pending")])]).toEqual([false, "pending"]);
        rooms.fire({ event: "ack", id: rooms.sent.at(-1)?.id });
        expect([await second, roomy.joined("r")]).toEqual(["joined", true]);

        const strays: string[] = [];

        roomy.on("*", ( _, frame ) => { strays.push(frame.event); });
        rooms.fire({ event: "pong" });
        rooms.fire({ event: "ack", id: "unknown" });
        rooms.fire({ event: "ack" });
        rooms.fire({ event: "news" });
        expect(strays).toEqual(["ack", "news"]);
        roomy.close();

        const twice: Side[] = [];
        const reopened = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1 }, factory: () => { const made = fakeSocket(); twice.push(made); return made; } });

        void reopened.connect().catch(() => undefined);
        await tick(1);
        twice[0]?.openNow();
        twice[0]?.dropNow();
        await tick(5);
        twice[1]?.openNow();
        twice[0]?.openNow();
        expect([reopened.stats().opens, reopened.status()]).toEqual([2, "open"]);
        reopened.close();

    });
    it("survivors: open deadlines, late dials, presence ids, actor lists, limits, quiet re-syncs, unknown leaves and sync on open", async () => {

        const never = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, timeout: 20, factory: () => fakeSocket() });

        expect([await never.connect().then(() => "connected", told), never.status()]).toEqual(["timeout/socket.open", "failed"]);

        const dials: Side[] = [];
        const late = socket.open({ url: async () => { await tick(10); return "wss://x"; }, heartbeat: 0, reconnect: false, factory: () => { const made = fakeSocket(); dials.push(made); return made; } });
        const connecting = late.connect().then(() => "connected", told);

        late.close();
        await tick(20);
        expect([dials.length, await connecting, late.status()]).toEqual([0, "unavailable/socket.closed", "closed"]);

        const side = fakeSocket();
        const made = socket.open({ url: "wss://x", factory: () => side, reconnect: false, heartbeat: 0 });
        const who = socket.presence(made, "room", { limit: 2 });
        const counts: number[] = [];

        who.watch(( state ) => { counts.push(state.count); });
        expect(() => socket.presence(made, "room", { limit: Number.NaN })).toThrow(new RangeError("not a count"));
        expect(() => socket.presence(made, "room", { limit: -1 })).toThrow(new RangeError("not a count"));
        void made.connect();
        await tick(1);
        side.openNow();
        side.fire({ event: "presence.joined", channel: "room", data: "x".repeat(300) });
        side.fire({ event: "presence.joined", channel: "room", data: { id: 7, data: { x: 1 } } });
        side.fire({ event: "presence.joined", channel: "room", data: { id: 7, data: { x: 1 } } });
        side.fire({ event: "presence.left", channel: "room", data: "nobody" });
        expect([who.members().map(( member ) => member.id), counts]).toEqual([["7"], [1]]);
        side.fire({ event: "presence.synced", channel: "room", data: { actors: ["a", "b", "c", "d"] } });
        expect([who.members().map(( member ) => member.id), counts]).toEqual([["a", "b"], [1, 2]]);
        side.fire({ event: "presence.synced", channel: "room", data: ["a", "b"] });
        side.fire({ event: "presence.joined", channel: "room", data: "c" });
        expect([who.members().map(( member ) => member.id), counts, who.get("a")?.id]).toEqual([["a", "b"], [1, 2], "a"]);
        who.stop();
        side.fire({ event: "presence.synced", channel: "room", data: [] });
        expect(who.state().count).toBe(2);
        made.close();

        const syncing = fakeSocket();
        const live = socket.open({ url: "wss://x", factory: () => syncing, reconnect: false, heartbeat: 0 });
        const synced = socket.presence(live, "lobby", { sync: true });

        void live.connect();
        await tick(1);
        syncing.openNow();
        await tick(1);
        expect(syncing.sent.map(( frame ) => `${frame.event}:${frame.channel ?? "-"}`)).toEqual(["join:lobby", "presence:lobby"]);
        syncing.fire({ event: "ack", id: syncing.sent.at(-1)?.id, data: ["p", "q"] });
        await tick(1);
        expect(synced.members().map(( member ) => member.id)).toEqual(["p", "q"]);

        const asked = synced.sync();

        await tick(1);
        syncing.fire({ event: "ack", id: syncing.sent.at(-1)?.id, data: ["p"] });
        expect([(await asked).count, synced.state().count]).toEqual([1, 1]);
        synced.stop();
        live.close();

    });
    it("survivors: a request made while connecting survives a failed dial and is sent on the next link", async () => {

        const sides: Side[] = [];
        const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 1, max: 1, limit: 3 }, factory: () => { const made = fakeSocket(); sides.push(made); return made; } });

        void live.connect().catch(() => undefined);

        const early = live.request("early", 1, { timeout: 500 }).then(( data ) => `answered ${String(data)}`, told);

        await tick(1);
        sides[0]?.dropNow();
        await tick(5);
        sides[1]?.openNow();
        await tick(1);
        expect(sides[1]?.sent.map(( frame ) => frame.event)).toEqual(["early"]);
        sides[1]?.fire({ event: "ack", id: sides[1]?.sent[0]?.id, data: "ok" });
        expect(await early).toBe("answered ok");
        live.close();

    });
});
