import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as socket from "engine/socket";
import * as fc from "fast-check";

type Side = socket.Socket & { fire: ( frame: socket.Frame ) => void; sent: socket.Frame[]; openNow: () => void; dropNow: ( code?: number ) => void };
type Act = { kind: "open" } | { kind: "drop"; code: number } | { kind: "emit" } | { kind: "request" } | { kind: "answer"; at: number } | { kind: "join"; room: string } | { kind: "leave"; room: string } | { kind: "ackJoins" } | { kind: "fire"; room: string | undefined } | { kind: "close" } | { kind: "connect" };
type Model = { status: socket.Status; wanted: boolean; rooms: Map<string, boolean>; pending: Set<string>; dials: number };

const runs = 300;
const encoder = new TextEncoder();
const act: fc.Arbitrary<Act> = fc.oneof(
    { weight: 3, arbitrary: fc.constant<Act>({ kind: "open" }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("drop" as const), code: fc.constantFrom(1000, 1006, 1008, 4001) }) },
    { weight: 2, arbitrary: fc.constant<Act>({ kind: "emit" }) },
    { weight: 2, arbitrary: fc.constant<Act>({ kind: "request" }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("answer" as const), at: fc.nat({ max: 5 }) }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("join" as const), room: fc.constantFrom("a", "b") }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("leave" as const), room: fc.constantFrom("a", "b", "c") }) },
    { weight: 2, arbitrary: fc.constant<Act>({ kind: "ackJoins" }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("fire" as const), room: fc.constantFrom(undefined, "a", "b") }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "close" }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "connect" }) },
);

function fakeSocket (): Side {

    const made: Side = {
        readyState: 0,
        sent: [],
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: ( text ) => {

            const frame = socket.decode(text);

            if ( frame ) made.sent.push(frame);

        },
        close: () => {

            made.readyState = 3;

        },
        fire: ( frame ) => made.onmessage?.({ data: socket.encode(frame) }),
        openNow: () => {

            made.readyState = 1;
            made.onopen?.();

        },
        dropNow: ( code = 1006 ) => {

            made.readyState = 3;
            made.onclose?.({ code, reason: "" });

        },
    };

    return made;

}
function tick (): Promise<void> {

    return new Promise(( done ) => setTimeout(done, 0));

}

describe("fuzz socket", () => {

    it("decode never throws, frames round trip, and the frame bound follows the utf-8 byte length", () => {

        fc.assert(fc.property(fc.string({ maxLength: 64 }), ( text ) => { socket.decode(text); }), { numRuns: 10_000 });
        fc.assert(
            fc.property(fc.stringMatching(/^[a-z.]{1,12}$/), fc.jsonValue({ maxDepth: 2 }), fc.option(fc.stringMatching(/^[a-z0-9.]{1,12}$/), { nil: undefined }), ( event, data, channel ) => {

                fc.pre(!JSON.stringify(data).includes("__proto__"));

                const decoded = socket.decode(socket.encode({ event, data, channel }));

                expect(decoded?.event).toBe(event);
                expect(decoded?.channel).toBe(channel);
                expect(JSON.stringify(decoded?.data)).toBe(JSON.stringify(data));

            }),
            { numRuns: 10_000 },
        );
        fc.assert(fc.property(fc.string({ maxLength: 40, unit: "grapheme" }), fc.integer({ min: 10, max: 120 }), ( payload, most ) => {

            const side = fakeSocket();
            const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => side, maxFrame: most });

            void live.connect();
            side.openNow();

            const text = socket.encode({ event: "p", data: payload });
            const bytes = encoder.encode(text).byteLength;
            let answer: boolean | string;

            try {

                answer = live.emit("p", payload);

            } catch ( caught ) {

                answer = error.is(caught) ? caught.reason ?? "?" : "?";

            }

            expect(answer).toBe(bytes <= most ? true : "socket.frame");
            expect(socket.decode(text, most) === undefined).toBe(text.length > most);
            live.close();

        }), { numRuns: 3000 });

    });
    it("a connection follows its model through opens, drops, close codes, joins, leaves, requests and answers", async () => {

        await fc.assert(fc.asyncProperty(fc.array(act, { maxLength: 20 }), fc.constantFrom(0, 1, 3), async ( acts, limit ) => {

            const sides: Side[] = [];
            const statuses: string[] = [];
            const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: { min: 0, max: 0, limit }, timeout: 1000, factory: () => { const made = fakeSocket(); sides.push(made); return made; }, onStatus: ( status, attempt ) => { statuses.push(`${status}:${attempt}`); } });
            const model: Model = { status: "idle", wanted: false, rooms: new Map(), pending: new Set(), dials: 0 };
            const outstanding: Promise<unknown>[] = [];
            const heard: string[] = [];
            let attempts = 0;
            let serial = 0;
            const asks = new Map<string, Promise<unknown>>();

            live.on("*", ( _, frame ) => { heard.push(`${frame.channel ?? "-"}:${frame.event}`); });

            const current = (): Side | undefined => sides[sides.length - 1];
            const ackJoins = (): void => {

                const side = current();

                if ( !side || model.status !== "open" ) return;

                for ( const frame of side.sent ) {

                    if ( (frame.event === "join" || frame.event === "leave") && frame.id && !model.pending.has(frame.id) ) {

                        model.pending.add(frame.id);
                        side.fire({ event: "ack", id: frame.id });

                        if ( frame.event === "join" && frame.channel && model.rooms.has(frame.channel) ) model.rooms.set(frame.channel, true);

                    }

                }

            };

            for ( const step of acts ) {

                if ( step.kind === "connect" ) {

                    if ( !model.wanted ) {

                        model.wanted = true;
                        model.status = "connecting";
                        attempts = 1;
                        model.dials += 1;

                    }

                    outstanding.push(live.connect().catch(() => undefined));

                } else if ( step.kind === "open" ) {

                    const side = current();

                    if ( side && model.status === "connecting" && side.readyState === 0 ) {

                        side.openNow();
                        model.status = "open";

                        for ( const room of model.rooms.keys() ) model.rooms.set(room, false);

                    }

                } else if ( step.kind === "drop" ) {

                    const side = current();

                    if ( side && (model.status === "open" || model.status === "connecting") && side.readyState !== 3 ) {

                        side.dropNow(step.code);

                        const final = step.code === 1008 || step.code === 4001;

                        for ( const room of model.rooms.keys() ) model.rooms.set(room, false);

                        if ( !final && attempts < limit ) {

                            attempts += 1;
                            model.dials += 1;
                            model.status = "connecting";
                            await tick();

                        } else {

                            model.status = "failed";
                            model.wanted = false;

                        }

                    }

                } else if ( step.kind === "emit" ) {

                    expect(live.emit("e", 1)).toBe(model.status === "open");

                } else if ( step.kind === "request" ) {

                    serial += 1;

                    const asked = live.request(`q${serial}`, serial, { timeout: 1000 });

                    asks.set(`q${serial}`, asked.catch(( cause: unknown ) => (error.is(cause) ? cause.reason : "?")));

                } else if ( step.kind === "answer" ) {

                    const side = current();
                    const sent = side?.sent.filter(( frame ) => frame.event.startsWith("q") && frame.id)[step.at];

                    if ( side && sent && model.status === "open" ) side.fire({ event: "ack", id: sent.id, data: `answer ${sent.event}` });

                } else if ( step.kind === "join" ) {

                    if ( !model.rooms.has(step.room) ) model.rooms.set(step.room, false);

                    outstanding.push(live.join(step.room).catch(() => undefined));

                } else if ( step.kind === "leave" ) {

                    model.rooms.delete(step.room);
                    outstanding.push(live.leave(step.room).catch(() => undefined));

                } else if ( step.kind === "ackJoins" ) {

                    await tick();
                    ackJoins();

                } else if ( step.kind === "fire" ) {

                    const side = current();

                    if ( side && model.status === "open" ) {

                        side.fire({ event: "news", channel: step.room });
                        expect(heard.at(-1)).toBe(`${step.room ?? "-"}:news`);

                    }

                } else {

                    live.close();
                    model.status = "closed";
                    model.wanted = false;

                    for ( const room of model.rooms.keys() ) model.rooms.set(room, false);

                }

                await tick();
                expect(live.status()).toBe(model.status);
                expect(live.channels()).toEqual([...model.rooms.keys()].sort());

                for ( const [room, joined] of model.rooms ) expect([room, live.joined(room)]).toEqual([room, joined]);

                expect(sides.length).toBe(model.dials);

            }

            live.close();

            for ( const [name, asked] of asks ) {

                const answer = await asked;

                expect(answer === `answer ${name}` || answer === "socket.closed" || answer === "socket.request").toBe(true);

            }

            await Promise.all(outstanding);

            for ( let at = 1; at < statuses.length; at += 1 ) expect(statuses[at]).not.toBe(statuses[at - 1]);

        }), { numRuns: runs });

    });

});
