import { describe, expect, test as it } from "bun:test";
import * as spec from "engine/spec";

const part = spec.part({ platform: "web" });
const screens = [spec.screen("home", { path: "/", title: "Home" }), spec.screen("offers", { path: "/offers", title: "Offers", description: "Every offer of the week" })];

function booted ( contents: object ): spec.App {

    const built = spec.build(spec.define({ shop: spec.surface({ schema: screens, config: { contents } }) }), part);

    return spec.boot(JSON.parse(JSON.stringify(built.artifact("shop"))), { sinks: [] }).app;

}

describe("spec contents", () => {

    it("a role's contents feed every page's meta: description, keywords, the sharing image and the owner's handle", () => {

        const app = booted({ name: "Shop", tagline: "Fresh every day", description: "The whole market in one place", url: "https://shop.example.test", seo: { image: "/images/share.png", twitter: "@shop", keywords: ["market", "", "fresh"] } });
        const home = app.meta(app.compiled.byName.home as spec.CompiledScreen, "en");
        const offers = app.meta(app.compiled.byName.offers as spec.CompiledScreen, "en");
        const named = ( meta: spec.Meta, name: string ): string | undefined => meta.tags.map(( tag ) => ("name" in tag && tag.name === name) || ("property" in tag && tag.property === name) ? tag.content : undefined).find(( content ) => content !== undefined);

        expect([home.description, offers.description, home.keywords, named(home, "keywords"), named(home, "og:image"), named(home, "twitter:site"), named(home, "twitter:card"), home.canonical]).toEqual(["The whole market in one place", "Every offer of the week", ["market", "fresh"], "market, fresh", "https://shop.example.test/images/share.png", "@shop", "summary_large_image", "https://shop.example.test"]);
        expect(home.tags.some(( tag ) => "rel" in tag && tag.rel === "canonical")).toBe(true);
        expect(booted({ name: "Shop", tagline: "Fresh every day", url: "https://shop.example.test" }).meta(app.compiled.byName.home as spec.CompiledScreen, "en").description).toBe("Fresh every day");

    });
    it("seeds and a role's assets merge by key, each file read from its own folder, and the app answers every key with its served address", () => {

        const seeds = { messages: { en: { hello: "Hi", bye: "Bye" } }, assets: { home: "/part/seeds/assets", images: { logo: "images/logo.svg", hero: { home: "images/hero.gif" } }, security: { "security.txt": "security/security.txt" } } };
        const shop = spec.surface({ schema: screens, config: { contents: { url: "https://shop.example.test", logo: { asset: "images.logo" }, icon: "https://cdn.example.test/icon.svg", seo: { image: { asset: "images.hero.home" } } } }, messages: { en: { hello: "Hello" } }, assets: { home: "/part/specs/shop/assets/", images: { logo: "images/mark.png", extra: "images/extra.png" } } });
        const built = spec.build(spec.define({ shop }), part, { seeds, served: "/_files/", places: { fonts: "/type", paint: "/paint.js" } });
        const one = built.surface("shop");
        const app = spec.boot(JSON.parse(JSON.stringify(built.artifact("shop"))), { sinks: [] }).app;
        const first = app.theme();

        expect(one.files.map(( file ) => [file.key, file.from, file.to, file.at])).toEqual([
            ["images.logo", "/part/specs/shop/assets/images/mark.png", "images/logo.png", "specs.shop.assets.images.logo"],
            ["images.hero.home", "/part/seeds/assets/images/hero.gif", "images/hero/home.gif", "seeds.assets.images.hero.home"],
            ["security.security.txt", "/part/seeds/assets/security/security.txt", "security/security.txt", "seeds.assets.security.security.txt"],
            ["images.extra", "/part/specs/shop/assets/images/extra.png", "images/extra.png", "specs.shop.assets.images.extra"],
        ]);
        expect([app.asset("images.logo"), app.asset("images.hero.home"), app.asset("images.ghost"), app.asset(""), app.asset("https://cdn.example.test/a.png"), app.asset("constructor")]).toEqual(["/_files/shop/images/logo.png", "/_files/shop/images/hero/home.gif", "", "", "https://cdn.example.test/a.png", ""]);
        expect([app.content("logo", "en"), app.content("icon", "en"), app.text("en", "hello"), app.text("en", "bye"), app.site("en")?.image]).toEqual(["/_files/shop/images/logo.png", "https://cdn.example.test/icon.svg", "Hello", "Bye", "/_files/shop/images/hero/home.gif"]);
        expect([first === app.theme(), first, app.publish === spec.publish]).toEqual([true, spec.theme(app.config.themes), true]);
        expect([app.place("paint"), app.place("fonts"), app.place("ghost"), spec.boot(JSON.parse(JSON.stringify(spec.build(spec.define({ shop }), part).artifact("shop"))), { sinks: [] }).app.place("paint")]).toEqual(["/paint.js", "/type", "", ""]);
        expect(spec.build(spec.define({ shop }), part, { seeds: { messages: { en: { a: "1" }, ar: { b: "2" } } } }).surface("shop").compiled.issues.map(( issue ) => [issue.path, issue.rule])).toEqual([["seeds.messages.en.b", "messages.keys"], ["seeds.messages.ar.a", "messages.keys"]]);
        expect(spec.assets(undefined)).toEqual({});
        expect(() => spec.assets({ images: { logo: "a.svg" } })).toThrow("assets.home: name the folder of these files");
        expect(spec.filed([{ given: { home: "/a", x: { y: "y.txt" } }, at: "here" }], "id").urls).toEqual({ "x.y": "/id/x/y.txt" });

    });
    it("the role's identity is told as structured data: its logo, contacts, address and social pages", () => {

        const app = booted({ name: "Shop", tagline: "Fresh every day", url: "https://shop.example.test", logo: "/images/logo.svg", email: "hello@shop.example.test", phone: "+20 100 000 0000", address: "12 Market Street, Cairo", socials: [{ name: "github", href: "https://github.com/shop" }, { name: "empty" }] });
        const told = JSON.parse(app.graph("en") ?? "null") as { "@graph"?: Record<string, unknown>[] } | Record<string, unknown>[];
        const things = Array.isArray(told) ? told : told["@graph"] ?? [told as Record<string, unknown>];
        const found = things.find(( thing ) => thing["@type"] === "Organization");

        expect(found).toMatchObject({ name: "Shop", url: "https://shop.example.test", logo: "https://shop.example.test/images/logo.svg", description: "Fresh every day", email: "hello@shop.example.test", telephone: "+20 100 000 0000", address: "12 Market Street, Cairo", sameAs: ["https://github.com/shop"] });
        expect(things.some(( thing ) => thing["@type"] === "WebSite")).toBe(true);
        expect(booted({ name: "Shop" }).graph("en")).toBeUndefined();

    });
    it("the crawl rules come from the contents, default to everything, and close a surface with no public address", () => {

        expect(booted({ name: "Shop", url: "https://shop.example.test" }).crawl()).toBe("User-agent: *\nAllow: /\n\nSitemap: https://shop.example.test/sitemap.xml\n");
        expect(booted({ name: "Shop", url: "https://shop.example.test", seo: { robots: { allow: ["/"], disallow: ["/account", "/cart"] } } }).crawl()).toBe("User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /cart\n\nSitemap: https://shop.example.test/sitemap.xml\n");
        expect(booted({ name: "Shop" }).crawl()).toBe("User-agent: *\nDisallow: /\n");

    });
    it("the engine names the contents a role may fill, and a stranger is refused", () => {

        const settled = spec.settle(part, spec.surface({ schema: [], config: { contents: { email: "hello@shop.example.test", socials: [{ name: "github", href: "https://github.com/shop" }], seo: { keyword: ["x"] }, slogan: "x" } } }));

        expect(settled.issues.map(( issue ) => [issue.path, issue.rule, issue.near])).toEqual([["config.contents.seo.keyword", "config.unknown", "keywords"], ["config.contents.slogan", "config.unknown", "logo"]]);
        expect([settled.config.contents.email, settled.config.contents.socials]).toEqual(["hello@shop.example.test", [{ name: "github", href: "https://github.com/shop" }]]);

    });

    it("a localized surface carries the language in the address: the default has no prefix, a supported one is read, a stranger is sent to the default", () => {

        const pages = [spec.screen("home", { path: "/", title: { en: "Home", ar: "الرئيسية" } }), spec.screen("offers", { path: "/offers", title: { en: "Offers", ar: "العروض" } })];
        const made = ( localization: boolean ): spec.App => spec.boot(JSON.parse(JSON.stringify(spec.build(spec.define({ shop: spec.surface({ schema: pages, config: { settings: { locales: ["en", "ar"], locale: "en", localization }, contents: { name: "Shop", url: "https://shop.example.test" } } }) }), part).artifact("shop"))), { sinks: [] }).app;
        const app = made(true);
        const plain = made(false);

        expect(app.routes()).toEqual(["/", "/offers", "/en", "/en/offers", "/ar", "/ar/offers"]);
        expect([app.locate("/offers"), app.locate("/ar/offers"), app.locate("/ar"), app.locate("/en/offers"), app.locate("/fr/offers"), app.locate("/fr"), app.locate("/missing")]).toEqual([
            { locale: "en", path: "/offers", moved: false },
            { locale: "ar", path: "/offers", moved: false },
            { locale: "ar", path: "/", moved: false },
            { locale: "en", path: "/offers", moved: false },
            { locale: "en", path: "/offers", moved: true },
            { locale: "en", path: "/", moved: true },
            { locale: "en", path: "/missing", moved: false },
        ]);
        expect([app.href("/offers", "en"), app.href("/offers", "ar"), app.href("/", "ar"), app.href("/offers", "fr")]).toEqual(["/offers", "/ar/offers", "/ar", "/offers"]);

        const arabic = app.meta(app.compiled.byName.offers as spec.CompiledScreen, "ar");

        expect([arabic.canonical, arabic.alternates]).toEqual(["https://shop.example.test/ar/offers", [{ locale: "en", href: "https://shop.example.test/offers" }, { locale: "ar", href: "https://shop.example.test/ar/offers" }, { locale: "x-default", href: "https://shop.example.test/offers" }]]);
        expect([plain.routes(), plain.locate("/ar/offers"), plain.href("/offers", "ar"), plain.meta(plain.compiled.byName.offers as spec.CompiledScreen, "ar").alternates.length]).toEqual([["/", "/offers"], { locale: "en", path: "/offers", moved: true }, "/offers", 2]);

    });

});
