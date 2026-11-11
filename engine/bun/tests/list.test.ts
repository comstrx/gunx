import { describe, expect, test as it } from "bun:test";
import * as list from "engine/list";

type Row = { id: number; name: string; group: string; price: number | null };

const rows: Row[] = [
    { id: 1, name: "b", group: "x", price: 10 },
    { id: 2, name: "a", group: "y", price: 5 },
    { id: 3, name: "c", group: "x", price: null },
];

describe("list", () => {

    it("core shapes, groups and sorts with a stable order", () => {

        expect(list.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(list.chunk([1], 0)).toEqual([[1]]);
        expect(list.unique([1, 1, 2])).toEqual([1, 2]);
        expect(list.uniqueBy(rows, "group").map(( row ) => row.id)).toEqual([1, 2]);
        expect(Object.keys(list.groupBy(rows, "group"))).toEqual(["x", "y"]);
        expect(list.indexBy(rows, "id")[2]?.name).toBe("a");
        expect(list.partition([1, 2, 3, 4], ( value ) => value % 2 === 0)).toEqual([[2, 4], [1, 3]]);
        expect(list.sortBy(rows, "name").map(( row ) => row.id)).toEqual([2, 1, 3]);
        expect(list.sortBy(rows, "price", "desc").map(( row ) => row.id)).toEqual([1, 2, 3]);
        expect(list.sortByMany(rows, [{ by: "group" }, { by: "price", direction: "desc" }]).map(( row ) => row.id)).toEqual([1, 3, 2]);
        expect(list.sortNatural(["file10", "file2", "File1"])).toEqual(["File1", "file2", "file10"]);
        expect(list.compare("a", "B") < 0 && list.compare(2, 10) < 0 && list.compare(null, 1) > 0).toBe(true);
        expect(list.range(1, 5, 2)).toEqual([1, 3, 5]);
        expect(list.range(3, 1)).toEqual([3, 2, 1]);
        expect(list.zip([1, 2, 3], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
        expect(list.move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
        expect(list.move([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
        expect(list.upsertBy(rows, { id: 2, name: "z", group: "y", price: 1 }, "id")[1]?.name).toBe("z");
        expect(list.upsertBy(rows, { id: 9, name: "n", group: "y", price: 1 }, "id")).toHaveLength(4);
        expect(list.removeBy(rows, "group", "x").map(( row ) => row.id)).toEqual([2]);
        expect(list.sumBy(rows, "price")).toBe(15);
        expect(list.keyOf({ a: { b: 1 } }, "a")).toBe('{"b":1}');

    });
    it("shape verbs never mutate and clamp their indexes", () => {

        const items = [1, 2, 3, 4];

        expect(list.compact([0, 1, "", null, "a", undefined, false])).toEqual([1, "a"]);
        expect(list.isEmpty([]) && list.isEmpty(undefined) && !list.isEmpty([1])).toBe(true);
        expect(list.first(items)).toBe(1);
        expect(list.last(items)).toBe(4);
        expect(list.nth(items, -1)).toBe(4);
        expect(list.take(items, 2)).toEqual([1, 2]);
        expect(list.take(items, -1)).toEqual([4]);
        expect(list.skip(items, 3)).toEqual([4]);
        expect(list.takeWhile(items, ( value ) => value < 3)).toEqual([1, 2]);
        expect(list.skipWhile(items, ( value ) => value < 3)).toEqual([3, 4]);
        expect(list.flatten([1, [2, 3]])).toEqual([1, 2, 3]);
        expect(list.difference(items, [2, 4])).toEqual([1, 3]);
        expect(list.intersection([1, 1, 2, 3], [1, 3])).toEqual([1, 3]);
        expect(list.union([1, 2], [2, 3])).toEqual([1, 2, 3]);
        expect(list.without(items, 1, 4)).toEqual([2, 3]);
        expect(list.toggle([1, 2], 2)).toEqual([1]);
        expect(list.toggle([1], 2)).toEqual([1, 2]);
        expect(list.equal([1, Number.NaN], [1, Number.NaN])).toBe(true);
        expect(list.fill(2, "x")).toEqual(["x", "x"]);
        expect(list.times(3, ( index ) => index * 2)).toEqual([0, 2, 4]);
        expect(list.insertAt(items, 1, 9, 8)).toEqual([1, 9, 8, 2, 3, 4]);
        expect(list.insertAt(items, 99, 9)).toEqual([1, 2, 3, 4, 9]);
        expect(list.removeAt(items, 1)).toEqual([1, 3, 4]);
        expect(list.removeAt(items, 9)).toEqual(items);
        expect(list.replaceAt(items, 0, 7)).toEqual([7, 2, 3, 4]);
        expect(list.swap(items, 0, 3)).toEqual([4, 2, 3, 1]);
        expect(list.rotate(items, 1)).toEqual([2, 3, 4, 1]);
        expect(list.rotate(items, -1)).toEqual([4, 1, 2, 3]);
        expect(list.splitAt(items, 2)).toEqual([[1, 2], [3, 4]]);
        expect(list.windows(items, 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
        expect(list.windows(items, 2, 2)).toEqual([[1, 2], [3, 4]]);
        expect(list.pairs([1, 2, 3])).toEqual([[1, 2], [1, 3], [2, 3]]);
        expect(list.crossJoin([1, 2], ["a"])).toEqual([[1, "a"], [2, "a"]]);
        expect(list.transpose([[1, 2], [3, 4]])).toEqual([[1, 3], [2, 4]]);
        expect(list.paginate(list.range(1, 23), 3, 10)).toEqual({ items: [21, 22, 23], page: 3, limit: 10, total: 23, pages: 3 });
        expect(list.paginate([], 7, 10).page).toBe(1);
        expect(items).toEqual([1, 2, 3, 4]);

    });
    it("find verbs filter by criteria and aggregate", () => {

        expect(list.where(rows, { group: "x" }).map(( row ) => row.id)).toEqual([1, 3]);
        expect(list.where(rows, { id: [1, 2] }).map(( row ) => row.id)).toEqual([1, 2]);
        expect(list.whereNot(rows, { group: "x" }).map(( row ) => row.id)).toEqual([2]);
        expect(list.findBy(rows, "name", "c")?.id).toBe(3);
        expect(list.pluck(rows, "name")).toEqual(["b", "a", "c"]);
        expect(list.countBy(rows, "group")).toEqual({ x: 2, y: 1 });
        expect(list.minBy(rows, "price")?.id).toBe(2);
        expect(list.maxBy(rows, "price")?.id).toBe(1);
        expect(list.averageBy(rows, "price")).toBe(5);
        expect(list.search(rows, " A ", ( row ) => row.name).map(( row ) => row.id)).toEqual([2]);
        expect(list.search(rows, "", ( row ) => row.name)).toHaveLength(3);

    });
    it("async lanes bound concurrency and keep order", async () => {

        let active = 0;
        let peak = 0;
        const doubled = await list.mapAsync([1, 2, 3, 4, 5, 6], async ( value ) => {

            active += 1;
            peak = Math.max(peak, active);

            await new Promise(( resolve ) => setTimeout(resolve, 2));

            active -= 1;

            return value * 2;

        }, { lanes: 2 });

        expect(doubled).toEqual([2, 4, 6, 8, 10, 12]);
        expect(peak).toBe(2);
        expect(await list.filterAsync([1, 2, 3], async ( value ) => value !== 2)).toEqual([1, 3]);
        expect(await list.reduceAsync([1, 2, 3], async ( total, value ) => total + value, 0)).toBe(6);

        const order: number[] = [];

        await list.eachAsync([1, 2], async ( value ) => { order.push(value); });
        expect(order.sort()).toEqual([1, 2]);
        expect(await list.sequence([async () => 1, async () => 2])).toEqual([1, 2]);

        const settled = await list.settle([async () => 1, async () => { throw new Error("x"); }, async () => 3]);

        expect(settled.done).toEqual([1, 3]);
        expect(settled.failed).toHaveLength(1);

    });
    it("a catalog indexes by key and searches across fields with weights", () => {

        const rows = [{ code: "EG", names: ["Egypt", "مصر"], weight: 1 }, { code: "ES", names: ["Spain", "إسبانيا"], weight: 0 }, { code: "EE", names: ["Estonia", "إستونيا"], weight: 0 }];
        const made = list.catalog(rows, ( row ) => row.code, ( row ) => [row.code, ...row.names], ( row ) => row.weight);

        expect([made.search("", -1).length, made.search("", Number.NaN).length, made.search("a", -3).length, made.search("", Number.POSITIVE_INFINITY).length]).toEqual([0, Math.min(10, rows.length), 0, rows.length]);

        expect(made.size).toBe(3);
        expect(made.get("eg")?.names[0]).toBe("Egypt");
        expect(made.has(" ES ") && !made.has("ZZ")).toBe(true);
        expect(made.keys()).toEqual(["EG", "ES", "EE"]);
        expect(made.search("e").map(( row ) => row.code)).toEqual(["EG", "ES", "EE"]);
        expect(made.search("مصر")[0]?.code).toBe("EG");
        expect(made.search("", 2)).toHaveLength(2);
        expect(made.search("zzz")).toEqual([]);
        expect(made.pick(["ee", "nope", "EG"]).map(( row ) => row.code)).toEqual(["EE", "EG"]);
        expect(made.where(( row ) => row.weight > 0).map(( row ) => row.code)).toEqual(["EG"]);
        expect(made.all).toBe(rows);

    });
    it("orders stand on hostile values", () => {

        expect(list.compare(Number.NaN, 1)).toBe(1);
        expect(list.compare(1, Number.NaN)).toBe(-1);
        expect(list.compare(Number.NaN, Number.NaN)).toBe(0);
        expect(list.compare(-5n, -3n)).toBe(-1);
        expect(list.compare(2n, 1.5)).toBe(1);
        expect(list.compare(new Date(1), new Date(2))).toBe(-1);
        expect(list.compare(new Date(Number.NaN), new Date(2))).toBe(1);
        expect(list.compare(new Date(5), 3)).toBe(1);
        expect(list.compare("a", "b", "not a locale")).toBeLessThan(0);
        expect(list.compare("a", "b", "ar_EG")).toBeLessThan(0);
        expect(list.compare(Object.create(null), "a")).not.toBeNaN();

        const marks = [{ id: 1, at: 3 }, { id: 2, at: Number.NaN }, { id: 3, at: 1 }, { id: 4, at: 2 }];
        const ring: { self?: unknown } = {};
        let reads = 0;

        ring.self = ring;

        expect(list.sortBy(marks, "at").map(( row ) => row.id)).toEqual([3, 4, 1, 2]);
        expect(list.sortBy(marks, "at", "desc").map(( row ) => row.id)).toEqual([1, 4, 3, 2]);
        expect(list.sortBy([{ n: 10n }, { n: -5n }, { n: -3n }], "n").map(( row ) => row.n)).toEqual([-5n, -3n, 10n]);
        expect(list.sortBy([{ d: new Date(30) }, { d: new Date(10) }, { d: new Date(20) }], "d").map(( row ) => row.d.getTime())).toEqual([10, 20, 30]);
        expect(list.sortBy(list.range(1, 50), ( value ) => { reads += 1; return 0 - value; })[0]).toBe(50);
        expect(reads).toBe(50);
        expect(list.keyOf(null as unknown as { a: number }, "a")).toBeUndefined();
        expect(list.keyOf({ a: 5n }, "a")).toBe(5n);
        expect(list.keyOf({ a: new Date(7) }, "a")).toBe(7);
        expect(list.keyOf({ a: ring }, "a")).toBe("[object Object]");

    });
    it("keyed tables hold any key, even one that names the prototype", () => {

        const tagged = [{ tag: "__proto__", id: 1 }, { tag: "__proto__", id: 2 }, { tag: "constructor", id: 3 }];
        const grouped = list.groupBy(tagged, "tag");
        const indexed = list.indexBy(tagged, "tag");

        expect(Object.entries(grouped).map(([name, rows]) => [name, rows.map(( row ) => row.id)])).toEqual([["__proto__", [1, 2]], ["constructor", [3]]]);
        expect(Object.getPrototypeOf(grouped)).toBe(Object.prototype);
        expect(Object.entries(indexed).map(([name, row]) => [name, row.id])).toEqual([["__proto__", 2], ["constructor", 3]]);
        expect(Object.getPrototypeOf(indexed)).toBe(Object.prototype);
        expect(Object.entries(list.countBy(tagged, "tag"))).toEqual([["__proto__", 2], ["constructor", 1]]);

    });
    it("a range is counted, never walked", () => {

        expect(list.range(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
        expect(list.range(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
        expect(list.range(1, 0, 0.25)).toEqual([1, 0.75, 0.5, 0.25, 0]);
        expect(list.range(0.5, 2.5)).toEqual([0.5, 1.5, 2.5]);
        expect(list.range(0, 10, 3)).toEqual([0, 3, 6, 9]);
        expect(list.range(5, 5)).toEqual([5]);
        expect(list.range(1, 3, 0)).toEqual([1, 2, 3]);
        expect(list.range(1, 3, Number.NaN)).toEqual([1, 2, 3]);
        expect(list.range(1, 3, -1)).toEqual([1, 2, 3]);
        expect(list.range(1, 3, Number.POSITIVE_INFINITY)).toEqual([1]);
        expect(list.range(0, Number.POSITIVE_INFINITY)).toEqual([]);
        expect(list.range(Number.NaN, 3)).toEqual([]);
        expect(() => list.range(0, 1e9)).toThrow(RangeError);

    });
    it("an index or a size that is not whole is refused, never guessed", () => {

        const items = [1, 2, 3, 4];

        expect(list.swap(items, 0.5, 1)).toEqual(items);
        expect(Object.keys(list.swap(items, Number.NaN, 1))).toEqual(["0", "1", "2", "3"]);
        expect(list.move(items, Number.NaN, 2)).toEqual(items);
        expect(list.move(items, 0.5, 2)).toEqual(items);
        expect(list.removeAt(items, 1.5)).toEqual(items);
        expect(list.replaceAt(items, Number.NaN, 9)).toEqual(items);
        expect(list.take(items, Number.NaN)).toEqual([]);
        expect(list.take(items, -0.5)).toEqual([]);
        expect(list.take(items, 2.9)).toEqual([1, 2]);
        expect(list.chunk(items, Number.NaN)).toEqual([[1], [2], [3], [4]]);
        expect(list.chunk(items, Number.POSITIVE_INFINITY)).toEqual([items]);
        expect(list.chunk(items, 2.9)).toEqual([[1, 2], [3, 4]]);
        expect(list.windows(items, Number.NaN)).toEqual([[1], [2], [3], [4]]);
        expect(list.windows(items, 2, Number.NaN)).toEqual([[1, 2], [2, 3], [3, 4]]);
        expect(list.paginate(items, Number.NaN, Number.NaN)).toEqual({ items: [1], page: 1, limit: 1, total: 4, pages: 4 });
        expect(list.paginate(items, 1, Number.POSITIVE_INFINITY).items).toEqual(items);
        expect(list.paginate(items, 9, 3)).toEqual({ items: [4], page: 2, limit: 3, total: 4, pages: 2 });
        expect(list.transpose(list.times(200_000, () => [1]))).toHaveLength(1);
        expect(list.where([null as unknown as Row, ...rows], { group: "y" }).map(( row ) => row.id)).toEqual([2]);

    });
    it("keyed set verbs merge, compare and tell lists apart", () => {

        const before = [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }];
        const after = [{ id: 2, name: "B" }, { id: 4, name: "d" }];

        expect(list.mergeBy(before, after, "id")).toEqual([{ id: 1, name: "a" }, { id: 2, name: "B" }, { id: 3, name: "c" }, { id: 4, name: "d" }]);
        expect(list.mergeBy(before, [], "id")).toEqual(before);
        expect(list.mergeBy([], [{ id: 1, name: "x" }, { id: 1, name: "y" }], "id")).toEqual([{ id: 1, name: "y" }]);
        expect(before).toHaveLength(3);
        expect(list.changes(before, after, "id")).toEqual({ added: [{ id: 4, name: "d" }], removed: [{ id: 1, name: "a" }, { id: 3, name: "c" }], kept: [{ id: 2, name: "B" }] });
        expect(list.changes([1, 2], [2, 3])).toEqual({ added: [3], removed: [1], kept: [2] });
        expect(list.differenceBy(before, after, "id").map(( row ) => row.id)).toEqual([1, 3]);
        expect(list.intersectionBy(before, after, "id").map(( row ) => row.name)).toEqual(["b"]);
        expect(list.unionBy(before, after, "id").map(( row ) => row.name)).toEqual(["a", "b", "c", "d"]);
        expect(list.duplicates([1, 2, 1, 1, 3, 2])).toEqual([1, 1, 2]);
        expect(list.duplicates([...before, ...after], "id").map(( row ) => row.name)).toEqual(["B"]);
        expect(list.sole([1, 2, 3], ( value ) => value > 2)).toBe(3);
        expect(list.sole([1, 2, 3], ( value ) => value > 1)).toBeUndefined();
        expect(list.sole([7])).toBe(7);
        expect(list.sole([])).toBeUndefined();
        expect(list.search([{ name: "أحمد" }, { name: "Zoë" }], "احمد", ( row ) => row.name)).toHaveLength(1);
        expect(list.search([{ name: "أحمد" }, { name: "Zoë" }], "ZOE", ( row ) => row.name)).toHaveLength(1);

    });
    it("nest builds a forest from flat rows and unnest walks it in order", () => {

        type Leaf = { id: number; parent: number | null; name: string };

        const flat: Leaf[] = [
            { id: 1, parent: null, name: "root" }, { id: 2, parent: 1, name: "a" }, { id: 3, parent: 1, name: "b" }, { id: 4, parent: 2, name: "a1" },
            { id: 5, parent: 99, name: "orphan" }, { id: 6, parent: 6, name: "self" },
        ];
        const ring: Leaf[] = [{ id: 1, parent: 3, name: "x" }, { id: 2, parent: 1, name: "y" }, { id: 3, parent: 2, name: "z" }, { id: 4, parent: 3, name: "tail" }];
        const chain = list.times(50_000, ( index ) => ({ id: index, parent: index === 0 ? null : index - 1 }));
        const forest = list.nest(flat, "id", "parent");
        const told = ( branches: readonly list.Branch<Leaf>[] ): string[] => list.unnest(branches).map(( branch ) => `${branch.depth}:${branch.item.name}`);

        expect(forest.map(( branch ) => branch.item.name)).toEqual(["root", "orphan", "self"]);
        expect(forest[0]?.children.map(( branch ) => branch.item.name)).toEqual(["a", "b"]);
        expect(told(forest)).toEqual(["0:root", "1:a", "2:a1", "1:b", "0:orphan", "0:self"]);
        expect(told(list.nest(ring, "id", "parent"))).toEqual(["0:x", "1:y", "2:z", "3:tail"]);
        expect(list.unnest(list.nest(chain, "id", "parent")).at(-1)?.depth).toBe(49_999);
        expect(list.nest([], "id", "parent")).toEqual([]);

    });
    it("a failed or aborted lane stops the others from taking more work", async () => {

        const started: number[] = [];
        const seen: number[] = [];
        const controller = new AbortController();
        const failing = list.mapAsync(list.range(1, 20), async ( value ) => {

            started.push(value);

            await new Promise(( resolve ) => setTimeout(resolve, 1));

            if ( value === 2 ) throw new Error("boom");

            return value;

        }, { lanes: 2 });

        await expect(failing).rejects.toThrow("boom");
        await new Promise(( resolve ) => setTimeout(resolve, 40));
        expect(started.length).toBeLessThanOrEqual(4);

        const aborted = list.mapAsync([1, 2, 3, 4, 5, 6], async ( value ) => {

            seen.push(value);

            if ( value === 2 ) controller.abort(new Error("enough"));

            return value;

        }, { lanes: 1, signal: controller.signal });

        await expect(aborted).rejects.toThrow("enough");
        expect(seen).toEqual([1, 2]);
        await expect(list.mapAsync([1], async ( value ) => value, { signal: AbortSignal.abort() })).rejects.toThrow();
        expect(await list.mapAsync([1, 2, 3], async ( value ) => value * 2, { lanes: Number.NaN })).toEqual([2, 4, 6]);
        expect(await list.mapAsync([1, 2, 3], async ( value ) => value * 2, { lanes: 0.5 })).toEqual([2, 4, 6]);
        expect(await list.mapAsync([], async ( value ) => value)).toEqual([]);

    });
    it("a catalog indexes lazily, trims its keys and folds its search", () => {

        const rows = [{ code: " Eg ", names: ["Egypt", "أحمد"] }, { code: "ES", names: ["Spain"] }];
        let reads = 0;
        const made = list.catalog(rows, ( row ) => row.code, ( row ) => { reads += 1; return row.names; });

        expect(made.get("EG")?.names[0]).toBe("Egypt");
        expect(made.has("es") && reads === 0).toBe(true);
        expect(made.search("احمد").map(( row ) => row.code)).toEqual([" Eg "]);
        expect(made.search("spain")).toHaveLength(1);
        expect(reads).toBe(2);
        expect(made.search("!!")).toEqual([]);
        expect(made.search(" ", 1)).toHaveLength(1);

    });

});
