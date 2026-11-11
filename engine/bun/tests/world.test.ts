import { beforeAll, describe, expect, test as it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as world from "engine/world";

const asset = resolve(import.meta.dir, "../src/world/asset");

beforeAll(async () => {

    await world.load();

});

describe("world", () => {

    it("the data is loaded, indexed and searchable in both languages", () => {

        expect(world.countries.size).toBeGreaterThan(240);
        expect(world.currencies.size).toBeGreaterThan(150);
        expect(world.languages.size).toBeGreaterThan(100);
        expect(world.regions.length).toBeGreaterThan(20);
        expect(world.everyEmoji().length).toBeGreaterThan(1800);
        expect(world.emojiGroups.map(( group ) => group.key)).toContain("smileys");
        expect(world.countries.get("eg")?.alpha3).toBe("EGY");
        expect(world.countries.has("EG") && !world.countries.has("ZZ")).toBe(true);
        expect(world.countries.byAlpha3("sau")?.code).toBe("SA");
        expect(world.countries.byNumeric("818")?.code).toBe("EG");
        expect(world.countries.byNumeric("20")?.code).toBe("AD");
        expect(world.countries.byNumeric("999")).toBeUndefined();
        expect(world.countries.search("مصر")[0]?.code).toBe("EG");
        expect(world.countries.search("saudi")[0]?.code).toBe("SA");
        expect(world.countries.search("+20")[0]?.code).toBe("EG");
        expect(world.countries.search("")).toHaveLength(10);
        expect(world.countries.pick(["eg", "zz", "SA"]).map(( country ) => country.code)).toEqual(["EG", "SA"]);
        expect(world.countries.where(( country ) => country.key === "+1").length).toBeGreaterThan(20);
        expect(world.countries.inRegion("145").map(( country ) => country.code)).toContain("SA");
        expect(world.countries.spending("EUR").map(( country ) => country.code)).toContain("DE");
        expect(world.countries.speaking("ar-EG").map(( country ) => country.code)).toContain("EG");
        expect(world.countries.nameOf("eg", "ar")).toBe("مصر");
        expect(world.countries.nameOf("EG")).toBe("Egypt");
        expect(world.countries.nameOf("zz")).toBe("ZZ");
        expect(world.countries.dialingOf("sa")).toBe("+966");
        expect(world.countries.dialingOf("aq")).toBeUndefined();
        expect(world.regionOf("002")?.name.en).toBe("Africa");
        expect(world.regionName("002", "ar")).toBe("أفريقيا");
        expect(world.regionName("999")).toBe("999");
        expect(world.countries.get("EG")?.region?.name.en).toBe("Africa");
        expect(world.countries.sorted("ar")[0]?.name.ar.startsWith("آ") || world.countries.sorted("ar")[0]?.name.ar.startsWith("أ")).toBe(true);
        expect(world.countries.sorted("en")[0]?.name.en).toBe("Afghanistan");

        const grouped = world.countries.grouped("en");

        expect(grouped.map(( group ) => group.region.name.en)).toEqual(["Africa", "Americas", "Asia", "Europe", "Oceania"]);
        expect(grouped.find(( group ) => group.region.code === "142")?.subregions.flatMap(( sub ) => sub.countries.map(( country ) => country.code))).toContain("SA");
        expect(() => world.defineCountries(["EG", "ZZ"])).toThrow(RangeError);
        expect(world.defineCountries(["sa", "eg"]).all.map(( country ) => country.code)).toEqual(["SA", "EG"]);
        expect(world.isArabic("ar-EG") && !world.isArabic("en")).toBe(true);
        expect(world.nameIn(undefined, "ar", "x")).toBe("x");
        expect(world.dialings("+20", ["10"])).toEqual(["+20", "20", "0020", "+2010", "2010", "+20 10"]);

    });
    it("phones resolve their country, dialing keys rank by what was typed", () => {

        expect(world.countries.byPhone("+20 100 000 0000")?.code).toBe("EG");
        expect(world.countries.byPhone("0096650000000")?.code).toBe("SA");
        expect(world.countries.byPhone("+1 212 555 0100")?.code).toBe("US");
        expect(world.countries.byPhone("")).toBeUndefined();
        expect(world.countries.localOf("+201000000000")).toBe("01000000000");
        expect(world.countries.localOf("nothing")).toBe("nothing");
        expect(world.countries.phone("+20 100 000 0000")).toEqual({ country: world.countries.get("EG"), key: "+20", national: "1000000000", e164: "+201000000000", valid: true });
        expect(world.countries.phone("01000000000", "eg")).toMatchObject({ key: "+20", national: "1000000000", e164: "+201000000000", valid: true });
        expect(world.countries.phone("12", "eg")).toMatchObject({ valid: false, e164: undefined });
        expect(world.countries.phone("0109").country).toBeUndefined();
        expect(world.keys.of("eg")).toBe("+20");
        expect(world.keys.of("zz")).toBeUndefined();
        expect(world.keys.search("20")[0]?.code).toBe("EG");
        expect(world.keys.search("+966")[0]?.code).toBe("SA");
        expect(world.keys.search("1")[0]?.code).toBe("US");
        expect(world.keys.search("1 416 555")[0]?.code).toBe("US");
        expect(world.keys.search("egy")[0]?.code).toBe("EG");
        expect(world.keys.search("مصر")[0]?.code).toBe("EG");
        expect(world.keys.search("", 3)).toHaveLength(3);
        expect(world.keys.search("999999")).toEqual([]);
        expect(world.defineKeys(world.defineCountries(["SA"]).all).all.map(( key ) => key.code)).toEqual(["SA"]);

    });
    it("currencies know their countries, symbols, digits and formats", () => {

        expect(world.currencies.get("egp")?.digits).toBe(2);
        expect(world.currencies.of("EG").map(( currency ) => currency.code)).toEqual(["EGP"]);
        expect(world.currencies.primaryOf("sa")?.code).toBe("SAR");
        expect(world.currencies.primaryOf("zz")).toBeUndefined();
        expect(world.currencies.symbolOf("USD")).toBe("$");
        expect(world.currencies.symbolOf("SAR", "ar")).toContain("ر.س");
        expect(world.currencies.symbolOf("EGP", "en", true)).toBe("E£");
        expect(world.currencies.symbolOf("XXX")).toBe("XXX");
        expect(world.currencies.nameOf("EGP", "ar")).toBe("جنيه مصري");
        expect(world.currencies.nameOf("egp")).toBe("Egyptian Pound");
        expect(world.currencies.nameOf("xxx")).toBe("XXX");
        expect(world.currencies.digitsOf("KWD")).toBe(3);
        expect(world.currencies.digitsOf("JPY")).toBe(0);
        expect(world.currencies.digitsOf("nope")).toBe(2);
        expect(world.currencies.minor(12.345, "KWD")).toBe(12345);
        expect(world.currencies.minor(10.5, "EGP")).toBe(1050);
        expect(world.currencies.major(1050, "EGP")).toBe(10.5);
        expect(world.currencies.minor(1, "IQD")).toBe(1000);
        expect(world.currencies.digitsOf("IQD")).toBe(0);
        expect(world.currencies.minor(-0.004, "EGP")).toBe(0);
        expect(() => world.currencies.minor(Number.NaN, "EGP")).toThrow(RangeError);
        expect(world.currencies.round(10.555, "EGP")).toBe(10.56);
        expect(world.currencies.round(10.5, "JPY")).toBe(11);
        expect(world.currencies.format(1234.5, "egp", "en")).toContain("1,234.50");
        expect(world.currencies.search("riyal").map(( currency ) => currency.code)).toContain("SAR");
        expect(world.currencies.search("saudi")[0]?.code).toBe("SAR");
        expect(world.currencies.search("مصر")[0]?.code).toBe("EGP");
        expect(world.defineCurrencies(["usd"]).all.map(( currency ) => currency.code)).toEqual(["USD"]);

    });
    it("languages carry direction and script and follow their countries", () => {

        expect(world.languages.get("ar-EG")?.direction).toBe("rtl");
        expect(world.languages.has("AR") && !world.languages.has("zz")).toBe(true);
        expect(world.languages.nameOf("en", "ar")).toBe("الإنجليزية");
        expect(world.languages.nameOf("ar")).toBe("Arabic");
        expect(world.languages.nameOf("zz")).toBe("zz");
        expect(world.languages.directionOf("ar") === "rtl" && world.languages.directionOf("en") === "ltr" && world.languages.directionOf("zz") === "ltr").toBe(true);
        expect(world.languages.isRtl("fa") && !world.languages.isRtl("fr")).toBe(true);
        expect(world.languages.scriptOf("ar")).toBe("Arab");
        expect(world.languages.scriptOf("zz")).toBe("Latn");
        expect(world.languages.ofCountry("eg").map(( language ) => language.code)).toEqual(["ar"]);
        expect(world.languages.withScript("arab").map(( language ) => language.code)).toContain("ar");
        expect(world.languages.search("عرب")[0]?.code).toBe("ar");
        expect(world.baseOf("ar_EG")).toBe("ar");
        expect(world.defineLanguages(["EN", "ar"]).all.map(( language ) => language.code)).toEqual(["en", "ar"]);

    });
    it("emoji are browsed, named, coded and spotted inside text", () => {

        expect(world.emojis.get("😀")?.name.en).toBe("grinning face");
        expect(world.emojis.has("😀") && !world.emojis.has("x")).toBe(true);
        expect(world.emojis.of("smileys").length).toBeGreaterThan(50);
        expect(world.emojis.browse({ query: "grin" })[0]?.glyph).toBe("😀");
        expect(world.emojis.browse({ query: "ابتسامة", group: "smileys" })[0]?.group).toBe("smileys");
        expect(world.emojis.browse({ group: "food", limit: 5 })).toHaveLength(5);
        expect(world.emojis.browse({ limit: 3 })).toHaveLength(3);
        expect(world.emojis.browse()).toHaveLength(400);
        expect(world.emojis.nameOf("😀", "ar")).toBe("وجه بابتسامة عريضة");
        expect(world.emojis.nameOf("x")).toBe("");
        expect(world.emojis.groupName("food", "ar")).toBe("طعام وشراب");
        expect(world.emojis.groupName("nope")).toBe("nope");
        expect(world.emojis.shortcode("😀")).toBe(":grinning_face:");
        expect(world.emojis.byShortcode("grinning_face")?.glyph).toBe("😀");
        expect(world.emojis.byShortcode(":nope:")).toBeUndefined();
        expect(world.emojis.imageOf("😀")).toBe("/world/emoji/1f600.webp");
        expect(world.emojis.imageOf("🇪🇬")).toBe("/world/flag/eg.svg");
        expect(world.emojis.imageOf("x")).toBeUndefined();
        expect(world.defineEmoji({ folder: "/e/", flags: { folder: "/f", format: "webp" } }).imageOf("🇸🇦")).toBe("/f/sa.webp");
        expect(world.emojis.files.length).toBeGreaterThan(1500);
        expect(world.emojis.files.every(( file ) => file.endsWith(".webp"))).toBe(true);
        expect(world.plainEmoji("☺️")).toBe("☺");
        expect(world.emojiCode("👨‍👩‍👧")).toBe("1f468-200d-1f469-200d-1f467");
        expect(world.emojiGlyph("1f600")).toBe("😀");
        expect(world.emojiGlyph(world.emojiCode("👨‍👩‍👧"))).toBe("👨‍👩‍👧");
        expect(world.isEmoji("hi 😀") && !world.isEmoji("hi")).toBe(true);
        expect(world.emojisIn("go 🇪🇬 now 👍🏽 and 👨‍👩‍👧 ok 2️⃣")).toEqual(["🇪🇬", "👍🏽", "👨‍👩‍👧", "2️⃣"]);
        expect(world.stripEmoji("go 🇪🇬 now 👍🏽")).toBe("go now");
        expect(world.onlyEmoji("😀 👍") && !world.onlyEmoji("😀 x") && !world.onlyEmoji("")).toBe(true);

    });
    it("flags and fonts answer from the asset folders", () => {

        expect(world.flagEmoji("eg")).toBe("🇪🇬");
        expect(world.flagEmoji("x")).toBe("");
        expect(world.flagCode("🇪🇬")).toBe("EG");
        expect(world.flagCode("😀")).toBeUndefined();
        expect(world.isFlag("🇸🇦") && !world.isFlag("x")).toBe(true);
        expect(world.flagFile("EG")).toBe("/world/flag/eg.svg");
        expect(world.flagFile("sa", { folder: "/static/flags/", format: "webp" })).toBe("/static/flags/sa.webp");
        expect(world.families.map(( family ) => family.family)).toEqual(["Readex Pro", "Figtree"]);
        expect(world.fontOf("Arab")?.family).toBe("Readex Pro");
        expect(world.fontOf("Cyrl")?.family).toBe("Figtree");
        expect(world.fontFiles()).toEqual(["readex-pro-arabic.woff2", "figtree-latin.woff2", "figtree-latin-ext.woff2"]);
        expect(world.fontFaces("/fonts").split("@font-face").length - 1).toBe(3);
        expect(world.fontFaces()).toContain('src: url(/world/font/readex-pro-arabic.woff2) format("woff2");');
        expect(world.fontFaces("/f/", "optional")).toContain("font-display: optional;");
        expect(world.fontStack("Arab")).toBe('"Readex Pro", Figtree, "Noto Naskh Arabic", Tahoma, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif');
        expect(world.fontStack("Latn").startsWith("Figtree, system-ui")).toBe(true);
        expect(world.fontFor("ar-EG").startsWith('"Readex Pro"') && world.fontFor("en").startsWith("Figtree")).toBe(true);
        expect(world.fontPreload("/fonts", ["Arab"])).toHaveLength(3);
        expect(world.fontLinks("/fonts/", ["latn"])).toEqual([{ rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous", href: "/fonts/figtree-latin.woff2" }, { rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous", href: "/fonts/figtree-latin-ext.woff2" }]);
        expect([world.fontLinks().length, world.fontLinks("/f", ["Cyrl"]).length]).toEqual([3, 2]);
        expect(world.fontPreload("/fonts", ["Latn"])).toHaveLength(2);
        expect(world.fontPreload()[0]).toBe('<link rel="preload" as="font" type="font/woff2" crossorigin href="/world/font/readex-pro-arabic.woff2">');

    });
    it("a scoped world speaks one locale over chosen countries and currencies", () => {

        const ar = world.define({ locale: "ar-EG", countries: ["EG", "SA"], currencies: ["EGP", "SAR"], flags: { folder: "/f" } });
        const en = world.define();

        expect(ar.countries.all.map(( country ) => country.code)).toEqual(["EG", "SA"]);
        expect(ar.keys.all.map(( key ) => key.code)).toEqual(["EG", "SA"]);
        expect(ar.country("EG")).toBe("مصر");
        expect(en.country("EG")).toBe("Egypt");
        expect(ar.currency("EGP")).toBe("جنيه مصري");
        expect(ar.symbol("SAR")).toContain("ر.س");
        expect(en.symbol("EGP", true)).toBe("E£");
        expect(ar.language("en")).toBe("الإنجليزية");
        expect(ar.region("002")).toBe("أفريقيا");
        expect(ar.flag("SA")).toBe("🇸🇦");
        expect(ar.flagUrl("sa")).toBe("/f/sa.svg");
        expect(ar.emojis.nameOf("😀")).toBe("وجه بابتسامة عريضة");
        expect(ar.emojis.imageOf("🇪🇬")).toBe("/f/eg.svg");
        expect(ar.fontOf("ar")?.family).toBe("Readex Pro");
        expect(en.fontOf("fr")?.family).toBe("Figtree");
        expect(en.regions.length).toBe(world.regions.length);
        expect(en.assets().flag).toContain("eg.svg");
        expect(en.assets().font).toHaveLength(3);
        expect(en.assets().emoji).toHaveLength(1581);
        expect(en.assets().emoji).toEqual([...en.emojis.files]);
        expect(() => world.define({ currencies: ["NOPE"] })).toThrow(RangeError);

    });
    it("every asset the data names exists on disk and nothing on disk is unnamed", () => {

        const named = world.define().assets();
        const onDisk = ( folder: string ): string[] => readdirSync(resolve(asset, folder)).filter(( file ) => !file.startsWith(".")).sort();

        expect(onDisk("emoji")).toEqual(named.emoji.toSorted());
        expect(onDisk("font")).toEqual(named.font.toSorted());
        expect(named.flag.filter(( file ) => !existsSync(resolve(asset, "flag", file)))).toEqual([]);
        expect(onDisk("flag").filter(( file ) => !new Set(named.flag).has(file))).toEqual(["eu.svg"]);
        expect(existsSync(resolve(asset, "LICENSE.txt"))).toBe(true);

    });
    it("edges: overlong phones are nobody, limits clamp, locales are checked, trunks and keys fold, codes pad, glyphs and flags refuse junk", () => {

        const brief = ( phone: world.Phone ): unknown[] => [phone.country?.code, phone.key, phone.national, phone.e164, phone.valid];
        const nobody = [undefined, undefined, "", undefined, false];

        expect([brief(world.countries.phone("9".repeat(65), "eg")), brief(world.countries.phone("+")), brief(world.countries.phone("00")), brief(world.countries.phone("1000000000", "zz")), brief(world.countries.phone("+20", "eg"))]).toEqual([nobody, nobody, nobody, [undefined, undefined, "1000000000", undefined, false], ["EG", "+20", "", undefined, false]]);
        expect([world.countries.byPhone(`+20${"1".repeat(70)}`), world.countries.localOf("9".repeat(65)).length, world.countries.localOf(""), world.countries.localOf("+9665")]).toEqual([undefined, 65, "", "05"]);
        expect([brief(world.countries.phone("++20 1000000000")), brief(world.countries.phone("+20 0 1000000000")), brief(world.countries.phone("0020 1000000000", "eg")), brief(world.countries.phone("201000000000", "eg")), brief(world.countries.phone("1000000000", "eg")), brief(world.countries.phone("tel:+201000000000")), brief(world.countries.phone("١٠٠٠٠٠٠٠٠٠", "eg"))]).toEqual(Array.from({ length: 7 }, () => ["EG", "+20", "1000000000", "+201000000000", true]));
        expect([brief(world.countries.phone("+1 416 555 0100", "eg")), brief(world.countries.phone("4165550100", "ca")), brief(world.countries.phone("14165550100", "us")), brief(world.countries.phone("+44 20 7946 0958")), brief(world.countries.phone("020 7946 0958", "GB")), brief(world.countries.phone("+966 0 50 000 0000"))]).toEqual([["US", "+1", "4165550100", "+14165550100", true], ["CA", "+1", "4165550100", "+14165550100", true], ["US", "+1", "4165550100", "+14165550100", true], ["GB", "+44", "2079460958", "+442079460958", true], ["GB", "+44", "2079460958", "+442079460958", true], ["SA", "+966", "500000000", "+966500000000", true]]);
        expect([world.countries.localOf("+1 416 555 0100"), world.countries.localOf("+44 20 7946 0958"), world.countries.localOf("+20 0 1000000000")]).toEqual(["4165550100", "02079460958", "01000000000"]);
        expect([world.keys.search("1", 0).length, world.keys.search("1", -1).length, world.keys.search("1", Number.NaN).length, world.keys.search("", Number.POSITIVE_INFINITY).length, world.countries.search("e", -1).length, world.countries.search("e", Number.NaN).length, world.emojis.browse({ limit: -1 }).length, world.emojis.browse({ query: "a", limit: -5 }).length]).toEqual([0, 0, 20, world.keys.all.length, 0, 10, 0, 0]);
        expect([world.keys.search("+").length, world.keys.search("+2 0").map(( key ) => key.code), world.keys.search("00966")[0]?.code, world.keys.search("1 684")[0]?.code, world.keys.search("+1 684")[0]?.code, world.keys.search("7")[0]?.code, world.keys.search("+7 7")[0]?.code]).toEqual([20, ["EG"], "SA", "AS", "AS", "RU", "RU"]);
        expect([world.countries.byNumeric("20")?.code, world.countries.byNumeric("020")?.code, world.countries.byNumeric(" 818 ")?.code, world.countries.byNumeric("0818"), world.countries.byAlpha3(" egy ")?.code, world.countries.byAlpha3("EG")]).toEqual(["AD", "AD", "EG", undefined, "EG", undefined]);
        expect([world.countries.sorted("\u0000")[0]?.code, world.countries.sorted("x".repeat(500))[0]?.code, world.countries.sorted("ar_EG")[0]?.name.ar, world.countries.grouped("ar")[0]?.region.name.ar]).toEqual(["AF", "AF", world.countries.sorted("ar")[0]?.name.ar, "آسيا"]);
        expect([world.define({ locale: "" }).locale, world.define({ locale: " ar-EG " }).locale, world.define({ locale: "AR" }).direction(), world.define({ locale: "ar" }).direction("en"), world.define({ countries: ["eg", "EG"] }).countries.all.length]).toEqual(["en", "ar-EG", "rtl", "ltr", 1]);
        expect(["\u0000", "e n", "x", "en-", "a".repeat(9)].map(( locale ) => { try { world.define({ locale }); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(["refused", "refused", "refused", "refused", "refused"]);
        expect([world.currencies.of(" eg ").map(( one ) => one.code), world.currencies.format(1, "nope").replace(/\u00a0/g, " "), world.currencies.major(1005, "EGP"), world.currencies.major(1, "JPY"), world.currencies.major(1, "nope"), world.currencies.exponentOf("nope"), world.currencies.symbolOf("  "), world.currencies.minor(1e13, "EGP"), world.currencies.minor(0.1 + 0.2, "EGP")]).toEqual([["EGP"], "NOPE 1", 10.05, 1, 0.01, 2, "", 1e15, 30]);
        expect(() => world.currencies.minor(1e15, "EGP")).toThrow(RangeError);
        expect([world.currencies.digitsOf("HUF"), world.currencies.exponentOf("HUF"), world.currencies.minor(1, "HUF"), world.currencies.round(1.234, "HUF"), world.currencies.round(1.234, "BHD"), world.currencies.exponentOf("BHD")]).toEqual([0, 2, 100, 1, 1.234, 3]);
        expect([world.languages.scriptOf("ar-Latn"), world.languages.directionOf("ar-Latn"), world.languages.scriptOf("zh-TW"), world.languages.scriptOf("zh-Hans-TW"), world.languages.scriptOf("sr-Cyrl-RS"), world.languages.directionOf("yi"), world.languages.directionOf("AR_eg"), world.languages.scriptOf(""), world.languages.nameOf(""), world.languages.ofCountry("zz"), world.languages.get("ar-EG")?.code, world.languages.scriptOf("x-Arab"), world.languages.directionOf("x-Hebr")]).toEqual(["Latn", "ltr", "Hant", "Hans", "Cyrl", "rtl", "rtl", "Latn", "", [], "ar", "Arab", "rtl"]);
        expect([world.emojiGlyph(""), world.emojiGlyph("-".repeat(40)), world.emojiGlyph("110000"), world.emojiGlyph("d800"), world.emojiGlyph("1f600-"), world.emojiGlyph("zz"), world.emojiCode(""), world.emojis.imageOf("☺️"), world.emojis.get("☺")?.code, world.emojis.byShortcode(":Grinning Face:")?.glyph, world.emojis.of("nope").length, world.emojis.browse({ group: "nope" }).length, world.emojis.browse({ query: "grin", group: "food" }).length]).toEqual(["", "", "", "", "😀", "", "", "/world/emoji/263a.webp", "263a", "😀", 0, 0, 0]);
        expect([world.flagFile("../x"), world.flagFile("EG", { folder: "" }), world.flagFile("eu"), world.flagFile("x".repeat(17)), world.flagFile("E G"), world.flagEmoji("eg "), world.flagEmoji("🇪🇬"), world.flagCode("🇪🇬🇪🇬"), world.flagCode("🇪"), world.flagFile("a-b1")]).toEqual(["", "/eg.svg", "/world/flag/eu.svg", "", "", "🇪🇬", "", undefined, undefined, "/world/flag/a-b1.svg"]);
        expect([world.regionName("002"), world.regionName(" 002 ", "ar"), world.nameIn({ en: "", ar: "ع", native: "" }, "en", "f"), world.nameIn({ en: "E", ar: "", native: "" }, "ar", "f")]).toEqual(["Africa", "أفريقيا", "f", "E"]);

    });
    it("edges: shared keys fold to the home country, area codes win over the primary, trunks fall only when the rest fits, unknown catalogs and displays are refused", async () => {

        expect([world.countries.phone("84951234", "ru").national, world.countries.phone("84951234567", "ru").national, world.countries.phone("1416555", "us").national]).toEqual(["84951234", "4951234567", "1416555"]);
        expect([world.countries.byPhone("+1 684 633 1234")?.code, world.countries.phone("+1 684 633 1234").country?.code, world.countries.phone("+1 416 555 0100", "ca").country?.code, world.countries.phone("14165550100", "ca").country?.code, world.countries.phone("14165550100", "eg").country?.code, world.countries.phone("4165550100", "eg").country?.code]).toEqual(["AS", "AS", "CA", "CA", "US", "EG"]);
        expect(world.keys.search("96").map(( key ) => key.code)).toEqual(["IQ", "JO", "KW", "LB", "MV", "OM", "SA", "SY", "YE"]);
        expect([world.currencies.primaryOf("LS")?.code, world.currencies.primaryOf("ZW")?.code, world.currencies.of("LS").map(( one ) => one.code)]).toEqual(["ZAR", "ZWG", ["LSL", "ZAR"]]);
        expect([world.fontFor("ar-Latn").startsWith("Figtree"), world.fontFor("en-Arab").startsWith('"Readex Pro"'), world.fontFor("fa").startsWith('"Readex Pro"')]).toEqual([true, true, true]);
        expect(() => world.fontFaces("/f", "nope" as never)).toThrow(RangeError);
        await expect(world.load("nope" as never)).rejects.toThrow(RangeError);
        expect(world.loaded("countries") && !world.loaded("nope" as never)).toBe(true);

    });
    it("the whole catalogs and the asset folders are public", () => {

        expect(world.everyCountry().length).toBe(250);
        expect(world.everyCurrency().length).toBe(153);
        expect(world.everyLanguage().length).toBe(135);
        expect([world.emojiFolder, world.flagFolder, world.fontFolder]).toEqual(["/world/emoji", "/world/flag", "/world/font"]);

    });
});
