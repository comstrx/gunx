import { describe, expect, test as it } from "bun:test";
import * as seo from "engine/seo";

const site: seo.Site = { name: "Acme", url: "https://acme.test/", locale: "ar", locales: ["ar", "en"], description: "Store", image: "https://acme.test/og.png", twitter: "acme" };

describe("seo", () => {

    it("metadata composes titles, canonicals, alternates and cards", () => {

        expect(seo.titleOf(["  Cart ", undefined, "", "Acme"])).toBe("Cart · Acme");
        expect(seo.canonical("https://a.io/", "/x/", "ar")).toBe("https://a.io/ar/x");
        expect(seo.canonical("https://a.io", "/")).toBe("https://a.io");
        expect(seo.canonical("https://a.io", "/", "en")).toBe("https://a.io/en");
        expect(seo.languageLinks(site, "/p")).toEqual([{ locale: "ar", href: "https://acme.test/ar/p" }, { locale: "en", href: "https://acme.test/en/p" }, { locale: "x-default", href: "https://acme.test/ar/p" }]);

        const page = seo.metadata(site, { title: "Cart", path: "/cart", type: "article", published: "2026-01-01" });

        expect(page.title).toBe("Cart · Acme");
        expect(page.description).toBe("Store");
        expect(page.canonical).toBe("https://acme.test/ar/cart");
        expect(page.robots).toContain("index");
        expect(page.openGraph).toMatchObject({ "og:type": "article", "og:locale": "ar", "og:image": "https://acme.test/og.png", "article:published_time": "2026-01-01" });
        expect(page.twitter).toMatchObject({ "twitter:card": "summary_large_image", "twitter:site": "@acme" });
        expect(seo.metadata(site, { noindex: true }).robots).toBe("noindex, nofollow");
        expect(seo.metadata({ name: "X", url: "https://x.io", locale: "en" }).twitter["twitter:card"]).toBe("summary");

    });
    it("robots, sitemap and manifest are well formed", () => {

        const text = seo.robots(site, { disallow: ["/admin"], agents: { GPTBot: { disallow: ["/"] } } });

        expect(text).toBe("User-agent: *\nAllow: /\nDisallow: /admin\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://acme.test/sitemap.xml\n");

        const xml = seo.sitemap(site, [{ path: "/", modified: "2026-03-01", frequency: "daily", priority: 1 }, { path: "/legal", localized: false }]);

        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><urlset')).toBe(true);
        expect(xml).toContain("<loc>https://acme.test/ar</loc><lastmod>2026-03-01</lastmod><changefreq>daily</changefreq><priority>1.0</priority>");
        expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://acme.test/en"/>');
        expect(xml).toContain("<url><loc>https://acme.test/legal</loc></url>");
        expect((xml.match(/<url>/g) ?? []).length).toBe(3);

        const manifest = JSON.parse(seo.manifest({ name: "Acme Store", theme: "#f60", background: "#fff", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }], lang: "ar", dir: "rtl" })) as Record<string, unknown>;

        expect(manifest).toEqual({ name: "Acme Store", short_name: "Acme Store", start_url: "/", display: "standalone", theme_color: "#f60", background_color: "#fff", lang: "ar", dir: "rtl", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] });

    });
    it("structured data serializes safely", () => {

        const text = seo.jsonLd(seo.organization(site, { sameAs: ["https://x.com/acme"] }), seo.website(site, "/search"));
        const graph = JSON.parse(text) as Record<string, unknown>[];

        expect(graph).toHaveLength(2);
        expect(graph[0]).toMatchObject({ "@context": "https://schema.org", "@type": "Organization", name: "Acme", logo: "https://acme.test/og.png", sameAs: ["https://x.com/acme"] });
        expect(graph[1]).toMatchObject({ "@type": "WebSite", potentialAction: { target: "https://acme.test/search?q={search_term_string}" } });
        expect(seo.jsonLd({ "@type": "Thing", name: "</script>" })).toContain("\\u003c/script\\u003e");
        expect(seo.breadcrumbs(site, [{ name: "Home", path: "/" }, { name: "Cart", path: "/cart" }]).itemListElement).toEqual([
            { "@type": "ListItem", position: 1, name: "Home", item: "https://acme.test/ar" },
            { "@type": "ListItem", position: 2, name: "Cart", item: "https://acme.test/ar/cart" },
        ]);
        expect(seo.webPage(site, { title: "Cart", path: "/cart" })).toMatchObject({ "@type": "WebPage", url: "https://acme.test/ar/cart", inLanguage: "ar" });
        expect(seo.product(site, { name: "Tea", path: "/p/tea", price: "12.50", currency: "EGP", available: false }).offers).toMatchObject({ price: "12.50", priceCurrency: "EGP", availability: "https://schema.org/OutOfStock" });

    });
    it("ancestors list every path above a page from the root", () => {

        expect(seo.ancestors("/shop/bags/leather")).toEqual(["/", "/shop", "/shop/bags", "/shop/bags/leather"]);
        expect(seo.ancestors("/")).toEqual(["/"]);
        expect([seo.ancestors("/a/../b"), seo.ancestors("/a b/c?x=1#y"), seo.ancestors("/a//b/"), seo.ancestors("a/./b")]).toEqual([["/", "/b"], ["/", "/a%20b", "/a%20b/c"], ["/", "/a", "/a/b"], ["/", "/a", "/a/b"]]);

    });
    it("names, descriptions, titles and keywords lose control characters and collapse; og:type falls back; an empty site name is refused", () => {

        const dirty: seo.Site = { ...site, name: "Acme\u0000\n  Store", description: " S\u0007tore \n\n here " };
        const made = seo.metadata(dirty, { title: " Ca\u0001rt ", type: "evil" as never, keywords: [" a ", "a", "", "\u0002", "b"], author: "\u0003", section: " S " });

        expect([made.title, made.description, made.openGraph["og:site_name"], made.openGraph["og:type"], made.keywords, made.openGraph["article:author"], made.openGraph["article:section"]]).toEqual(["Cart · Acme Store", "Store here", "Acme Store", "website", ["a", "b"], undefined, "S"]);
        expect([seo.organization(dirty).name, seo.website(dirty).name, (seo.article(dirty, { title: "T", path: "/t" }).publisher as { name: string }).name, seo.business(dirty).name]).toEqual(["Acme Store", "Acme Store", "Acme Store", "Acme Store"]);
        expect([seo.titleOf(["Acme", "Acme"]), seo.titleOf([]), seo.titleOf(["a", "b"], " | "), seo.metadata({ ...site, separator: " - " }, { title: "Cart" }).title, seo.metadata(site, { title: "Acme" }).title]).toEqual(["Acme", "", "a | b", "Cart - Acme", "Acme"]);
        expect(() => seo.metadata({ ...site, name: " \u0000 " })).toThrow(RangeError);

    });
    it("paths are cleaned: traversal, dots, backslashes, loose percents, fragments, control characters and protocol-relative paths", () => {

        const root = "https://a.io";

        expect(["/x?b=1&a=2#frag", "//evil.com/x", "/a/%zz", "/a\\b", "/a/./b/../c", "/\u0000a", "/a?", "/a?x=\u0001y", "/../../etc", "x", "", "/a/.hidden", "/ع ر"].map(( path ) => seo.canonical(root, path))).toEqual([
            `${root}/x?b=1&a=2`, `${root}/evil.com/x`, `${root}/a/%25zz`, `${root}/a/b`, `${root}/a/c`, `${root}/a`, `${root}/a`, `${root}/a?x=y`, `${root}/etc`, `${root}/x`, root, `${root}/a/.hidden`, `${root}/%D8%B9%20%D8%B1`,
        ]);
        expect(seo.canonical(root, "/x", "en-US")).toBe(`${root}/en-US/x`);
        expect(seo.canonical(root, "/a\uD800b/\uDC00")).toBe(`${root}/a%EF%BF%BDb/%EF%BF%BD`);
        expect(() => seo.canonical(root, "/", "e n")).toThrow(RangeError);

    });
    it("images and links refuse foreign schemes, accept absolute and protocol-relative targets and encode the rest", () => {

        const image = ( target: string ): string | undefined => seo.metadata({ name: "X", url: "https://x.io", locale: "en" }, { image: target }).openGraph["og:image"];

        expect(["//cdn.test/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "http://x.test/a b.png", "/a b.png", "  ", "///x", "mailto:a@b.c"].map(image)).toEqual(["https://cdn.test/x.png", undefined, undefined, "http://x.test/a%20b.png", "https://x.io/a%20b.png", undefined, "https://x.io/x", undefined]);
        expect(seo.metadata({ name: "X", url: "https://x.io", locale: "en" }, { image: "/a.png" }).twitter["twitter:card"]).toBe("summary_large_image");
        expect(seo.metadata({ name: "X", url: "https://x.io", locale: "en" }, { image: "/a.png", alt: " Alt " }).openGraph["og:image:alt"]).toBe("Alt");
        expect(seo.metadata({ name: "X", url: "https://x.io", locale: "en" }, { alt: "Alt" }).openGraph["og:image:alt"]).toBeUndefined();
        expect(["@acme", "acme me", "a".repeat(16), "", "a".repeat(15), "@@x_1"].map(( twitter ) => seo.metadata({ name: "X", url: "https://x.io", locale: "en", twitter }).twitter["twitter:site"])).toEqual(["@acme", undefined, undefined, undefined, `@${"a".repeat(15)}`, "@x_1"]);

    });
    it("directives cap counts, honor noindex over page directives and stamp unavailable_after", () => {

        expect([seo.directives({ snippet: 1e20 }), seo.directives({ snippet: -2 }), seo.directives({ snippet: -1, videoPreview: 3e9 }), seo.directives({ index: false, snippet: 5, imagePreview: "large" }), seo.directives({ until: "2026-01-01" }), seo.directives({ imagePreview: "huge" as never }), seo.directives({ archive: false, translate: false, snippet: false })]).toEqual([
            "index, follow, max-snippet:2147483647", "index, follow", "index, follow, max-snippet:-1, max-video-preview:2147483647", "noindex, follow", "index, follow, unavailable_after: 2026-01-01T00:00:00.000Z", "index, follow", "index, follow, noarchive, notranslate, nosnippet",
        ]);
        expect([seo.metadata(site, { noindex: true, robots: { index: true, follow: true } }).robots, seo.metadata(site, { noindex: true, robots: { snippet: 5 } }).robots, seo.metadata(site, { robots: { imagePreview: "none" } }).robots, seo.metadata(site).robots]).toEqual(["noindex, follow", "noindex, nofollow", "index, follow, max-image-preview:none", "index, follow, max-image-preview:large"]);

    });
    it("robots strips agent names, ceils and caps the crawl delay, skips empty agents and paths, lists sitemaps", () => {

        expect(seo.robots(site, { delay: 1e-7, agents: { "Bad\nBot": { disallow: ["/x\ny", " ", "/z"], allow: ["/z/ok"], delay: 1e9 }, "": { disallow: ["/"] }, " ": { allow: ["/"] } }, sitemaps: ["/a.xml", "//cdn.test/b.xml", "javascript:x", ""] })).toBe("User-agent: *\nAllow: /\nCrawl-delay: 1\n\nUser-agent: BadBot\nAllow: /z/ok\nDisallow: /xy\nDisallow: /z\nCrawl-delay: 86400\n\nSitemap: https://acme.test/a.xml\nSitemap: https://cdn.test/b.xml\n");
        expect(seo.robots(site, { sitemaps: [] })).toBe("User-agent: *\nAllow: /\n");
        expect(seo.robots(site, { allow: [], delay: Number.NaN })).toBe("User-agent: *\n\nSitemap: https://acme.test/sitemap.xml\n");

    });
    it("sitemaps refuse more than 50 000 rows, clamp priority, skip unknown frequencies, cap images, split by room and index files", () => {

        const many = Array.from({ length: 25_001 }, ( _, index ) => ({ path: `/p/${index}` }));

        expect(() => seo.sitemap(site, many)).toThrow(RangeError);
        expect((seo.sitemap(site, many.slice(0, 25_000)).match(/<url>/g) ?? []).length).toBe(50_000);
        expect(seo.sitemap(site, [{ path: "/", priority: 7, localized: false }, { path: "/", priority: -1, localized: false }, { path: "/", priority: Number.NaN, localized: false }, { path: "/", frequency: "sometimes" as never, localized: false }, { path: "/", modified: "2026-03-01T10:00:00Z", localized: false }])).toBe(`${seo.sitemap(site, []).slice(0, -9)}<url><loc>https://acme.test</loc><priority>1.0</priority></url><url><loc>https://acme.test</loc><priority>0.0</priority></url><url><loc>https://acme.test</loc></url><url><loc>https://acme.test</loc></url><url><loc>https://acme.test</loc><lastmod>2026-03-01</lastmod></url></urlset>`);
        expect(seo.sitemap(site, [{ path: "/", localized: false, images: ["/a.png", "//cdn.test/b.png", "", "<x>", "javascript:x"] }])).toContain('<url><loc>https://acme.test</loc><image:image><image:loc>https://acme.test/a.png</image:loc></image:image><image:image><image:loc>https://cdn.test/b.png</image:loc></image:image><image:image><image:loc>https://acme.test/%3Cx%3E</image:loc></image:image></url>');
        expect((seo.sitemap(site, [{ path: "/", localized: false, images: Array.from({ length: 1200 }, ( _, index ) => `/${index}.png`) }]).match(/<image:image>/g) ?? []).length).toBe(1000);
        expect(seo.sitemap(site, [{ path: "/a&b" }])).toContain("<loc>https://acme.test/ar/a&amp;b</loc>");
        expect((seo.sitemap(site, [{ path: "/a" }]).match(/hreflang="x-default" href="https:\/\/acme.test\/ar\/a"/g) ?? []).length).toBe(2);
        expect(seo.sitemap({ ...site, locales: ["ar"] }, [{ path: "/a" }])).toBe(`${seo.sitemap(site, []).slice(0, -9)}<url><loc>https://acme.test/ar/a</loc></url></urlset>`);
        expect(seo.sitemaps(site, Array.from({ length: 7 }, ( _, index ) => ({ path: `/p/${index}` })), 5).map(( one ) => (one.match(/<url>/g) ?? []).length)).toEqual([4, 4, 4, 2]);
        expect([seo.sitemaps(site, [], 5).length, seo.sitemaps(site, [{ path: "/a" }], Number.NaN).length, seo.sitemaps(site, [{ path: "/a" }], 1).map(( one ) => (one.match(/<url>/g) ?? []).length)]).toEqual([1, 1, [2]]);
        expect(seo.sitemapIndex(site, ["/sitemap-1.xml", { path: "/sitemap-2.xml", modified: "2026-03-01" }, "javascript:x", "//cdn.test/s.xml"])).toBe('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://acme.test/sitemap-1.xml</loc></sitemap><sitemap><loc>https://acme.test/sitemap-2.xml</loc><lastmod>2026-03-01</lastmod></sitemap><sitemap><loc>https://cdn.test/s.xml</loc></sitemap></sitemapindex>');

    });
    it("structured data validates prices, currencies, ratings and coordinates, appends search terms and escapes line separators", () => {

        expect(seo.product(site, { name: "T", path: "/t", price: 12.5, currency: "egp", image: ["/a.png", "/a.png", "javascript:x"], brand: "B", rating: { value: 4.5, count: 3, best: Number.NaN } })).toMatchObject({ image: ["https://acme.test/a.png"], brand: { "@type": "Brand", name: "B" }, aggregateRating: { ratingValue: 4.5, reviewCount: 3 }, offers: { price: "12.5", priceCurrency: "EGP", availability: "https://schema.org/InStock", url: "https://acme.test/ar/t" } });
        expect([() => seo.product(site, { name: "T", path: "/t", price: "1e3", currency: "EGP" }), () => seo.product(site, { name: "T", path: "/t", price: 1, currency: "EG" }), () => seo.product(site, { name: "T", path: "/t", price: -1, currency: "EGP" })].map(( work ) => { try { work(); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? String((caught as Error).message) : "?"; } })).toEqual(["not a price", "not a currency", "not a price"]);
        expect([seo.product(site, { name: "T", path: "/t", price: 1, currency: "EGP", rating: { value: 4.5, count: 0 } }).aggregateRating, seo.product(site, { name: "T", path: "/t", price: 1, currency: "EGP", rating: { value: Number.NaN, count: 2 } }).aggregateRating, seo.product(site, { name: "T", path: "/t", price: 1, currency: "EGP", image: [] }).image]).toEqual([undefined, undefined, undefined]);
        expect([seo.website(site, "/s?x=1").potentialAction, seo.website(site, "").potentialAction]).toEqual([{ "@type": "SearchAction", target: "https://acme.test/s?x=1&q={search_term_string}", "query-input": "required name=search_term_string" }, undefined]);
        expect(seo.business(site, { type: " Store ", point: { lat: 91, lng: 0 }, address: { city: "Cairo" }, hours: [], phone: "+201000000000" })).toEqual({ "@type": "Store", name: "Acme", url: "https://acme.test/ar", image: "https://acme.test/og.png", telephone: "+201000000000", address: { "@type": "PostalAddress", addressLocality: "Cairo" } });
        expect(seo.business(site, { point: { lat: 30, lng: 31 }, hours: ["Mo-Fr 09:00-17:00"] })).toMatchObject({ "@type": "LocalBusiness", geo: { "@type": "GeoCoordinates", latitude: 30, longitude: 31 }, openingHours: ["Mo-Fr 09:00-17:00"] });
        expect([seo.jsonLd(), seo.jsonLd({ "@type": "Thing", "@context": "evil", name: "\u2028&" }), seo.jsonLd({ "@type": "A" }, { "@type": "B" })]).toEqual(["[]", '{"@context":"https://schema.org","@type":"Thing","name":"\\u2028\\u0026"}', '[{"@context":"https://schema.org","@type":"A"},{"@context":"https://schema.org","@type":"B"}]']);
        expect(seo.article(site, { title: "T", path: "/t", published: "2026-01-01", author: "A" })).toMatchObject({ datePublished: "2026-01-01", dateModified: "2026-01-01", author: { "@type": "Person", name: "A" }, publisher: { "@type": "Organization", name: "Acme", logo: "https://acme.test/og.png" } });
        expect(seo.itemList(site, [{ path: "/a", name: "A" }, { path: "/b" }])).toEqual({ "@type": "ItemList", numberOfItems: 2, itemListElement: [{ "@type": "ListItem", position: 1, name: "A", url: "https://acme.test/ar/a" }, { "@type": "ListItem", position: 2, url: "https://acme.test/ar/b" }] });
        expect(seo.faq([{ question: "Q", answer: "A" }])).toEqual({ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "A" } }] });

    });
    it("summary strips tags, unescapes entities, cuts at a word, trims trailing punctuation and survives junk limits", () => {

        expect([seo.summary("<p>Hello <b>world</b> &amp; friends</p>", 10), seo.summary("a".repeat(200), 50).length, seo.summary("one two, three four five six", 12), seo.summary("x", 0), seo.summary("x", Number.NaN), seo.summary("short text"), seo.summary("<unclosed tag", 5), seo.summary("")]).toEqual(["Hello wor…", 50, "one two…", "x", "x", "short text", "<unc…", ""]);

    });
    it("locale shapes: a hidden default locale drops its prefix, underscores become hyphens, duplicates collapse, og:locale alternates follow", () => {

        const hidden: seo.Site = { name: "X", url: "https://x.io", locale: "en-US", locales: ["en-US", "en_us", "ar", "fr-ca"], hide: true };

        expect(seo.languageLinks(hidden, "/p")).toEqual([{ locale: "en-US", href: "https://x.io/p" }, { locale: "ar", href: "https://x.io/ar/p" }, { locale: "fr-ca", href: "https://x.io/fr-ca/p" }, { locale: "x-default", href: "https://x.io/p" }]);
        expect(seo.languageLinks({ ...hidden, default: "ar" }, "/p")).toEqual([{ locale: "en-US", href: "https://x.io/en-US/p" }, { locale: "ar", href: "https://x.io/p" }, { locale: "fr-ca", href: "https://x.io/fr-ca/p" }, { locale: "x-default", href: "https://x.io/p" }]);
        expect([seo.metadata(hidden).openGraph["og:locale"], seo.metadata({ ...hidden, locale: "ar_EG" }).openGraph["og:locale"], seo.metadata({ ...hidden, locale: "zh-Hant-TW" }).openGraph["og:locale"]]).toEqual(["en_US", "ar_EG", "zh_TW"]);
        expect(seo.tags(seo.metadata(hidden)).filter(( tag ) => "property" in tag && tag.property === "og:locale:alternate").map(( tag ) => ("content" in tag ? tag.content : ""))).toEqual(["ar", "fr_CA"]);
        expect(() => seo.metadata({ ...hidden, locales: ["en-US", "e n"] })).toThrow(RangeError);
        expect(() => seo.metadata({ ...hidden, default: "x y" })).toThrow(RangeError);

    });
    it("site urls: trailing slashes trimmed, base paths kept and encoded, credentials, spaces, queries and foreign schemes refused; the shape cache refreshes on any field change", () => {

        expect([seo.metadata({ name: "X", url: "https://x.io/base//", locale: "en" }, { path: "/p" }).canonical, seo.metadata({ name: "X", url: " https://x.io/ba%20se/ ", locale: "en" }).canonical, seo.metadata({ name: "X", url: "https://x.io/ba%zz/", locale: "en" }).canonical]).toEqual(["https://x.io/base/en/p", "https://x.io/ba%20se/en", "https://x.io/ba%25zz/en"]);
        expect(["ftp://x.io", "https://user:pw@x.io", "https://x.io?x=1", "https://x.io#x", "x.io", "https://", "https://x.io\u0000", "https://x.io/ba se"].map(( url ) => { try { seo.metadata({ name: "X", url, locale: "en" }); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(["refused", "refused", "refused", "refused", "refused", "refused", "refused", "refused"]);

        const first = seo.metadata({ name: "X", url: "https://x.io", locale: "en", locales: ["en", "ar"] });
        const second = seo.metadata({ name: "Y", url: "https://x.io", locale: "en", locales: ["en", "fr"], hide: true });

        expect([first.alternates.map(( link ) => link.href), second.alternates.map(( link ) => link.href), second.title]).toEqual([["https://x.io/en", "https://x.io/ar", "https://x.io/en"], ["https://x.io", "https://x.io/fr", "https://x.io"], "Y"]);

    });
    it("tags render description, keywords, robots, canonical, alternates, open graph, article tags and twitter in order", () => {

        const made = seo.tags(seo.metadata(site, { title: "Cart", type: "article", keywords: ["a", "b"], path: "/cart" }));
        const names = made.map(( tag ) => "name" in tag ? tag.name : "property" in tag ? tag.property : `${tag.rel}:${tag.hreflang ?? ""}`);

        expect(names).toEqual(["description", "keywords", "robots", "canonical:", "alternate:ar", "alternate:en", "alternate:x-default", "og:type", "og:title", "og:url", "og:site_name", "og:locale", "og:description", "og:image", "og:locale:alternate", "article:tag", "article:tag", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:site"]);
        expect(made[1]).toEqual({ name: "keywords", content: "a, b" });
        expect(seo.tags(seo.metadata(site, { title: "Cart", keywords: ["a", "b"] })).some(( tag ) => "property" in tag && tag.property === "article:tag")).toBe(false);
        expect(seo.tags(seo.metadata({ name: "X", url: "https://x.io", locale: "en" })).map(( tag ) => "name" in tag ? tag.name : "property" in tag ? tag.property : tag.rel)).toEqual(["robots", "canonical", "alternate", "alternate", "og:type", "og:title", "og:url", "og:site_name", "og:locale", "twitter:card", "twitter:title"]);

    });
});
