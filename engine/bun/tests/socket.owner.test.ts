import { expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as exception from "engine/exception";
import * as socket from "engine/socket";

it("cancellation during a provider send is observed before arming the timeout", async () => {

    const controller = new AbortController();
    const wire: socket.Socket = {
        readyState: 0,
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null,
        send: () => { controller.abort(); },
        close: () => undefined,
    };
    const made = api.connect({ url: "wss://test.example", factory: () => wire, heartbeat: 0, reconnect: false });

    const connected = made.connect();

    try {

        await new Promise(( resolve ) => setTimeout(resolve, 0));
        wire.readyState = 1;
        wire.onopen?.();
        await connected;
        await expect(made.request("work", {}, { signal: controller.signal, timeout: 5 })).rejects.toMatchObject({ reason: "socket.aborted" });

    } finally {

        made.close();

    }

});


it("a supplied tuple protocol owns wire keys, controls and failures without reserved application event names", async () => {

    const sent: string[] = [];
    const wire: socket.Socket = { readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: ( text ) => { sent.push(text); } };
    const protocol: socket.Protocol = {
        encode: ( frame, command ) => JSON.stringify([command ? { ping: "p", pong: "q", join: "+", leave: "-" }[command] : frame.event, frame.data ?? null, frame.channel ?? null, frame.id ?? null]),
        decode: ( text ) => {

            const [event, data, channel, id] = JSON.parse(text) as [string, unknown, string | null, string | null];

            return { event, data, channel: channel ?? undefined, id: id ?? undefined };

        },
        kind: ( frame ) => frame.event === "p" ? "ping" : frame.event === "q" ? "quiet" : frame.event === "!" ? "error" : undefined,
        fault: ( frame ) => exception.fault("conflict", String(frame.data)),
        identity: () => undefined,
    };
    const made = socket.open({ url: "wss://example.test", protocol, factory: () => wire, heartbeat: 0, reconnect: false });
    const heard: string[] = [];

    made.on("*", ( _, frame ) => { heard.push(frame.event); });
    await made.connect();

    try {

        wire.onmessage?.({ data: '["ping",1,null,null]' });
        wire.onmessage?.({ data: '["connected",2,null,null]' });
        wire.onmessage?.({ data: '["p",null,null,"beat"]' });
        expect(heard).toEqual(["ping", "connected"]);
        expect(sent).toEqual(['["q",null,null,"beat"]']);

        const joined = made.join("news");
        const join = JSON.parse(sent.at(-1) ?? "") as unknown[];

        expect(join.slice(0, 3)).toEqual(["+", null, "news"]);
        wire.onmessage?.({ data: JSON.stringify(["ok", null, "news", join[3]]) });
        await joined;
        expect(made.joined("news")).toBe(true);

        const request = made.request("work");
        const ask = JSON.parse(sent.at(-1) ?? "") as unknown[];

        wire.onmessage?.({ data: JSON.stringify(["!", "busy", null, ask[3]]) });
        await expect(request).rejects.toMatchObject({ code: "conflict", reason: "busy" });
        expect(made.id()).toBeUndefined();

    } finally {

        made.close();

    }

});
it("inbound string and binary payloads share UTF-8 bounds, including lone surrogates", async () => {

    const wire: socket.Socket = { readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: () => undefined };
    const seen: unknown[] = [];
    const protocol: socket.Protocol = { encode: ( frame ) => String(frame.data), decode: ( text ) => ({ event: "data", data: text }), kind: () => undefined, fault: () => exception.fault("internal"), identity: () => undefined };
    const made = socket.open({ url: "wss://example.test", protocol, factory: () => wire, heartbeat: 0, reconnect: false, maxFrame: 2 });

    made.on("data", ( value ) => { seen.push(value); });
    await made.connect();

    try {

        wire.onmessage?.({ data: "\ud800" });
        wire.onmessage?.({ data: "éé" });
        wire.onmessage?.({ data: new TextEncoder().encode("éé") });
        wire.onmessage?.({ data: "é" });
        expect(seen).toEqual(["é"]);
        expect(made.stats().refused).toBe(3);
        expect(() => made.emit("data", "\ud800")).toThrow();
        expect(made.emit("data", "é")).toBe(true);

    } finally {

        made.close();

    }

});
it("pending requests are bounded even on an open socket with an empty native buffer", async () => {

    const wire: socket.Socket = { readyState: 1, bufferedAmount: 0, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: () => undefined };
    const made = api.connect({ url: "wss://example.test", factory: () => wire, heartbeat: 0, reconnect: false });
    const pending: Promise<unknown>[] = [];

    await made.connect();

    try {

        for ( let at = 0; at < 1024; at += 1 ) pending.push(made.request("never").catch(( cause: unknown ) => cause));

        await expect(made.request("excess")).rejects.toMatchObject({ reason: "socket.busy" });
        expect(made.stats().sent).toBe(1024);

    } finally {

        made.close();
        await Promise.all(pending);

    }

});
it("default reconnect is bounded and normal close is terminal unless the caller explicitly chooses otherwise", async () => {

    let calls = 0;
    const made = api.connect({ url: "wss://example.test", heartbeat: 0, timeout: 1000, reconnect: { min: 0, max: 0 }, factory: () => {

        calls += 1;

        const wire: socket.Socket = { readyState: 0, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: () => undefined };

        queueMicrotask(() => wire.onclose?.({ code: 1006, reason: "" }));

        return wire;

    } });

    await expect(made.connect()).rejects.toMatchObject({ reason: "socket.closed" });
    expect(calls).toBe(8);
    expect(made.status()).toBe("failed");
    made.close();

    const wire: socket.Socket = { readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: () => undefined };
    const normal = api.connect({ url: "wss://example.test", factory: () => wire, heartbeat: 0 });

    await normal.connect();
    wire.onclose?.({ code: 1000, reason: "finished" });
    expect(normal.status()).toBe("failed");
    normal.close();

});

it("a channel scopes every operation and releases its listeners", async () => {

    const sent: socket.Frame[] = [];
    const wire: socket.Socket = { readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: ( text ) => {

        const frame = api.decodeFrame(text);

        if ( !frame ) throw new Error("invalid fixture frame");

        sent.push(frame);

        if ( frame.id ) queueMicrotask(() => wire.onmessage?.({ data: api.encodeFrame({ event: "ack", channel: frame.channel, id: frame.id, data: 42 }) }));

    } };
    const made = api.connect({ url: "wss://example.test", factory: () => wire, heartbeat: 0, reconnect: false });

    await made.connect();

    try {

        const room = socket.channel(made, "room");
        const seen: unknown[] = [];
        const stop = room.on("news", ( data ) => { seen.push(data); });

        expect(room.name).toBe("room");
        expect(room.joined()).toBe(false);
        await room.join();
        expect(room.joined()).toBe(true);

        const once = room.once("news", 100);

        wire.onmessage?.({ data: api.encodeFrame({ event: "news", channel: "other", data: "wrong" }) });
        wire.onmessage?.({ data: api.encodeFrame({ event: "news", channel: "room", data: "right" }) });
        expect(await once).toBe("right");
        expect(seen).toEqual(["right"]);
        stop();
        wire.onmessage?.({ data: api.encodeFrame({ event: "news", channel: "room", data: "later" }) });
        expect(seen).toEqual(["right"]);
        expect(room.emit("fire", 1)).toBe(true);
        expect(await room.request("ask", 2, 100)).toBe(42);
        expect(await room.request("ask", 3, { timeout: 100 })).toBe(42);
        await room.leave();
        expect(room.joined()).toBe(false);
        expect(sent.every(( frame ) => frame.channel === "room")).toBe(true);

    } finally {

        made.close();

    }

});

it("protocol callback failures cannot escape receive, leave a join hanging or crash a heartbeat", async () => {

    let broken = true;
    const wire: socket.Socket = { readyState: 1, onopen: null, onclose: null, onmessage: null, onerror: null, close: () => undefined, send: ( text ) => {

        const frame = api.decodeFrame(text);

        if ( frame?.id ) queueMicrotask(() => wire.onmessage?.({ data: api.encodeFrame({ event: "error", id: frame.id, channel: frame.channel }) }));

    } };
    const protocol: socket.Protocol = {
        ...api.liveProtocol,
        kind: ( frame ) => { if ( broken ) throw new Error("bad classifier"); return api.liveProtocol.kind(frame); },
        fault: () => { throw new Error("bad fault reader"); },
        ending: () => { throw new Error("bad close reader"); },
    };
    const made = socket.open({ url: "wss://example.test", protocol, factory: () => wire, heartbeat: 0, reconnect: false });

    await made.connect();
    expect(() => wire.onmessage?.({ data: api.encodeFrame({ event: "news" }) })).not.toThrow();
    expect(made.stats().refused).toBe(1);
    broken = false;
    await expect(made.join("room")).rejects.toMatchObject({ reason: "socket.join" });
    expect(() => wire.onclose?.({ code: 1000, reason: "" })).not.toThrow();
    expect(made.status()).toBe("failed");
    made.close();

    const beating = socket.open({ url: "wss://example.test", protocol: { ...api.liveProtocol, encode: () => { throw new Error("bad encoder"); } }, factory: () => wire, heartbeat: 1, reconnect: false });

    await beating.connect();
    await new Promise(( resolve ) => setTimeout(resolve, 10));
    expect(beating.status()).toBe("failed");
    beating.close();

});
