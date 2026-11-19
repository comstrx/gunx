import { describe, expect, test as it } from "bun:test";
import * as spec from "engine/spec";
import * as validate from "engine/validate";

const blocks = { stack: validate.partial(validate.strictObject({ gap: validate.enum(["sm", "md"]) })), feature: validate.strictObject({ name: validate.string() }) };
const features: Readonly<Record<string, spec.Manifest>> = { hello: { name: "hello", actions: ["greet"], emits: ["hello.greeted"] }, orders: { name: "orders" } };
const defaults = { settings: { budget: { js: 0 as number | string } }, themes: { brand: "#000000", radius: { md: 10, lg: 18 } }, contents: { name: { en: "Shop" }, tagline: "", url: "" } };
const messages = { en: { nav: { menu: "Menu", yes: "Yes" }, hello: { title: "Hello" } }, ar: { nav: { menu: "القائمة" } } };
const blank = Object.fromEntries(spec.tones.map(( name ) => [name, ""]));
const part = spec.part({ platform: "web", blocks, features, defaults, messages, topics: ["shop.opened"] });
const home = spec.screen("home", { path: "/", title: { en: "Home", ar: "الرئيسية" }, features: [spec.feature("hello", { on: { load: [spec.confirm("nav.yes", [])] } })], blocks: [spec.block("stack", { gap: "sm" }, [spec.block("feature", { name: "hello" })])] });
const admin = spec.surface({ config: { settings: { locales: ["en", "ar"], grants: ["orders.*"] }, themes: { brand: "#ff4500" }, contents: { url: "https://shop.example.test" }, contracts: { baseUrl: "https://api.example.test/v1/" } }, schema: [home], messages: { en: { hello: { title: "Hello from the shop" } } } });
const client = spec.surface({ id: "shop-client", schema: { screens: [spec.screen("home", { path: "/", title: "Home" })], signals: ["cart"] }, brand: { icons: { logo: "./logo.svg" } } });

function reasonOf ( run: () => unknown ): string {

    try {

        run();

        return "";

    } catch ( caught ) {

        return (caught as { reason?: string }).reason ?? "thrown";

    }

}

describe("spec tree", () => {

    it("a screen is named first and defaults the rest; its layout places features inline; on takes hooks and topics, one effect or many", () => {

        const stack = spec.kind("stack");
        const list = spec.feature("orders", { id: "list", settings: { size: 20 }, on: { load: spec.set("signals.ready", true), "orders.changed": [spec.refresh("list")] }, watch: { "form.q": spec.set("signals.q", spec.from("form.q")) } });
        const made = spec.screen("orders.list_all", {
            layout: [stack({ gap: "md" }, [list, stack([spec.feature("hello")], { id: "side" }), list])],
            on: { leave: spec.clear("signals.ready"), "shop.opened": spec.branch("event.id", spec.emit("orders.changed")) },
            triggers: [spec.trigger("orders.changed", spec.hide("side"))],
        });

        expect([made.name, made.path, made.title, made.role, made.menu, made.auth, made.features.map(( one ) => one.id ?? one.name), spec.isBuilt(made)]).toEqual(["orders.list_all", "/orders/list-all", {}, "any", true, false, ["list", "hello"], true]);
        expect(made.blocks).toEqual([{ kind: "stack", id: undefined, props: { gap: "md" }, when: undefined, children: [
            { kind: "feature", id: undefined, props: { name: "list" }, when: undefined, children: [] },
            { kind: "stack", id: "side", props: {}, when: undefined, children: [{ kind: "feature", id: undefined, props: { name: "hello" }, when: undefined, children: [] }] },
            { kind: "feature", id: undefined, props: { name: "list" }, when: undefined, children: [] },
        ] }]);
        expect([made.on, made.triggers, list.on, list.triggers, list.watch, list.settings]).toEqual([
            { leave: [{ clear: "signals.ready" }] },
            [{ on: "orders.changed", do: [{ hide: "side" }] }, { on: "shop.opened", do: [{ when: { is: "event.id", empty: false }, do: [{ emit: "orders.changed" }] }] }],
            { load: [{ set: "signals.ready", to: true }] },
            [{ on: "orders.changed", do: [{ refresh: "list" }] }],
            { "form.q": [{ set: "signals.q", to: { path: "form.q" } }] },
            { size: 20 },
        ]);

        const compiled = spec.compile(spec.plan({ name: "web-admin", role: "admin", locales: ["en", "ar"], screens: [made, spec.screen("home", { path: "/", title: { en: "Home" } })] }), { blocks, features: { ...features, orders: { name: "orders", actions: ["refresh"], emits: ["orders.changed"] } }, topics: ["shop.opened"] });

        expect(compiled.issues.map(( issue ) => [issue.path, issue.rule])).toEqual([["screens.home", "locale.missing"]]);
        expect([spec.titleOf(made, "ar"), compiled.byName["orders.list_all"]?.features.map(( one ) => one.id), spec.screen("plain").path, spec.feature("plain").on]).toEqual(["Orders.list_all", ["list", "hello"], "/plain", {}]);

    });
    it("a surface is one frozen object of config, schema, messages and brand, and refuses anything else", () => {

        expect([spec.isSurface(admin), spec.isSurface({ ...admin }), Object.isFrozen(admin), admin.id, client.id, client.signals, client.brand, admin.brand.fonts]).toEqual([true, false, true, undefined, "shop-client", ["cart"], { icons: { logo: "./logo.svg" } }, undefined]);
        expect([
            () => spec.surface({ schema: [home], extra: 1 } as never),
            () => spec.surface({ schema: 7 } as never),
            () => spec.surface({ schema: [home], id: "Bad Id" }),
            () => spec.surface({ schema: [home], config: [] as never }),
            () => spec.surface({ schema: [home], messages: { en: "hi" } as never }),
            () => spec.surface({ schema: [home], brand: { images: 7 } }),
            () => spec.surface({ schema: [home], brand: { icons: { logo: "" } } }),
            () => spec.surface(7 as never),
        ].map(reasonOf)).toEqual(Array.from({ length: 8 }, () => "spec.surface"));

    });
    it("define gathers surfaces through nested groups into addresses, names the current one and refuses anything else", () => {

        const flat = spec.define({ admin, client });
        const deep = spec.define({ shop: { v1: { admin, client }, v2: { client } }, lab: { admin } }, { current: "v2.client" });

        expect([spec.isSpec(flat), spec.isSpec({ ...flat }), flat.names, flat.current, deep.names, deep.current, deep.surfaces["shop.v1.admin"] === admin, Object.isFrozen(deep)]).toEqual([true, false, ["admin", "client"], "admin", ["shop.v1.admin", "shop.v1.client", "shop.v2.client", "lab.admin"], "shop.v2.client", true, true]);
        expect([
            () => spec.define({}),
            () => spec.define({ Admin: admin }),
            () => spec.define({ "a.b": admin }),
            () => spec.define({ admin: 7 } as never),
            () => spec.define(7 as never),
            () => spec.define({ admin }, { current: "ghost" }),
            () => spec.define({ shop: { v1: { client }, v2: { client } } }, { current: "client" }),
        ].map(reasonOf)).toEqual(Array.from({ length: 7 }, () => "spec.define"));

    });
    it("locate reads a written name from the caller's group upward, by tail, with dots or colons, and tells the nearest name when lost", () => {

        const deep = spec.define({ shop: { v1: { admin, client, courier: client }, v2: { client } }, lab: { admin, tools: { client } } });

        expect([
            spec.locate(deep, "client", "shop.v1.admin").name,
            spec.locate(deep, "client", "shop.v2.client").name,
            spec.locate(deep, "v2.client", "shop.v1.admin").name,
            spec.locate(deep, "shop:v2:client", "lab.admin").name,
            spec.locate(deep, "courier", "lab.admin").name,
            spec.locate(deep, "client", "lab.admin").name,
            spec.locate(deep, "lab.admin").name,
            spec.locate(deep, "tools.client", "shop.v1.admin").name,
        ]).toEqual(["shop.v1.client", "shop.v2.client", "shop.v2.client", "shop.v2.client", "shop.v1.courier", "lab.tools.client", "lab.admin", "lab.tools.client"]);
        expect([spec.locate(deep, "admin").issue?.rule, spec.locate(deep, "client", "shop.v1.ghost").name, spec.locate(deep, "admin", "shop.v2.client").name, spec.locate(deep, "admin").issue?.message]).toEqual(["surface.ambiguous", "shop.v1.client", "shop.v1.admin", "admin: names shop.v1.admin and lab.admin"]);
        expect(spec.locate(deep, "couriers", "shop.v1.admin").issue).toEqual({ path: "shop.v1.admin", rule: "surface.unknown", message: "couriers: no surface carries this name", fix: "name a surface the spec defines", near: "shop.v1.courier" });
        expect([spec.locate(deep, "", "lab.admin").issue?.rule, spec.locate(deep, "Shop..x").issue?.rule, spec.locate(deep, 7 as never).issue?.rule]).toEqual(["surface.name", "surface.name", "surface.name"]);

    });
    it("a part holds the platform, its vocabulary, defaults and texts; settle lays engine defaults, the part's and the surface's over one another", () => {

        const settled = spec.settle(part, admin);
        const plain = spec.settle(part, client);

        expect([spec.isPart(part), spec.isPart({ ...part }), Object.isFrozen(part), part.topics]).toEqual([true, false, true, ["shop.opened"]]);
        expect(settled.config).toEqual({
            settings: { locales: ["en", "ar"], locale: "en", localization: false, scheme: "system", world: [], grants: ["orders.*"], storage: { secure: "secure" }, app: { name: "", identifier: "", version: "0.0.0", slug: "", scheme: "" }, budget: { js: 0 } },
            themes: { brand: "#ff4500", color: { light: blank, dark: blank, custom: {} }, shadow: { light: { raised: "" }, dark: { raised: "" } }, radius: { md: 10, lg: 18 }, motion: { fast: "", base: "", ease: "" }, font: { sans: [] } },
            contents: { name: { en: "Shop" }, tagline: "", description: "", url: "https://shop.example.test", logo: "", icon: "", email: "", phone: "", address: "", socials: [], seo: { image: "", twitter: "", keywords: [], robots: { allow: [], disallow: [] } } },
            contracts: { baseUrl: "https://api.example.test/v1/", realtime: false, media: [], wire: {}, live: { path: "", channel: "{feature}", events: { created: "{feature}.created", updated: "{feature}.updated", deleted: "{feature}.deleted" }, key: "id" } },
            features: [],
        });
        expect([settled.issues, settled.messages, plain.config.settings.locales, plain.messages]).toEqual([[], { en: { nav: { menu: "Menu", yes: "Yes" }, hello: { title: "Hello from the shop" } }, ar: { nav: { menu: "القائمة" } } }, ["en"], { en: messages.en }]);
        expect(spec.settle(part, spec.surface({ schema: [], config: { settings: { storage: { secure: "local" } } } })).config.settings.storage).toEqual({ secure: "local" });
        expect(spec.settle(part, spec.surface({ schema: [], config: { settings: { storage: { secure: "", vault: "local" } } } })).issues.map(( issue ) => [issue.path, issue.rule])).toEqual([["config.settings.storage.vault", "config.unknown"], ["config.settings.storage.secure", "config.shape"]]);
        expect(spec.settle(part, spec.surface({ schema: [], config: { settings: { locals: ["en"], locale: "fr", home: "home" }, themes: { brnad: "#fff" }, extra: 1, contents: { anything: true } }, messages: { fr: {} } })).issues.map(( issue ) => [issue.path, issue.rule, issue.near])).toEqual([
            ["config.settings.locals", "config.unknown", "locales"],
            ["config.themes.brnad", "config.unknown", "brand"],
            ["config.extra", "config.unknown", undefined],
            ["config.contents.anything", "config.unknown", undefined],
            ["config.settings.locale", "config.locale", undefined],
            ["messages.fr", "messages.locale", undefined],
        ]);
        expect(spec.settle(part, spec.surface({ schema: [], config: { settings: { locales: "en", world: ["moon"] }, features: [7] } })).issues.map(( issue ) => issue.path)).toEqual(["config.settings.locales", "config.settings.locale", "config.settings.world.0", "config.features.0"]);
        expect([() => spec.part({ platform: "tv" } as never), () => spec.part({ platform: "web", extra: 1 } as never), () => spec.part({ platform: "web", defaults: [] as never }), () => spec.part({ platform: "web", messages: { en: "x" } as never }), () => spec.part(7 as never)].map(reasonOf)).toEqual(Array.from({ length: 5 }, () => "spec.part"));

    });
    it("build compiles each surface against the part, settles its address and writes one artifact a part boots", () => {

        const built = spec.build(spec.define({ shop: { admin, client } }), part);
        const made = built.surface("shop.admin");
        const artifact = JSON.parse(JSON.stringify(built.artifact("shop.admin")));

        expect([built.names, built.current, made.id, built.surface("shop.client").id, made.address, built.surface("shop.client").address, made.compiled.issues, made.compiled.surface.name, made.compiled.surface.role, built.surface("shop.admin") === made]).toEqual([["shop.admin", "shop.client"], "shop.admin", "shop.admin", "shop-client", "https://api.example.test/v1", undefined, [], "web-admin", "admin", true]);
        expect([built.reach("shop.admin"), built.locate("client", "shop.admin").name, artifact.version, artifact.entry, Object.keys(artifact.surfaces), Object.keys(artifact.surfaces["shop.admin"])]).toEqual([["shop.admin"], "shop.client", spec.version, "shop.admin", ["shop.admin"], ["id", "address", "home", "config", "messages", "brand", "links", "compiled"]]);
        expect([artifact.index, built.artifact("shop.admin", false).index.length, built.listed("shop.client").indexable, built.carried("shop.client").id]).toEqual([[{ name: "shop.admin", id: "shop.admin", indexable: true, settings: { locales: made.config.settings.locales, locale: "en", scheme: made.config.settings.scheme, world: [] } }], 1, false, "shop-client"]);
        expect(spec.build(spec.define({ admin }), part, { url: "https://live.example.test" }).surface("admin").address).toBe("https://live.example.test");
        expect([reasonOf(() => spec.build(spec.define({ admin }), part, { release: true, url: "http://localhost:8100" }).surface("admin")), reasonOf(() => built.surface("ghost")), reasonOf(() => spec.build({} as never, part)), reasonOf(() => spec.build(spec.define({ admin }), {} as never))]).toEqual(["api.cleartext", "spec.surface", "spec.build", "spec.build"]);

        const picky = spec.build(spec.define({ admin: spec.surface({ config: { features: ["orders", "ghost"] }, schema: [home] }) }), part).surface("admin");

        expect(picky.compiled.issues.map(( issue ) => [issue.rule, issue.near])).toEqual([["config.feature", undefined], ["feature.unknown", undefined], ["block.feature", undefined], ["text.unknown", undefined]].slice(0, picky.compiled.issues.length));
        expect(picky.compiled.issues.map(( issue ) => issue.rule)).toContain("feature.unknown");

    });
    it("boot revives the artifact into the active surface's app: texts, labels, titles, menu, contents, metadata and confirmations", async () => {

        const built = spec.build(spec.define({ shop: { admin, client } }), part);
        const host = spec.boot<typeof defaults>(JSON.parse(JSON.stringify(built.artifact("shop.admin"))), { sinks: [] });
        const { app } = host;
        const screen = app.compiled.byName.home as spec.CompiledScreen;

        expect([host.entry, host.names, host.active.getState(), host.of("shop.admin") === app, app.name, app.id, app.address, app.config.themes.brand, app.config.settings.budget.js, app.links, app.brand.icons]).toEqual(["shop.admin", ["shop.admin"], "shop.admin", true, "shop.admin", "shop.admin", "https://api.example.test/v1", "#ff4500", 0, {}, undefined]);
        expect([app.text("en", "hello.title"), app.text("ar", "hello.title"), app.text("fr", "nav.menu"), app.text("en", "nav.ghost"), app.labels("ar", "nav"), app.labels("en", "ghost")]).toEqual(["Hello from the shop", "Hello from the shop", "Menu", "nav.ghost", { menu: "القائمة", yes: "Yes" }, {}]);
        expect(app.labels("ar", "nav")).toBe(app.labels("ar", "nav"));
        expect([app.title(screen, "ar"), app.heading(screen, "en"), app.content("name", "ar"), app.content("url", "en"), app.content("ghost", "en"), app.indexing(), app.paths(), app.site("en")?.url, app.meta(screen, "en").canonical, app.screenAt("/")?.screen.name, app.menu("en", "/").map(( item ) => item.name), app.settings("home", "hello")]).toEqual(["الرئيسية", "Home · Shop", "Shop", "https://shop.example.test", "", { indexable: true, url: "https://shop.example.test" }, ["/"], "https://shop.example.test", "https://shop.example.test", "home", ["home"], {}]);

        const ordered = spec.boot(JSON.parse(JSON.stringify(spec.build(spec.define({ admin: spec.surface({ schema: [spec.screen("zeta", { title: "Zeta" }), spec.screen("home", { path: "/", title: "Home" }), spec.screen("alpha", { title: "Alpha" })] }) }), part).artifact("admin"))), { sinks: [] }).app;

        expect([ordered.paths(), ordered.menu("en", "/").map(( item ) => item.name), ordered.compiled.screens.map(( one ) => one.name)]).toEqual([["/zeta", "/", "/alpha"], ["zeta", "home", "alpha"], ["alpha", "zeta", "home"]]);

        const asked = app.ask("nav.yes");

        expect(app.confirmations.get()?.key).toBe("nav.yes");

        app.answer(true);

        expect([await asked, app.confirmations.get(), app.report(new Error("down"), "here"), app.logs.entries.length]).toEqual([true, undefined, undefined, 1]);

        const counted = host.own(( one ) => ({ of: one.name }));

        expect(counted()).toBe(counted());
        expect(counted().of).toBe("shop.admin");
        expect(spec.boot<typeof defaults>(JSON.parse(JSON.stringify(built.artifact("shop.client"))), { sinks: [] }).app.meta(screen, "en")).toEqual({ title: "Home · Shop", description: "", robots: "noindex, nofollow", canonical: undefined, alternates: [], openGraph: {}, twitter: {}, keywords: [], tags: [{ name: "description", content: "" }, { name: "robots", content: "noindex, nofollow" }] });
        expect([() => spec.boot(7), () => spec.boot({}), () => spec.boot({ version: spec.version, entry: "ghost", surfaces: {} }), () => spec.boot({ version: 0, entry: "a", surfaces: {} })].map(reasonOf)).toEqual(["spec.artifact", "spec.artifact", "spec.artifact", "spec.artifact"]);

    });
    it("a transfer names another surface: the build resolves it from the caller's group, checks where it lands and carries what it reaches", () => {

        const popup = validate.partial(validate.strictObject({ size: validate.enum(["sm", "md", "full"]) }));
        const owner = spec.part({ platform: "web", blocks: { ...blocks, popup }, features, defaults, messages });
        const jobs = spec.screen("jobs", { path: "/jobs/{id}", title: { en: "Job" }, menu: false });
        const board = spec.screen("board", { path: "/", title: { en: "Board" }, on: { load: [spec.transfer("client", { to: "/", refresh: true }), spec.open("/jobs/{id}", { with: { id: 7 }, size: "md" }), spec.close()] } });
        const courier = spec.surface({ schema: [board, jobs] });
        const shopper = spec.surface({ config: { settings: { home: "start" } }, schema: [spec.screen("start", { path: "/start", title: { en: "Start" }, on: { load: [spec.transfer("courier", { to: "/jobs/{id}", with: { id: 3 } }), spec.transfer("v2:courier")] } })] });
        const built = spec.build(spec.define({ shop: { v1: { client: shopper, courier }, v2: { courier } } }), owner);
        const made = built.surface("shop.v1.client");

        expect([made.compiled.issues, made.links, made.home, built.surface("shop.v1.courier").links, built.reach("shop.v1.client"), built.reach("shop.v2.courier")]).toEqual([[], { courier: "shop.v1.courier", "v2:courier": "shop.v2.courier" }, "/start", { client: "shop.v1.client" }, ["shop.v1.client", "shop.v1.courier", "shop.v2.courier"], ["shop.v2.courier", "shop.v1.client", "shop.v1.courier"]]);
        expect([Object.keys(built.artifact("shop.v1.client").surfaces), built.artifact("shop.v1.client").surfaces["shop.v1.client"]?.home, board.on.load]).toEqual([["shop.v1.client", "shop.v1.courier", "shop.v2.courier"], "/start", [{ transfer: "client", to: "/", reload: true }, { open: "/jobs/{id}", with: { id: 7 }, props: { size: "md" } }, { close: "top" }]]);

        const lost = spec.build(spec.define({ shop: { client: spec.surface({ config: { settings: { home: "ghost" } }, schema: [spec.screen("start", { path: "/start", title: "Start", on: { load: [spec.transfer("couriers"), spec.transfer("courier", { to: "/nope" }), spec.transfer("empty"), spec.open("/nope", { size: "huge" }), { close: "now" }] } })] }), courier, empty: spec.surface({ schema: [jobs] }) } }), owner).surface("shop.client");

        expect(lost.compiled.issues.map(( issue ) => [issue.path, issue.rule, issue.near])).toEqual([
            ["screens.start.on.load[3]", "effect.screen", undefined],
            ["screens.start.on.load[3]", "popup.props", undefined],
            ["screens.start.on.load[4]", "effect.close", undefined],
            ["config.settings.home", "config.home", undefined],
            ["screens.start.on.load[0]", "surface.unknown", "shop.courier"],
            ["screens.start.on.load[1]", "transfer.screen", undefined],
            ["screens.start.on.load[2]", "transfer.home", undefined],
        ]);
        expect(spec.effectShape.safeParse({ transfer: "courier", reload: true, extra: 1 }).success).toBe(false);

    });
    it("the host transfers between the surfaces it carries, hands the next one a map, and stacks screens opened over the current one", async () => {

        const went: string[] = [];
        const greet = spec.feature("hello", { on: { load: spec.set("signals.seen", spec.param("id")) } });
        const admins = spec.surface({ config: { settings: { locales: ["en", "ar"] } }, schema: [
            spec.screen("home", { path: "/", title: { en: "Home", ar: "الرئيسية" }, on: { "shop.opened": [spec.open("/jobs/{id}", { with: { id: spec.from("event.id") } })], leave: spec.close("all") } }),
            spec.screen("jobs", { path: "/jobs/{id}", title: { en: "Job", ar: "مهمة" }, menu: false, layout: [greet], on: { "job.done": spec.close(), "job.next": spec.navigate("/"), "job.leave": spec.transfer("client", { with: { token: "t-1" } }) } }),
        ] });
        const clients = spec.surface({ schema: [spec.screen("home", { path: "/welcome", title: "Welcome", on: { "go.back": spec.transfer("admin", { to: "/jobs/{id}", with: { id: 9 }, refresh: true }) } })], config: { settings: { home: "home" } } });
        const built = spec.build(spec.define({ admin: admins, client: clients }), spec.part({ platform: "web", features, defaults, messages, topics: ["shop.opened", "job.done", "job.next", "job.leave", "go.back"] }));

        expect(built.surface("admin").compiled.issues).toEqual([]);

        const host = spec.boot<typeof defaults>(JSON.parse(JSON.stringify(built.artifact("admin"))), { sinks: [], navigate: ( path ) => { went.push(`go ${path}`); }, reload: ( path ) => { went.push(`reload ${path}`); }, carry: ( app ) => ({ locale: app.live.get("locale"), from: app.name }) });
        const admin = host.app;
        const tick = (): Promise<void> => new Promise(( resolve ) => setTimeout(resolve, 0));

        await admin.live.mount("home");
        admin.live.patch({ locale: "ar", user: { id: 1 } });
        admin.bus.publish("shop.opened", { id: 5 });
        await tick();

        const first = admin.popups.getState()[0] as spec.Popup;

        expect([host.names, admin.home, host.of("client").home, admin.popups.getState().length, first.path, first.screen.name, first.params, first.live.get("signals.seen"), first.live.get("locale"), first.live.get("user"), admin.live.get("signals.seen")]).toEqual([["admin", "client"], "/", "/welcome", 1, "/jobs/5", "jobs", { id: "5" }, "5", "ar", { id: 1 }, undefined]);

        admin.live.patch({ locale: "en" });
        await admin.open("/jobs/6");

        expect([admin.popups.getState().map(( one ) => one.path), first.live.get("locale")]).toEqual([["/jobs/5", "/jobs/6"], "en"]);

        admin.bus.publish("job.done", {});
        await tick();
        await tick();

        expect(admin.popups.getState().map(( one ) => one.path)).toEqual(["/jobs/5"]);

        await admin.close();
        await admin.close();
        expect(admin.popups.getState()).toEqual([]);
        await admin.open("/jobs/7");
        admin.bus.publish("job.next", {});
        await tick();
        await tick();

        expect([admin.popups.getState().length, went]).toEqual([0, ["go /"]]);

        await admin.open("/jobs/8");
        admin.bus.publish("job.leave", {});
        await tick();
        await tick();

        expect([host.active.getState(), host.app.name, host.carried(), admin.popups.getState().length, went]).toEqual(["client", "client", { locale: "en", from: "admin", token: "t-1" }, 0, ["go /", "go /welcome"]]);

        await host.app.live.mount("home");
        host.app.bus.publish("go.back", {});
        await tick();

        expect([host.active.getState(), went.at(-1), host.carried().from]).toEqual(["admin", "reload /jobs/9", "client"]);
        await expect(host.transfer("ghost")).rejects.toMatchObject({ reason: "spec.transfer" });
        await expect(admin.open("/nope")).rejects.toMatchObject({ reason: "spec.screen" });
        const unbound = host.bind({ navigate: ( path ) => { went.push(`bound ${path}`); } });

        await host.transfer("client", { to: "/welcome" });
        unbound();
        expect([went.at(-1), await host.resume("admin"), host.active.getState(), await host.resume("ghost"), host.active.getState()]).toEqual(["bound /welcome", true, "admin", false, "admin"]);
        expect([await host.owner("/welcome"), await host.owner("/jobs/9"), await host.owner("/nowhere"), host.active.getState()]).toEqual(["client", "admin", undefined, "admin"]);
        await host.transfer("client", { to: "/welcome" });
        expect(went.at(-1)).toBe("go /welcome");
        expect([host.active.getState(), spec.boot(JSON.parse(JSON.stringify(built.artifact("admin"))), { sinks: [], active: "client" }).app.name, spec.boot(JSON.parse(JSON.stringify(built.artifact("admin"))), { sinks: [], active: "ghost" }).app.name]).toEqual(["client", "client", "admin"]);

    });
    it("a build split into an index and loaders boots on its entry alone and loads another surface the first time something transfers to it", async () => {

        const one = spec.surface({ schema: [spec.screen("home", { path: "/", title: "Home", on: { "go.next": spec.transfer("two") } })] });
        const two = spec.surface({ config: { contents: { url: "https://two.example.test" } }, schema: [spec.screen("home", { path: "/", title: "Home" })] });
        const built = spec.build(spec.define({ one, two }), spec.part({ platform: "web", defaults, topics: ["go.next"] }));
        const light = JSON.parse(JSON.stringify(built.artifact("one", false)));
        const asked: string[] = [];
        const went: string[] = [];
        const load = { two: async () => { asked.push("two"); return { default: JSON.parse(JSON.stringify(built.carried("two"))) }; } };
        const host = spec.boot<typeof defaults>(light, { sinks: [], load, navigate: ( path ) => { went.push(path); } });

        expect([Object.keys(light.surfaces), host.names, host.index.map(( listed ) => [listed.name, listed.indexable, listed.settings.scheme]), asked]).toEqual([["one"], ["one", "two"], [["one", false, "system"], ["two", true, "system"]], []]);
        expect(() => host.of("two")).toThrow("the artifact carries no such surface");

        await host.app.live.mount("home");
        host.app.bus.publish("go.next", {});
        await Promise.all([host.ready("two"), host.ready("two")]);
        await new Promise(( resolve ) => setTimeout(resolve, 0));

        expect([host.active.getState(), host.app.name, asked, went, host.of("two").indexing().indexable]).toEqual(["two", "two", ["two"], ["/"], true]);
        expect([await host.resume("one"), host.active.getState(), asked]).toEqual([true, "one", ["two"]]);
        await expect(host.ready("ghost")).rejects.toMatchObject({ reason: "spec.transfer" });
        await expect(spec.boot(light, { sinks: [] }).transfer("two")).rejects.toMatchObject({ reason: "spec.artifact" });
        expect(spec.boot(JSON.parse(JSON.stringify(built.artifact("one"))), { sinks: [], active: "two" }).app.name).toBe("two");

    });

});
