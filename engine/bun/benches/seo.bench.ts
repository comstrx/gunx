import * as seo from "engine/seo";
import { bench, do_not_optimize, run } from "mitata";

const site: seo.Site = { name: "Acme", url: "https://acme.test", locale: "ar", locales: ["ar", "en"], description: "Store", image: "/og.png", twitter: "acme" };
const entries = Array.from({ length: 200 }, ( _, index ) => ({ path: `/p/${index}`, modified: "2026-03-01" }));
const thousand = Array.from({ length: 1000 }, ( _, index ) => ({ path: `/p/${index}`, modified: "2026-03-01", images: ["/a.png"] }));
const files = Array.from({ length: 50 }, ( _, index ) => ({ path: `/sitemap-${index}.xml`, modified: "2026-03-01" }));
const long = `<p>${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40)}</p>`;
const crumbs = [{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }, { name: "Bags", path: "/shop/bags" }, { name: "Leather", path: "/shop/bags/leather" }, { name: "Tote", path: "/shop/bags/leather/tote" }];
const questions = Array.from({ length: 10 }, ( _, index ) => ({ question: `Question ${index}?`, answer: `Answer ${index}.` }));
const page = seo.metadata(site, { title: "Cart", path: "/cart", type: "article", keywords: ["a", "b", "c"] });

bench("seo.metadata", () => do_not_optimize(seo.metadata(site, { title: "Cart", path: "/cart" })));
bench("seo.metadata article", () => do_not_optimize(seo.metadata(site, { title: "Post", path: "/blog/post", type: "article", published: "2026-01-01", keywords: ["a", "b"], image: "/post.png", alt: "Post" })));
bench("seo.metadata noindex", () => do_not_optimize(seo.metadata(site, { title: "Account", path: "/account", noindex: true })));
bench("seo.tags", () => do_not_optimize(seo.tags(page)));
bench("seo.canonical easy", () => do_not_optimize(seo.canonical("https://acme.test", "/shop/bags", "ar")));
bench("seo.canonical dirty", () => do_not_optimize(seo.canonical("https://acme.test", "/shop/../bags\\x/%zz?q=a b#top", "ar")));
bench("seo.languageLinks", () => do_not_optimize(seo.languageLinks(site, "/shop")));
bench("seo.titleOf", () => do_not_optimize(seo.titleOf(["  Cart ", undefined, "Shop", "Acme"])));
bench("seo.summary 2k", () => do_not_optimize(seo.summary(long)));
bench("seo.directives", () => do_not_optimize(seo.directives({ imagePreview: "large", snippet: 160, until: "2026-12-31" })));
bench("seo.robots", () => do_not_optimize(seo.robots(site, { disallow: ["/admin", "/cart"], agents: { GPTBot: { disallow: ["/"] }, Bingbot: { delay: 2 } } })));
bench("seo.sitemap.200", () => do_not_optimize(seo.sitemap(site, entries)));
bench("seo.sitemaps.1000 by 200", () => do_not_optimize(seo.sitemaps(site, thousand, 200)));
bench("seo.sitemapIndex.50", () => do_not_optimize(seo.sitemapIndex(site, files)));
bench("seo.manifest", () => do_not_optimize(seo.manifest({ name: "Acme Store", theme: "#f60", background: "#fff", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }], lang: "ar", dir: "rtl", shortcuts: [{ name: "Cart", url: "/cart" }] })));
bench("seo.jsonLd", () => do_not_optimize(seo.jsonLd(seo.organization(site), seo.website(site, "/search"))));
bench("seo.product", () => do_not_optimize(seo.product(site, { name: "Tea", path: "/p/tea", price: "12.50", currency: "EGP", image: ["/a.png", "/b.png"], brand: "Acme", rating: { value: 4.5, count: 12 } })));
bench("seo.article", () => do_not_optimize(seo.article(site, { title: "Post", path: "/blog/post", published: "2026-01-01", author: "A" })));
bench("seo.breadcrumbs.5", () => do_not_optimize(seo.breadcrumbs(site, crumbs)));
bench("seo.faq.10", () => do_not_optimize(seo.faq(questions)));
bench("seo.business", () => do_not_optimize(seo.business(site, { point: { lat: 30.04, lng: 31.24 }, address: { city: "Cairo", country: "EG" }, hours: ["Mo-Fr 09:00-17:00"] })));
bench("seo.ancestors deep", () => do_not_optimize(seo.ancestors("/shop/bags/leather/tote/brown?x=1")));

await run();
