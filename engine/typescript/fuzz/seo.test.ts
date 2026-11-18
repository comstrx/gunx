import { describe, expect, test as it } from "bun:test";
import * as seo from "engine/seo";
import * as fc from "fast-check";

const runs = 2_000;
const root = "https://acme.example";
const site: seo.Site = { name: "Acme", url: root, locale: "en", locales: ["en", "ar"] };
const kinds = new Set(["website", "article", "product", "profile"]);
const path = fc.stringMatching(/^\/[a-z0-9/_-]{0,24}$/);
const anyPath = fc.string({ maxLength: 48 });
const text = fc.string({ maxLength: 64 });
const cleanPath = /^(?:\/[^\s/?#\\<>"]+)*(?:\?[^\s#<>"\\]*)?$/;

function control ( letter: string ): boolean {

    const code = letter.charCodeAt(0);

    return code < 32 || code === 127;

}
function clean ( value: string ): boolean {

    return ![...value].some(control);

}

describe("fuzz seo", () => {

    it("metadata, canonical, robots and the sitemap accept any text, strip control characters and stay well formed", () => {

        fc.assert(
            fc.property(text, text, anyPath, text, fc.array(text, { maxLength: 4 }), ( title, description, at, name, keywords ) => {

                fc.pre([...name].filter(( letter ) => !control(letter)).join("").trim() !== "");

                const made = seo.metadata({ ...site, name, description }, { title, description, path: at, keywords, type: title as never, image: description });

                expect([clean(made.title), clean(made.description ?? ""), made.keywords.every(clean), clean(made.canonical), kinds.has(made.openGraph["og:type"] ?? "")]).toEqual([true, true, true, true, true]);
                expect(made.canonical.startsWith(`${root}/en`)).toBe(true);
                expect(made.canonical.slice(`${root}/en`.length)).toMatch(cleanPath);
                expect(made.canonical.includes("/../") || made.canonical.includes("/./") || made.canonical.endsWith("/..") || made.canonical.includes("\\")).toBe(false);
                expect(seo.tags(made).every(( tag ) => clean("content" in tag ? tag.content : tag.href))).toBe(true);
                expect(made.alternates.map(( link ) => link.locale)).toEqual(["en", "ar", "x-default"]);
                expect(seo.robots(site, { disallow: [at], agents: { [name]: { allow: [at] } } }).split("\n").every(( line ) => clean(line) && (line === "" || /^(User-agent|Allow|Disallow|Crawl-delay|Sitemap): \S/.test(line)))).toBe(true);

                const map = seo.sitemap(site, [{ path: at, images: [description] }]);

                expect([map.startsWith("<?xml"), map.includes("<urlset"), map.endsWith("</urlset>"), (map.match(/<url>/g) ?? []).length, clean(map)]).toEqual([true, true, true, 2, true]);
                expect(seo.titleOf([title, description]).includes("undefined")).toBe(false);

            }),
            { numRuns: runs },
        );

    });
    it("json-ld is parseable, carries no raw markup or line separators and round trips any page text", () => {

        fc.assert(
            fc.property(text, path, text, fc.double({ min: 0, max: 1e6, noNaN: true }).map(( value ) => Math.round(value * 100) / 100), ( title, at, answer, price ) => {

                const things = [seo.website(site), seo.webPage(site, { title, path: at, description: answer }), seo.breadcrumbs(site, [{ name: title, path: at }]), seo.faq([{ question: title, answer }]), seo.product(site, { name: title, path: at, price, currency: "EGP" })];
                const script = seo.jsonLd(...things);
                const parsed = JSON.parse(script) as Record<string, unknown>[];

                expect(/[<>&\u2028\u2029]/.test(script)).toBe(false);
                expect(parsed).toHaveLength(things.length);
                expect(parsed.map(( thing ) => thing["@context"])).toEqual(things.map(() => "https://schema.org"));
                expect(parsed[3]).toEqual({ "@context": "https://schema.org", ...things[3] });
                expect((parsed[4] as { offers: { price: string } }).offers.price).toBe(String(price));

            }),
            { numRuns: runs },
        );

    });
    it("ancestors are the prefixes of the cleaned path and end at the canonical path", () => {

        fc.assert(
            fc.property(anyPath, ( at ) => {

                const bare = at.replace(/[?#].*$/, "");
                const found = seo.ancestors(bare);
                const tail = seo.canonical(root, bare).slice(root.length);

                expect(found[0]).toBe("/");
                expect(found[found.length - 1]).toBe(tail === "" ? "/" : tail);

                for ( let index = 1; index < found.length; index += 1 ) {

                    const previous = found[index - 1] as string;
                    const current = found[index] as string;

                    expect(current.startsWith(previous === "/" ? "/" : `${previous}/`)).toBe(true);
                    expect(current.split("/").length).toBe(index + 1);

                }

            }),
            { numRuns: runs },
        );

    });
    it("summary never exceeds its limit, never keeps a tag and returns the whole text when it fits", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 400, unit: fc.constantFrom(" ", "a", "b", ".", ",", "<p>", "</p>", "&amp;", "<", ">") }), fc.integer({ min: 1, max: 300 }), ( raw, limit ) => {

                const made = seo.summary(raw, limit);

                expect(made.length <= limit).toBe(true);
                expect(/<\/?p>/.test(made)).toBe(false);
                expect(made.includes("&amp;")).toBe(false);

                const whole = seo.summary(raw, 10_000);

                if ( whole.length <= limit ) expect(made).toBe(whole);
                else expect(made.endsWith("…")).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("sitemaps carry every row of the single sitemap, split by room and index every file", () => {

        fc.assert(
            fc.property(fc.array(fc.record({ path, localized: fc.boolean(), priority: fc.option(fc.integer({ min: -2, max: 3 }), { nil: undefined }) }), { maxLength: 20 }), fc.integer({ min: 1, max: 12 }), ( entries, room ) => {

                const whole = (seo.sitemap(site, entries).match(/<url>/g) ?? []).length;
                const files = seo.sitemaps(site, entries, room);
                const counts = files.map(( file ) => (file.match(/<url>/g) ?? []).length);

                expect(counts.reduce(( sum, count ) => sum + count, 0)).toBe(whole);
                expect(files.length >= 1 && (counts.length === 1 || counts.every(( count ) => count <= Math.max(room, 2)))).toBe(true);
                expect(files.every(( file ) => file.startsWith("<?xml") && file.endsWith("</urlset>"))).toBe(true);

                const index = seo.sitemapIndex(site, files.map(( _, at ) => `/sitemap-${at}.xml`));

                expect((index.match(/<sitemap>/g) ?? []).length).toBe(files.length);
                expect(seo.sitemap(site, entries).match(/<priority>(\d\.\d)<\/priority>/g)?.every(( found ) => Number(found.slice(10, 13)) >= 0 && Number(found.slice(10, 13)) <= 1) ?? true).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("directives always open with the index verdict, pair follow, and never cap snippets on a noindex page", () => {

        fc.assert(
            fc.property(fc.record({ index: fc.option(fc.boolean(), { nil: undefined }), follow: fc.option(fc.boolean(), { nil: undefined }), snippet: fc.option(fc.oneof(fc.boolean(), fc.integer({ min: -5, max: 500 })), { nil: undefined }), imagePreview: fc.option(fc.constantFrom("none", "standard", "large", "huge"), { nil: undefined }), archive: fc.option(fc.boolean(), { nil: undefined }) }), ( given ) => {

                const made = seo.directives(given as seo.Directives);
                const parts = made.split(", ");

                expect(parts[0]).toBe(given.index === false ? "noindex" : "index");
                expect(parts[1]).toBe(given.follow === false ? "nofollow" : "follow");
                expect(new Set(parts).size).toBe(parts.length);

                if ( given.index === false ) expect(parts.some(( part ) => part.startsWith("max-"))).toBe(false);
                if ( given.index !== false && typeof given.snippet === "number" && given.snippet >= -1 ) expect(parts).toContain(`max-snippet:${given.snippet}`);
                if ( given.imagePreview === "huge" ) expect(made.includes("huge")).toBe(false);

            }),
            { numRuns: runs },
        );

    });

});
