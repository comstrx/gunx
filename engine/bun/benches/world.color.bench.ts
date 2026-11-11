import * as world from "engine/world";
import { bench, do_not_optimize, run } from "mitata";

const brand = world.rgb(255, 69, 0);
const white = world.rgb(255, 255, 255);
const lab = world.toOklch(brand);

bench("world.color hex", () => do_not_optimize(world.color("#ff4500")));
bench("world.color name", () => do_not_optimize(world.color("rebeccapurple")));
bench("world.color rgb", () => do_not_optimize(world.color("rgb(255 69 0 / 50%)")));
bench("world.color oklch", () => do_not_optimize(world.color("oklch(68% 0.22 40)")));
bench("world.color oklch outside the gamut", () => do_not_optimize(world.color("oklch(70% 0.4 150)")));
bench("world.toOklch", () => do_not_optimize(world.toOklch(brand)));
bench("world.fromOklch", () => do_not_optimize(world.fromOklch(lab)));
bench("world.toCss oklch", () => do_not_optimize(world.toCss(brand, "oklch")));
bench("world.contrast", () => do_not_optimize(world.contrast(brand, white)));
bench("world.mix", () => do_not_optimize(world.mix(brand, white)));
bench("world.shades", () => do_not_optimize(world.shades(brand)));
bench("world.ensureReadable", () => do_not_optimize(world.ensureReadable(brand, white)));

await run();
