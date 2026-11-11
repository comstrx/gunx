import * as event from "engine/event";
import { bench, do_not_optimize, run } from "mitata";

type Hits = { hit: number; miss: number };

const quiet = (): undefined => undefined;
const made = event.emitter<Hits>();
const bare = event.emitter<Hits>();
const wide = event.emitter<Hits>();
const bus = event.bus({ replay: 0 });
const direct = event.bus({ replay: 0 });
const crowded = event.bus({ replay: 0 });
const starred = event.bus({ replay: 0 });
const keeping = event.bus({ replay: 8 });
const tight = event.bus({ replay: 1, topics: 64 });
const told = event.bus({ replay: 4 });
const from = event.bus({ replay: 0 });
const to = event.bus({ replay: 0 });
const scoped = event.scope(event.scope(direct, "orders"), "eu");
const count = event.signal(0);
const steady = event.signal(1);
const watched = event.signal(0);
const idle = event.signal(0);
const feed = event.signal(0);
const even = event.derive(feed, ( value ) => value % 2 === 0);
const lazy = event.derive(idle, ( value ) => value * 2);
const parent = new AbortController();
const other = new AbortController();
const deep = "a.b.c.d.e.f.g.h.i.j.k.z";
let turn = 0;

made.on("hit", quiet);
bus.subscribe("orders.*", quiet);
bus.subscribe("**", quiet);
count.watch(quiet);
direct.subscribe("orders.created", quiet);
direct.subscribe("orders.eu.created", quiet);
keeping.subscribe("orders.*", quiet);
even.watch(quiet);
event.pipe(from, to, "orders.**", ( topic ) => `in.${topic}`);
to.subscribe("in.orders.created", quiet);

for ( let at = 0; at < 16; at += 1 ) wide.on("hit", quiet);
for ( let at = 0; at < 2; at += 1 ) wide.any(quiet);
for ( let at = 0; at < 256; at += 1 ) crowded.subscribe(`orders.${at}.created`, quiet);
for ( let at = 0; at < 64; at += 1 ) starred.subscribe(`orders.${at}.*`, quiet);
for ( let at = 0; at < 16; at += 1 ) watched.watch(quiet);
for ( let at = 0; at < 64; at += 1 ) told.publish(`orders.${at % 16}.created`, at);

bench("event.emitter", () => do_not_optimize(event.emitter<Hits>()));
bench("event.emit", () => do_not_optimize(made.emit("hit", 1)));
bench("event.emit.none", () => do_not_optimize(bare.emit("miss", 1)));
bench("event.emit.wide", () => do_not_optimize(wide.emit("hit", 1)));
bench("event.emit.once", () => {

    bare.once("hit", quiet);

    return do_not_optimize(bare.emit("hit", 1));

});
bench("event.on.stop", () => do_not_optimize(made.on("miss", quiet)()));
bench("event.count", () => do_not_optimize(wide.count()));
bench("event.wait", async () => {

    const waited = made.wait("miss");

    made.emit("miss", 1);

    return do_not_optimize(await waited);

});
bench("event.matches.same", () => do_not_optimize(event.matches("orders.created", "orders.created")));
bench("event.matches.star", () => do_not_optimize(event.matches("orders.*.created", "orders.eu.created")));
bench("event.matches.deep", () => do_not_optimize(event.matches("a.**.f.**.z", deep)));
bench("event.matches.miss", () => do_not_optimize(event.matches("a.**.q.**.z", deep)));
bench("event.bus", () => do_not_optimize(event.bus()));
bench("event.publish wildcard", () => do_not_optimize(bus.publish("orders.created", { id: 1 })));
bench("event.publish.exact", () => do_not_optimize(direct.publish("orders.created", 1)));
bench("event.publish.unheard", () => do_not_optimize(direct.publish("orders.dropped", 1)));
bench("event.publish.crowded", () => do_not_optimize(crowded.publish("orders.128.created", 1)));
bench("event.publish.starred", () => do_not_optimize(starred.publish("orders.32.created", 1)));
bench("event.publish.kept", () => do_not_optimize(keeping.publish("orders.created", 1)));
bench("event.publish.evicting", () => {

    turn = (turn + 1) % 4096;

    return do_not_optimize(tight.publish(`orders.${turn}`, 1));

});
bench("event.subscribe.stop", () => do_not_optimize(direct.subscribe("orders.paid", quiet)()));
bench("event.subscribe.starred.stop", () => do_not_optimize(starred.subscribe("orders.*.paid", quiet)()));
bench("event.subscribe.replay", () => do_not_optimize(told.subscribe("orders.*.created", quiet, { replay: true })()));
bench("event.once", async () => {

    const waited = direct.once("orders.shipped");

    direct.publish("orders.shipped", 1);

    return do_not_optimize(await waited);

});
bench("event.last", () => do_not_optimize(told.last("orders.7.created")));
bench("event.history", () => do_not_optimize(told.history("orders.7.*")));
bench("event.topics", () => do_not_optimize(told.topics()));
bench("event.bus.count", () => do_not_optimize(crowded.count()));
bench("event.bus.count.pattern", () => do_not_optimize(starred.count("orders.**.created")));
bench("event.scope.publish", () => do_not_optimize(scoped.publish("created", 1)));
bench("event.pipe.publish", () => do_not_optimize(from.publish("orders.created", 1)));
bench("event.signal", () => do_not_optimize(event.signal(0)));
bench("event.signal.get", () => do_not_optimize(count.get()));
bench("event.signal.set", () => count.set(( value ) => value + 1));
bench("event.signal.set.same", () => steady.set(1));
bench("event.signal.set.wide", () => watched.set(( value ) => value + 1));
bench("event.signal.watch.stop", () => do_not_optimize(steady.watch(quiet)()));
bench("event.signal.until", async () => do_not_optimize(await steady.until(( value ) => value === 1)));
bench("event.derive.get", () => do_not_optimize(lazy.get()));
bench("event.derive.told", () => feed.set(( value ) => value + 1));
bench("event.derive.watch.stop", () => do_not_optimize(lazy.watch(quiet)()));
bench("event.abortable", () => do_not_optimize(event.abortable()));
bench("event.abortable.parents", () => do_not_optimize(event.abortable(parent.signal, other.signal).release()));
bench("event.deadline", () => do_not_optimize(event.deadline(60_000).release()));
bench("event.deadline.parents", () => do_not_optimize(event.deadline(60_000, parent.signal).release()));
bench("event.race", async () => do_not_optimize(await event.race(Promise.resolve(1), parent.signal)));

await run();
