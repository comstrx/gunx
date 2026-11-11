import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as seo from "engine/seo";
import type * as spec from "engine/spec";
import { current } from "../specs/index.ts";
import { roleOf } from "../src/specs/deployment.ts";
import { answer, ask, compiled, confirmations, labels, live, logger, logs, menu, metadataOf, pathsOf, publicOf, report, screenAt, settingsOf, siteOf, textOf, title, titleOf } from "../src/specs/runtime.ts";
import { compileRole } from "../src/specs/surface.ts";
import { platform } from "../src/types/platform.ts";

const role = roleOf();
const name = role.config.contents.name;
const tagline = role.config.contents.tagline;
const messages = role.messages as Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;

describe("spec", () => {

    it("the role compiles clean, places the hello feature and wires its topic", () => {

        expect(compiled.issues).toEqual([]);
        expect(compiled.surface.name).toBe(`${platform}-${current}`);
        expect(compiled.surface.role).toBe(current);
        expect(compiled.features).toEqual(["hello"]);
        expect(compiled.kinds).toEqual(["feature", "stack"]);
        expect(compiled.topics.emitted).toEqual(["hello.greeted"]);
        expect(compiled.topics.consumed).toEqual(["hello.greeted"]);
        expect(compiled.byName.hello?.blocks[0]?.props).toEqual({ align: "center", justify: "center", padding: "md", height: "screen" });
        expect(compileRole(current).byName.hello?.features[0]?.manifest?.actions).toEqual(["refresh"]);
        expect(compiled.byName.hello?.features[0]?.manifest).toBeUndefined();
        expect(screenAt("/")?.screen.name).toBe("hello");
        expect(screenAt("/nope")).toBeUndefined();
        expect(menu("ar", "/")).toEqual([{ name: "hello", path: "/", title: compiled.byName.hello?.title.ar ?? "", icon: "wave", active: true }]);
        expect(title(compiled.byName.hello as spec.CompiledScreen, "en")).toBe(compiled.byName.hello?.title.en ?? "");
        expect(labels("ar", "hello").refresh).toBe(messages.ar?.hello?.refresh);
        expect(labels("en", "hello").switch).toBe(messages.en?.hello?.switch);
        expect(labels("en", "nav").theme).toBe(messages.en?.nav?.theme);
        expect(labels("en", "nope")).toEqual({});
        expect(settingsOf("hello", "hello")).toEqual({ tone: "warm" });
        expect(settingsOf("nope", "hello")).toEqual({});
        expect(compileRole(current).issues).toEqual([]);

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
        expect(menu("en", "/nope").map(( item ) => [item.name, item.active])).toEqual([["hello", false]]);

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
        expect(pathsOf()).toEqual(["/"]);
        expect(metadataOf(compiled.byName.hello as spec.CompiledScreen, "en")).toEqual({ title: `${compiled.byName.hello?.title.en} · ${name.en}`, description: tagline.en, robots: "noindex, nofollow", canonical: undefined, alternates: [], openGraph: {} });
        expect(metadataOf(compiled.byName.hello as spec.CompiledScreen, "ar").title).toBe(`${compiled.byName.hello?.title.ar} · ${name.ar}`);

        const site = siteOf("en", { indexable: true, url: "https://www.acme.example/" }) as seo.Site;
        const page = seo.metadata(site, { title: "Hello", path: "/hello" });
        const hello = compiled.byName.hello as spec.CompiledScreen;

        expect([titleOf(hello, "en"), titleOf(hello, "ar"), seo.metadata(site, { title: title(hello, "en"), path: hello.path }).title]).toEqual([metadataOf(hello, "en").title, metadataOf(hello, "ar").title, titleOf(hello, "en")]);
        expect([siteOf("en"), page.canonical, page.alternates, page.openGraph["og:url"], page.openGraph["og:locale"]]).toEqual([undefined, "https://www.acme.example/hello", [{ locale: "en", href: "https://www.acme.example/hello" }, { locale: "x-default", href: "https://www.acme.example/hello" }], "https://www.acme.example/hello", "en"]);

    });
    it("a failure is reported once, by name, through the surface logger", () => {

        logs.clear();
        expect(report(error.fault("unavailable", "hello.down"), "hello.refresh")).toBeUndefined();
        expect([logger.name, logs.entries.map(( entry ) => [entry.level, entry.message])]).toEqual([`${platform}-${current}`, [["error", "hello.refresh"]]]);
        logs.clear();

    });
    it("a release refuses the lab address and ships only a public https one", () => {

        expect(compiled.address).toBe(role.config.contracts.baseUrl);
        expect(compileRole(current, { url: "https://api.acme.example/", release: true }).address).toBe("https://api.acme.example");
        expect(() => compileRole(current, { release: true })).toThrow("a release calls a public https address");

    });

});
