import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as translate from "engine/translate";
import * as value from "engine/value";

const dictionaries: translate.Dictionaries = {
    en: {
        hello: "Hello {name}",
        items: "no items|one item|{count} items",
        apples: "{0} none|[1,1] one apple|[2,*] :count apples",
        nested: { deep: "Deep :value" },
        codes: { not_found: "Not here" },
        faults: { "cart.empty": "Your cart is empty" },
        validation: { required: "{field} is required" },
    },
    ar: {
        hello: "أهلاً {name}",
        items: "zero:لا عناصر|one:عنصر واحد|two:عنصران|few:{count} عناصر|many:{count} عنصرًا|other:{count} عنصر",
        nested: { deep: "عميق :value" },
    },
    "ar-EG": { hello: "إزيك يا {name}" },
};

function bare ( text: string ): string {

    return text.replace(/[\u200e\u200f\u061c]/g, "");

}

describe("translate", () => {

    it("dictionaries resolve with fallback, params and plurals", () => {

        const en = translate.dictionary(dictionaries, "en");
        const ar = en.use("ar");
        const egypt = en.use("ar-EG");

        expect(en.t("hello", { name: "Ann" })).toBe("Hello Ann");
        expect(en.t("nested.deep", { value: 1 })).toBe("Deep 1");
        expect(en.t("missing.key")).toBe("missing.key");
        expect(en.missing()).toEqual(["missing.key"]);
        expect(en.has("hello") && !en.has("nope") && en.has("hello", "ar")).toBe(true);
        expect(en.locales()).toEqual(["ar", "ar-EG", "en"]);
        expect(en.t("items", {}, 0)).toBe("no items");
        expect(en.t("items", {}, 1)).toBe("one item");
        expect(en.t("items", {}, 5)).toBe("5 items");
        expect(en.t("apples", {}, 0)).toBe("none");
        expect(en.t("apples", {}, 1)).toBe("one apple");
        expect(en.t("apples", {}, 7)).toBe("7 apples");
        expect(ar.t("hello", { name: "علي" })).toBe("أهلاً علي");
        expect([0, 1, 2, 3, 11, 100].map(( count ) => ar.t("items", {}, count))).toEqual(["لا عناصر", "عنصر واحد", "عنصران", "3 عناصر", "11 عنصرًا", "100 عنصر"]);
        expect(ar.t("codes.not_found")).toBe("Not here");
        expect(egypt.t("hello", { name: "x" })).toBe("إزيك يا x");
        expect(egypt.t("nested.deep", { value: 2 })).toBe("عميق 2");
        expect(egypt.locale).toBe("ar-EG");
        expect(translate.plural("a|b", 1, "en")).toBe("a");
        expect(translate.plural("a|b", 2, "en")).toBe("b");
        expect(translate.plural("only", 9, "en")).toBe("only");
        expect(translate.flatten(dictionaries.en ?? {})["nested.deep"]).toBe("Deep :value");
        expect(translate.missing(dictionaries, "en").ar).toContain("apples");
        expect(translate.has(dictionaries, "ar", "items")).toBe(true);
        expect(translate.translate({ hi: "Hi" }).t("hi")).toBe("Hi");

    });
    it("locales split, negotiate and name themselves", () => {

        expect(translate.split("ar_eg")).toEqual({ language: "ar", script: undefined, region: "EG", text: "ar-EG" });
        expect(translate.split("zh-hant-TW")?.text).toBe("zh-Hant-TW");
        expect(translate.split("!")).toBeUndefined();
        expect(translate.tag("EN_us")).toBe("en-US");
        expect(translate.language("ar-EG")).toBe("ar");
        expect(translate.region("ar")).toBeUndefined();
        expect(translate.direction("ar-SA")).toBe("rtl");
        expect(translate.direction("en")).toBe("ltr");
        expect(translate.negotiate("fr-CH, ar;q=0.8, en;q=0.9", ["en", "ar-EG"], "en")).toBe("en");
        expect(translate.negotiate("ar-SA", ["en", "ar-EG"], "en")).toBe("ar-EG");
        expect(translate.negotiate("de", ["en", "ar"], "ar")).toBe("ar");
        expect(translate.negotiate(undefined, ["en"], "en")).toBe("en");
        expect(translate.negotiate(["ar-EG"], ["ar-EG"], "en")).toBe("ar-EG");
        expect(translate.languageName("ar", "en")).toBe("Arabic");
        expect(translate.languageName("ar")).toBe("العربية");
        expect(translate.regionName("EG", "ar")).toBe("مصر");
        expect(translate.isTimeZone("Africa/Cairo") && !translate.isTimeZone("Nowhere/City")).toBe(true);
        expect(translate.formatList(["a", "b", "c"])).toBe("a, b, and c");
        expect(translate.formatList(["a", "b"], "ar", "or")).toBe("a أو b");

    });
    it("localizers format and translate faults", () => {

        const en = translate.dictionary(dictionaries, "en");
        const local = translate.localizer(en, "Africa/Cairo");

        expect(local.number(1234.5, { digits: 1 })).toBe("1,234.5");
        expect(local.money(value.money.of(10, "USD"))).toBe("$10.00");
        expect(local.date("2026-03-15T13:45:30Z", "clock")).toBe("15:45");
        expect(local.relative("2026-03-15T13:45:30Z", "2026-03-15T13:50:30Z")).toBe("5 minutes ago");
        expect(local.reason(error.fault("not_found", "cart.empty"))).toBe("Your cart is empty");
        expect(local.reason(error.fault("not_found", "other"))).toBe("Not here");
        expect(local.reason(error.fault("conflict"))).toBe("The request conflicts with the current state");
        expect(local.reason("boom")).toBe("boom");
        expect(local.field(error.fault("validation", "r", { errors: { email: ["required"] } }), "email")).toBe("email is required");
        expect(local.field(error.fault("validation", "r", { errors: { email: ["min_length:3"] } }), "email")).toBe("min_length:3");
        expect(local.field(new Error("x"), "email")).toBeUndefined();
        expect(translate.formatNumber(1234.5, "ar-EG-u-nu-arab")).toBe("١٬٢٣٤٫٥");
        expect(translate.formatMoney(value.money.of(5, "EGP"), "en")).toBe("EGP 5.00");
        expect(translate.formatDate("2026-03-15", "en", "YYYY/MM/DD")).toBe("2026/03/15");
        expect(translate.reason(error.fault("not_found", "cart.empty"), en)).toBe("Your cart is empty");

    });
    it("localized routes carry the locale as a prefix except the default, and date ranges speak the locale", () => {

        const routing: translate.Routing = { locales: ["ar", "en", "fr-FR"], default: "ar" };

        expect(translate.localeOfPath("/en/orders/7", routing)).toEqual({ locale: "en", path: "/orders/7" });
        expect(translate.localeOfPath("/fr/orders", routing)).toEqual({ locale: "fr-FR", path: "/orders" });
        expect(translate.localeOfPath("/orders", routing)).toEqual({ locale: "ar", path: "/orders" });
        expect(translate.localeOfPath("/", routing)).toEqual({ locale: "ar", path: "/" });
        expect(translate.routeOf("/orders", "ar", routing)).toBe("/orders");
        expect(translate.routeOf("/orders", "en", routing)).toBe("/en/orders");
        expect(translate.routeOf("/en/orders", "fr-FR", routing)).toBe("/fr-FR/orders");
        expect(translate.routeOf("/", "en", routing)).toBe("/en");
        expect(translate.routeOf("/x", "ar", { ...routing, hide: false })).toBe("/ar/x");
        expect(translate.formatRange("2026-03-01", "2026-03-05", "en", { month: "short", day: "numeric" })).toMatch(/^Mar 1\s*[–-]\s*5$/);
        expect(translate.formatRange("nope", "2026-03-05")).toBe("");

    });
    it("keys named like object members are plain misses and sheets hold own keys only", () => {

        const made = translate.translate({ hi: "Hi" });

        for ( const key of ["constructor", "toString", "__proto__", "constructor.name", "hasOwnProperty"] ) expect([made.t(key), made.has(key), made.find(key)]).toEqual([key, false, undefined]);

        expect(translate.interpolate("{__proto__} {constructor}", {})).toBe("{__proto__} {constructor}");

    });
    it("a locale walks script, region, language and the fallback, and has follows the same chain", () => {

        const world: translate.Dictionaries = {
            en: { a: "en", b: "en-b", c: "en-c", d: "en-d", days: "one:{count} day|other:{count} days", codes: { not_found: "Not here" } },
            ar: {},
            zh: { a: "zh", b: "zh-b", c: "zh-c" },
            "zh-Hant": { a: "hant" },
            "zh-TW": { a: "tw", b: "tw-b" },
            ar_eg: { hi: "x" },
        };
        const zh = translate.dictionary(world, "zh-Hant-TW", "en");
        const ar = translate.dictionary(world, "ar", "en");

        expect(["a", "b", "c", "d"].map(( key ) => zh.t(key))).toEqual(["hant", "tw-b", "zh-c", "en-d"]);
        expect([zh.locale, zh.fallback]).toEqual(["zh-Hant-TW", "en"]);
        expect(zh.locales()).toEqual(["ar", "ar_eg", "en", "zh", "zh-Hant", "zh-TW"]);
        expect(translate.dictionary(world, "ar-EG", "en").t("hi")).toBe("x");
        expect([ar.has("codes.not_found"), ar.has("codes.not_found", "ar"), ar.has("codes.not_found", "en"), ar.has("nope")]).toEqual([true, false, true, false]);
        expect([1, 2, 11].map(( count ) => ar.t("days", {}, count))).toEqual(["1 day", "2 days", "11 days"]);

        const live: translate.Dictionaries = { en: { a: "A" } };
        const fr = translate.dictionary(live, "fr", "en");

        expect(fr.t("a")).toBe("A");

        live.fr = { a: "Af" };

        expect(fr.t("a")).toBe("Af");
        expect(fr.locales()).toEqual(["en", "fr"]);

    });
    it("plurals read a count from the call or the params, and object leaves are plural forms", () => {

        const made = translate.translate({ days: "one:{count} day|other:{count} days", tabs: { one: "{count} tab", other: "{count} tabs" }, hello: "Hello {name}" });

        expect([made.t("days", { count: 5 }), made.t("days", { count: 1 }), made.t("days", {}, 1)]).toEqual(["5 days", "1 day", "1 day"]);
        expect([made.t("tabs", {}, 1), made.t("tabs", {}, 3), made.t("tabs"), made.has("tabs"), made.t("tabs.one")]).toEqual(["1 tab", "3 tabs", "{count} tabs", true, "{count} tab"]);
        expect(translate.missing({ en: { tabs: { one: "a", other: "b" }, solo: "x" }, ar: {} }, "en")).toEqual({ ar: ["tabs", "solo"] });
        expect([translate.plural("{0} none", 0), translate.plural("[1,3] few|[4,*] many", 2), translate.plural("[1,3] few|[4,*] many", 9), translate.plural("a|b|c", 0), translate.plural("a|b|c", 1), translate.plural("a|b|c", 2), translate.plural("", 1), translate.plural("one:x|other:y", 1, "!!")]).toEqual(["none", "few", "many", "a", "b", "c", "", "x"]);
        expect(made.find("hello", { name: "Ann" })).toBe("Hello Ann");
        expect(made.find("days", {}, 2)).toBe("2 days");
        expect(made.find("nope")).toBeUndefined();
        expect(made.missing()).toEqual([]);

        for ( let at = 0; at < 2000; at += 1 ) made.t(`gone.${at}`);

        expect([made.missing().length, made.missing()[0]]).toEqual([1024, "gone.0"]);

    });
    it("interpolation fills nested, numeric and colon names and keeps what it cannot fill", () => {

        expect(translate.interpolate("Hi {user.name}", { user: { name: "Ann" } })).toBe("Hi Ann");
        expect(translate.interpolate("{n}", { n: 10n })).toBe("10");
        expect(translate.interpolate("{a}{b}", { a: 1, b: 2 })).toBe("12");
        expect(translate.interpolate(":a-:b {c}", { a: "x", b: true })).toBe("x-true {c}");
        expect(translate.interpolate("{x} {y} {z}", { x: null, y: undefined, z: {} })).toBe("{x} {y} {z}");
        expect(translate.interpolate("{a}", { a: "{a}" })).toBe("{a}");
        expect(translate.interpolate("12:30 :a", { a: "z" })).toBe("12:30 z");
        expect(translate.interpolate(`${"x".repeat(1100)}{name}`, { name: "N" }).slice(-3)).toBe("xxN");

        const made = translate.translate({ hello: "Hello {name}" });

        expect([made.t("hello", { name: "A" }), made.t("hello", { name: "B" }), made.t("hello")]).toEqual(["Hello A", "Hello B", "Hello {name}"]);

    });
    it("locale readers refuse junk and direction follows the script before the language", () => {

        expect([translate.split("english"), translate.split(null as unknown as string), translate.split(5 as unknown as string), translate.split("a".repeat(100_000))]).toEqual([undefined, undefined, undefined, undefined]);
        expect(translate.split("en-US-u-nu-arab")).toEqual({ language: "en", script: undefined, region: "US", text: "en-US" });
        expect(translate.split("zh_hant_tw")).toEqual({ language: "zh", script: "Hant", region: "TW", text: "zh-Hant-TW" });
        expect(translate.split("es-419")?.region).toBe("419");
        expect(translate.split(" EN ")?.text).toBe("en");
        expect([translate.tag("!"), translate.language("!"), translate.region("!"), translate.language("ZH-hant"), translate.region("en-us")]).toEqual(["en", "en", undefined, "zh", "US"]);
        expect(["az-Arab", "ckb", "iw", "ks", "he", "fa", "ur", "en-Arab", "ar_EG", "dv", "yi", "ps", "sd", "ug"].filter(( name ) => translate.direction(name) !== "rtl")).toEqual([]);
        expect(["ar-Latn", "!", "", "az", "en-Latn"].filter(( name ) => translate.direction(name) !== "ltr")).toEqual([]);

    });
    it("negotiation ranks by quality then by closeness and never invents a locale", () => {

        expect(translate.negotiate("!!!", ["en", "ar"], "ar")).toBe("ar");
        expect(translate.negotiate("zh-TW", ["zh-Hans", "zh-Hant"], "en")).toBe("zh-Hant");
        expect(translate.negotiate("ar-SA", ["ar-EG", "ar"], "en")).toBe("ar");
        expect(translate.negotiate("en-US", ["en-GB", "en"], "fb")).toBe("en");
        expect(translate.negotiate("en-US", ["en-GB"], "fb")).toBe("en-GB");
        expect(translate.negotiate("EN_us", ["en-US"], "fb")).toBe("en-US");
        expect(translate.negotiate("*", ["en", "ar"], "ar")).toBe("ar");
        expect(translate.negotiate("en;q=abc, ar", ["en", "ar"], "fb")).toBe("ar");
        expect(translate.negotiate("en;q=0, ar;q=0.5", ["en", "ar"], "fb")).toBe("ar");
        expect(translate.negotiate("ar;q=0.3, en;q=0.7", ["ar", "en"], "fb")).toBe("en");
        expect(translate.negotiate(["fr", "ar"], ["en", "ar"], "fb")).toBe("ar");
        expect(translate.negotiate("en", ["!"], "fb")).toBe("fb");
        expect(translate.negotiate(`${"x-y, ".repeat(40)}ar`, ["ar"], "fb")).toBe("fb");
        expect(translate.negotiate(`${"a".repeat(1100)}, ar`, ["ar"], "fb")).toBe("fb");
        expect(translate.negotiate(5 as unknown as string, ["en"], "fb")).toBe("fb");
        expect(translate.negotiate("", ["en"], "fb")).toBe("fb");

    });
    it("names and lists fall back instead of throwing", () => {

        expect([translate.regionName("ZZZZ"), translate.languageName("!"), translate.localeName("!")]).toEqual(["ZZZZ", "!", "!"]);
        expect([translate.localeName("ar-EG", "en"), translate.localeName("pt-BR"), translate.localeName("en", "!!"), translate.regionName("eg", "en")]).toEqual(["Arabic (Egypt)", "Português (Brasil)", "English", "Egypt"]);
        expect([translate.isTimeZone(undefined as unknown as string), translate.isTimeZone(""), translate.isTimeZone("UTC")]).toEqual([false, false, true]);
        expect([translate.formatList(["a", "b", "c"], "!!"), translate.formatList([], "en"), translate.formatList(["a"], "en", "or"), translate.formatList(["a", "b"], "ar")]).toEqual(["a, b, and c", "", "a", "a وb"]);

    });
    it("ranges default to UTC whatever the host zone and a localizer carries its own", () => {

        const from = "2026-03-01T00:00:00Z";
        const to = "2026-03-05T00:00:00Z";
        const offset = new Date(2026, 0, 1).getTimezoneOffset();
        const zone = process.env.TZ;

        process.env.TZ = "America/New_York";

        try {

            expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(300);
            expect(translate.formatRange(from, to, "en", { month: "long", day: "numeric" })).toMatch(/^March 1\s*[–-]\s*5$/);
            expect(translate.formatRange(from, to, "en", { month: "long", day: "numeric", timeZone: "America/New_York" })).toMatch(/^February 28\s*[–-]\s*March 4$/);

        } finally {

            process.env.TZ = zone ?? "UTC";

        }

        expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(offset);
        expect(translate.formatRange(from, to, "!!")).toBe(translate.formatRange(from, to, "en"));
        expect(translate.formatRange(from, "nope")).toBe("");

        const local = translate.localizer(translate.dictionary(dictionaries, "ar", "en"), "Africa/Cairo");

        expect([local.locale, local.direction]).toEqual(["ar", "rtl"]);
        expect(bare(local.range("2026-03-01T23:00:00Z", "2026-03-05T23:00:00Z", { month: "numeric", day: "numeric" }))).toMatch(/^2\/3\s*[–-]\s*6\/3$/);
        expect([local.list(["a", "b"]), local.list(["a", "b"], "or")]).toEqual(["a وb", "a أو b"]);
        expect(bare(local.percent(50))).toBe("50%");
        expect(local.reason(error.fault("not_found"))).toBe("Not here");
        expect(local.relative("2026-03-15T13:45:30Z", "2026-03-15T13:50:30Z")).toBe("منذ 5 دقائق");

    });
    it("numbers take their numerals from the locale extension and percents take a percent", () => {

        expect([translate.formatPercent(25.6, "en"), translate.formatPercent(25.6, "en", { digits: 1 })]).toEqual(["26%", "25.6%"]);
        expect(bare(translate.formatPercent(25.6, "ar-EG"))).toBe("٢٦٪");
        expect(bare(translate.formatPercent(25.6, "ar-EG-u-nu-latn"))).toBe("26%");
        expect([translate.formatNumber(1234.5, "ar-EG-u-nu-latn"), translate.formatNumber(5, "en-u-nu-arab"), translate.formatNumber(1234.5, "!!"), translate.formatNumber(1234.5, "de")]).toEqual(["1,234.5", "٥", "1,234.5", "1.234,5"]);

    });
    it("fault reasons fill their facts and field messages read the rule, its value and the label", () => {

        const made = translate.translate({
            codes: { too_many_requests: "Wait {retryAfter}s ({code})" },
            faults: { "cart.empty": "Empty ({status})" },
            validation: { required: "{field} is required", min_length: "one:{field} needs {value} character|other:{field} needs {value} characters", "max:9": "exact nine" },
            fields: { email: "E-mail" },
        });
        const fault = error.fault("validation", "r", { errors: { email: ["required"], name: ["min_length:8"], one: ["min_length:1"], nine: ["max:9"], ten: ["max:10"], raw: ["weird thing"] } });

        expect(translate.reason(error.fault("too_many_requests", undefined, { retryAfter: 30 }), made)).toBe("Wait 30s (too_many_requests)");
        expect(translate.reason(error.fault("too_many_requests", "x.y", { retryAfter: 30 }), made)).toBe("Wait 30s (too_many_requests)");
        expect(translate.reason(error.fault("not_found", "cart.empty"), made)).toBe("Empty (404)");
        expect(translate.reason(new Error("plain"), made)).toBe("plain");
        expect(["email", "name", "one", "nine", "ten", "raw", "absent"].map(( name ) => translate.field(fault, name, made))).toEqual(["E-mail is required", "name needs 8 characters", "one needs 1 character", "exact nine", "max:10", "weird thing", undefined]);

    });
    it("localized paths stay rooted, keep their query and never leave the site", () => {

        const routing: translate.Routing = { locales: ["ar", "en", "fr-FR"], default: "ar" };
        const routed = ( path: string ): string => {

            const found = translate.localeOfPath(path, routing);

            return `${found.locale} ${found.path}`;

        };

        expect(["//evil.com/x", "/\\evil.com", "/\t/evil.com", "https://evil.com/en/x", "/%2F%2Fevil.com"].map(routed)).toEqual(["ar /evil.com/x", "ar /evil.com", "ar /evil.com", "ar /https:/evil.com/en/x", "ar /%2F%2Fevil.com"]);
        expect(["/en?x=1", "/en#top", "/EN/x", "/fr/x/", "/de/x", "", "en", "/en/", "/ar/x", "/en/en/x"].map(routed)).toEqual(["en /?x=1", "en /#top", "en /x", "fr-FR /x/", "ar /de/x", "ar /", "en /", "en /", "ar /x", "en /en/x"]);
        expect([translate.routeOf("/en/orders/", "ar", routing), translate.routeOf("/x", "de", routing), translate.routeOf("/x", "fr", routing), translate.routeOf("/x", "EN", routing)]).toEqual(["/orders/", "/x", "/fr-FR/x", "/en/x"]);
        expect([translate.routeOf("//evil.com", "en", routing), translate.routeOf("/\\evil.com", "ar", routing), translate.routeOf("/x?y=1#z", "en", routing), translate.routeOf("", "en", routing), translate.routeOf("/ar/x", "ar", routing), translate.routeOf("/ar/x", "ar", { ...routing, hide: false })]).toEqual(["/en/evil.com", "/evil.com", "/en/x?y=1#z", "/en", "/x", "/ar/x"]);

    });
});
