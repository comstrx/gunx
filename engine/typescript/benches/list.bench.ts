import * as list from "engine/list";
import { bench, do_not_optimize, run } from "mitata";

const rows = list.times(1000, ( index ) => ({ id: index, group: `g${index % 7}`, price: (index * 37) % 101 }));

bench("list.sortByMany", () => do_not_optimize(list.sortByMany(rows, [{ by: "group" }, { by: "price", direction: "desc" }])));
bench("list.groupBy", () => do_not_optimize(list.groupBy(rows, "group")));
bench("list.uniqueBy", () => do_not_optimize(list.uniqueBy(rows, "group")));
bench("list.paginate", () => do_not_optimize(list.paginate(rows, 7, 20)));
bench("list.where", () => do_not_optimize(list.where(rows, { group: "g3" })));

const many = list.times(100_000, ( index ) => ({ id: index, score: (index * 7919) % 100_003 }));
const compare = ( a: typeof many[number], b: typeof many[number] ): number => b.score - a.score;
const catalog = list.catalog(many, ( row ) => String(row.id), () => ["searchable shared entry"], ( row ) => row.score);

bench("list.best 20 of 100k", () => do_not_optimize(list.best(many, compare, 20)));
bench("list.best stable sort reference", () => do_not_optimize(many.toSorted(compare).slice(0, 20)));
bench("list.catalog ranked 20 of 100k", () => do_not_optimize(catalog.search("shared", 20)));

await run();
