import * as api from "engine/api";
import * as socket from "engine/socket";
import { bench, do_not_optimize, run } from "mitata";

type Side = socket.Socket & { fire: ( frame: socket.Frame ) => void };

function fakeSocket (): Side {

    const made: Side = {
        readyState: 1,
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: ( text ) => {

            const frame = api.decodeFrame(text);

            if ( frame?.id ) made.onmessage?.({ data: api.encodeFrame({ event: "ack", id: frame.id, data: 3 }) });

        },
        close: () => undefined,
        fire: ( frame ) => made.onmessage?.({ data: api.encodeFrame(frame) }),
    };

    return made;

}

const text = api.encodeFrame({ event: "order.updated", data: { id: 7, status: "paid" }, channel: "orders.7" });
const bytes = new TextEncoder().encode(text);
const side = fakeSocket();
const live = api.connect({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => side });
const room = socket.channel(live, "orders.7");
const who = api.presence(live, "orders.7");
let turn = 0;

await live.connect();
live.on("order.updated", () => undefined);
room.on("order.updated", () => undefined);

bench("api.encodeFrame", () => do_not_optimize(api.encodeFrame({ event: "order.updated", data: { id: 7, status: "paid" }, channel: "orders.7" })));
bench("api.decodeFrame text", () => do_not_optimize(api.decodeFrame(text)));
bench("api.decodeFrame bytes", () => do_not_optimize(api.decodeFrame(bytes)));
bench("api.decodeFrame junk", () => do_not_optimize(api.decodeFrame("not json")));
bench("socket.emit", () => do_not_optimize(live.emit("order.updated", { id: 7 }, "orders.7")));
bench("socket.emit oversize refused", () => {

    try {

        live.emit("x", "y".repeat(70_000));

    } catch {

        do_not_optimize(1);

    }

});
bench("socket.inbound dispatch", () => side.fire({ event: "order.updated", data: { id: 7 }, channel: "orders.7" }));
bench("socket.inbound unknown room", () => side.fire({ event: "order.updated", data: { id: 7 }, channel: "nowhere" }));
bench("socket.ping answered", () => side.fire({ event: "ping", id: "p" }));
bench("socket.request round trip", async () => do_not_optimize(await live.request("sum", [1, 2])));
bench("socket.on + off", () => live.on("tmp", () => undefined)());
bench("socket.on room + off", () => live.on("tmp", () => undefined, "orders.7")());
bench("api.presence synced 50", () => side.fire({ event: "presence.synced", channel: "orders.7", data: Array.from({ length: 50 }, ( _, at ) => ({ id: `u${at}`, data: { turn } })) }));
bench("api.presence joined", () => {

    turn += 1;
    side.fire({ event: "presence.joined", channel: "orders.7", data: `v${turn % 100}` });

});
bench("api.connect + close", () => {

    const made = api.connect({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => fakeSocket() });

    made.close();

});
bench("socket.status + stats", () => do_not_optimize([live.status(), live.stats(), who.state().count]));

await run();
