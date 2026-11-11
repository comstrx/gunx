import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as event from "engine/event";
import * as spec from "engine/spec";
import * as validate from "engine/validate";

const context: spec.Context = { ...spec.empty(), form: { a: 1, b: "x y", c: [1, "2"], d: null, e: "", s: "a=b" }, user: { abilities: ["orders.*"] } };
const reasonOf = ( work: () => unknown ): string => { try { work(); return "ok"; } catch ( caught ) { return error.isFault(caught) ? caught.reason ?? "?" : "?"; } };
const tick = (): Promise<void> => new Promise(( resolve ) => setTimeout(resolve, 0));
const surface = spec.surface({ name: "s", role: "admin", screens: [
    spec.screen({ name: "home", path: "/", title: "Home" }),
    spec.screen({ name: "dupe", path: "/d/{id}/{id}", title: "D" }),
    spec.screen({ name: "star", path: "/*/x", title: "S" }),
    spec.screen({ name: "one", path: "/a/{id}", title: "One" }),
    spec.screen({ name: "two", path: "/a/{id}", title: "Two" }),
    spec.screen({ name: "fixed", path: "/a/b", title: "Fixed", menu: false }),
    spec.screen({ name: "deep", path: "/a/b/c", title: "Deep", flow: ["x", "x"] }),
] });
const compiled = spec.compile(surface);

describe("spec.edges", () => {

    it("conditions read quotes, spaces, negated membership, globs and nesting; junk text parses to a test that never passes", () => {

        expect([spec.when("form.b='x y'"), spec.when('form.s="a=b"'), spec.when("form.b in 'x y',z"), spec.when("form.a = 1"), spec.when("form.x in "), spec.when("can:"), spec.when("form.a<=1"), spec.when("form.a!=1 & !form.d"), spec.when("!!form.a"), spec.when("form.a not in 1,2"), spec.when("(form.a=1 | form.a=2) & !(form.b=z)"), spec.when("form.b like 'x*'"), spec.when("a=1)"), spec.when("")]).toEqual([
            { is: "form.b", eq: "x y" }, { is: "form.s", eq: "a=b" }, { is: "form.b", in: ["x y", "z"] }, { is: "form.a", eq: 1 }, { is: "form.x in", empty: false }, { is: "user.abilities", can: "" }, { is: "form.a", lte: 1 }, { all: [{ is: "form.a", ne: 1 }, { not: { is: "form.d", empty: false } }] }, { is: "form.a", empty: false }, { not: { is: "form.a", in: [1, 2] } }, { all: [{ any: [{ is: "form.a", eq: 1 }, { is: "form.a", eq: 2 }] }, { not: { is: "form.b", eq: "z" } }] }, { is: "form.b", like: "x*" }, { is: "a", eq: "1)" }, true,
        ]);
        expect(["form.b='x y'", 'form.s="a=b"', "form.a = 1", "form.x in ", "can:orders.write", "can:", "form.c has 2", "form.c has 3", "form.d=null", "form.e", "!form.e", "form.a>0.5", "form.a>x", "(form.a=1 | form.a=2) & !(form.b=z)", "form.b like x*", "form.b like *y", "form.b like *", "form.a like 1", "form.a not in 1,2", "form.a not in 2,3", "form.a>=1 & form.a<2", "form.c=1"].map(( text ) => spec.evaluate(spec.when(text), context))).toEqual([true, true, true, false, true, false, true, false, true, false, true, true, false, true, true, true, true, true, false, true, true, false]);
        expect([spec.pathsOf(spec.when(`${"(".repeat(30)}form.a=1${")".repeat(30)}`)), spec.pathsOf(spec.when(`${"(".repeat(40)}form.a=1${")".repeat(40)}`)), spec.evaluate(spec.when(`${"(".repeat(40)}form.a=1${")".repeat(40)}`), context), spec.when(`${"(".repeat(5)}a=1${")".repeat(4)}`)]).toEqual([["form.a"], [`${"(".repeat(8)}form.a`], false, { is: "(((((a", eq: "1))))" }]);
        expect([spec.evaluate({ is: "form.a", gt: 0, eq: 1, in: [1], ne: 2 }, context), spec.evaluate({ is: "form.a", gt: 0, eq: 1, in: [1], ne: 2, has: 1 }, context), spec.evaluate({ is: "form.c", has: 1, empty: false }, context), spec.evaluate({ is: "form.b", has: "x" }, context)]).toEqual([true, false, true, true]);
        expect(spec.evaluate(spec.when(`${"a=1 & ".repeat(100)}form.a=1`), context)).toBe(false);

    });
    it("conditions keep apostrophes inside words, ignore quoted parentheses, read a lone bang as text, bind & tighter than |, match null to absence, anchor globs at both ends, compare lists loosely and judge a bare path by presence", () => {

        const routed: spec.Context = { ...context, params: { id: "7" } };

        expect(spec.when("form.b=it's & form.a=won't")).toEqual({ all: [{ is: "form.b", eq: "it's" }, { is: "form.a", eq: "won't" }] });
        expect(spec.when("(form.a=1) & form.b=')'")).toEqual({ all: [{ is: "form.a", eq: 1 }, { is: "form.b", eq: ")" }] });
        expect(spec.when("form.x!")).toEqual({ is: "form.x!", empty: false });
        expect(spec.when("form.a=1 | form.a=2 & form.b=z")).toEqual({ any: [{ is: "form.a", eq: 1 }, { all: [{ is: "form.a", eq: 2 }, { is: "form.b", eq: "z" }] }] });
        expect(["form.a=1 | form.a=2 & form.b=z", "form.zz=null", "form.d=null", "form.b like x*z", "form.b like x y*y", "params.id in 7,8", "params.id=7", "form.zz", "form.a"].map(( text ) => spec.evaluate(spec.when(text), routed))).toEqual([true, true, true, false, false, true, true, false, true]);
        expect([spec.evaluate({ is: "form.zz" }, routed), spec.evaluate({ is: "form.a" }, routed), spec.not(""), spec.not(true), spec.not("form.a")]).toEqual([false, true, false, false, { not: { is: "form.a", empty: false } }]);
        expect([spec.surface({ name: "s", role: "r", locales: ["ar", "en"], screens: [] }).locale, spec.surface({ name: "s", role: "r", screens: [] }).locale]).toEqual(["ar", "en"]);
        expect([spec.fromDevice("online"), spec.fromFlow("step"), spec.resolve(spec.fromDevice("online"), { ...routed, device: { online: false } }), spec.resolve(spec.fromFlow("last"), routed)]).toEqual([{ path: "device.online" }, { path: "flow.step" }, false, true]);

    });
    it("the compiler names writes outside form, signals and query, unknown steps, lacking port fields, block props and malformed built pieces; it accepts feature names as targets, templated and queried navigation and unbound optional ports", () => {

        const manifests: Record<string, spec.Manifest> = {
            list: { name: "list", ports: { rows: { kind: "list", fields: ["id", "zip"] } } },
            show: { name: "show", ports: { row: { kind: "one" }, save: { kind: "write", required: false } } },
        };
        const catalogue: spec.Catalogue = { "orders.list": { many: true, write: false, input: [], output: ["id", "status"] }, "orders.show": { many: false, write: false, input: ["id"], output: ["id", "status"] }, "orders.update": { many: false, write: true, input: ["id", "status"] } };
        const stack = validate.strictObject({ gap: validate.optional(validate.enum(["sm", "lg"])) });
        const made = spec.surface({ name: "s", role: "r", screens: [
            spec.screen({ name: "orders", path: "/orders", title: "Orders", flow: ["a", "b"], features: [spec.feature("list", {}, { id: "rows", ports: { rows: spec.read("orders.list") }, on: { load: [spec.set("user.name", "x"), spec.hide("list"), spec.navigate("/orders/42"), spec.navigate("/orders?status=open"), spec.step("c"), spec.step("next")] } })], blocks: [spec.block("stack", { gap: "huge" })] }),
            spec.screen({ name: "order", path: "/orders/{id}", title: "Order", features: [spec.feature("show", {}, { ports: { row: spec.read("orders.show", { id: spec.param("id") }) } }), spec.feature("show", {}, { id: "editor", ports: { row: spec.read("orders.show", { id: spec.param("id") }), save: spec.write("orders.update", { id: spec.param("id") }, ["status", "bogus"]) } })] }),
        ] });

        expect(spec.compile(made, { features: manifests, catalogue, blocks: { stack } }).issues.map(( issue ) => `${issue.path} | ${issue.rule} | ${issue.message}`)).toEqual([
            "screens.orders.blocks[0] | block.props | block stack: gap in",
            "screens.orders.features[0].ports.rows | port.fields | orders.list: lacks zip",
            "screens.orders.features[0].on.load[0] | effect.path | user.name: an effect writes form, signals, query",
            "screens.orders.features[0].on.load[4] | flow.step | c: not a step of this flow",
            "screens.order.features[1].ports.save | port.fields | orders.update: lacks bogus",
        ]);
        expect(spec.compile(spec.surface({ name: "s", role: "r", screens: [spec.screen({ name: "Bad Name", path: "/x", title: "x" }), spec.screen({ name: "ok", path: "/ok", title: "ok", features: [spec.feature("Bad Feature")], blocks: [spec.block("Bad Kind")] })] })).issues.map(( issue ) => `${issue.path} | ${issue.rule}`)).toEqual(["screens.Bad Name | shape", "screens.ok.features[0] | shape", "screens.ok.blocks[0] | shape"]);

    });
    it("the runtime refuses a namespace that is not a record, finds a handler by a feature's id or name, stops a retired chain, queues only offline, declines an unanswered confirmation, honours trigger conditions, drops a superseded mount, runs failure hooks and keeps a session screen closed without a user", async () => {

        const bus = event.bus();
        const calls: string[] = [];
        const queued: string[] = [];
        let release: (() => void) | undefined;
        const made = spec.surface({ name: "s", role: "r", screens: [
            spec.screen({ name: "a", path: "/a", title: "A", auth: true, signals: ["armed"], features: [spec.feature("list", {}, { id: "rows", on: { failure: [spec.set("signals.failed", true)] } })], triggers: [spec.trigger("ui.refresh", [spec.refresh("rows")]), spec.trigger("ui.slow", [spec.call("list.slow"), spec.set("signals.after", true)]), spec.trigger("ui.armed", [spec.set("signals.hit", true)], "signals.armed")] }),
            spec.screen({ name: "b", path: "/b", title: "B", triggers: [spec.trigger("ui.b", [spec.set("signals.b", true)])] }),
            spec.screen({ name: "c", path: "/c", title: "C" }),
        ] });
        const compiled = spec.compile(made, { features: { list: { name: "list", actions: ["refresh", "slow", "save"] } }, topics: ["ui.refresh", "ui.slow", "ui.armed", "ui.b"] });
        const live = spec.runtime(compiled, { bus, queue: ( action ) => { queued.push(action); }, handlers: { "list.refresh": () => { calls.push("refresh"); }, "list.slow": () => new Promise<void>(( resolve ) => { release = resolve; }), "list.save": () => { calls.push("save"); } } });

        expect(compiled.issues).toEqual([]);
        expect([() => live.set("form", 5), () => live.patch({ form: [] } as never), () => live.patch({ signals: "x" } as never)].map(reasonOf)).toEqual(["spec.path", "spec.path", "spec.path"]);
        expect([live.opens("a"), live.opens("b")]).toEqual([false, true]);
        live.patch({ user: { id: 1 } });
        expect(live.opens("a")).toBe(true);

        const first = await live.mount("a");

        bus.publish("ui.refresh", {});
        await tick();
        expect([calls, live.get("signals.failure")]).toEqual([["refresh"], undefined]);
        await live.run([spec.queued("list.save")]);
        expect([calls.at(-1), queued]).toEqual(["save", []]);
        live.patch({ device: { online: false } });
        await live.run([spec.queued("list.save")]);
        expect([calls.length, queued]).toEqual([2, ["list.save"]]);
        live.patch({ device: { online: true } });
        await live.run([spec.confirm("ask", [spec.set("signals.yes", true)], [spec.set("signals.no", true)])]);
        expect([live.get("signals.yes"), live.get("signals.no")]).toEqual([undefined, true]);
        bus.publish("ui.armed", {});
        await tick();
        expect(live.get("signals.hit")).toBeUndefined();
        live.set("signals.armed", true);
        bus.publish("ui.armed", {});
        await tick();
        expect(live.get("signals.hit")).toBe(true);
        await expect(live.act("rows", "explode")).rejects.toMatchObject({ reason: "spec.action" });
        expect(live.get("signals.failed")).toBe(true);
        bus.publish("ui.slow", {});
        await tick();
        await first.unmount();
        release?.();
        await tick();
        expect(live.get("signals.after")).toBeUndefined();

        const again = await live.mount("a");
        const [b, c] = await Promise.all([live.mount("b"), live.mount("c")]);

        bus.publish("ui.b", {});
        await tick();
        expect([live.get("signals.b"), b.screen.name, c.screen.name]).toEqual([undefined, "b", "c"]);
        await c.unmount();
        await b.unmount();
        await again.unmount();

    });
    it("compiling reports a parameter bound twice and a duplicate step, ranks fixed paths first, matches cleaned paths and keeps the menu in declaration order", () => {

        expect(compiled.issues.map(( issue ) => `${issue.path}:${issue.rule}`)).toEqual(["screens.dupe:path.param", "screens.two:path.taken", "screens.deep:flow.duplicate"]);
        expect(compiled.screens.map(( screen ) => `${screen.name}:${screen.params.join(",")}`)).toEqual(["deep:", "fixed:", "home:", "dupe:id", "one:id", "two:id", "star:"]);
        expect(["/a/b", "/a/zz", "//a//b//", "/a/b/", "/q/x", "/a/b/c/d", "/a/%2F", "/d/1/2", "/A/B", "/a/b?x=1#y", ""].map(( path ) => `${spec.match(compiled, path)?.screen.name ?? "-"} ${JSON.stringify(spec.match(compiled, path)?.params ?? null)}`)).toEqual(["fixed {}", 'one {"id":"zz"}', "- null", "fixed {}", "star {}", "- null", 'one {"id":"/"}', 'dupe {"id":"2"}', "- null", "fixed {}", "home {}"]);
        expect([spec.match(compiled, 7 as never), spec.menuOf(compiled, "en", "/a/bx").map(( item ) => `${item.name}:${item.active}`), spec.menuOf(compiled, "en", 7 as never).map(( item ) => item.active)]).toEqual([undefined, ["home:false", "deep:false"], [true, false]]);
        expect([spec.titleOf({ name: "x", title: { "ar-EG": "م", ar: "ع", en: "E" } }, "ar-EG-u-nu"), spec.titleOf({ name: "x", title: { ar: "ع", en: "E" } }, "ar-EG"), spec.titleOf({ name: "x", title: { en: "" } }, "en"), spec.titleOf({ name: "x", title: "junk" as never }, "en"), spec.titleOf({ name: "x", title: { fr: "F" } }, "en"), spec.titleOf({ name: "x", title: { en: "E" } }, 7 as never)]).toEqual(["م", "ع", "X", "X", "F", "E"]);
        expect(spec.screenOf(compiled, "__proto__")).toBeUndefined();

    });
    it("a compiled surface survives serialize and revive, and revive refuses malformed screens", () => {

        const again = spec.revive(JSON.parse(JSON.stringify(spec.serialize(compiled))));

        expect(again.screens).toEqual(compiled.screens.map(( screen ) => ({ ...screen, features: screen.features.map(( feature ) => ({ ...feature, manifest: undefined })) })));
        expect([again.byName.deep?.flow, again.topics, again.issues, again.surface.screens.length, again.features, again.kinds]).toEqual([["x", "x"], { emitted: [], consumed: [] }, [], 7, [], []]);
        expect([() => spec.revive({ surface: { name: "s", role: "r", locale: "en", locales: ["en"] }, screens: [{ name: "x" }] }), () => spec.revive({ surface: { name: "S", role: "r", locale: "en", locales: ["en"] }, screens: [] }), () => spec.revive(JSON.parse(JSON.stringify({ ...spec.serialize(compiled), screens: [{ ...(spec.serialize(compiled).screens as object[])[0], ids: "x" }] }))), () => spec.revive(null)].map(reasonOf)).toEqual(["spec.revive", "spec.revive", "spec.revive", "spec.revive"]);
        expect(spec.match(again, "/a/b")?.screen.name).toBe("fixed");

    });
    it("the runtime refuses paths outside the namespaces, deep or unsafe keys and mistyped namespaces; effects must be objects and nest at most 64 deep; navigation fills params and appends the rest", async () => {

        const bus = event.bus();
        const seen: string[] = [];
        const made = spec.runtime(compiled, { bus, navigate: ( path ) => { seen.push(path); } });

        expect(["locale", "user", "params.__proto__", "nope.x", `signals.${"a.".repeat(70)}b`, "form.constructor", "locale.x", 7, ".form.a", "form..a", "form.a.", ""].map(( path ) => reasonOf(() => made.set(path as string, 5)))).toEqual(Array.from({ length: 12 }, () => "spec.path"));
        made.set("signals", { z: 1 });
        made.set("query.a", ["x"]);
        made.set("device.online", false);
        made.set("flow.index", 5);
        expect([made.get("signals"), made.get("query"), made.get("device"), made.get("flow.index"), made.get(7 as never)]).toEqual([{ z: 1 }, { a: ["x"] }, { online: false }, 5, undefined]);
        made.set("signals", undefined);
        expect(made.get("signals")).toEqual({});
        expect([() => made.patch({ nope: 1 } as never), () => made.patch({ user: "x" } as never), () => made.patch({ locale: 5 } as never), () => made.patch(null as never), () => made.handle("", () => 1), () => made.handle("x", 5 as never)].map(reasonOf)).toEqual(["spec.path", "spec.path", "spec.path", "spec.path", "spec.handler", "spec.handler"]);
        await expect(made.run([7 as never])).rejects.toMatchObject({ reason: "spec.effect" });
        await expect(made.run([{ boom: 1 } as never])).rejects.toMatchObject({ reason: "spec.effect" });

        let effect: spec.Effect = spec.set("signals.z", 1);

        for ( let turn = 0; turn < 70; turn += 1 ) effect = spec.branch(true, [effect]);

        await expect(made.run([effect])).rejects.toMatchObject({ reason: "spec.depth" });
        await expect(made.run([spec.navigate("/a/{id}", { x: 1 })])).rejects.toMatchObject({ reason: "spec.navigate" });
        await made.run([spec.navigate("/a/{id}", { id: 7, q: "x y", n: null as never, b: true }), spec.navigate("/a?x=1", { y: 2 }), spec.navigate("/plain")]);
        expect(seen).toEqual(["/a/7?b=true&q=x%20y", "/a?x=1&y=2", "/plain"]);
        await expect(made.run([spec.step("next")])).rejects.toMatchObject({ reason: "spec.step" });
        await expect(made.act("f", "go")).rejects.toMatchObject({ reason: "spec.action" });
        await expect(made.act(7 as never, "go")).rejects.toMatchObject({ reason: "spec.action" });

        const mounted = await made.mount("deep");
        const flows = [made.flow()];

        for ( let turn = 0; turn < 3; turn += 1 ) {

            await made.run([spec.step("next")]);
            flows.push(made.flow());

        }

        await made.run([spec.step("back"), spec.step("back"), spec.step("back")]);
        flows.push(made.flow());
        await expect(made.run([spec.step("nope")])).rejects.toMatchObject({ reason: "spec.step" });
        expect(flows.map(( flow ) => `${flow.step}:${flow.index}:${flow.first}:${flow.last}:${flow.done}`)).toEqual(["x:0:true:false:false", "x:1:false:true:false", ":2:false:true:true", ":2:false:true:true", "x:0:true:false:false"]);
        await mounted.unmount();
        await mounted.unmount();
        expect(spec.explain(compiled, "deep").split("\n").slice(0, 3)).toEqual(["deep /a/b/c · role any · in the menu · open", "flow: x, x", "blocks:"]);
        expect(reasonOf(() => spec.explain(compiled, "nope"))).toBe("spec.screen");

    });

});
