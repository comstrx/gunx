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
        send: () => undefined,
        close: () => undefined,
        fire: ( frame ) => made.onmessage?.({ data: socket.encode(frame) }),
    };

    return made;

}

const text = socket.encode({ event: "order.updated", data: { id: 7, status: "paid" }, channel: "orders.7" });
const bytes = new TextEncoder().encode(text);
const side = fakeSocket();
const live = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => side });
const room = socket.channel(live, "orders.7");
const who = socket.presence(live, "orders.7");
let turn = 0;

await live.connect();
live.on("order.updated", () => undefined);
room.on("order.updated", () => undefined);

bench("socket.encode", () => do_not_optimize(socket.encode({ event: "order.updated", data: { id: 7, status: "paid" }, channel: "orders.7" })));
bench("socket.decode text", () => do_not_optimize(socket.decode(text)));
bench("socket.decode bytes", () => do_not_optimize(socket.decode(bytes)));
bench("socket.decode junk", () => do_not_optimize(socket.decode("not json")));
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
bench("socket.request round trip", async () => {

    const asked = live.request("sum", [1, 2]);

    side.fire({ event: "ack", id: `${(live as unknown as { stem?: string }).stem ?? ""}`, data: 3 });
    turn += 1;

    const frame = socket.decode(socket.encode({ event: "ack", id: "x" }));

    do_not_optimize(frame);
    side.fire({ event: "ack", id: "never" });
    do_not_optimize(await Promise.race([asked.catch(() => undefined), Promise.resolve(turn)]));

});
bench("socket.on + off", () => live.on("tmp", () => undefined)());
bench("socket.on room + off", () => live.on("tmp", () => undefined, "orders.7")());
bench("socket.presence synced 50", () => side.fire({ event: "presence.synced", channel: "orders.7", data: Array.from({ length: 50 }, ( _, at ) => ({ id: `u${at}`, data: { turn } })) }));
bench("socket.presence joined", () => {

    turn += 1;
    side.fire({ event: "presence.joined", channel: "orders.7", data: `v${turn % 100}` });

});
bench("socket.open + close", () => {

    const made = socket.open({ url: "wss://x", heartbeat: 0, reconnect: false, factory: () => fakeSocket() });

    made.close();

});
bench("socket.status + stats", () => do_not_optimize([live.status(), live.stats(), who.state().count]));

await run();
