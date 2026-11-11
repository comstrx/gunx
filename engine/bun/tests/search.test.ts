import { describe, expect, test as it } from "bun:test";
import * as search from "engine/search";

type Row = { id: string; name: string; tags: string[]; price: number; status: string; meta: { city: string } };

const rows: Row[] = [
    { id: "1", name: "Red running shoes", tags: ["shoes", "sport"], price: 120, status: "active", meta: { city: "Cairo" } },
    { id: "2", name: "Blue shoes", tags: ["shoes"], price: 80, status: "paused", meta: { city: "Giza" } },
    { id: "3", name: "Running shorts", tags: ["sport", "clothes"], price: 40, status: "active", meta: { city: "Cairo" } },
    { id: "4", name: "قميص أحمر", tags: ["clothes"], price: 60, status: "active", meta: { city: "Riyadh" } },
];

describe("search", () => {

    it("an index ranks by bm25 with prefixes, fuzzy terms, all-terms and removals", () => {

        const made = search.index<Row>({ fields: ["name", "tags", "meta.city"], key: ( row ) => row.id, weights: { name: 2 } });

        for ( const row of rows ) made.add(row);

        expect(made.size()).toBe(4);
        expect(made.terms()).toBeGreaterThan(8);
        expect(made.query("shoes").map(( hit ) => hit.item.id)).toEqual(["2", "1"]);
        expect(made.query("run").map(( hit ) => hit.item.id).sort()).toEqual(["1", "3"]);
        expect(made.query("run", { prefix: false })).toEqual([]);
        expect(made.query("running shoes", { all: true }).map(( hit ) => hit.item.id)).toEqual(["1"]);
        expect(made.query("shoez", { fuzzy: 1 }).map(( hit ) => hit.item.id).sort()).toEqual(["1", "2"]);
        expect(made.query("cairo").map(( hit ) => hit.item.id).sort()).toEqual(["1", "3"]);
        expect(made.query("احمر").map(( hit ) => hit.item.id)).toEqual(["4"]);
        expect(made.query("shoes", { limit: 1 })).toHaveLength(1);
        expect(made.query("")).toEqual([]);
        expect(made.query("shoes")[0]?.terms).toEqual(["shoes"]);
        expect(made.has("2") && made.get("2")?.name === "Blue shoes").toBe(true);
        expect(made.remove("2") && !made.remove("2")).toBe(true);
        expect(made.query("shoes").map(( hit ) => hit.item.id)).toEqual(["1"]);
        made.add({ ...(rows[0] as Row), name: "Green shoes" });
        expect(made.query("red")).toEqual([]);
        expect(made.query("green").map(( hit ) => hit.item.id)).toEqual(["1"]);
        made.clear();
        expect(made.size()).toBe(0);
        expect(search.tokenize("Hello, World! Ça va?", 2)).toEqual(["hello", "world", "ca", "va"]);

    });
    it("queries parse filters out of text, filter rows, highlight hits and count facets", () => {

        const parsed = search.parse('red status:active price>50 -tags:clothes meta.city="Cairo" "running shoes"');

        expect(parsed.terms).toEqual(["red", "running shoes"]);
        expect(parsed.text).toBe("red running shoes");
        expect(parsed.filters).toEqual([
            { field: "status", operator: ":", value: "active", negated: false },
            { field: "price", operator: ">", value: "50", negated: false },
            { field: "tags", operator: ":", value: "clothes", negated: true },
            { field: "meta.city", operator: "=", value: "Cairo", negated: false },
        ]);
        expect(search.filter(rows, parsed.filters).map(( row ) => row.id)).toEqual(["1"]);
        expect(search.filter(rows, search.parse("price<=60").filters).map(( row ) => row.id)).toEqual(["3", "4"]);
        expect(search.filter(rows, search.parse("status!=active").filters).map(( row ) => row.id)).toEqual(["2"]);
        expect(search.filter(rows, search.parse("tags:sport").filters).map(( row ) => row.id)).toEqual(["1", "3"]);
        expect(search.filter(rows, search.parse("price>x").filters)).toEqual([]);
        expect(search.highlight("Red running shoes", "run shoes")).toEqual([{ text: "Red ", hit: false }, { text: "run", hit: true }, { text: "ning ", hit: false }, { text: "shoes", hit: true }]);
        expect(search.highlight("plain", "")).toEqual([{ text: "plain", hit: false }]);
        expect(search.highlight("Café au lait", "cafe")[0]).toEqual({ text: "Café", hit: true });
        expect(search.facets(rows, "status")).toEqual([{ value: "active", count: 3 }, { value: "paused", count: 1 }]);
        expect(search.facets(rows, "tags", 2)).toEqual([{ value: "clothes", count: 2 }, { value: "shoes", count: 2 }]);
        expect(search.facets(rows, "meta.city")[0]).toEqual({ value: "Cairo", count: 2 });

    });
    it("suggestions complete the last typed term by how many rows carry it", () => {

        const made = search.index<{ id: string; name: string }>({ fields: ["name"], key: ( row ) => row.id });

        for ( const row of [{ id: "1", name: "tea table" }, { id: "2", name: "tent" }, { id: "3", name: "tea" }] ) made.add(row);

        expect(made.suggest("t")).toEqual(["tea", "table", "tent"]);
        expect(made.suggest("te", 1)).toEqual(["tea"]);
        expect(made.suggest("fresh t")).toEqual(["tea", "table", "tent"]);
        expect(made.suggest("")).toEqual([]);
        expect(made.suggest("zzzz")).toEqual([]);

    });
    it("queries page with offset, cap expansions, filter and boost hits, and index only text, numbers and lists", () => {

        type Item = { id: string; name: string; tags: string[]; price: number; flag: boolean; nested: { deep: { x: string } }; junk: unknown };
        const items: Item[] = [
            { id: "1", name: "Red running shoes", tags: ["shoes", "sport"], price: 120, flag: true, nested: { deep: { x: "alpha" } }, junk: { toString: () => "object" } },
            { id: "2", name: "Blue shoes", tags: ["shoes"], price: 80, flag: false, nested: { deep: { x: "beta" } }, junk: [["deep", ["deeper", ["deepest", ["lost"]]]]] },
        ];
        const made = search.index<Item>({ fields: ["name", "tags", "nested.deep.x", "price", "flag", "junk"], key: ( row ) => row.id, weights: { name: 2, missing: 3 } });

        made.addAll(items);
        expect([made.query("120").map(( hit ) => hit.key), made.query("true"), made.query("object"), made.query("alpha").map(( hit ) => hit.key), made.query("deepest").map(( hit ) => hit.key), made.query("lost")]).toEqual([["1"], [], [], ["1"], ["2"], []]);
        expect([made.query("shoes", { limit: 1 }).map(( hit ) => hit.key), made.query("shoes", { limit: 1, offset: 1 }).map(( hit ) => hit.key), made.query("shoes", { offset: 5 }), made.query("shoes", { limit: Number.POSITIVE_INFINITY }).length, made.query("shoes", { limit: 0 }), made.query("shoes", { limit: -3 }), made.query("shoes", { offset: -1 }).length]).toEqual([["1"], ["2"], [], 2, [], [], 2]);
        expect([made.query("shoes", { boost: ( row ) => (row.id === "1" ? 10 : 1) }).map(( hit ) => hit.key), made.query("shoes", { boost: () => Number.NaN }).map(( hit ) => hit.key), made.query("shoes", { boost: () => -1 }).map(( hit ) => hit.key), made.query("shoes", { boost: () => Number.POSITIVE_INFINITY }).map(( hit ) => hit.key), made.query("shoes", { boost: () => 0 }).map(( hit ) => hit.score), made.query("shoes", { filter: ( row ) => row.id === "2" }).map(( hit ) => hit.key), made.query("shoes", { filter: () => false })]).toEqual([["1", "2"], ["1", "2"], ["1", "2"], ["1", "2"], [0, 0], ["2"], []]);
        expect(made.query("shoes").map(( hit ) => hit.score)).toEqual([0.287, 0.287]);
        expect(made.query("shoes", { boost: ( row ) => (row.id === "2" ? 1.5 : 1) }).map(( hit ) => [hit.key, hit.score])).toEqual([["2", 0.43], ["1", 0.287]]);
        expect([made.query("s", { expansions: 1 }).map(( hit ) => hit.key), made.query("s", { expansions: 1 })[0]?.terms, made.query("s", { expansions: 0 }).length, made.query("s", { expansions: Number.NaN }).length, made.query("s")[0]?.terms]).toEqual([["1", "2"], ["shoes"], 2, 2, ["shoes", "sport"]]);
        expect(() => search.index<Item>({ fields: ["name"], key: ( row ) => row.id, weights: { name: Number.NaN } })).toThrow(new RangeError("not a weight"));
        expect(() => search.index<Item>({ fields: ["name"], key: ( row ) => row.id, weights: { name: -1 } })).toThrow(new RangeError("not a weight"));
        expect(() => search.index<Item>({ fields: ["name"], key: ( row ) => row.id, weights: { name: Number.POSITIVE_INFINITY } })).toThrow(new RangeError("not a weight"));

        const unweighted = search.index<Item>({ fields: ["name"], key: ( row ) => row.id, weights: { name: 0 } });

        unweighted.addAll(items);
        expect([unweighted.size(), unweighted.terms(), unweighted.query("shoes")]).toEqual([2, 0, []]);
        expect(() => made.add({ ...(items[0] as Item), id: "" })).toThrow(new TypeError("not a key"));
        expect(() => made.add({ ...(items[0] as Item), id: 5 as unknown as string })).toThrow(new TypeError("not a key"));
        expect([made.size(), made.has("1"), made.get("1")?.name]).toEqual([2, true, "Red running shoes"]);

    });
    it("stop words, minimum length and a custom tokenizer shape the vocabulary on both sides", () => {

        const rows = [{ id: "1", name: "The Running Shoes" }, { id: "2", name: "Blue shoes" }];
        const stopped = search.index<{ id: string; name: string }>({ fields: ["name"], key: ( row ) => row.id, stop: ["The Running"], minLength: 3 });

        stopped.addAll(rows);
        expect([stopped.terms(), stopped.query("running"), stopped.query("the"), stopped.query("blue").map(( hit ) => hit.key), stopped.query("bl").length, stopped.query("shoes").length]).toEqual([2, [], [], ["2"], 0, 2]);

        const custom = search.index<{ id: string; name: string }>({ fields: ["name"], key: ( row ) => row.id, tokenize: ( text ) => text.split("").filter(( sign ) => sign !== " ") });

        custom.addAll(rows);
        expect([custom.terms(), custom.query("R", { prefix: false }).map(( hit ) => hit.key), custom.query("r", { prefix: false }).map(( hit ) => hit.key), custom.suggest("S")]).toEqual([13, ["1"], [], ["S"]]);
        expect([search.tokenize("Hello, World! Ça va?"), search.tokenize("a bb ccc", 2), search.tokenize("", 1), search.tokenize("x", Number.NaN)]).toEqual([["hello", "world", "ca", "va"], ["bb", "ccc"], [], []]);

    });
    it("parse keeps quoted values whole, scopes filter fields, reads negation, and leaves links and junk as terms", () => {

        expect(search.parse('a:"quoted value" b:')).toEqual({ terms: ["b:"], filters: [{ field: "a", operator: ":", value: "quoted value", negated: false }], text: "b:" });
        expect(search.parse("-x:1 -y z:2", { fields: ["x"] })).toEqual({ terms: ["-y", "z:2"], filters: [{ field: "x", operator: ":", value: "1", negated: true }], text: "-y z:2" });
        expect(search.parse('"unbalanced quote')).toEqual({ terms: ["unbalanced quote"], filters: [], text: "unbalanced quote" });
        expect(search.parse("a>=1 b<= c: d!=x e<2").filters.map(( one ) => `${one.field}${one.operator}${one.value}`)).toEqual(["a>=1", "d!=x", "e<2"]);
        expect(search.parse("a>=1 b<= c:").terms).toEqual(["b<=", "c:"]);
        expect(search.parse("1price:5 _ok:1 A.B:2 http://example.com/x secret:abc").filters.map(( one ) => one.field)).toEqual(["_ok", "A.B", "secret"]);
        expect(search.parse("1price:5 http://example.com/x").terms).toEqual(["1price:5", "http://example.com/x"]);
        expect(search.parse("   \t\n ")).toEqual({ terms: [], filters: [], text: "" });
        expect(search.parse('"a:b" c:"d e" f:g"h"').filters).toEqual([{ field: "c", operator: ":", value: "d e", negated: false }, { field: "f", operator: ":", value: "gh", negated: false }]);
        expect(search.parse('"a:b"').terms).toEqual(["a:b"]);

        const scoped = search.parse("status:active secret:x price>1", { fields: ["status", "price"] });

        expect([scoped.terms, scoped.filters.map(( one ) => one.field)]).toEqual([["secret:x"], ["status", "price"]]);
        expect(search.matcher(scoped.filters)({ status: "Active", price: 2 })).toBe(true);
        expect(search.matcher(scoped.filters)({ status: "Active", price: 1 })).toBe(false);
        expect(search.matcher([])({})).toBe(true);

    });
    it("filters compare text, numbers, dates, booleans and lists the way a person types them", () => {

        type Item = { id: string; name: string; tags: string[]; price: number; when: Date; flag: boolean; big: bigint; nested: { deep: { x: string } }; none: null };
        const items: Item[] = [
            { id: "1", name: "Red running shoes", tags: ["shoes", "sport"], price: 120, when: new Date("2024-01-02T00:00:00Z"), flag: true, big: 10n, nested: { deep: { x: "alpha" } }, none: null },
            { id: "2", name: "Blue shoes", tags: ["shoes"], price: 80, when: new Date("2023-06-01T00:00:00Z"), flag: false, big: 9n, nested: { deep: { x: "beta" } }, none: null },
        ];
        const ids = ( text: string ): string[] => search.filter(items, search.parse(text).filters).map(( row ) => row.id);

        expect([ids("when>2023-12-31"), ids("when:2024"), ids("when<=2023-06-01T00:00:00.000Z"), ids("flag=true"), ids("flag!=true"), ids("flag:ru")]).toEqual([["1"], ["1"], ["2"], ["1"], ["2"], ["1"]]);
        expect([ids("missing!=x"), ids("-missing!=x"), ids("missing:x"), ids("-missing:x"), ids("none:null"), ids("none!=null")]).toEqual([["1", "2"], [], [], ["1", "2"], [], ["1", "2"]]);
        expect([ids("price>=1e2"), ids("price=١٢٠"), ids("price=120.0"), ids("price=+120"), ids("price=0x78"), ids("price<x"), ids("price!=x"), ids("big>9"), ids("big=10")]).toEqual([["1"], ["1"], ["1"], ["1"], [], [], ["1", "2"], ["1"], ["1"]]);
        expect([ids("name:RED"), ids("tags=SHOES"), ids("tags=sport"), ids("tags!=sport"), ids("-tags=sport"), ids("name>blue"), ids("name<=80"), ids("name=red running shoes"), ids('name="red running shoes"'), ids("nested.deep.x=Alpha")]).toEqual([["1"], ["1", "2"], ["1"], ["2"], ["2"], ["1", "2"], [], [], ["1"], ["1"]]);
        expect([ids("__proto__:x"), ids("constructor:y"), ids("id:1 id:2"), ids("id:1 -id:1")]).toEqual([[], [], [], []]);
        expect(search.filter(items, [{ field: "price", operator: "?" as search.Operator, value: "1", negated: false }])).toEqual([]);
        expect(search.filter(items, [{ field: "price", operator: "?" as search.Operator, value: "1", negated: true }]).length).toBe(2);
        expect(search.filter([{ a: [[1, [2, [3, [4]]]]] }], search.parse("a=3").filters).length).toBe(1);
        expect(search.filter([{ a: [[1, [2, [3, [4]]]]] }], search.parse("a=4").filters).length).toBe(0);

    });
    it("highlight folds ligatures and marks, prefers the longest needle, merges adjacent hits and keeps every character", () => {

        expect(search.highlight("ﬁne ﬁsh", "fi")).toEqual([{ text: "ﬁ", hit: true }, { text: "ne ", hit: false }, { text: "ﬁ", hit: true }, { text: "sh", hit: false }]);
        expect(search.highlight("aaaa", "aa")).toEqual([{ text: "aaaa", hit: true }]);
        expect(search.highlight("Red red RED", "red")).toEqual([{ text: "Red", hit: true }, { text: " ", hit: false }, { text: "red", hit: true }, { text: " ", hit: false }, { text: "RED", hit: true }]);
        expect(search.highlight("x", "x x xx")).toEqual([{ text: "x", hit: true }]);
        expect(search.highlight("running runner", "run runner")).toEqual([{ text: "run", hit: true }, { text: "ning ", hit: false }, { text: "runner", hit: true }]);
        expect(search.highlight("Σίσυφος", "σισυφοσ")).toEqual([{ text: "Σίσυφος", hit: true }]);
        expect(search.highlight("naïve café", "naive cafe")).toEqual([{ text: "naïve", hit: true }, { text: " ", hit: false }, { text: "café", hit: true }]);
        expect(search.highlight("", "x")).toEqual([{ text: "", hit: false }]);
        expect(search.highlight("abc", "zzz")).toEqual([{ text: "abc", hit: false }]);
        expect(search.highlight("مُحَمَّد", "محمد")).toEqual([{ text: "مُحَمَّد", hit: true }]);
        expect(search.highlight("Straße", "strasse")).toEqual([{ text: "Straße", hit: false }]);

    });
    it("facets count scalars and list members once per row in count order, and suggestions rank by rows then text", () => {

        const items = [{ id: "1", tags: ["a", "a", "b"], flag: true, when: new Date("2024-01-02T00:00:00Z"), none: null, obj: { x: 1 } }, { id: "2", tags: ["b"], flag: false, when: new Date("2024-01-02T00:00:00Z"), none: null, obj: { x: 1 } }];

        expect([search.facets(items, "tags"), search.facets(items, "flag"), search.facets(items, "when"), search.facets(items, "none"), search.facets(items, "obj"), search.facets(items, "missing"), search.facets([], "tags")]).toEqual([[{ value: "a", count: 1 }, { value: "b", count: 2 }].sort(( x, y ) => y.count - x.count), [{ value: "false", count: 1 }, { value: "true", count: 1 }], [{ value: "2024-01-02T00:00:00.000Z", count: 2 }], [], [], [], []]);
        expect([search.facets(items, "tags", 1), search.facets(items, "tags", 0), search.facets(items, "tags", -2), search.facets(items, "tags", Number.NaN).length]).toEqual([[{ value: "b", count: 2 }], [], [], 2]);

        const made = search.index<{ id: string; name: string }>({ fields: ["name"], key: ( row ) => row.id });

        made.addAll([{ id: "1", name: "tea table" }, { id: "2", name: "tent" }, { id: "3", name: "tea" }, { id: "4", name: "tab" }]);
        expect([made.suggest("t"), made.suggest("ta"), made.suggest("t", 2), made.suggest("t", 0), made.suggest("t", Number.NaN).length, made.suggest("fresh t"), made.suggest("  "), made.suggest("T")]).toEqual([["tea", "tab", "table", "tent"], ["tab", "table"], ["tea", "tab"], [], 4, ["tea", "tab", "table", "tent"], [], ["tea", "tab", "table", "tent"]]);
        made.remove("3");
        expect(made.suggest("t")).toEqual(["tab", "table", "tea", "tent"]);

    });
    it("survivors: fuzzy edits are capped by term length and at three, an exact hit is never double counted, expansions cap fuzzy candidates too", () => {

        const made = search.index<{ id: string; name: string }>({ fields: ["name"], key: ( row ) => row.id });

        made.addAll([{ id: "1", name: "running go" }, { id: "2", name: "run" }, { id: "3", name: "shoes" }, { id: "4", name: "shoez" }, { id: "5", name: "shoe" }, { id: "6", name: "xhoe" }]);
        expect([made.query("rxxxxng", { fuzzy: 9, prefix: false }), made.query("runnxxx", { fuzzy: 9, prefix: false }).map(( hit ) => hit.key), made.query("rxn", { fuzzy: 2, prefix: false }).map(( hit ) => hit.key), made.query("rxx", { fuzzy: 2, prefix: false }), made.query("gx", { fuzzy: 1, prefix: false }), made.query("go", { fuzzy: 1, prefix: false }).map(( hit ) => hit.key)]).toEqual([[], ["1"], ["2"], [], [], ["1"]]);
        expect(made.query("shoes", { fuzzy: 1, prefix: false })[0]?.score).toBe(made.query("shoes", { prefix: false })[0]?.score);
        expect(made.query("shoes", { fuzzy: 1, prefix: false }).map(( hit ) => hit.key)).toEqual(["3", "4", "5"]);
        expect([made.query("shoe", { fuzzy: 1, expansions: 1 }).map(( hit ) => hit.key), made.query("shoe", { fuzzy: 1, expansions: 2 }).map(( hit ) => hit.key).sort(), made.query("shoe", { fuzzy: 1 }).map(( hit ) => hit.key).sort(), made.query("shoe", { fuzzy: 1, expansions: 4 }).map(( hit ) => hit.key).sort()]).toEqual([["5"], ["3", "5"], ["3", "4", "5", "6"], ["3", "4", "5", "6"]]);
        expect(made.query("shoe").map(( hit ) => hit.key)).toEqual(["5", "3", "4"]);
        expect((made.query("shoe")[0]?.score ?? 0) > (made.query("shoe")[1]?.score ?? 0)).toBe(true);

        const weighted = search.index<{ id: string; name: string; tags: string[] }>({ fields: ["name", "tags"], key: ( row ) => row.id, weights: { name: 2 } });

        weighted.addAll([{ id: "1", name: "Red running shoes", tags: ["shoes", "sport"] }, { id: "2", name: "Blue shoes", tags: ["shoes"] }]);
        expect([weighted.query("shoes").map(( hit ) => hit.key), weighted.query("shoes", { boost: () => -1 }).map(( hit ) => hit.key), weighted.query("shoes", { boost: () => -1 }).map(( hit ) => hit.score)]).toEqual([["2", "1"], ["2", "1"], [0.301, 0.273]]);
        expect(search.highlight("café au lait", "cafe")).toEqual([{ text: "café", hit: true }, { text: " au lait", hit: false }]);
        expect(search.highlight("café cafe", "cafe")).toEqual([{ text: "café", hit: true }, { text: " ", hit: false }, { text: "cafe", hit: true }]);

    });
});
