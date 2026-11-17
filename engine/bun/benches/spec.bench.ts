import * as event from "engine/event";
import * as spec from "engine/spec";
import { bench, do_not_optimize, run } from "mitata";

const surface = spec.plan({
    name: "bench",
    role: "admin",
    screens: Array.from({ length: 60 }, ( _, index ) => spec.screen(`s${index}`, {
        path: index % 3 === 0 ? `/s${index}/{id}` : `/s${index}`,
        title: { en: `S ${index}` },
        features: [spec.feature("rows", { watch: { "form.a": [spec.branch("form.a=1", [spec.set("form.b", 2)])] }, triggers: [spec.trigger("rows.changed", [spec.set("signals.seen", spec.fromEvent("id"))])] })],
        blocks: [spec.block("hero", {}, [spec.block("text")])],
    })),
});
const manifests = { rows: { name: "rows", fields: ["a", "b"], actions: ["refresh", "save"], emits: ["rows.changed"] } };
const compiled = spec.compile(surface, { features: manifests });
const serialized = JSON.parse(JSON.stringify(spec.serialize(compiled))) as unknown;
const bus = event.bus({ replay: 0 });
const made = spec.runtime(compiled, { bus, handlers: { "rows.save": () => "ok", "rows.refresh": () => "ok" } });
const context = { ...spec.empty(), form: { type: "digital", qty: 3 } };
const condition = spec.when("form.type=digital & form.qty>2");
const complex = spec.when("(form.type=digital | form.type=book) & form.qty>2 & !(form.qty>9 | form.type like *x) & form.qty in 1,2,3");

const part = spec.part({ platform: "web", features: manifests });
const wide = ( other: string ): spec.Surface => spec.surface({
    config: { settings: { locales: ["en", "ar"] } },
    schema: {
        screens: Array.from({ length: 30 }, ( _, index ) => spec.screen(`s${index}`, { path: index === 0 ? "/" : `/s${index}`, title: { en: `S ${index}`, ar: `ش ${index}` }, layout: [spec.feature("rows", { on: { success: spec.transfer(other), "rows.changed": spec.debounce(50, spec.toggle("signals.seen")) } })] })),
        on: { enter: spec.set("signals.round", spec.fromEvent("round")) },
    },
    messages: { en: Object.fromEntries(Array.from({ length: 200 }, ( _, index ) => [`k${index}`, `Text ${index}`])), ar: Object.fromEntries(Array.from({ length: 200 }, ( _, index ) => [`k${index}`, `نص ${index}`])) },
});
const tree = spec.define({ shop: { one: wide("two"), two: wide("one") } });
const artifact = JSON.parse(JSON.stringify(spec.build(tree, part).artifact("shop.one"))) as unknown;
const host = spec.boot(artifact, { sinks: [], navigate: () => undefined, handlers: { "rows.save": () => "ok" } });

await made.mount("s1");
await host.app.live.mount("s0");

let turn = 0;

bench("spec.compile.60", () => do_not_optimize(spec.compile(surface, { features: manifests })));
bench("spec.match fixed", () => do_not_optimize(spec.match(compiled, "/s4")));
bench("spec.match moving", () => do_not_optimize(spec.match(compiled, "/s33/42")));
bench("spec.match miss", () => do_not_optimize(spec.match(compiled, "/nope/x/y")));
bench("spec.menuOf", () => do_not_optimize(spec.menuOf(compiled, "en", "/s4")));
bench("spec.titleOf", () => do_not_optimize(spec.titleOf(compiled.screens[0] as spec.CompiledScreen, "ar-EG")));
bench("spec.when parse", () => do_not_optimize(spec.when("form.type=digital & form.qty>2 | !signals.on")));
bench("spec.when parse nested", () => do_not_optimize(spec.when("(form.type=digital | form.type=book) & form.qty>2 & !(form.qty>9 | form.type like *x)")));
bench("spec.evaluate", () => do_not_optimize(spec.evaluate(condition, context)));
bench("spec.evaluate complex", () => do_not_optimize(spec.evaluate(complex, context)));
bench("spec.serialize", () => do_not_optimize(spec.serialize(compiled)));
bench("spec.revive", () => do_not_optimize(spec.revive(serialized)));
bench("spec.explain", () => do_not_optimize(spec.explain(compiled, "s1")));
bench("spec.runtime.set+watch", () => { turn += 1; made.set("form.a", turn & 1); });
bench("spec.runtime.get", () => do_not_optimize(made.get("form.a")));
bench("spec.runtime.act", async () => do_not_optimize(await made.act("rows", "save", { a: 1 })));
bench("spec.runtime.trigger", () => bus.publish("rows.changed", { id: 1 }));
bench("spec.runtime.mount+unmount", async () => { const mounted = await made.mount("s2"); await mounted.unmount(); });
bench("spec.runtime.visible", () => do_not_optimize(made.visible("rows")));

bench("spec.runtime.toggle", () => made.run([spec.toggle("signals.flag")]));
bench("spec.build+artifact 2x30", () => do_not_optimize(spec.build(tree, part).artifact("shop.one")));
bench("spec.boot 2x30", () => do_not_optimize(spec.boot(artifact, { sinks: [] })));
bench("spec.app.text", () => do_not_optimize(host.app.text("ar", "k150")));
bench("spec.app.meta", () => do_not_optimize(host.app.meta(host.app.compiled.screens[0] as spec.CompiledScreen, "ar")));
bench("spec.app.open+close", async () => { await host.app.open("/s3"); await host.app.close(); });
bench("spec.host.transfer round trip", async () => { await host.transfer("two", { with: { round: 1 } }); await host.transfer("one"); });

await run();
