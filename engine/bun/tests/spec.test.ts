import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as event from "engine/event";
import * as spec from "engine/spec";
import * as validate from "engine/validate";

const manifests: Record<string, spec.Manifest> = {
    "orders.list": { name: "orders.list", settings: validate.strictObject({ pageSize: validate.optional(validate.int().check(validate.lte(100))) }), ports: { rows: { kind: "list", fields: ["id", "status"] } }, actions: ["refresh", "export"], emits: ["orders.selected"], signals: ["selected"] },
    "orders.show": { name: "orders.show", ports: { row: { kind: "one" }, save: { kind: "write", required: false } }, fields: ["status", "note"], actions: ["save"], emits: ["orders.updated"] },
    "orders.export": { name: "orders.export", actions: ["run"] },
    hello: { name: "hello", settings: validate.strictObject({ tone: validate.optional(validate.enum(["plain", "warm"])) }), actions: ["refresh"] },
};
const catalogue: spec.Catalogue = {
    "orders.list": { many: true, write: false, input: ["page", "status"], output: ["id", "status", "total"] },
    "orders.show": { many: false, write: false, input: ["id"], output: ["id", "status", "note"] },
    "orders.update": { many: false, write: true, input: ["id", "status", "note"] },
};
const stack = validate.strictObject({ gap: validate.optional(validate.enum(["sm", "lg"])) });
const placement = validate.strictObject({ name: validate.string() });
const admin = spec.surface({
    name: "acme-admin",
    role: "admin",
    locales: ["ar", "en"],
    locale: "ar",
    screens: [
        spec.screen({
            name: "home",
            path: "/",
            title: { ar: "الرئيسية", en: "Home" },
            icon: "house",
            features: [spec.feature("hello", { tone: "warm" }, { on: { load: [spec.set("signals.greeted", true)] } })],
            blocks: [spec.block("stack", { gap: "sm" }, [spec.block("feature", { name: "hello" }, [], { id: "greeting", when: "signals.greeted" })])],
        }),
        spec.screen({
            name: "orders",
            path: "/orders",
            title: { ar: "الطلبات", en: "Orders" },
            auth: true,
            query: ["status"],
            features: [
                spec.feature("orders.list", { pageSize: 20 }, {
                    ports: { rows: spec.read("orders.list", { status: spec.query("status") }) },
                    watch: { "query.status": [spec.refresh("orders.list")] },
                    triggers: [spec.trigger("orders.updated", [spec.refresh("orders.list"), spec.set("signals.selected", spec.fromEvent("id"))])],
                }),
                spec.feature("orders.export", {}, { when: "signals.selected", on: { success: [spec.emit("orders.exported", { count: spec.fromSignal("selected") })] } }),
            ],
        }),
        spec.screen({
            name: "order",
            path: "/orders/{id}",
            title: { ar: "طلب", en: "Order" },
            menu: false,
            features: [
                spec.feature("orders.show", {}, {
                    ports: { row: spec.read("orders.show", { id: spec.param("id") }), save: spec.write("orders.update", { id: spec.param("id") }, ["status", "note"]) },
                    watch: { "form.status": [spec.branch("form.status=cancelled", [spec.set("form.note", "cancelled by staff"), spec.show("note")], [spec.hide("note")])] },
                    on: { success: [spec.emit("orders.updated", { id: spec.param("id") }), spec.navigate("/orders")] },
                }),
            ],
            blocks: [spec.block("stack", {}, [spec.block("feature", { name: "orders.show" }, [], { id: "note" })])],
        }),
        spec.screen({ name: "files", path: "/files/*", title: { ar: "ملفات", en: "Files" }, menu: false }),
    ],
});

describe("spec", () => {

    it("a surface compiles with facts, graph edges and topics", () => {

        const compiled = spec.compile(admin, { blocks: { stack, feature: placement }, features: manifests, catalogue, maxDepth: 3 });

        expect(compiled.issues).toEqual([]);
        expect(compiled.screens.map(( screen ) => screen.name)).toEqual(["orders", "home", "files", "order"]);
        expect(compiled.byName.home?.kinds).toEqual(["feature", "stack"]);
        expect(compiled.byName.home?.depth).toBe(2);
        expect(compiled.byName.home?.ids).toEqual(["greeting", "hello"]);
        expect(compiled.byName.order?.params).toEqual(["id"]);
        expect(compiled.byName.order?.watches).toEqual([{ from: "form.status", to: "form.note" }]);
        expect(compiled.byName.order?.emits).toEqual(["orders.updated"]);
        expect(compiled.byName.orders?.listens).toEqual(["orders.updated"]);
        expect(compiled.features).toEqual(["hello", "orders.export", "orders.list", "orders.show"]);
        expect(compiled.kinds).toEqual(["feature", "stack"]);
        expect(compiled.topics).toEqual({ emitted: ["orders.exported", "orders.selected", "orders.updated"], consumed: ["orders.updated"] });
        expect(compiled.byName.orders?.features[0]?.manifest?.name).toBe("orders.list");
        expect(JSON.parse(JSON.stringify(spec.serialize(compiled))).screens).toHaveLength(4);
        expect(() => spec.compile({ ...admin, screens: [spec.screen({ name: "Bad Name", path: "/x", title: "x" })] })).toThrow(error.Fault);
        expect(() => spec.compile({ ...admin, screens: [spec.screen({ name: "bad", path: "no-slash", title: "x" })] })).toThrow(error.Fault);

    });
    it("the compiler names every broken reference, binding, effect, topic and cycle", () => {

        const loose = spec.surface({
            name: "s",
            role: "admin",
            locales: ["ar", "en"],
            screens: [
                spec.screen({
                    name: "home",
                    path: "/",
                    title: { en: "Home" },
                    role: "vendor",
                    features: [
                        spec.feature("ghost"),
                        spec.feature("orders.list", { pageSize: 500 }, {
                            ports: { rows: spec.read("orders.nope"), extra: spec.data([]) },
                            watch: { "form.a": [spec.set("form.b", 1)], "form.b": [spec.set("form.a", 2)], "nowhere.x": [spec.call("orders.list.explode")] },
                            on: { load: [spec.set("query.tab", "x"), spec.hide("missing"), spec.refresh("hello"), spec.navigate("/elsewhere"), spec.set("params.id", spec.param("id")), spec.set("signals.copy", spec.fromEvent("id"))] },
                            triggers: [spec.trigger("payments.settled", [spec.emit("x.y")])],
                        }),
                        spec.feature("orders.show", {}, { ports: { row: spec.write("orders.list"), save: spec.read("orders.update", { bogus: 1 }) } }),
                    ],
                    blocks: [spec.block("odd", { gap: "huge" }, [spec.block("feature", { name: "nobody" }, [], { id: "dup" })], { id: "dup", when: "signals.nope" })],
                }),
                spec.screen({ name: "home", path: "/", title: { ar: "x", en: "x" } }),
            ],
        });
        const compiled = spec.compile(loose, { blocks: { stack, feature: placement }, features: manifests, catalogue, maxDepth: 1 });

        expect(compiled.issues.map(( issue ) => issue.rule).sort()).toEqual([
            "block.feature", "block.kind", "depth", "effect.action", "effect.feature", "effect.path", "effect.path", "effect.path", "effect.path", "effect.screen", "effect.target", "event.outside",
            "feature.settings", "feature.unknown", "id.duplicate", "locale.missing", "path.taken", "port.input", "port.kind", "port.kind", "port.kind", "port.kind", "port.operation",
            "port.unknown", "ref.unknown", "role", "screen.duplicate", "trigger.topic", "watch.cycle", "watch.path", "watch.path", "watch.path", "when.path",
        ]);
        expect(compiled.issues.find(( issue ) => issue.rule === "watch.cycle")?.message).toBe("watch cycle: form.a → form.b → form.a");
        expect(compiled.issues.find(( issue ) => issue.rule === "trigger.topic")?.message).toBe("payments.settled: nothing emits this topic");
        expect(compiled.issues.find(( issue ) => issue.rule === "feature.settings")?.message).toBe("orders.list: pageSize max:100");
        expect(compiled.issues.filter(( issue ) => issue.rule === "effect.path").map(( issue ) => issue.message)).toContain("query.tab: the screen declares no query tab");
        expect(compiled.issues.filter(( issue ) => issue.rule === "port.unbound")).toEqual([]);
        expect(spec.compile(loose, { topics: ["payments.*"] }).issues.some(( issue ) => issue.rule === "trigger.topic")).toBe(false);
        expect(spec.compile(spec.surface({ name: "k", role: "a", screens: [spec.screen({ name: "x", path: "/x", title: "X", blocks: [spec.block("weird")] })] }), { kinds: ["stack"] }).issues).toEqual([{ path: "screens.x", rule: "block.kind", fix: "declare the kind in the surface's blocks", message: "unknown block kind: weird" }]);

    });
    it("conditions parse from shorthand and evaluate against the context", () => {

        const context: spec.Context = { ...spec.empty(), form: { type: "digital", qty: 3, tags: ["a", "b"], name: "Café" }, params: { id: "7" }, user: { roles: ["admin"] }, signals: { on: false } };

        expect(spec.when("form.type=digital")).toEqual({ is: "form.type", eq: "digital" });
        expect(spec.when("form.qty>2 & !signals.on")).toEqual({ all: [{ is: "form.qty", gt: 2 }, { not: { is: "signals.on", empty: false } }] });
        expect(spec.when("form.type in digital,physical | user.roles has admin")).toEqual({ any: [{ is: "form.type", in: ["digital", "physical"] }, { is: "user.roles", has: "admin" }] });
        expect(spec.when("form.name like cafe")).toEqual({ is: "form.name", like: "cafe" });
        expect(spec.when("form.qty!=3")).toEqual({ is: "form.qty", ne: 3 });
        expect(spec.when("form.qty>=3 & form.qty<=3 & form.qty<4")).toEqual({ all: [{ is: "form.qty", gte: 3 }, { is: "form.qty", lte: 3 }, { is: "form.qty", lt: 4 }] });
        expect(spec.when({ is: "x" })).toEqual({ is: "x" });

        for ( const text of ["form.type=digital", "form.qty>2 & !signals.on", "form.type in digital,physical | user.roles has admin", "form.name like cafe", "params.id=7", "form.tags has a", "!form.missing", "form.qty!=4"] ) {

            expect(spec.evaluate(spec.when(text), context)).toBe(true);

        }

        for ( const text of ["form.type=physical", "form.qty>3", "signals.on", "form.missing", "form.qty!=3", "form.name like xyz", "form.tags has z"] ) expect(spec.evaluate(spec.when(text), context)).toBe(false);

        expect(spec.evaluate(undefined, context) && spec.evaluate(true, context) && !spec.evaluate(false, context)).toBe(true);
        expect(spec.evaluate({ is: "form.name", empty: false }, context) && spec.evaluate({ is: "form.nothing", empty: true }, context)).toBe(true);
        expect(spec.pathsOf(spec.when("a=1 & (b" as string))).toEqual(["a", "(b"]);
        expect(spec.pathsOf({ any: [{ not: { is: "x" } }, { is: "y" }] })).toEqual(["x", "y"]);
        expect(spec.resolve(spec.param("id"), context)).toBe("7");
        expect(spec.resolve(spec.form("qty"), context)).toBe(3);
        expect(spec.resolve(spec.user("roles"), context)).toEqual(["admin"]);
        expect(spec.resolve("plain", context)).toBe("plain");
        expect(spec.resolveAll({ a: spec.query("q"), b: 1 }, context)).toEqual({ a: undefined, b: 1 });
        expect(spec.referencePath(spec.setting("pageSize"))).toBe("settings.pageSize");
        expect(spec.referencePath({ path: "device.online" })).toBe("device.online");
        expect(spec.isReference({ param: "x" }) && !spec.isReference({ param: "x", y: 1 }) && !spec.isReference("x")).toBe(true);
        expect(spec.readPath(context, "form.tags.1")).toBe("b");

    });
    it("the runtime mounts a screen, runs hooks, watches paths, answers triggers, calls actions and navigates", async () => {

        const compiled = spec.compile(admin, { features: manifests, catalogue });
        const bus = event.bus();
        const visited: string[] = [];
        const calls: string[] = [];
        const made = spec.runtime(compiled, { bus, navigate: ( path ) => { visited.push(path); }, handlers: { "orders.list.refresh": () => { calls.push("refresh"); return "ok"; } } });

        made.handle("orders.show.save", async ( input ) => { calls.push(`save:${JSON.stringify(input)}`); return { saved: true }; });

        const home = await made.mount("home");

        expect(made.get("signals.greeted")).toBe(true);
        expect(made.visible("greeting") && made.enabled("greeting")).toBe(true);
        expect(made.settings("home", "hello")).toEqual({ tone: "warm" });
        expect(made.get("settings.hello.tone")).toBe("warm");
        await home.unmount();

        const orders = await made.mount("orders", { query: { status: "open" } });

        expect(made.get("query.status")).toBe("open");
        made.set("query.status", "closed");
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(calls).toEqual(["refresh"]);
        expect(made.visible("orders.export")).toBe(false);
        made.set("signals.selected", 3);
        expect(made.visible("orders.export")).toBe(true);
        bus.publish("orders.updated", { id: "9" });
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(calls).toEqual(["refresh", "refresh"]);
        expect(made.get("event")).toEqual({ id: "9" });
        expect(made.get("signals.selected")).toBe("9");
        await orders.unmount();
        bus.publish("orders.updated", { id: "10" });
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(calls).toHaveLength(2);

        const order = await made.mount("order", { params: { id: "7" } });
        const topics: string[] = [];

        bus.subscribe("orders.*", ( _, message ) => { topics.push(message.topic); });
        made.set("form.status", "cancelled");
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(made.get("form.note")).toBe("cancelled by staff");
        expect(made.visible("note")).toBe(true);
        made.set("form.status", "open");
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(made.visible("note")).toBe(false);
        expect(await made.act("orders.show", "save", { status: "open" })).toEqual({ saved: true });
        expect(calls.at(-1)).toBe('save:{"status":"open"}');
        expect(topics).toEqual(["orders.updated"]);
        expect(bus.last<{ id: string }>("orders.updated")?.payload).toEqual({ id: "7" });
        expect(visited).toEqual(["/orders"]);
        await expect(made.act("orders.show", "explode")).rejects.toMatchObject({ code: "not_found", reason: "spec.action" });
        expect(made.get("signals.failure")).toMatchObject({ code: "not_found" });
        await made.run([spec.disable("note"), spec.set("form.note", spec.param("id"))]);
        expect(made.enabled("note")).toBe(false);
        expect(made.get("form.note")).toBe("7");
        made.patch({ locale: "ar" });
        expect(made.state.getState().locale).toBe("ar");

        const seen: string[] = [];
        const stop = made.state.subscribe(( next ) => { seen.push(String(next.form.note)); });

        made.set("form.note", "x");
        made.set("form.note", "x");
        stop();
        expect(seen).toEqual(["x"]);
        expect(made.placed("order", "orders.show")?.id).toBe("orders.show");
        expect(made.placed("order", "nope")).toBeUndefined();
        await order.unmount();
        await expect(made.mount("nope")).rejects.toMatchObject({ code: "not_found" });

    });
    it("matching, titles, menus and feature settings", () => {

        const compiled = spec.compile(admin);

        expect(spec.match(compiled, "/")?.screen.name).toBe("home");
        expect(spec.match(compiled, "/orders/")?.screen.name).toBe("orders");
        expect(spec.match(compiled, "/orders/42?x=1")?.screen.name).toBe("order");
        expect(spec.match(compiled, "/orders/42?x=1")?.params).toEqual({ id: "42" });
        expect(spec.match(compiled, "/files/a/b.txt")?.screen.name).toBe("files");
        expect(spec.match(compiled, "/nope")).toBeUndefined();
        expect(spec.titleOf(compiled.byName.home as spec.CompiledScreen, "ar-EG")).toBe("الرئيسية");
        expect(spec.titleOf(compiled.byName.home as spec.CompiledScreen, "fr", "en")).toBe("Home");
        expect(spec.titleOf(spec.screen({ name: "my-screen", path: "/x", title: {} }), "ar")).toBe("My-screen");
        expect(spec.menuOf(compiled, "en", "/orders/42")).toEqual([
            { name: "home", path: "/", title: "Home", icon: "house", active: false },
            { name: "orders", path: "/orders", title: "Orders", icon: undefined, active: true },
        ]);
        expect(spec.menuOf(compiled, "ar", "/")[0]?.active).toBe(true);
        expect(spec.featuresOf(compiled, "orders")).toEqual({ "orders.list": { pageSize: 20 }, "orders.export": {} });
        expect(() => spec.featuresOf(compiled, "nope")).toThrow(error.Fault);
        expect(spec.namespaces).toContain("signals");
        expect(validate.check(spec.whenShape, spec.when("a.b=1")).ok && validate.check(spec.effectShape, spec.emit("x.y")).ok && !validate.check(spec.effectShape, { boom: 1 }).ok).toBe(true);

    });
    it("enable is an effect and the surface shape refuses an empty surface", () => {

        expect(spec.enable("form.save")).toEqual({ enable: "form.save" });
        expect(spec.surfaceShape.safeParse({}).success).toBe(false);
        expect(spec.platformShape.safeParse("mobile").success && !spec.platformShape.safeParse("tv").success).toBe(true);
        expect(spec.catalogShape.safeParse("emoji").success && !spec.catalogShape.safeParse("stars").success).toBe(true);
        expect(spec.surface({ name: "s", role: "r", screens: [], world: ["countries"] }).world).toEqual(["countries"]);
        expect(() => spec.revive({ nope: 1 })).toThrow(error.Fault);
        expect(spec.isBuilt(spec.screen({ name: "x", path: "/x", title: "X" })) && !spec.isBuilt(JSON.parse(JSON.stringify(spec.screen({ name: "x", path: "/x", title: "X" }))))).toBe(true);
        expect(typeof spec.built).toBe("symbol");
        expect(spec.screenShapeOf.safeParse(JSON.parse(JSON.stringify(spec.screen({ name: "x", path: "/x", title: "X" })))).success).toBe(true);
        expect(spec.featureShapeOf.safeParse({ name: "f" }).success).toBe(false);
        expect(spec.blockShapeOf.safeParse({ kind: "stack", props: {}, children: [] }).success).toBe(true);

        const raw = JSON.parse(JSON.stringify(spec.surface({ name: "raw", role: "r", screens: [spec.screen({ name: "x", path: "/x", title: "X", blocks: [spec.block("stack")] })] }))) as spec.Surface;

        expect(spec.compile(raw).issues).toEqual([]);
        expect(() => spec.compile({ ...raw, locale: 7 } as unknown as spec.Surface)).toThrow(error.Fault);

        const rawScreen = JSON.parse(JSON.stringify(spec.screen({ name: "y", path: "/y", title: "Y" }))) as spec.Screen;

        (rawScreen as { path: string }).path = "Bad Path";
        expect(spec.compile(spec.surface({ name: "mixed", role: "r", screens: [rawScreen] })).issues.map(( issue ) => issue.rule)).toEqual(["shape"]);

    });
    it("the second-lap dsl: texts, grants, flows, confirmations, form checks, listings, live ports, queued calls, suggestions and explain", async () => {

        const manifests: Record<string, spec.Manifest> = {
            orders: { name: "orders", ports: { rows: { kind: "list" } }, actions: ["refresh", "remove"], emits: ["orders.removed"] },
            wizard: { name: "wizard", actions: ["save"] },
        };
        const catalogue: spec.Catalogue = { "orders.list": { many: true, write: false, input: ["page", "limit", "q"], output: ["id", "total", "status"] }, "orders.remove": { many: false, write: true, input: ["id"] } };
        const texts = ["orders.title", "orders.removeAsk", "wizard.next"];
        const grants = ["orders.read", "orders.*", "wizard.use"];
        const made = spec.surface({
            name: "s",
            role: "admin",
            locales: ["en"],
            screens: [
                spec.screen({
                    name: "orders",
                    path: "/orders",
                    title: "Orders",
                    access: ["orders.read"],
                    features: [
                        spec.feature("orders", {}, {
                            ports: { rows: spec.read("orders.list", { q: spec.query("q") }, { list: { sort: "-total", filter: { status: "open" }, page: spec.query("page"), limit: 20 }, live: true }) },
                            when: "can:orders.write",
                            triggers: [spec.trigger("orders.removed", [spec.set("signals.gone", true)])],
                            on: { load: [spec.set("signals.label", spec.text("orders.title"))] },
                        }),
                    ],
                    query: ["q", "page"],
                    triggers: [spec.trigger("ui.ask", [spec.confirm("orders.removeAsk", [spec.queued("orders.remove", { id: spec.fromEvent("id") })], [spec.set("signals.kept", true)])])],
                }),
                spec.screen({
                    name: "wizard",
                    path: "/wizard",
                    title: "Wizard",
                    flow: ["account", "address", "review"],
                    features: [spec.feature("wizard", {}, { form: { email: "required|email", age: "integer|between:18,99" }, access: ["wizard.use"] })],
                    triggers: [spec.trigger("ui.next", [spec.check("wizard", [spec.step("next")], [spec.set("signals.blocked", true)])]), spec.trigger("ui.back", [spec.step("back")]), spec.trigger("ui.review", [spec.step("review")])],
                }),
            ],
        });
        const compiled = spec.compile(made, { blocks: { stack: validate.strictObject({}) }, features: manifests, catalogue, texts, grants, topics: ["ui.ask", "ui.next", "ui.back", "ui.review"] });

        expect(compiled.issues).toEqual([]);
        expect(compiled.byName.orders?.listens).toEqual(["orders.*", "orders.removed", "ui.ask"]);
        expect(spec.explain(compiled, "orders")).toContain("rows ← read orders.list live listing");
        expect(spec.explain(compiled, "wizard")).toContain("flow: account, address, review");
        expect(spec.explain(compiled, "wizard")).toContain("email: required|email");

        const wrong = spec.compile(spec.surface({
            name: "s",
            role: "admin",
            screens: [spec.screen({
                name: "orders",
                path: "/orders",
                title: "Orders",
                access: ["orders.delete"],
                features: [spec.feature("orders", {}, { ports: { rows: spec.read("orders.list", undefined, { list: { sort: "totl" } }) }, when: "can:orders.writ", on: { load: [spec.set("signals.label", spec.text("orders.titel")), spec.step("next"), spec.check("orders", [])] } })],
            })],
        }), { features: manifests, catalogue, texts, grants: ["orders.read", "wizard.use"] });
        const rules = Object.fromEntries(wrong.issues.map(( issue ) => [issue.rule, issue]));

        expect(Object.keys(rules).sort()).toEqual(["access.grant", "check.form", "flow.none", "port.list", "text.unknown", "when.grant"]);
        expect(rules["text.unknown"]?.near).toBe("orders.title");
        expect(rules["text.unknown"]?.fix).toContain("brand/messages");
        expect(rules["when.grant"]?.near).toBe("orders.read");
        expect(rules["port.list"]?.near).toBe("total");
        expect(rules["access.grant"]?.near).toBe("orders.read");
        expect(spec.nearest("hllo", ["hello", "world"])).toBe("hello");
        expect(spec.nearest("zzzzzz", ["hello"])).toBeUndefined();

        const bus = event.bus();
        const asked: string[] = [];
        const queued: string[] = [];
        const refreshed: string[] = [];
        const live = spec.runtime(compiled, { bus, translate: ( key ) => `t:${key}`, confirm: ( key ) => { asked.push(key); return asked.length % 2 === 1; }, queue: ( action ) => { queued.push(action); }, rulebook: validate.rulebook });

        live.handle("orders.refresh", () => { refreshed.push("orders"); });
        live.handle("orders.remove", () => "removed");
        live.patch({ user: { abilities: ["orders.read", "orders.write"] }, device: { online: false } });

        const mounted = await live.mount("orders");

        expect(live.get("signals.label")).toBe("t:orders.title");
        expect(live.visible("orders")).toBe(true);
        expect(live.allowed("orders")).toBe(true);
        bus.publish("orders.changed", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(refreshed).toEqual(["orders"]);
        bus.publish("ui.ask", { id: "7" });
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(asked).toEqual(["orders.removeAsk"]);
        expect(queued).toEqual(["orders.remove"]);
        bus.publish("ui.ask", { id: "8" });
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.kept")).toBe(true);
        live.patch({ user: { abilities: ["orders.read"] } });
        expect(live.visible("orders")).toBe(false);
        await mounted.unmount();

        const steps = await live.mount("wizard");

        expect(live.flow()).toEqual({ step: "account", index: 0, first: true, last: false, done: false });
        expect(live.allowed("wizard")).toBe(false);
        live.set("form.email", "nope");
        bus.publish("ui.next", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.blocked")).toBe(true);
        expect(live.errors("wizard")).toEqual({ email: ["email"] });
        live.set("form.email", "ann@example.com");
        live.set("form.age", "30");
        bus.publish("ui.next", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.flow().step).toBe("address");
        bus.publish("ui.review", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.flow()).toEqual({ step: "review", index: 2, first: false, last: true, done: false });
        bus.publish("ui.back", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.flow().step).toBe("address");
        expect(live.errors("nope")).toBeUndefined();
        await steps.unmount();

        const stale = await live.mount("wizard");
        const fresh = await live.mount("wizard");

        await stale.unmount();
        live.set("form.email", "nope");
        bus.publish("ui.next", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.errors("wizard")).toEqual({ email: ["email"] });
        expect(live.flow().step).toBe("account");
        live.set("form.email", "ann@example.com");
        bus.publish("ui.next", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.flow().step).toBe("address");
        await fresh.unmount();
        expect(live.errors("wizard")).toBeUndefined();
        await live.run([spec.check("wizard", [spec.set("signals.passed", true)], [spec.set("signals.refused", true)])]);
        expect(live.get("signals.passed")).toBeUndefined();
        expect(live.get("signals.refused")).toBe(true);

    });
    it("a screen opens by its access and a check narrows to the fields it names", async () => {

        const made = spec.surface({
            name: "s",
            role: "admin",
            screens: [
                spec.screen({ name: "home", path: "/", title: "Home" }),
                spec.screen({
                    name: "join",
                    path: "/join",
                    title: "Join",
                    access: ["join.use"],
                    flow: ["account", "profile"],
                    features: [spec.feature("join", {}, { form: { email: "required|email", name: "required|min:2" } })],
                    triggers: [
                        spec.trigger("ui.next", [spec.check("join", [spec.clear("signals.blocked"), spec.step("next")], [spec.set("signals.blocked", true)], ["email"])]),
                        spec.trigger("ui.done", [spec.check("join", [spec.set("signals.done", true)])]),
                        spec.trigger("ui.reset", [spec.clear("signals.errors"), spec.clear("signals.failure")]),
                        spec.trigger("ui.save", [spec.call("join.save"), spec.set("signals.saved", true)]),
                    ],
                }),
            ],
        });
        const compiled = spec.compile(made, { features: { join: { name: "join", actions: ["save"] } }, grants: ["join.use"], topics: ["ui.next", "ui.done", "ui.reset", "ui.save"] });

        expect(compiled.issues).toEqual([]);
        expect(spec.check("join", [], undefined, ["email"])).toEqual({ check: "join", do: [], fields: ["email"] });
        expect(validate.check(spec.effectShape, spec.check("join", [], [], ["email"])).ok).toBe(true);
        expect(validate.check(spec.effectShape, { check: "join", do: [], fields: [""] }).ok).toBe(false);

        const wrong = spec.compile(spec.surface({
            name: "s",
            role: "admin",
            screens: [spec.screen({ name: "join", path: "/join", title: "Join", features: [spec.feature("join", {}, { form: { email: "required|email" } })], on: { load: [spec.check("join", [], undefined, ["emial"])] } })],
        }), { features: { join: { name: "join" } } });

        expect(wrong.issues.map(( issue ) => [issue.rule, issue.near])).toEqual([["check.field", "email"]]);

        const bus = event.bus();
        const live = spec.runtime(compiled, { bus, rulebook: validate.rulebook });
        const ruled: spec.Rulebook = validate.rulebook;

        const refused = error.attemptSync(() => spec.runtime(compiled, { bus }));

        expect(!refused.ok && [refused.fault.code, refused.fault.reason, refused.fault.errors]).toEqual(["internal", "spec.rulebook", { feature: ["join"] }]);
        expect(spec.runtime(compiled, { bus, rulebook: ruled }).opens("home")).toBe(true);
        expect([live.opens("home"), live.opens("join"), live.opens("nowhere")]).toEqual([true, false, false]);
        live.patch({ user: { abilities: ["join.use"] } });
        expect(live.opens("join")).toBe(true);

        const mounted = await live.mount("join");

        live.set("form.email", "ann@example.com");
        expect(live.errors("join")).toEqual({ name: ["required"] });
        expect(live.errors("join", ["email"])).toEqual({});
        expect(live.errors("join", ["name", "nope"])).toEqual({ name: ["required"] });
        bus.publish("ui.done", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.done")).toBeUndefined();
        expect(live.get("signals.errors")).toEqual({ name: ["required"] });
        bus.publish("ui.next", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.flow().step).toBe("profile");
        expect(live.get("signals.errors")).toBeUndefined();
        expect(live.get("signals.blocked")).toBeUndefined();
        live.set("form.email", "nope");
        bus.publish("ui.next", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.blocked")).toBe(true);
        live.set("form.name", "Ann");
        live.set("form.email", "ann@example.com");
        bus.publish("ui.done", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.done")).toBe(true);
        bus.publish("ui.save", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect([(live.get("signals.failure") as { code?: string }).code, live.get("signals.saved")]).toEqual(["not_found", undefined]);
        bus.publish("ui.reset", {});
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.failure")).toBeUndefined();
        await mounted.unmount();

    });

});
