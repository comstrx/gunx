import * as engine from "engine";
import { bench, do_not_optimize, run } from "mitata";

const rows = Array.from({ length: 10_000 }, ( _, id ) => ({ id, score: (id * 37) % 1009 }));
const box = engine.cache.open({ storage: engine.cache.memory() });
const loaded = engine.state.resource({ load: async () => engine.list.best(rows, ( a, b ) => b.score - a.score, 20) });

bench("engine ranked resource to storage round trip", async () => {

    const ranked = await loaded.refresh();

    await box.set("ranked", ranked);
    do_not_optimize(await box.get("ranked"));

});
bench("engine cached resource", async () => do_not_optimize(await loaded.ensure()));

await run();
loaded.reset();
await box.remove("ranked");
