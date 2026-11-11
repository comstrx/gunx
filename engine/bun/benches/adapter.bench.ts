import * as adapter from "engine/adapter";
import { bench, do_not_optimize, run } from "mitata";

const clock = adapter.port<{ now: () => number }>("bench.clock", { fallback: () => ({ now: () => 0 }) });
const drivers = adapter.family<{ name: string }>("bench.drivers");

clock.use({ now: () => 1 });
drivers.add("memory", { name: "memory" });

bench("adapter.port.get", () => do_not_optimize(clock.get()));
bench("adapter.family.pick", () => do_not_optimize(drivers.pick()));
bench("adapter.runtime", () => do_not_optimize(adapter.runtime()));

await run();
