import { describe, expect, test as it } from "bun:test";
import * as exception from "engine/exception";
import * as seo from "engine/seo";
import * as spec from "engine/spec";
import { specs } from "../specs/index.ts";
import { platform } from "../src/api/index.ts";
import { host } from "../src/specs/app.ts";
import { part } from "../src/specs/part.ts";

const { answer, ask, compiled, confirmations, labels, live, logger, logs, menu, report, screenAt, title } = host.app;
const { current } = specs;
const role = current.slice(current.lastIndexOf(".") + 1);
const name = host.app.config.contents.name;
const tagline = host.app.config.contents.tagline;
const messages = host.app.messages as unknown as Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
const built = ( deploy: spec.Deploy = {} ): spec.Built<typeof part.defaults> => spec.build(specs, part, deploy).surface(current);
const textOf = host.app.text;
const settingsOf = host.app.settings;
const metadataOf = host.app.meta;
const titleOf = host.app.heading;
const pathsOf = host.app.paths;
const publicOf = host.app.indexing;

describe("spec", () => {

    it("the role compiles clean, places the hello feature and wires its topic", () => {

        expect(compiled.issues).toEqual([]);
        expect(compiled.surface.name).toBe(`${platform}-${role}`);
        expect(compiled.surface.role).toBe(role);
        expect([host.entry, host.names, host.app.name, host.app.id]).toEqual([current, [current, "acme.client"], current, current]);
        expect(compiled.features).toEqual(["action", "hello", "locate", "note", "probe", "vault"]);
        expect(compiled.kinds).toEqual(["feature", "stack"]);
        expect(compiled.topics.emitted).toEqual(["hello.greeted", "locate.moved"]);
        expect(compiled.topics.consumed).toEqual(["hello.greeted"]);
        expect(compiled.byName.hello?.blocks[0]?.props).toEqual({ align: "center", justify: "center", padding: "md", gap: "lg", height: "screen" });
        expect(built().compiled.byName.hello?.features[0]?.manifest?.actions).toEqual(["refresh"]);
        expect(compiled.byName.hello?.features[0]?.manifest).toBeUndefined();
        expect(screenAt("/")?.screen.name).toBe("hello");
        expect(screenAt("/nope")).toBeUndefined();
        expect(menu("ar", "/")).toEqual([{ name: "hello", path: "/", title: compiled.byName.hello?.title.ar ?? "", icon: "wave", active: true }, { name: "about", path: "/about", title: compiled.byName.about?.title.ar ?? "", icon: "info", active: false }, { name: "storage", path: "/storage", title: compiled.byName.storage?.title.ar ?? "", icon: "box", active: false }, { name: "gear", path: "/device", title: compiled.byName.gear?.title.ar ?? "", icon: "chip", active: false }]);
        expect(title(compiled.byName.hello as spec.CompiledScreen, "en")).toBe(compiled.byName.hello?.title.en ?? "");
        expect(labels("ar", "hello").refresh).toBe(messages.ar?.hello?.refresh);
        expect(labels("en", "hello").switch).toBe(messages.en?.hello?.switch);
        expect(labels("en", "nav").theme).toBe(messages.en?.nav?.theme);
        expect(labels("en", "nope")).toEqual({});
        expect(settingsOf("hello", "hello")).toEqual({ tone: "warm" });
        expect(settingsOf("nope", "hello")).toEqual({});
        expect(built().compiled.issues).toEqual([]);

    });
    it("the runtime mounts the hello screen, runs its load hook and answers the greeted topic", async () => {

        const mounted = await live.mount("hello");

        expect(live.get("signals.visits")).toBe(1);
        expect(live.get("signals.greeted")).toBeUndefined();
        live.bus.publish("hello.greeted", { tone: "warm" });
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(live.get("signals.greeted")).toBe(true);
        expect(live.visible("hello")).toBe(true);
        await mounted.unmount();

    });
    it("the session opens what the role grants and the menu lists only that", () => {

        expect(live.opens("hello")).toBe(true);
        expect(live.opens("nope")).toBe(false);
        expect(menu("en", "/nope").map(( item ) => [item.name, item.active])).toEqual([["hello", false], ["about", false], ["storage", false], ["gear", false]]);

    });
    it("a confirmation waits for one answer and a second ask refuses the first", async () => {

        const first = ask("hello.refresh");
        const second = ask("hello.retry");

        expect(await first).toBe(false);
        expect(confirmations.get()?.key).toBe("hello.retry");
        answer(true);
        expect(await second).toBe(true);
        expect(confirmations.get()).toBeUndefined();
        answer(true);
        expect(confirmations.get()).toBeUndefined();

    });
    it("a text resolves by its key in the chosen language and every language carries the same keys", () => {

        const keys = ( locale: string ): string[] => Object.entries(messages[locale] ?? {}).flatMap(([feature, sheet]) => Object.keys(sheet).map(( key ) => `${feature}.${key}`)).sort();

        expect(textOf("en", "hello.refresh")).toBe(messages.en?.hello?.refresh ?? "");
        expect(textOf("ar", "nav.denied")).toBe(messages.ar?.nav?.denied ?? "");
        expect(textOf("en", "nope.key")).toBe("nope.key");
        expect(textOf("en", "hello")).toBe("hello");
        expect(keys(compiled.surface.locale).length).toBeGreaterThan(0);

        for ( const locale of compiled.surface.locales ) expect(keys(locale)).toEqual(keys(compiled.surface.locale));
        for ( const key of ["menu", "theme", "language", "system", "light", "dark", "denied", "deniedHint", "confirm", "yes", "no", "stale", "staleHint", "later", "reload"] ) expect(keys(compiled.surface.locale)).toContain(`nav.${key}`);

    });
    it("what the surface says about itself follows the config: no public url means no index", () => {

        expect(publicOf()).toEqual({ indexable: false, url: undefined });
        expect(pathsOf()).toEqual(["/", "/about", "/storage", "/device"]);
        expect(metadataOf(compiled.byName.hello as spec.CompiledScreen, "en")).toEqual({ title: `${compiled.byName.hello?.title.en} · ${name.en}`, description: tagline.en ?? "", robots: "noindex, nofollow", canonical: undefined, alternates: [], openGraph: {}, twitter: {}, keywords: [], tags: [{ name: "description", content: tagline.en ?? "" }, { name: "robots", content: "noindex, nofollow" }] });
        expect(metadataOf(compiled.byName.hello as spec.CompiledScreen, "ar").title).toBe(`${compiled.byName.hello?.title.ar} · ${name.ar}`);

        const site: seo.Site = { name: name.en ?? "", url: "https://www.acme.example/", locale: "en", locales: ["en"], default: "en", hide: true, description: tagline.en ?? "" };
        const page = seo.metadata(site, { title: "Hello", path: "/hello" });
        const hello = compiled.byName.hello as spec.CompiledScreen;

        expect([titleOf(hello, "en"), titleOf(hello, "ar"), seo.metadata(site, { title: title(hello, "en"), path: hello.path }).title]).toEqual([metadataOf(hello, "en").title, metadataOf(hello, "ar").title, titleOf(hello, "en")]);
        expect([host.app.site("en"), page.canonical, page.alternates, page.openGraph["og:url"], page.openGraph["og:locale"]]).toEqual([undefined, "https://www.acme.example/hello", [{ locale: "en", href: "https://www.acme.example/hello" }, { locale: "x-default", href: "https://www.acme.example/hello" }], "https://www.acme.example/hello", "en"]);

    });
    it("a failure is reported once, by name, through the surface logger", () => {

        logs.clear();
        expect(report(exception.fault("unavailable", "hello.down"), "hello.refresh")).toBeUndefined();
        expect([logger.name, logs.entries.map(( entry ) => [entry.level, entry.message])]).toEqual([`${platform}-${role}`, [["error", "hello.refresh"]]]);
        logs.clear();

    });
    it("a release refuses the lab address and ships only a public https one", () => {

        expect(host.app.address).toBe(host.app.config.contracts.baseUrl);
        expect(built({ url: "https://api.acme.example/", release: true }).address).toBe("https://api.acme.example");
        expect(() => built({ release: true })).toThrow("a release calls a public https address");

    });
    it("a surface reached by transfer loads on demand, reads what was carried, and its screens flip, wait and describe themselves", async () => {

        const went: string[] = [];
        const unbind = host.bind({ navigate: ( path ) => { went.push(path); }, carry: () => ({ locale: "en" }) });
        const client = await host.ready("acme.client");
        const offers = client.compiled.byName.offers as spec.CompiledScreen;

        expect([host.index.map(( listed ) => [listed.name, listed.indexable]), client.compiled.surface.on.enter?.length, offers.settings, client.meta(offers, "en").description, client.meta(offers, "en").robots.startsWith("index"), host.app.meta(host.app.compiled.byName.about as spec.CompiledScreen, "en").robots]).toEqual([[[current, false], ["acme.client", true]], 1, { width: "reading" }, offers.description.en ?? "", true, "noindex, nofollow"]);

        const stops: (() => void)[] = [unbind];

        try {

            const hello = await host.app.live.mount("hello");
            stops.push(host.app.live.handle("leave.press", () => undefined));

            await host.app.live.act("leave", "press");
            await hello.unmount();

            const home = await client.live.mount("home");
            stops.push(client.live.handle("more.press", () => undefined));

            expect([host.active.getState(), host.carried(), client.live.get("signals.from"), client.live.visible("back"), client.live.visible("details"), went]).toEqual(["acme.client", { locale: "en", from: "admin" }, "admin", true, false, ["/"]]);

            await client.live.act("more", "press");

            expect(client.live.visible("details")).toBe(true);

            await client.live.act("more", "press");

            expect(client.live.visible("details")).toBe(false);

            await home.unmount();

        } finally {

            await host.resume(current);

            for ( const off of stops ) off();

        }

        expect(host.active.getState()).toBe(current);

    });

});
