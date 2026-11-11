import { describe, expect, test as it } from "bun:test";
import * as translate from "engine/translate";
import * as fc from "fast-check";

const runs = 10_000;
const key = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
const routing: translate.Routing = { locales: ["ar", "en", "fr-FR"], default: "ar" };
const shown: translate.Routing = { ...routing, hide: false };
const segment = fc.stringMatching(/^[a-z]{4,8}$/);
const plain = fc.string({ maxLength: 48 }).filter(( text ) => !/[{:]/.test(text));

describe("fuzz translate", () => {

    it("locale readers never throw and negotiation lands on a supported tag or the fallback", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 32 }), fc.array(fc.constantFrom("ar", "en", "fr", "de-DE", "ar-EG"), { maxLength: 4 }), ( text, supported ) => {

                translate.split(text);
                translate.tag(text);
                translate.language(text);
                translate.region(text);
                expect(["ltr", "rtl"]).toContain(translate.direction(text));
                expect([...supported, "en"]).toContain(translate.negotiate(text, supported, "en"));

            }),
            { numRuns: runs },
        );

    });
    it("plural and interpolation accept any message", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 48 }), fc.integer(), fc.constantFrom("ar", "en"), ( message, count, locale ) => {

                expect(typeof translate.plural(message, count, locale)).toBe("string");
                expect(typeof translate.translate({ key: message }, locale).t("key", { n: count, s: message, none: null, off: undefined }, count)).toBe("string");

            }),
            { numRuns: runs },
        );

    });
    it("every flattened key is found again in its tree", () => {

        fc.assert(
            fc.property(fc.dictionary(key, fc.oneof(fc.string({ maxLength: 12 }), fc.dictionary(key, fc.string({ maxLength: 12 }), { maxKeys: 3 })), { maxKeys: 5 }), ( messages ) => {

                const made = translate.translate(messages, "en");

                for ( const [path] of Object.entries(translate.flatten(messages)) ) expect(made.has(path)).toBe(true);

            }),
            { numRuns: 2_000 },
        );

    });
    it("a miss answers its key, a hit answers the same through find, and nothing to fill keeps the text", () => {

        fc.assert(
            fc.property(fc.dictionary(key, plain, { maxKeys: 5 }), key, fc.string({ maxLength: 48 }), plain, ( messages, other, message, value ) => {

                const made = translate.translate(messages, "en");

                for ( const [name, held] of Object.entries(messages) ) expect([made.t(name), made.find(name), made.has(name)]).toEqual([held, held, true]);

                if ( !Object.hasOwn(messages, other) ) expect([made.t(other), made.find(other), made.has(other)]).toEqual([other, undefined, false]);

                expect(translate.interpolate(message, {})).toBe(message);
                expect(translate.interpolate("{a}|:a", { a: value })).toBe(`${value}|${value}`);

            }),
            { numRuns: runs },
        );

    });
    it("any path stays rooted on the site and lands on a routed locale", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 64 }), fc.constantFrom("ar", "en", "fr-FR", "fr", "de", "!", ""), fc.boolean(), ( path, locale, hide ) => {

                const rules = hide ? routing : shown;
                const read = translate.localeOfPath(path, rules);
                const made = translate.routeOf(path, locale, rules);

                expect(routing.locales).toContain(read.locale);
                expect(read.path.startsWith("/") && !read.path.startsWith("//") && read.path[1] !== "\\").toBe(true);
                expect(made.startsWith("/") && !made.startsWith("//") && made[1] !== "\\").toBe(true);
                expect(/[\t\r\n]/.test(made.split(/[?#]/)[0] ?? "")).toBe(false);

            }),
            { numRuns: runs },
        );

    });
    it("a clean path reads back the locale it was routed to", () => {

        fc.assert(
            fc.property(fc.array(segment, { maxLength: 4 }), fc.constantFrom("ar", "en", "fr-FR"), fc.boolean(), ( segments, locale, hide ) => {

                const rules = hide ? routing : shown;
                const path = `/${segments.join("/")}`;
                const made = translate.routeOf(path, locale, rules);

                expect(translate.localeOfPath(made, rules)).toEqual({ locale, path });
                expect(translate.routeOf(made, locale, rules)).toBe(made);
                expect(made === `/${locale}` || made.startsWith(`/${locale}/`)).toBe(!(hide && locale === "ar"));

            }),
            { numRuns: runs },
        );

    });
    it("names, lists and formats answer text for any locale", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 24 }), fc.string({ maxLength: 24 }), fc.double(), ( text, locale, amount ) => {

                expect(typeof translate.languageName(text, locale)).toBe("string");
                expect(typeof translate.localeName(text, locale)).toBe("string");
                expect(typeof translate.regionName(text, locale)).toBe("string");
                expect(typeof translate.isTimeZone(text)).toBe("boolean");
                expect(typeof translate.formatList([text, locale], locale)).toBe("string");
                expect(typeof translate.formatNumber(amount, locale)).toBe("string");
                expect(typeof translate.formatPercent(amount, locale)).toBe("string");
                expect(typeof translate.formatRange(text, locale, locale)).toBe("string");
                expect(typeof translate.formatRange(amount, 0, locale)).toBe("string");

            }),
            { numRuns: 2_000 },
        );

    });
    it("negotiation over a list lands on a supported tag or the fallback", () => {

        fc.assert(
            fc.property(fc.array(fc.oneof(fc.string({ maxLength: 12 }), fc.constantFrom("ar", "en-US", "fr;q=0.5", "zh-TW", "*")), { maxLength: 6 }), fc.array(fc.constantFrom("ar", "en", "fr", "zh-Hant", "zh-Hans", "!"), { maxLength: 4 }), ( accept, supported ) => {

                const picked = translate.negotiate(accept, supported, "fallback");

                expect([...supported.filter(( item ) => item !== "!"), "fallback"]).toContain(picked);
                expect(translate.negotiate(accept.join(","), supported, "fallback")).toBe(picked);

            }),
            { numRuns: runs },
        );

    });

});
