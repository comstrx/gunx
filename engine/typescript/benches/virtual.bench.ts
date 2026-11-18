import * as virtual from "engine/virtual";
import { bench, do_not_optimize, run } from "mitata";

const varied = virtual.layout({ count: 100_000, size: ( index ) => 32 + (index % 5) * 8, gap: 4 });
const fixed = virtual.layout({ count: 100_000, size: 40, gap: 4 });
const small = virtual.layout({ count: 200, size: ( index ) => 20 + (index % 3) * 10 });
const headers = Array.from({ length: 3000 }, ( _, at ) => at * 33);
const grid = virtual.grid(100_000, 6, 160, 12);
const shown = virtual.visible(fixed, 1_234_567, 800).items;
const sizes = virtual.measures();
let turn = 0;

for ( let index = 0; index < 1000; index += 1 ) sizes.set(index, 30 + (index % 7));

bench("virtual.layout fixed 100k", () => do_not_optimize(virtual.layout({ count: 100_000, size: 40 })));
bench("virtual.layout fixed 100k + offsets read", () => do_not_optimize(virtual.layout({ count: 100_000, size: 40 }).offsets.length));
bench("virtual.layout varied 100k", () => do_not_optimize(virtual.layout({ count: 100_000, size: ( index ) => 32 + (index % 5) * 8, gap: 4 })));
bench("virtual.layout measured 200", () => do_not_optimize(virtual.layout({ count: 200, size: sizes.sizer(40) })));
bench("virtual.visible fixed 800px", () => do_not_optimize(virtual.visible(fixed, 1_234_567, 800)));
bench("virtual.visible varied 800px", () => do_not_optimize(virtual.visible(varied, 1_234_567, 800)));
bench("virtual.visible varied 40000px", () => do_not_optimize(virtual.visible(varied, 1_234_567, 40_000)));
bench("virtual.range varied", () => do_not_optimize(virtual.range(varied, 1_234_567, 800)));
bench("virtual.indexAt fixed", () => do_not_optimize(virtual.indexAt(fixed, 2_000_000)));
bench("virtual.indexAt varied", () => do_not_optimize(virtual.indexAt(varied, 2_000_000)));
bench("virtual.item", () => do_not_optimize(virtual.item(varied, 54_321)));
bench("virtual.reached", () => do_not_optimize(virtual.reached(varied, 1_234_567, 800, 200)));
bench("virtual.offsetFor center", () => do_not_optimize(virtual.offsetFor(varied, 54_321, 800, "center")));
bench("virtual.offsetFor auto", () => do_not_optimize(virtual.offsetFor(varied, 54_321, 800, "auto", 1_234_567)));
bench("virtual.stuck 3000 headers", () => do_not_optimize(virtual.stuck(fixed, headers, 1_234_567)));
bench("virtual.anchor", () => do_not_optimize(virtual.anchor(fixed, varied, 1_234_567, 30_000)));
bench("virtual.table", () => do_not_optimize(virtual.table(fixed, small, 1_234_567, 1200, { width: 640, height: 800 })));
bench("virtual.grid.cells 40 rows x 6", () => do_not_optimize(grid.cells(shown.slice(0, 40))));
bench("virtual.grid.row", () => do_not_optimize(grid.row(54_321)));
bench("virtual.fit", () => do_not_optimize(virtual.fit(1280, 240, 16)));
bench("virtual.measures.set", () => {

    turn += 1;
    sizes.set(turn % 1000, 30 + (turn % 9));

});
bench("virtual.measures.estimate", () => do_not_optimize(sizes.estimate(40)));

await run();
