import * as fake from "engine/fake";
import * as search from "engine/search";
import { bench, do_not_optimize, run } from "mitata";

type Row = { id: string; name: string; city: string; tags: string[]; price: number };

const maker = fake.create("search");
const rows: Row[] = maker.records(10_000, ( index ) => ({ id: String(index), name: `${maker.words(3)} ${maker.company()}`, city: maker.city(), tags: [maker.word(), maker.word()], price: index % 500 }));
const made = search.index<Row>({ fields: ["name", "city", "tags"], key: ( row ) => row.id, weights: { name: 2 } });
const exact = rows[500]?.name.split(" ")[0] ?? "market";
const filters = search.parse("city:cairo price>=100 -tags:x").filters;
const keep = search.matcher<Row>(filters);
let turn = 0;

made.addAll(rows);

bench("search.index.addAll 10k", () => {

    const fresh = search.index<Row>({ fields: ["name", "city", "tags"], key: ( row ) => row.id });

    fresh.addAll(rows);
    do_not_optimize(fresh.size());

});
bench("search.add + remove", () => {

    turn += 1;
    made.add({ id: "hot", name: `hot ${turn}`, city: "cairo", tags: ["a"], price: 1 });
    made.remove("hot");

});
bench("search.query exact", () => do_not_optimize(made.query(exact, { prefix: false, limit: 10 })));
bench("search.query prefix word", () => do_not_optimize(made.query("mar", { limit: 10 })));
bench("search.query prefix 1 char capped", () => do_not_optimize(made.query("m", { limit: 10, expansions: 128 })));
bench("search.query two terms all", () => do_not_optimize(made.query(`${exact} cairo`, { all: true, limit: 10 })));
bench("search.query fuzzy 1 memoized", () => do_not_optimize(made.query("markte", { fuzzy: 1, limit: 10 })));
bench("search.query fuzzy 1 fresh typo", () => {

    turn += 1;
    do_not_optimize(made.query(`mark${String.fromCharCode(97 + (turn % 26))}t`, { fuzzy: 1, limit: 10 }));

});
bench("search.query filter + boost", () => do_not_optimize(made.query("mar", { limit: 10, filter: keep, boost: ( row ) => 1 + row.price / 1000 })));
bench("search.query offset 100", () => do_not_optimize(made.query("mar", { limit: 10, offset: 100 })));
bench("search.suggest", () => do_not_optimize(made.suggest("ma")));
bench("search.parse", () => do_not_optimize(search.parse('red status:active price>50 -tags:clothes meta.city="Cairo" "running shoes"')));
bench("search.matcher compile", () => do_not_optimize(search.matcher(filters)));
bench("search.filter 10k x 3", () => do_not_optimize(search.filter(rows, filters)));
bench("search.facets 10k", () => do_not_optimize(search.facets(rows, "city")));
bench("search.highlight ascii", () => do_not_optimize(search.highlight("Red running shoes for the market", "run market")));
bench("search.highlight arabic", () => do_not_optimize(search.highlight("قميص أحمر للجري في السوق", "احمر سوق")));
bench("search.tokenize", () => do_not_optimize(search.tokenize("Hello, World! Ça va? Red running shoes for the market", 2)));

await run();
