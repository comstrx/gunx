import * as list from "engine/list";
import { bench, do_not_optimize, run } from "mitata";

const rows = list.times(1000, ( index ) => ({ id: index, group: `g${index % 7}`, price: (index * 37) % 101 }));

bench("list.sortByMany", () => do_not_optimize(list.sortByMany(rows, [{ by: "group" }, { by: "price", direction: "desc" }])));
bench("list.groupBy", () => do_not_optimize(list.groupBy(rows, "group")));
bench("list.uniqueBy", () => do_not_optimize(list.uniqueBy(rows, "group")));
bench("list.paginate", () => do_not_optimize(list.paginate(rows, 7, 20)));
bench("list.where", () => do_not_optimize(list.where(rows, { group: "g3" })));

await run();
