import { describe, expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as event from "engine/event";
import type * as socket from "engine/socket";
import * as spec from "engine/spec";
import * as validate from "engine/validate";

const blocks = { stack: validate.partial(validate.strictObject({ gap: validate.enum(["sm", "md"]) })), feature: validate.strictObject({ name: validate.string() }), popup: validate.partial(validate.strictObject({ size: validate.enum(["sm", "lg"]) })) };
const screen = validate.partial(validate.strictObject({ width: validate.enum(["narrow", "wide"]), chrome: validate.boolean() }));
const features: Readonly<Record<string, spec.Manifest>> = { search: { name: "search", fields: ["q"], actions: ["refresh", "press"], emits: ["search.typed"] } };
const defaults = { contents: { name: { en: "Shop", ar: "المتجر" }, tagline: { en: "All of it", ar: "كل شيء" }, url: "" } };
const part = spec.part({ platform: "web", blocks, screen, features, defaults, topics: ["session.ended", "cart.changed"] });

function wait ( ms: number ): Promise<void> {

    return new Promise(( resolve ) => { setTimeout(resolve, ms); });

}
function rulesOf ( compiled: spec.Compiled ): string[] {

    return compiled.issues.map(( issue ) => issue.rule);

}
function planned ( screens: spec.Screen[], more: Partial<spec.PlanOptions> = {} ): spec.Compiled {

    return spec.compile(spec.plan({ name: "flow", role: "admin", screens, ...more }), { features, blocks, screen, topics: ["session.ended", "cart.changed"] });

}

describe("spec flow", () => {

    it("toggle flips a flag, after runs its effects later and debounce keeps only the latest; leaving the screen drops what still waits", async () => {

        const compiled = planned([
            spec.screen("home", {
                path: "/",
                features: [spec.feature("search", {
                    watch: { "form.q": spec.debounce(15, spec.set("signals.asked", spec.from("form.q"))) },
                    on: { load: [spec.toggle("signals.open"), spec.after(10, spec.set("signals.late", true))], "search.typed": spec.after(5, spec.set("signals.heard", spec.fromEvent("q"))) },
                })],
            }),
            spec.screen("next", { features: [spec.feature("search", { on: { load: spec.after(200, spec.set("signals.never", true)) } })] }),
        ]);
        const bus = event.bus();
        const live = spec.runtime(compiled, { bus });
        const mounted = await live.mount("home");

        expect([compiled.issues, live.get("signals.open"), live.get("signals.late")]).toEqual([[], true, undefined]);

        live.set("form.q", "a");
        live.set("form.q", "ab");
        live.set("form.q", "abc");
        bus.publish("search.typed", { q: "first" });
        await live.run([spec.toggle("signals.open")]);
        await wait(40);

        expect([live.get("signals.open"), live.get("signals.late"), live.get("signals.asked"), live.get("signals.heard")]).toEqual([false, true, "abc", "first"]);

        await mounted.unmount();

        const next = await live.mount("next");

        await next.unmount();
        await wait(20);

        expect(live.get("signals.never")).toBeUndefined();

        live.set("form.q", "late");
        await wait(30);

        expect(live.get("signals.asked")).toBe("abc");

    });
    it("the compiler refuses a wait that is not whole milliseconds, a wait inside a leave hook and a toggle on a path no effect may write", () => {

        const compiled = planned([spec.screen("home", { path: "/", on: { load: [spec.after(1.5, []), spec.after(700_000, []), spec.toggle("user.name")], leave: spec.debounce(10, spec.toggle("signals.gone")) } })]);
        const raw = ( wait: number ): spec.Plan => ({ name: "flow", role: "admin", platform: "web", world: [], locales: ["en"], locale: "en", signals: [], on: {}, triggers: [], screens: [{ ...spec.screen("home", { path: "/" }), on: { load: [{ after: wait, do: [] }] } }] });

        expect(rulesOf(compiled)).toEqual(["effect.after", "effect.after", "effect.path", "effect.after"]);
        expect(compiled.issues[3]?.fix).toBe("run the effects at once, or from another hook");
        expect(rulesOf(spec.compile(raw(20)))).toEqual([]);
        expect(() => spec.compile(raw(-1))).toThrow("The given data is invalid");

    });
    it("a screen carries its own description, an index stance and settings the part's screen vocabulary checks", () => {

        const offers = spec.screen("offers", { title: { en: "Offers", ar: "العروض" }, description: { en: "Deals of the week", ar: "عروض الأسبوع" }, settings: { width: "wide" } });
        const hidden = spec.screen("drafts", { title: "Drafts", description: "Private notes", index: false, settings: { width: "vast", ghost: 1 } });
        const half = spec.screen("half", { title: { en: "Half" }, description: { en: "Only one" } });
        const surface = spec.surface({ config: { settings: { locales: ["en", "ar"] }, contents: { url: "https://shop.example.test" } }, schema: [spec.screen("home", { path: "/", title: { en: "Home", ar: "الرئيسية" } }), offers] });
        const built = spec.build(spec.define({ shop: surface }), part);
        const host = spec.boot<typeof defaults>(JSON.parse(JSON.stringify(built.artifact("shop"))), { sinks: [] });
        const { app } = host;
        const found = app.compiled.byName.offers as spec.CompiledScreen;
        const bad = spec.build(spec.define({ shop: spec.surface({ config: { settings: { locales: ["en", "ar"] }, contents: { url: "https://shop.example.test" } }, schema: [hidden, half] }) }), part).surface("shop");
        const drafts = spec.boot<typeof defaults>(spec.build(spec.define({ shop: spec.surface({ config: { contents: { url: "https://shop.example.test" } }, schema: [spec.screen("drafts", { title: "Drafts", description: "Private notes", index: false })] }) }), part).artifact("shop"), { sinks: [] }).app;

        expect([built.surface("shop").compiled.issues, found.settings, found.index, app.meta(found, "ar").description, app.meta(found, "en").description, app.meta(app.compiled.byName.home as spec.CompiledScreen, "en").description]).toEqual([[], { width: "wide" }, true, "عروض الأسبوع", "Deals of the week", "All of it"]);
        expect([app.meta(found, "en").robots, drafts.meta(drafts.compiled.byName.drafts as spec.CompiledScreen, "en").robots, drafts.meta(drafts.compiled.byName.drafts as spec.CompiledScreen, "en").description]).toEqual(["index, follow, max-image-preview:large", "noindex, nofollow", "Private notes"]);
        expect(bad.compiled.issues.map(( issue ) => [issue.path, issue.rule])).toEqual([["screens.drafts", "locale.missing"], ["screens.drafts", "locale.missing"], ["screens.drafts", "screen.settings"], ["screens.drafts", "screen.settings"], ["screens.half", "locale.missing"], ["screens.half", "locale.missing"]]);

    });
    it("a surface reacts as a whole: its triggers live with every screen, never twice under a popup, and its signals reach every screen", async () => {

        const schema = {
            screens: [
                spec.screen("home", { path: "/", features: [spec.feature("search", { when: "signals.guest = true" })] }),
                spec.screen("cart", { on: { load: spec.set("signals.seen", spec.fromSignal("count")) } }),
            ],
            signals: ["count"],
            on: { "cart.changed": spec.set("signals.count", spec.fromEvent("count")), "session.ended": [spec.set("signals.guest", true), spec.navigate("/")] },
            triggers: [spec.trigger("cart.changed", spec.emit("cart.heard"), "event.count > 2")],
        };
        const built = spec.build(spec.define({ shop: spec.surface({ schema }) }), part);
        const went: string[] = [];
        const host = spec.boot(built.artifact("shop"), { sinks: [], navigate: ( path ) => { went.push(path); } });
        const { app } = host;
        const heard: unknown[] = [];

        app.bus.subscribe("cart.heard", ( payload ) => { heard.push(payload); });
        app.bus.publish("cart.changed", { count: 9 });

        expect([built.surface("shop").compiled.issues, built.surface("shop").compiled.topics, app.live.get("signals.count")]).toEqual([[], { emitted: ["cart.changed", "cart.heard", "search.typed", "session.ended"], consumed: ["cart.changed", "session.ended"] }, undefined]);

        const mounted = await app.live.mount("home");
        const popup = await app.open("/cart");

        app.bus.publish("cart.changed", { count: 3 });
        app.bus.publish("session.ended", {});
        await wait(5);

        expect([app.live.get("signals.count"), popup.live.get("signals.count"), heard.length, app.live.get("signals.guest"), app.live.visible("search")]).toEqual([3, undefined, 1, true, true]);
        expect([went, app.popups.getState().length]).toEqual([["/"], 1]);

        await app.close("all");
        await mounted.unmount();
        app.bus.publish("cart.changed", { count: 7 });

        expect(app.live.get("signals.count")).toBe(3);

    });
    it("a transfer runs the left surface's leave and the entered surface's enter, which reads what was carried as the event", async () => {

        const order = spec.screen("order", { path: "/", signals: ["order"], features: [spec.feature("search", { id: "go", on: { success: spec.transfer("vendor", { with: { order: spec.from("signals.order"), note: "rush" } }) } })] });
        const client = spec.surface({ schema: { screens: [order], signals: ["left"], on: { leave: spec.set("signals.left", true) } } });
        const vendor = spec.surface({ schema: { screens: [spec.screen("desk", { path: "/" })], on: { enter: [spec.set("signals.order", spec.fromEvent("order")), spec.set("signals.note", spec.fromEvent("note")), spec.set("signals.locale", spec.fromEvent("locale"))] } } });
        const loud = spec.surface({ schema: { screens: [spec.screen("desk", { path: "/" })], on: { enter: spec.call("ghost.act"), leave: spec.after(5, []) } } });
        const built = spec.build(spec.define({ shop: { client, vendor } }), part);
        const went: string[] = [];
        const host = spec.boot(built.artifact("shop.client"), { sinks: [], navigate: ( path ) => { went.push(path); }, carry: () => ({ locale: "ar" }), handlers: { "go.press": () => "ok" } });

        await host.app.live.mount("order");
        host.app.live.set("signals.order", 41);
        await host.app.live.act("go", "press");

        const entered = host.app;

        expect([host.active.getState(), host.of("shop.client").live.get("signals.left"), entered.live.get("signals.order"), entered.live.get("signals.note"), entered.live.get("signals.locale"), went, host.carried()]).toEqual(["shop.vendor", true, 41, "rush", "ar", ["/"], { locale: "ar", order: 41, note: "rush" }]);
        await host.resume("shop.client");

        expect([host.active.getState(), host.carried()]).toEqual(["shop.client", {}]);

        await host.resume("shop.vendor");

        expect(host.carried()).toEqual({ locale: "ar", order: 41, note: "rush" });
        expect(spec.build(spec.define({ loud }), part).surface("loud").compiled.issues.map(( issue ) => [issue.path, issue.rule])).toEqual([["surface.on.enter[0]", "effect.action"], ["surface.on.leave[0]", "effect.after"]]);
        expect(() => spec.surface({ schema: { screens: [], ghost: [] } as never })).toThrow("schema.ghost: a schema holds screens, signals, on, triggers");

    });
    it("a serialized surface drops every default and revives whole; an artifact of another version is refused", () => {

        const compiled = planned([
            spec.screen("home", { path: "/", title: "Home" }),
            spec.screen("item", { path: "/items/{id}", menu: false, auth: true, index: false, settings: { width: "narrow" }, layout: [spec.block("stack", {}, [spec.feature("search", { id: "find", form: {}, on: { load: spec.toggle("signals.open") } })])] }),
        ], { on: { enter: spec.set("signals.in", true), "cart.changed": spec.emit("cart.heard") } });
        const wire = JSON.parse(JSON.stringify(spec.serialize(compiled))) as { surface: Record<string, unknown>; screens: Record<string, unknown>[] };
        const revived = spec.revive(wire);
        const plain = ( given: spec.Compiled ): unknown => JSON.parse(JSON.stringify({ ...given, screens: given.screens.map(( one ) => ({ ...one, features: one.features.map(( feature ) => ({ ...feature, manifest: undefined })) })), surface: { ...given.surface, screens: given.surface.screens.map(( one ) => one.name) }, byName: Object.keys(given.byName), transfers: [], issues: [] }));
        const home = wire.screens.find(( one ) => one.name === "home");
        const built = spec.build(spec.define({ shop: spec.surface({ schema: [spec.screen("home", { path: "/" })] }) }), part);

        expect([compiled.issues, home, Object.keys(wire.surface).sort()]).toEqual([[], { name: "home", path: "/", title: { en: "Home" } }, ["locale", "locales", "name", "on", "order", "platform", "role", "triggers"]]);
        expect(plain(revived)).toEqual(plain(compiled));
        expect(JSON.stringify(wire.screens).length / JSON.stringify(compiled.screens).length).toBeLessThan(0.6);
        expect([revived.screens[0]?.access === revived.screens[1]?.query, Object.isFrozen(revived.byName.home?.settings), revived.byName.item?.features[0]?.id, revived.byName.item?.features[0]?.manifest]).toEqual([true, true, "find", undefined]);
        expect([spec.version, built.artifact("shop").version]).toEqual([2, 2]);
        expect(() => spec.boot({ ...built.artifact("shop"), version: 1 })).toThrow("not a spec artifact of this engine");
        expect(() => spec.revive({ ...wire, screens: [{ name: "home", path: "/", menu: "yes" }] })).toThrow("a serialized screen is malformed");
        expect(() => spec.revive({ ...wire, screens: [{ name: "home", path: "/", blocks: [{ kind: 7 }] }] })).toThrow("a serialized screen is malformed");
        expect(() => spec.revive({ ...wire, surface: { ...wire.surface, triggers: {} } })).toThrow("a serialized screen is malformed");

    });
    it("a live binding joins its resource through the api's live link while its screen is mounted, once per resource, and only when the surface is realtime", async () => {

        const sent: socket.Frame[] = [];
        const side: socket.Socket & { fire: ( frame: socket.Frame ) => void } = {
            readyState: 0,
            onopen: null,
            onclose: null,
            onerror: null,
            onmessage: null,
            send: ( text ) => {

                const frame = api.decodeFrame(text);

                if ( !frame ) return;

                sent.push(frame);

                if ( (frame.event === "join" || frame.event === "leave") && frame.id ) queueMicrotask(() => side.fire({ event: "ack", id: frame.id }));

            },
            close: () => { side.readyState = 3; side.onclose?.({ code: 1000, reason: "" }); },
            fire: ( frame ) => side.onmessage?.({ data: api.encodeFrame(frame) }),
        };
        const catalogue: spec.Catalogue = { "orders.list": { many: true, write: false, input: [] } };
        const lively = spec.part({ platform: "web", blocks, features: { rows: { name: "rows", ports: { rows: { kind: "list" } }, actions: ["refresh"] } }, catalogue });
        const rows = (): spec.Feature => spec.feature("rows", { ports: { rows: spec.read("orders.list", undefined, { live: true }) } });
        const schema = [spec.screen("orders", { path: "/", features: [rows()] }), spec.screen("peek", { features: [rows()] }), spec.screen("plain", {})];
        const built = spec.build(spec.define({ live: spec.surface({ config: { contracts: { realtime: true } }, schema }), still: spec.surface({ schema }) }), lively);
        const refreshed: string[] = [];
        const asked: string[] = [];
        const options = ( name: string ): spec.AppOptions => ({
            sinks: [],
            handlers: { "rows.refresh": () => { refreshed.push(name); } },
            live: ( app ) => {

                asked.push(app.name);

                return api.live({ url: "wss://live.example.test", heartbeat: 0, reconnect: false, factory: () => side });

            },
        });
        const host = spec.boot(built.artifact("live"), options("live"));
        const still = spec.boot(built.artifact("still"), options("still"));
        const mounted = await host.app.live.mount("orders");

        side.readyState = 1;
        side.onopen?.();
        await wait(5);

        const popup = await host.app.open("/peek");

        side.fire({ event: "orders.updated", channel: "orders", data: { id: 7 } });
        await wait(5);

        expect([asked, sent.filter(( frame ) => frame.event === "join").map(( frame ) => frame.channel), refreshed, popup.screen.name]).toEqual([["live"], ["orders"], ["live", "live"], "peek"]);

        await host.app.close("all");

        expect(sent.filter(( frame ) => frame.event === "leave")).toEqual([]);

        await mounted.unmount();
        await wait(5);

        const plain = await host.app.live.mount("plain");
        const quiet = await still.app.live.mount("orders");

        side.fire({ event: "orders.updated", channel: "orders", data: { id: 8 } });
        await wait(5);

        expect([sent.filter(( frame ) => frame.event === "leave").map(( frame ) => frame.channel), refreshed.length, asked]).toEqual([["orders"], 2, ["live"]]);

        await plain.unmount();
        await quiet.unmount();

        const late = spec.boot(built.artifact("live"), { sinks: [], handlers: { "rows.refresh": () => undefined } });
        const unbound = await late.app.live.mount("orders");

        expect(asked).toEqual(["live"]);

        await unbound.unmount();

        const unbind = late.bind({ live: options("late").live });
        const bound = await late.app.live.mount("orders");

        expect(asked).toEqual(["live", "live"]);

        await bound.unmount();
        unbind();

    });
    it("a transfer carries only what it asks for by name: the part's door is told, a reloading transfer may carry nothing, and a resumed surface can be re-seated with what was handed", async () => {

        const handing = spec.part({ platform: "web", blocks, features, carries: ["session", "cart"] });
        const go = ( id: string, effect: spec.Effect ): spec.Feature => spec.feature("search", { id, on: { success: effect } });
        const client = spec.surface({ schema: [spec.screen("home", { path: "/", features: [go("plain", spec.transfer("vendor")), go("signed", spec.transfer("vendor", { carry: { session: true } })), go("fresh", spec.transfer("vendor", { refresh: true })), go("bare", spec.transfer("vendor", { carry: { inherit: false, session: true } })), go("same", spec.transfer("client", { to: "/about" }))] }), spec.screen("about", {})] });
        const vendor = spec.surface({ schema: [spec.screen("desk", { path: "/" })] });
        const wrong = spec.surface({ schema: [spec.screen("home", { path: "/", features: [go("a", spec.transfer("vendor", { carry: { sesion: true } })), go("b", spec.transfer("vendor", { carry: { session: true }, refresh: true }))] })] });
        const built = spec.build(spec.define({ client, vendor }), handing);
        const asked: (readonly string[])[] = [];
        const reloads: string[] = [];
        const host = spec.boot(built.artifact("client"), {
            sinks: [],
            navigate: () => undefined,
            reload: ( path ) => { reloads.push(path); },
            carry: ( _, handing ) => { asked.push(handing.names); return { ...(handing.inherit ? { locale: "ar" } : {}), ...(handing.names.includes("session") ? { session: { access: "a-1", refresh: "r-1" } } : {}) }; },
            handlers: { "plain.press": () => "ok", "signed.press": () => "ok", "fresh.press": () => "ok", "bare.press": () => "ok", "same.press": () => "ok" },
        });
        const press = async ( id: string ): Promise<unknown> => {

            await host.resume("client");
            await host.app.live.mount("home");
            await host.app.live.act(id, "press");

            return host.carried();

        };

        expect([built.surface("client").compiled.issues, await press("plain"), await press("signed"), await press("fresh"), asked, reloads]).toEqual([[], { locale: "ar" }, { locale: "ar", session: { access: "a-1", refresh: "r-1" } }, { locale: "ar" }, [[], ["session"], []], ["/"]]);
        expect(spec.build(spec.define({ client: wrong, vendor }), handing).surface("client").compiled.issues.map(( issue ) => [issue.rule, issue.near])).toEqual([["transfer.carry", "session"], ["transfer.carry", undefined]]);
        expect([await press("bare"), host.active.getState()]).toEqual([{ session: { access: "a-1", refresh: "r-1" } }, "vendor"]);
        expect([await host.resume("vendor", { locale: "en", scheme: "dark" }), host.carried(), await host.resume("client"), host.carried()]).toEqual([true, { locale: "en", scheme: "dark" }, true, {}]);

        const before = asked.length;
        const went: string[] = [];
        const stop = host.bind({ navigate: ( path ) => { went.push(path); } });

        await host.app.live.mount("home");
        await host.app.live.act("same", "press");
        stop();

        expect([host.active.getState(), went, asked.length === before, host.carried()]).toEqual(["client", ["/about"], true, {}]);

    });
    it("a schema and a config name their texts by message key: the factory speaks them in every locale from the part's messages and the surface's own, a literal still works, and a key no locale carries is a build issue", () => {

        const worded = spec.part({ platform: "web", blocks, defaults: { contents: { name: { en: "A literal name" }, tagline: { key: "brand.tagline" }, url: "" } }, messages: { en: { screens: { home: "Home", about: "About" }, brand: { name: "Shop", tagline: "All of it" } }, ar: { screens: { home: "الرئيسية", about: "عن المتجر" }, brand: { name: "المتجر", tagline: "كل شيء" } } } });
        const schema = [
            spec.screen("home", { path: "/", title: { key: "screens.home" }, description: { key: "brand.tagline" } }),
            spec.screen("about", { title: { key: "screens.about" } }),
            spec.screen("terms", { title: { en: "Terms", ar: "الشروط" } }),
            spec.screen("plain", { title: "Plain" }),
        ];
        const config = { settings: { locales: ["en", "ar"] }, contents: { name: { key: "brand.name" }, url: "https://shop.example.test" } };
        const shop = spec.surface({ config, schema, messages: { ar: { screens: { about: "من نحن" } } } });
        const built = spec.build(spec.define({ shop }), worded).surface("shop");
        const { app } = spec.boot<typeof defaults>(spec.build(spec.define({ shop }), worded).artifact("shop"), { sinks: [] });
        const by = ( name: string ): spec.CompiledScreen => app.compiled.byName[name] as spec.CompiledScreen;
        const lost = spec.build(spec.define({ shop: spec.surface({ config: { settings: { locales: ["en", "ar"] }, contents: { name: { key: "brand.nam" } } }, schema: [spec.screen("home", { path: "/", title: { key: "screens.hom" } }), spec.screen("half", { title: { key: "only.en" } })], messages: { en: { only: { en: "Half" } } } }) }), worded).surface("shop");

        expect([built.compiled.issues.map(( issue ) => [issue.path, issue.message]), by("home").title, by("about").title, by("terms").title, by("plain").title, by("home").description, by("home").texts]).toEqual([[["screens.plain", "title misses a locale: ar"]], { en: "Home", ar: "الرئيسية" }, { en: "About", ar: "من نحن" }, { en: "Terms", ar: "الشروط" }, { en: "Plain" }, { en: "All of it", ar: "كل شيء" }, {}]);
        expect([app.title(by("about"), "ar"), app.content("name", "ar"), app.content("name", "en"), app.meta(by("home"), "ar").description, app.menu("ar", "/").map(( item ) => item.title)]).toEqual(["من نحن", "المتجر", "Shop", "كل شيء", ["الرئيسية", "من نحن", "الشروط", "Plain"]]);
        expect(lost.compiled.issues.map(( issue ) => [issue.path, issue.rule, issue.message, issue.near])).toEqual([
            ["config.contents.name", "text.unknown", "brand.nam: no message carries this key in en, ar", undefined],
            ["screens.home.title", "text.unknown", "screens.hom: no message carries this key in en, ar", "screens.home"],
            ["screens.half.title", "text.unknown", "only.en: no message carries this key in ar", undefined],
        ]);
        expect([spec.screen("x", { title: { key: "a.b" } }).texts, spec.screen("x", { title: { key: "a.b" } }).title, spec.screen("x", { title: { key: "Key", en: "Both" } }).texts]).toEqual([{ title: "a.b" }, {}, {}]);

    });
    it("a surface guards itself: a screen that needs a session sends a guest to the declared login, a guest-only screen sends a signed-in user home, a transfer lands where the guard would send it, and a login that is unknown or itself guarded is a build issue", async () => {

        const schema = [spec.screen("home", { path: "/" }), spec.screen("login", { auth: "guest" }), spec.screen("account", { auth: true }), spec.screen("open", {})];
        const guarded = spec.surface({ config: { settings: { login: "login" } }, schema });
        const { app } = spec.boot(spec.build(spec.define({ guarded }), part).artifact("guarded"), { sinks: [] });
        const by = ( name: string ): spec.CompiledScreen => app.compiled.byName[name] as spec.CompiledScreen;
        const guest = ["home", "login", "account", "open"].map(( name ) => app.gate(by(name)));

        app.live.patch({ user: { id: "u-1" } });

        const signed = ["home", "login", "account", "open"].map(( name ) => app.gate(by(name)));
        const bare = spec.boot(spec.build(spec.define({ bare: spec.surface({ schema }) }), part).artifact("bare"), { sinks: [] }).app;
        const wrong = ( login: string, extra: spec.Screen[] = [] ): string[][] => spec.build(spec.define({ shop: spec.surface({ config: { settings: { login } }, schema: [...schema, ...extra] }) }), part).surface("shop").compiled.issues.map(( issue ) => [issue.path, issue.rule, issue.near ?? ""]);

        expect([app.login, app.home, guest, signed, by("login").guest, by("account").auth, by("login").auth]).toEqual(["/login", "/", [undefined, undefined, "/login", undefined], [undefined, "/", undefined, undefined], true, true, false]);
        const landed = spec.boot(spec.build(spec.define({ shop: spec.surface({ config: { settings: { login: "login", account: "account" } }, schema }) }), part).artifact("shop"), { sinks: [] }).app;

        landed.live.patch({ user: { id: "u-1" } });

        expect([landed.account, landed.gate(landed.compiled.byName.login as spec.CompiledScreen), landed.gate(landed.compiled.byName.account as spec.CompiledScreen)]).toEqual(["/account", "/account", undefined]);
        const pair = spec.build(spec.define({ one: spec.surface({ schema: [spec.screen("home", { path: "/", features: [spec.feature("search", { id: "go", on: { success: spec.transfer("two", { to: "/login" }) } }), spec.feature("search", { id: "in", on: { success: spec.transfer("two", { to: "/account" }) } })] })] }), two: spec.surface({ config: { settings: { login: "login", account: "account" } }, schema }) }), part);
        const went: string[] = [];
        const host = spec.boot(pair.artifact("one"), { sinks: [], navigate: ( path ) => { went.push(path); }, handlers: { "go.press": () => "ok", "in.press": () => "ok" } });
        const move = async ( id: string ): Promise<void> => {

            await host.resume("one");
            await host.app.live.mount("home");
            await host.app.live.act(id, "press");

        };

        await move("go");
        await move("in");
        host.of("two").live.patch({ user: { id: "u-1" } });
        await move("go");
        await move("in");

        expect(went).toEqual(["/login", "/login", "/account", "/account"]);
        expect([bare.login, bare.gate(bare.compiled.byName.account as spec.CompiledScreen), bare.live.opens("account")]).toEqual([undefined, undefined, false]);
        expect([wrong("logn"), wrong("account")]).toEqual([[["config.settings.login", "config.login", "login"]], [["config.settings.login", "config.login", ""]]]);

    });
    it("what the environment deploys sits on top of the ladder, is checked like any config, and reaches the app", () => {

        const keyed = spec.part({ platform: "web", blocks, defaults: { contracts: { maps: { key: "" } } } });
        const shop = spec.define({ shop: spec.surface({ config: { contracts: { maps: { key: "from-the-spec" }, media: ["https://maps.example.test/tiles"] } }, schema: [spec.screen("home", { path: "/" })] }) });
        const built = spec.build(shop, keyed, { config: { contracts: { maps: { key: "from-the-environment" } } } });
        const wrong = spec.build(shop, keyed, { config: { contracts: { mapz: { key: "x" } }, settings: { scheme: 7 } } }).surface("shop");
        const { app } = spec.boot<{ contracts: { maps: { key: string } } }>(built.artifact("shop"), { sinks: [] });

        expect([built.surface("shop").compiled.issues, app.config.contracts.maps.key, app.config.contracts.media, spec.build(shop, keyed).surface("shop").config.contracts.maps.key]).toEqual([[], "from-the-environment", ["https://maps.example.test/tiles"], "from-the-spec"]);
        expect(wrong.compiled.issues.map(( issue ) => [issue.path, issue.rule, issue.near])).toEqual([["config.contracts.mapz", "config.unknown", "maps"], ["config.settings.scheme", "config.shape", undefined]]);

    });
    it("an app speaks a locale only once it is asked for, and an unknown locale speaks the surface's default", () => {

        const built = spec.build(spec.define({ shop: spec.surface({ config: { settings: { locales: ["en", "ar"] } }, schema: [spec.screen("home", { path: "/" })], messages: { en: { nav: { menu: "Menu" } }, ar: { nav: { menu: "القائمة" } } } }) }), part);
        const { app } = spec.boot(built.artifact("shop"), { sinks: [] });

        expect([app.text("ar", "nav.menu"), app.text("fr", "nav.menu"), app.text("en", "nav.ghost"), app.labels("ar", "nav"), app.labels("fr", "nav")]).toEqual(["القائمة", "Menu", "nav.ghost", { menu: "القائمة" }, { menu: "Menu" }]);

    });

});
