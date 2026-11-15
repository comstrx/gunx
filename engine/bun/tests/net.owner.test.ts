import { expect, test as it, jest } from "bun:test";
import * as net from "engine/net";

function streamed ( chunks: readonly Uint8Array[] ): Response {

    return new Response(new ReadableStream({ start ( controller ) {

        for ( const chunk of chunks ) controller.enqueue(chunk);

        controller.close();

    } }), { headers: { "content-type": "text/event-stream" } });

}
async function collect ( options: net.EventsOptions ): Promise<net.Event[]> {

    const out: net.Event[] = [];

    for await ( const item of net.events("https://test.example/events", options) ) out.push(item);

    return out;

}
async function settle (): Promise<void> {

    for ( let index = 0; index < 40; index += 1 ) await Promise.resolve();

}

it("SSE carries an id across events and clears it explicitly", () => {

    expect(net.parseEvents("id: 7\n\ndata: first\n\ndata: second\n\nid:\n\ndata: third\n\n").map(( item ) => item.id)).toEqual(["7", "7", ""]);

});

it("an empty SSE id removes the reconnection header", async () => {

    const headers: (string | undefined)[] = [];
    const encoder = new TextEncoder();
    const events = await collect({ lastId: "old", reconnect: 2, retry: 0, fetcher: async ( _, init ) => {

        headers.push(init.headers["last-event-id"]);

        return headers.length === 1 ? streamed([encoder.encode("id:\ndata: reset\n\n")]) : new Response(null, { status: 204 });

    } });

    expect(events[0]?.id).toBe("");
    expect(headers).toEqual(["old", undefined]);

});

it("SSE caps UTF-8 bytes independently of network chunking", async () => {

    const encoded = new TextEncoder().encode("data: 😀😀\n\n");

    for ( const chunks of [[encoded], Array.from(encoded, ( byte ) => new Uint8Array([byte]))] ) {

        await expect(collect({ maxBytes: 12, fetcher: async () => streamed(chunks) })).rejects.toMatchObject({ code: "too_large", reason: "net.event" });
        expect((await collect({ maxBytes: 14, fetcher: async () => streamed(chunks) }))[0]?.data).toBe("😀😀");

    }

});

it("SSE discards arbitrarily chunked comments without retaining them as event data", async () => {

    const encoder = new TextEncoder();
    const chunks = [":", ...Array.from({ length: 32 }, () => "x".repeat(100)), "\ndata: a\n\n"].map(( chunk ) => encoder.encode(chunk));

    expect((await collect({ maxBytes: 10, fetcher: async () => streamed(chunks) })).map(( item ) => item.data)).toEqual(["a"]);

});

it("SSE respects HTTP Retry-After seconds", async () => {

    jest.useFakeTimers();

    try {

        let calls = 0;
        const done = collect({ reconnect: 1, retry: 0, fetcher: async () => {

            calls += 1;

            return calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : new Response(null, { status: 204 });

        } });

        await settle();
        jest.advanceTimersByTime(1999);
        await settle();
        expect(calls).toBe(1);
        jest.advanceTimersByTime(1);
        await settle();
        await done;
        expect(calls).toBe(2);

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

});


it("a malformed successful JSON response is a protocol failure without retries", async () => {

    let calls = 0;

    await expect(net.request("https://example.test/value", {
        retries: 3,
        fetcher: async () => {

            calls += 1;

            return new Response("{bad", { headers: { "content-type": "application/json" } });

        },
    })).rejects.toMatchObject({ code: "internal", reason: "net.json", status: 502 });
    expect(calls).toBe(1);

});

it("a total request budget includes backoff and aborts a fetcher that ignores the signal", async () => {

    let calls = 0;

    await expect(net.request("https://example.test/value", { budget: 10, timeout: 1000, retries: 10, fetcher: async () => {

        calls += 1;

        return new Response("", { status: 503 });

    } })).rejects.toMatchObject({ reason: "net.budget" });
    expect(calls).toBe(1);

    let signal: AbortSignal | undefined;

    await expect(net.request("https://example.test/value", { budget: 10, timeout: 1000, fetcher: ( _, init ) => {

        signal = init.signal;

        return new Promise<Response>(() => undefined);

    } })).rejects.toMatchObject({ reason: "net.budget" });
    expect(signal?.aborted).toBe(true);

});


it("trace headers are optional so a plain cross-origin GET can remain safelisted", async () => {

    let headers: Record<string, string> = {};
    const reply = await net.request("https://example.test/value", { trace: false, fetcher: async ( _, init ) => {

        headers = init.headers;

        return new Response("ok");

    } });

    expect(headers).toEqual({ accept: "application/json" });
    expect(reply.requestId).toBe("");

});
