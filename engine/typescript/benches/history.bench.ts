import * as history from "engine/history";
import { bench, do_not_optimize, run } from "mitata";

const short = "/users/7";
const usual = "/users/7?tab=a&tab=b&x=1#top";
const long = `/${Array.from({ length: 12 }, ( _, at ) => `part-${at}`).join("/")}?${Array.from({ length: 12 }, ( _, at ) => `k${at}=v${at}`).join("&")}#section`;
const hostile = "/a/../%2e%2e/b\\c/./%zz?x=%&y[]=1&y[]=2#<frag>";
const worded = "/مستخدم/٧?اسم=قيمة#أعلى";
const wide = { path: "/a", query: Object.fromEntries(Array.from({ length: 16 }, ( _, at ) => [`k${at}`, `v${at}`])), hash: "h" };
const nav = history.create(history.memoryAdapter("/"));
const based = history.create(history.memoryAdapter("/app/users"), "/app");
const still = history.create(history.memoryAdapter("/users/7?tab=a"));
const walk = history.create(history.memoryAdapter("/a"));
const barred = history.create(history.memoryAdapter("/a"));
const heard = history.create(history.memoryAdapter("/"));
const paged = history.create(history.memoryAdapter("/list?page=1&sort=name"));
let turn = 0;

walk.push("/b");
walk.push("/c");
barred.push("/b");
barred.push("/c");
barred.back();
barred.block(() => true);

for ( let at = 0; at < 8; at += 1 ) heard.listen(() => undefined);

bench("history.parse", () => do_not_optimize(history.parse(usual)));
bench("history.parse.short", () => do_not_optimize(history.parse(short)));
bench("history.parse.long", () => do_not_optimize(history.parse(long)));
bench("history.parse.hostile", () => do_not_optimize(history.parse(hostile)));
bench("history.parse.worded", () => do_not_optimize(history.parse(worded)));
bench("history.format", () => do_not_optimize(history.format({ path: "/a", query: { x: "1", y: ["2", "3"] }, hash: "h" })));
bench("history.format.wide", () => do_not_optimize(history.format(wide)));
bench("history.format.parsed", () => do_not_optimize(history.format(history.parse(usual))));
bench("history.local", () => do_not_optimize(history.local(usual)));
bench("history.local.refused", () => do_not_optimize(history.local("//evil.example/x")));
bench("history.isCurrent", () => do_not_optimize(history.isCurrent("/users", "/users/7")));
bench("history.create", () => do_not_optimize(history.create(history.memoryAdapter("/"))));
bench("history.current", () => do_not_optimize(still.current()));
bench("history.href", () => do_not_optimize(still.href({ path: "/users/8", query: { tab: "b" } })));
bench("history.href.based", () => do_not_optimize(based.href("/users/8?tab=b")));
bench("history.isCurrent.bound", () => do_not_optimize(still.isCurrent("/users")));
bench("history.push", () => do_not_optimize(nav.push("/users/7?tab=x")));
bench("history.push.target", () => do_not_optimize(nav.push({ path: "/users/7", query: { tab: "x" } }, { at: 1 })));
bench("history.push.based", () => do_not_optimize(based.push("/users/7?tab=x")));
bench("history.push.heard", () => do_not_optimize(heard.push("/users/7")));
bench("history.replace", () => do_not_optimize(nav.replace("/users/7?tab=y", { at: 2 })));
bench("history.back+forward", () => {

    walk.back();
    walk.forward();
    do_not_optimize(walk.current());

});
bench("history.back.refused", () => {

    barred.back();
    do_not_optimize(barred.current());

});
bench("history.patchQuery", () => {

    turn += 1;
    do_not_optimize(history.patchQuery(paged, { page: turn % 9 }));

});
bench("history.guard", () => do_not_optimize(history.guard(still, () => true)()));

await run();
