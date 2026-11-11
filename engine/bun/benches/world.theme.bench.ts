import * as world from "engine/world";
import { bench, do_not_optimize, run } from "mitata";

const tokens = { light: { surface: "#fff", ink: "#111", brand: "#f40", line: "#ddd" }, dark: { surface: "#000", ink: "#eee", brand: "#f84", line: "#333" } };
const made = world.theme({ tokens, system: () => "light", watch: () => () => undefined });

bench("world.theme.toggle", () => made.toggle());
bench("world.theme.palette", () => do_not_optimize(made.palette()));
bench("world.theme.css", () => do_not_optimize(made.css()));
bench("world.theme.variables", () => do_not_optimize(made.variables()));

await run();
