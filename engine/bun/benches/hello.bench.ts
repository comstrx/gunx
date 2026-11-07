import * as hello from "engine/hello";
import { bench, do_not_optimize, run } from "mitata";

bench("hello.world", () => do_not_optimize(hello.world()));
bench("hello.world.length", () => do_not_optimize(hello.world().length));

await run();
