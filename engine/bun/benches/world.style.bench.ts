import * as world from "engine/world";
import { bench, do_not_optimize, run } from "mitata";

const button = world.variants({ base: "btn", axes: { look: { solid: "bg-brand", ghost: "bg-none" }, size: { sm: "h-8", md: "h-10" } }, defaults: { look: "solid", size: "md" }, compound: [{ when: { look: "ghost", size: "sm" }, add: "border" }] });

bench("world.classes", () => do_not_optimize(world.classes("a b", ["c", null], { e: true, f: false })));
bench("world.variants", () => do_not_optimize(button({ look: "ghost", size: "sm", className: "w-full" })));

const soft = world.spring(0.8, 180);
bench("world.path", () => do_not_optimize(world.path(soft)));
bench("world.tween", () => do_not_optimize(world.tween(0, 100, 0.37, "emphasized")));
bench("world.transition", () => do_not_optimize(world.transition(["opacity", "transform"], 200, "standard")));

await run();
