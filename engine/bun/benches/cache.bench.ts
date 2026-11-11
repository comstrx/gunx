import * as cache from "engine/cache";
import { bench, do_not_optimize, run } from "mitata";

const secret = "s".repeat(32);
const kept = cache.lru<string, number>(1000);
const small = cache.lru<number, number>(64);
const ttl = cache.expiring<number>(60_000);
const known = cache.remember<number>(60_000);
const stale = cache.swr<number>(60_000, 120_000);
const marked = cache.tagged<number>(60_000, 4096);
const single = cache.dedupe();
const limit = cache.limiter(1_000_000_000, 60_000);
const spread = cache.limiter(1_000_000_000, 60_000, 1024);
const shut = cache.limiter(1, 60_000);
const flat = cache.memory();
const inside = cache.namespaced(flat, "app");
const shaped = cache.typed<{ n: number; tags: string[] }>(flat);
const box = cache.open({ storage: cache.memory() });
const wide = cache.open({ storage: cache.memory(), prefix: "app" });
const sealed = cache.open({ storage: cache.memory(), secret });
const signed = cache.open({ storage: cache.memory(), sign: secret });
const both = cache.open({ storage: cache.memory(), secret, sign: secret });
const header = "a=1; b=two; c=%D8%B9; theme=dark";
const long = Array.from({ length: 30 }, ( _, at ) => `name${at}=value%20${at}`).join("; ");
const jar = cache.headerCookies(long);
const page = cache.documentCookies({ cookie: long });
const cookie = await cache.signCookie("session-7", secret);
const order = { id: 9, lines: [{ sku: "x", count: 2 }, { sku: "y", count: 1 }], note: "leave at the door" };
let tick = 0;

for ( let index = 0; index < 1000; index += 1 ) {

    kept.set(`k${index}`, index);
    ttl.set(`k${index}`, index);
    marked.set(`k${index}`, index, [`t${index % 10}`, "all"]);
    await flat.set(`app.k${index}`, `${index}`);

}

for ( let index = 0; index < 50; index += 1 ) await wide.set(`k${index}`, order);

await known.get("k", async () => 1);
await stale.get("k", async () => 1);
await shaped.write("typed", { n: 1, tags: ["a", "b"] });
await box.set("k", order);
await box.set("n", 0);
await sealed.set("k", order);
await signed.set("k", order);
await both.set("k", order);
shut.take("ip");

bench("cache.lru.get", () => do_not_optimize(kept.get("k500")));
bench("cache.lru.peek", () => do_not_optimize(kept.peek("k500")));
bench("cache.lru.has", () => do_not_optimize(kept.has("k500")));
bench("cache.lru.set.known", () => kept.set("k500", 1));
bench("cache.lru.set.evicting", () => {

    tick += 1;
    small.set(tick, tick);

});
bench("cache.lru.keys", () => do_not_optimize(kept.keys()));
bench("cache.expiring.get", () => do_not_optimize(ttl.get("k500")));
bench("cache.expiring.has", () => do_not_optimize(ttl.has("k500")));
bench("cache.expiring.set", () => ttl.set("k500", 1));
bench("cache.expiring.prune", () => do_not_optimize(ttl.prune()));
bench("cache.remember.get", async () => do_not_optimize(await known.get("k", async () => 1)));
bench("cache.remember.peek", () => do_not_optimize(known.peek("k")));
bench("cache.swr.get", async () => do_not_optimize(await stale.get("k", async () => 1)));
bench("cache.swr.state", () => do_not_optimize(stale.state("k")));
bench("cache.tagged.get", () => do_not_optimize(marked.get("k500")));
bench("cache.tagged.set", () => marked.set("k500", 1, ["t0", "all"]));
bench("cache.tagged.invalidate", () => {

    marked.set("gone", 1, ["once"]);
    do_not_optimize(marked.invalidate("once"));

});
bench("cache.dedupe", async () => do_not_optimize(await single("k", async () => 1)));
bench("cache.limiter.take", () => do_not_optimize(limit.take("ip")));
bench("cache.limiter.take.spread", () => {

    tick += 1;
    do_not_optimize(spread.take(`ip${tick % 4096}`));

});
bench("cache.limiter.take.refused", () => do_not_optimize(shut.take("ip")));
bench("cache.limiter.peek", () => do_not_optimize(limit.peek("ip")));
bench("cache.limiter.assert", () => do_not_optimize(limit.assert("ip")));
bench("cache.parseCookies", () => do_not_optimize(cache.parseCookies(header)));
bench("cache.parseCookies.long", () => do_not_optimize(cache.parseCookies(long)));
bench("cache.serializeCookie", () => do_not_optimize(cache.serializeCookie("session", "abc123", { maxAge: 3600, httpOnly: true, secure: true })));
bench("cache.serializeCookie.bare", () => do_not_optimize(cache.serializeCookie("session", "abc123")));
bench("cache.serializeCookie.encoded", () => do_not_optimize(cache.serializeCookie("session", "two words; and more")));
bench("cache.headerCookies", () => do_not_optimize(cache.headerCookies(header)));
bench("cache.headerCookies.get", () => do_not_optimize(jar.get("name20")));
bench("cache.documentCookies.get", () => do_not_optimize(page.get("name20")));
bench("cache.signCookie", async () => do_not_optimize(await cache.signCookie("session-7", secret)));
bench("cache.unsignCookie", async () => do_not_optimize(await cache.unsignCookie(cookie, secret, 3600)));
bench("cache.storage.set+get", async () => {

    await flat.set("k", "v");
    do_not_optimize(await flat.get("k"));

});
bench("cache.storage.keys", async () => do_not_optimize(await flat.keys()));
bench("cache.namespaced.get", async () => do_not_optimize(await inside.get("k500")));
bench("cache.namespaced.keys", async () => do_not_optimize(await inside.keys()));
bench("cache.typed.read", async () => do_not_optimize(await shaped.read("typed")));
bench("cache.typed.write", async () => shaped.write("typed", { n: 1, tags: ["a", "b"] }));
bench("cache.box.set+get", async () => {

    await box.set("k", { n: 1 });
    do_not_optimize(await box.get("k"));

});
bench("cache.box.get", async () => do_not_optimize(await box.get("k")));
bench("cache.box.has", async () => do_not_optimize(await box.has("k")));
bench("cache.box.set", async () => box.set("k", order));
bench("cache.box.set.ttl", async () => box.set("t", order, { ttl: 60 }));
bench("cache.box.update", async () => do_not_optimize(await box.update<number>("n", ( current ) => (current ?? 0) + 1)));
bench("cache.box.increment", async () => do_not_optimize(await box.increment("n")));
bench("cache.box.remember", async () => do_not_optimize(await box.remember("k", () => order)));
bench("cache.box.touch", async () => do_not_optimize(await box.touch("k", { ttl: 60 })));
bench("cache.box.all", async () => do_not_optimize(await wide.all()));
bench("cache.box.keys", async () => do_not_optimize(await wide.keys()));
bench("cache.box.sealed.set", async () => sealed.set("k", order));
bench("cache.box.sealed.get", async () => do_not_optimize(await sealed.get("k")));
bench("cache.box.signed.set", async () => signed.set("k", order));
bench("cache.box.signed.get", async () => do_not_optimize(await signed.get("k")));
bench("cache.box.both.set+get", async () => {

    await both.set("k", order);
    do_not_optimize(await both.get("k"));

});

await run();
