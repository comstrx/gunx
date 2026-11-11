import * as cache from "engine/cache";
import * as error from "engine/error";
import * as queue from "engine/queue";
import { bench, do_not_optimize, run } from "mitata";

const box = queue.create({ owner: "u", perform: async () => undefined });
const failing = queue.create({ owner: "u", retries: 2, delay: 0, perform: async () => { throw error.fault("unavailable", "down"); } });
const wide = queue.create({ owner: "u", lanes: 8, perform: async () => undefined });
const stored = queue.create({ store: cache.memory(), owner: "u", perform: async () => undefined });
const pace = queue.backoff({ delay: 100, factor: 2, max: 60_000, jitter: 0.2 });
const plain = queue.backoff({ delay: 100, factor: 2 });
let turn = 0;

await stored.push("seed", {});

bench("queue.push", function* () {

    yield {
        0: (): queue.Outbox => queue.create({ owner: "u", perform: async () => undefined }),
        bench: async ( fresh: queue.Outbox ) => do_not_optimize(await fresh.push("x", { n: 1 })),
    };

});
bench("queue.push keyed (replace)", async () => do_not_optimize(await box.push("x", { n: 1 }, { key: "k" })));
bench("queue.push + flush one", async () => {

    await box.push("y", { n: turn });
    do_not_optimize(await box.flush());

});
bench("queue.flush empty", async () => do_not_optimize(await box.flush()));
bench("queue.flush 20 jobs, 8 lanes", async () => {

    for ( let at = 0; at < 20; at += 1 ) await wide.push("w", at);

    do_not_optimize(await wide.flush());
    await wide.prune();

});
bench("queue.flush failing job", async () => {

    await failing.push("f", {});
    do_not_optimize(await failing.flush());
    await failing.clear();

});
bench("queue.jobs", async () => do_not_optimize(await stored.jobs()));
bench("queue.counts", async () => do_not_optimize(await stored.counts()));
bench("queue.next", async () => do_not_optimize(await stored.next()));
bench("queue.load", async () => do_not_optimize(await stored.load()));
bench("queue.retry missing", async () => do_not_optimize(await stored.retry("nope")));
bench("queue.prune done", async () => do_not_optimize(await box.prune()));
bench("queue.backoff plain", () => {

    turn += 1;
    do_not_optimize(plain((turn & 7) + 1));

});
bench("queue.backoff jittered", () => {

    turn += 1;
    do_not_optimize(pace((turn & 7) + 1));

});
bench("queue.watch + stop", () => box.watch(() => undefined)());
bench("queue.create", () => do_not_optimize(queue.create({ owner: "u", perform: async () => undefined })));

await run();
