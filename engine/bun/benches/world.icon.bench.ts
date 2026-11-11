import * as world from "engine/world";
import { bench, do_not_optimize, run } from "mitata";

const icons = world.icons({ arrowRight: { path: "M5 12h14", mirror: true }, check: "M20 6L9 17l-4-4" }, { next: "arrowRight" });

bench("world.icons.resolve", () => do_not_optimize(icons.resolve("next", "rtl")));

await run();
