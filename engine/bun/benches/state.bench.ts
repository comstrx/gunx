import * as cache from "engine/cache";
import * as event from "engine/event";
import * as state from "engine/state";
import { bench, do_not_optimize, run } from "mitata";

type Bag = { items: string[]; user: { id: number; name: string } | null; n: number };
type Moves = { add: ( sku: string ) => void; put: ( n: number ) => void };

const rows = Array.from({ length: 200 }, ( _, id ) => `item-${id}`);
const define = ( name: string, persist?: state.Persist<Bag> ): state.Instance<Bag, Moves> => state.define<Bag, Moves>({
    name,
    initial: { items: rows, user: { id: 1, name: "n" }, n: 0 },
    actions: ( set, get ) => ({ add: ( sku ) => set({ items: [...get().items, sku] }), put: ( n ) => set({ n }) }),
    persist,
}).create();
const bare = define("bare");
const kept = define("kept", { box: cache.open({ kind: "memory" }) });
const synced = define("synced", { box: cache.open({ kind: "memory" }), sync: true });
const partial = define("partial", { box: cache.open({ kind: "memory" }), keys: ["items"] });
const bound = state.bind(bare);
const count = state.derive(bare, ( current ) => current.items.length);
const flag = event.signal(false);
const both = state.combine({ count, flag, n: state.derive(bare, ( current ) => current.n) });
const loader = state.resource<number>({ load: async () => 1, staleAfter: 60_000 });
const ready = state.resource<number>({ load: async () => 1, seed: 1 });
const act = state.action<number, number>(async ( input ) => input);
const first = state.action<number, number>(async ( input ) => input, { mode: "first" });
const feed = state.feed<{ id: string }>({ key: ( item ) => item.id, load: async ( cursor ) => ({ items: [{ id: `${cursor ?? "s"}-${Math.random()}` }], next: "n" }) });
const idle = (): undefined => undefined;
let turn = 0;

await Promise.all([kept.hydrate(), synced.hydrate(), partial.hydrate()]);
bare.subscribe(idle);
kept.subscribe(idle);

bench("state.set", () => {

    turn += 1;
    bare.getState().put(turn);

});
bench("state.set persisted key", () => {

    turn += 1;
    kept.getState().put(turn);

});
bench("state.set persisted key, synced", () => {

    turn += 1;
    synced.getState().put(turn);

});
bench("state.set unpersisted key", () => {

    turn += 1;
    partial.getState().put(turn);

});
bench("state.set + flush persisted", async () => {

    turn += 1;
    kept.getState().put(turn);
    await kept.flush();

});
bench("state.set + flush synced", async () => {

    turn += 1;
    synced.getState().put(turn);
    await synced.flush();

});
bench("state.flush clean", async () => kept.flush());
bench("state.hydrate fresh instance", async () => {

    const made = define("fresh", { box: cache.open({ kind: "memory" }) });

    await made.hydrate();

});
bench("state.hydrate saved copy", async () => {

    const box = cache.open({ kind: "memory" });

    await box.set("saved@2", { version: 1, state: { items: rows, user: { id: 1, name: "n" }, n: 3 } });

    const made = define("saved", { box });

    await made.hydrate();

});
bench("state.hydrate migrated copy", async () => {

    const box = cache.open({ kind: "memory" });

    await box.set("moved@2", { version: 1, state: { items: rows, n: 3 } });

    const made = define("moved", { box, version: 2, migrate: ( saved ) => saved as Partial<Bag> });

    await made.hydrate();

});
bench("state.define + create", () => do_not_optimize(define("made")));
bench("state.select", () => do_not_optimize(bound.select(( current ) => current.n)));
bench("state.derive.getState same", () => do_not_optimize(count.getState()));
bench("state.derive.getState changed", () => {

    turn += 1;
    bare.getState().put(turn);
    do_not_optimize(count.getState());

});
bench("state.combine.getState same", () => do_not_optimize(both.getState()));
bench("state.combine.getState changed", () => {

    flag.set(turn % 2 === 0);
    turn += 1;
    do_not_optimize(both.getState());

});
bench("state.combine.subscribe + stop", () => state.combine({ count, flag }).subscribe(idle)());
bench("state.shallow equal objects", () => do_not_optimize(state.shallow({ a: 1, b: "x", c: rows }, { a: 1, b: "x", c: rows })));
bench("state.shallow equal lists", () => do_not_optimize(state.shallow(rows, [...rows])));
bench("state.readable signal", () => do_not_optimize(state.readable(flag).getState()));
bench("state.resource.ensure fresh", async () => do_not_optimize(await loader.ensure()));
bench("state.resource.ensure seeded stale", async () => do_not_optimize(await ready.ensure()));
bench("state.resource.refresh", async () => do_not_optimize(await loader.refresh()));
bench("state.resource.set", () => loader.set(turn));
bench("state.action.run", async () => do_not_optimize(await act.run(1)));
bench("state.action.run first-mode joined", async () => {

    const one = first.run(1);

    do_not_optimize(await Promise.all([one, first.run(2)]));

});
bench("state.action.run superseded pair", async () => {

    const slow = act.run(1);

    do_not_optimize(await Promise.all([slow, act.run(2)]));

});
bench("state.feed.more", async () => feed.more());
bench("state.feed.put known", () => feed.put({ id: feed.getState().items[0]?.id ?? "s" }));
bench("state.feed.put + drop", () => {

    feed.put({ id: "x" });
    feed.drop("x");

});
bench("state.feed.refresh", async () => feed.refresh());

await run();
