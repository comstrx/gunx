import * as stage from "engine/test";
import { bench, do_not_optimize, run } from "mitata";

const counted = stage.spy(( value: number ) => value + 1);
const temp = stage.tmp("engine-bench-");
const logs = stage.logs("info");

for ( let at = 0; at < 100; at += 1 ) logs.logger.info(`m${at}`);

bench("test.spy", () => do_not_optimize(counted(1)));
bench("test.spy reset", () => counted.reset());
bench("test.env push+restore", () => stage.env({ ENGINE_BENCH_A: "1", ENGINE_BENCH_B: undefined }).restore());
bench("test.env nested", () => {

    const outer = stage.env({ ENGINE_BENCH_A: "1" });
    const inner = stage.env({ ENGINE_BENCH_A: "2" });

    outer.restore();
    inner.restore();

});
bench("test.globals push+undo", () => stage.globals({ engineBenchA: 1, engineBenchB: undefined })());
bench("test.tmp file", () => do_not_optimize(temp.file("a/b/c.txt")));
bench("test.until ready", async () => do_not_optimize(await stage.until(() => true)));
bench("test.tick 0", async () => { await stage.tick(0); });
bench("test.logs info", () => logs.logger.info("hello", { id: 1 }));
bench("test.logs messages", () => do_not_optimize(logs.messages()));

await run();

temp.remove();
