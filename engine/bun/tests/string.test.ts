import { describe, expect, test as it } from "bun:test";
import * as string from "engine/string";

describe("string", () => {

    it("cases split camel, snake, kebab and spaces alike", () => {

        expect(string.words("userIDValue my-name_x 2nd")).toEqual(["user", "ID", "Value", "my", "name", "x", "2nd"]);
        expect(string.camel("First name")).toBe("firstName");
        expect(string.pascal("first_name")).toBe("FirstName");
        expect(string.studly("first-name")).toBe("FirstName");
        expect(string.snake("firstName")).toBe("first_name");
        expect(string.kebab("FirstName")).toBe("first-name");
        expect(string.constant("first name")).toBe("FIRST_NAME");
        expect(string.title("hello  wORLD")).toBe("Hello World");
        expect(string.sentence("helloWorld again")).toBe("Hello world again");
        expect(string.capitalize("éa")).toBe("Éa");
        expect(string.uncapitalize("Abc")).toBe("abc");
        expect(string.slug("Hello, World! -- 2026")).toBe("hello-world-2026");
        expect(string.slug("متجر الشِّفاء")).toBe("متجر-الشفاء");
        expect(string.transliterate("محمد")).toBe("mhmd");
        expect(string.transliterate("Café")).toBe("Cafe");

    });
    it("text verbs are grapheme aware and bidi aware", () => {

        expect(string.isBlank("  ") && string.isBlank(null) && !string.isBlank("a")).toBe(true);
        expect(string.isArabic("مرحبا") && !string.isArabic("hello")).toBe(true);
        expect(string.direction("مرحبا world")).toBe("rtl");
        expect(string.direction("123 hello")).toBe("ltr");
        expect(string.isolate("مرحبا")).toBe("\u2067مرحبا\u2069");
        expect(string.length("👨‍👩‍👧")).toBe(1);
        expect(string.collapse("  a \n b  ")).toBe("a b");
        expect(string.lines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
        expect(string.reverse("abc")).toBe("cba");
        expect(string.truncate("hello world", 8)).toBe("hello w…");
        expect(string.truncate("short", 8)).toBe("short");
        expect(string.excerpt("the quick brown fox jumps", "brown", 4)).toBe("…ick brown fox…");
        expect(string.limitWords("a b c d", 2)).toBe("a b…");
        expect(string.wordCount(" a  b ")).toBe(2);
        expect(string.pad("5", 3)).toBe("  5");
        expect(string.pad("5", 3, "0", "end")).toBe("500");
        expect(string.pad("ab", 6, "-", "both")).toBe("--ab--");
        expect(string.initials("abdulrahman yasser ali")).toBe("AY");
        expect(string.escapeHtml("<a href='x'>&</a>")).toBe("&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;");
        expect(string.escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
        expect(string.before("a/b/c", "/")).toBe("a");
        expect(string.beforeLast("a/b/c", "/")).toBe("a/b");
        expect(string.after("a/b/c", "/")).toBe("b/c");
        expect(string.afterLast("a/b/c", "/")).toBe("c");
        expect(string.between("[a][b]", "[", "]")).toBe("a][b");
        expect(string.start("path", "/")).toBe("/path");
        expect(string.finish("/path/", "/")).toBe("/path/");
        expect(string.remove("a-b-c", "-")).toBe("abc");
        expect(string.replaceFirst("aXbXc", "X", "-")).toBe("a-bXc");
        expect(string.replaceLast("aXbXc", "X", "-")).toBe("aXb-c");
        expect(string.take("abcdef", -2)).toBe("ef");
        expect(string.count("banana", "an")).toBe(2);
        expect(string.startsWithAny("image.png", ["img", "image"])).toBe(true);
        expect(string.endsWithAny("image.png", [".jpg", ".png"])).toBe(true);
        expect(string.includesAny("abc", ["x", "b"]) && string.includesAll("abc", ["a", "c"])).toBe(true);
        expect(string.wrap("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);

    });
    it("masks keep the useful edges", () => {

        expect(string.mask("abdulrahman@example.com", { kind: "email" })).toBe("a*********n@example.com");
        expect(string.mask("+201099188572", { kind: "phone" })).toBe("+20********72");
        expect(string.mask("4111 1111 1111 1234", { kind: "card" })).toBe("**** **** **** 1234");
        expect(string.mask("Abdulrahman Yasser", { kind: "name" })).toBe("A********** Y*****");
        expect(string.mask("secret", { mark: "•" })).toBe("se••et");
        expect(string.mask("ab", { kind: "email" })).toBe("**");

    });
    it("folding unifies Arabic shapes and digits for search", () => {

        expect(string.fold("Hello")).toBe("hello");
        expect(string.fold("مَحْمُود")).toBe("محمود");
        expect(string.fold("أحمد إبراهيم آمنة")).toBe("احمد ابراهيم امنه");
        expect(string.fold("مصطفى")).toBe("مصطفي");
        expect(string.fold("١٢٣ ۴")).toBe("123 4");
        expect(string.asciiDigits("٠٩")).toBe("09");
        expect(string.digits("+20 (10) ٩٩-١")).toBe("2010991");
        expect(string.bare("Café-Shop, #1!")).toBe("cafe shop 1");
        expect(string.tokens("  متجر  الشفاء ")).toEqual(["متجر", "الشفاء"]);
        expect(string.score("Cairo Store", "cairo store")).toBe(1);
        expect(string.score("Cairo Store", "cai")).toBe(0.9);
        expect(string.score("Cairo Store", "store cai")).toBeGreaterThan(0.7);
        expect(string.score("Cairo Store", "xyz")).toBe(0);
        expect(string.rank(["Alexandria", "Cairo", "Giza", "cairo west"], "cai", ( item ) => item)).toEqual(["Cairo", "cairo west"]);

    });
    it("compare measures distance, similarity and dice", () => {

        expect(string.distance("kitten", "sitting")).toBe(3);
        expect(string.distance("", "abc")).toBe(3);
        expect(string.similarity("abc", "abc")).toBe(1);
        expect(string.similarity("", "")).toBe(1);
        expect(string.dice("night", "nacht")).toBeCloseTo(0.25, 5);
        expect(string.dice("a", "a")).toBe(1);
        expect(string.isSimilar("Mohamed", "mohammed", 0.8)).toBe(true);
        expect(string.closest(["apple", "grape", "mango"], "aple", ( item ) => item)?.item).toBe("apple");
        expect(string.closest([], "x", ( item: string ) => item)).toBeUndefined();

    });
    it("encodings round trip bytes, hex and base64", () => {

        const data = string.bytes("مرحبا ✓");

        expect(string.utf8(data)).toBe("مرحبا ✓");
        expect(string.hex(new Uint8Array([0, 255, 16]))).toBe("00ff10");
        expect([...string.fromHex("00FF10")]).toEqual([0, 255, 16]);
        expect(string.fromHex("xyz").length).toBe(0);
        expect(string.base64("hello")).toBe("aGVsbG8=");
        expect(string.base64("hi")).toBe("aGk=");
        expect(string.base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
        expect(string.utf8(string.fromBase64("aGVsbG8="))).toBe("hello");
        expect(string.utf8(string.fromBase64("aGk"))).toBe("hi");
        expect([...string.fromBase64("-__-")]).toEqual([251, 255, 254]);
        expect(string.fromBase64("!!!").length).toBe(0);
        expect(string.utf8(string.fromBase64(string.base64(data)))).toBe("مرحبا ✓");

    });
    it("plurals know English rules, irregulars and Arabic duals", () => {

        expect(string.plural("city")).toBe("cities");
        expect(string.plural("box")).toBe("boxes");
        expect(string.plural("person")).toBe("people");
        expect(string.plural("Person")).toBe("People");
        expect(string.plural("sheep")).toBe("sheep");
        expect(string.plural("status")).toBe("statuses");
        expect(string.plural("index")).toBe("indices");
        expect(string.singular("cities")).toBe("city");
        expect(string.singular("people")).toBe("person");
        expect(string.singular("boxes")).toBe("box");
        expect(string.singular("statuses")).toBe("status");
        expect(string.singular("news")).toBe("news");
        expect(string.dual("طالب")).toBe("طالبان");
        expect(string.dual("طالبة")).toBe("طالبتان");
        expect(string.pluralize(1, "item")).toBe("item");
        expect(string.pluralize(3, "item")).toBe("items");
        expect(string.pluralize(2, "كتاب", "كتب", "ar")).toBe("كتابان");
        expect(string.pluralize(5, "كتاب", "كتب", "ar")).toBe("كتب");

    });
    it("graphemes keep a cluster whole in every text verb", () => {

        expect(string.graphemes("e\u0301a")).toEqual(["e\u0301", "a"]);
        expect(string.graphemes("🇪🇬🇸🇦")).toEqual(["🇪🇬", "🇸🇦"]);
        expect(string.graphemes("\u1100\u1161\u11a8")).toEqual(["\u1100\u1161\u11a8"]);
        expect(string.graphemes("a\r\nb")).toEqual(["a", "\r\n", "b"]);
        expect(string.graphemes("مرحبا")).toHaveLength(5);
        expect(string.length("👍🏽")).toBe(1);
        expect(string.reverse("🇪🇬a")).toBe("a🇪🇬");
        expect(string.truncate("👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧", 2)).toBe("👨‍👩‍👧…");
        expect(string.take("شِّفاء", 1)).toBe("شِّ");
        expect(string.take("🇪🇬🇸🇦", -1)).toBe("🇸🇦");
        expect(string.pad("e\u0301", 3, "ab")).toBe("abe\u0301");
        expect(string.pad("x", 3, "")).toBe("x");
        expect(string.pad("x", 4, "🇪🇬")).toBe("🇪🇬🇪🇬🇪🇬x");
        expect(string.initials("👨‍👩‍👧 family")).toBe("👨‍👩‍👧F");
        expect(string.mask("🇪🇬🇪🇬🇪🇬🇪🇬🇪🇬🇪🇬", { keep: 1, keepEnd: 1 })).toBe("🇪🇬****🇪🇬");
        expect(string.wrap("e\u0301e\u0301 e\u0301e\u0301 ab", 5)).toEqual(["e\u0301e\u0301 e\u0301e\u0301", "ab"]);
        expect(string.chunk("abcde", 2)).toEqual(["ab", "cd", "e"]);
        expect(string.chunk("🇪🇬🇸🇦", 1)).toEqual(["🇪🇬", "🇸🇦"]);
        expect(string.chunk("abc", 0)).toEqual(["a", "b", "c"]);
        expect(string.chunk("", 3)).toEqual([]);

    });
    it("an excerpt is cut in the text itself, never through a pair", () => {

        expect(string.excerpt("İİİİ the brown fox", "BROWN", 4)).toBe("…the brown fox");
        expect(string.excerpt("😀😀 brown 😀😀", "brown", 2)).toBe("…😀 brown 😀…");
        expect(string.excerpt("a (b) c", "(b)", 1)).toBe("…(b)…");
        expect(string.excerpt("nothing here", "absent", 2)).toBe("nothing h…");
        expect(string.direction("ﻻ latin")).toBe("rtl");

    });
    it("chop, unwrap, deduplicate, swap and unescape undo what text gathers", () => {

        expect(string.chopStart("https://shop.test", "https://")).toBe("shop.test");
        expect(string.chopStart("shop.test", "https://")).toBe("shop.test");
        expect(string.chopStart("shop", "")).toBe("shop");
        expect(string.chopEnd("file.ts", ".ts")).toBe("file");
        expect(string.chopEnd("file", "")).toBe("file");
        expect(string.unwrap('"quoted"', '"')).toBe("quoted");
        expect(string.unwrap("[a]", "[", "]")).toBe("a");
        expect(string.unwrap("a]", "[", "]")).toBe("a");
        expect(string.deduplicate("a  b   c")).toBe("a b c");
        expect(string.deduplicate("a//b///c", "/")).toBe("a/b/c");
        expect(string.deduplicate("a..b.c", ".")).toBe("a.b.c");
        expect(string.deduplicate("aab", "")).toBe("aab");
        expect(string.swap("Hi {name}, {n} new", { "{name}": "Sam", "{n}": "3" })).toBe("Hi Sam, 3 new");
        expect(string.swap("abc", { a: "1", ab: "2" })).toBe("2c");
        expect(string.swap("a.c abc", { "a.c": "x" })).toBe("x abc");
        expect(string.swap("constructor", {})).toBe("constructor");
        expect(string.unescapeHtml("&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;")).toBe("<a href='x'>&</a>");
        expect(string.unescapeHtml("&amp;lt; &quot;q&quot; &nbsp;")).toBe('&lt; "q" &nbsp;');
        expect(string.headline("emailNotification_sent-now")).toBe("Email Notification Sent Now");
        expect(string.slug("Hello World", ".")).toBe("hello.world");
        expect(string.slug("..a..b..", ".")).toBe("a.b");
        expect(string.slug("a b", "")).toBe("ab");
        expect(string.transliterate("شارع ٢٣")).toBe("shara 23");

    });
    it("a word that names an object member is still only a word", () => {

        expect(string.plural("constructor")).toBe("constructors");
        expect(string.plural("toString")).toBe("toStrings");
        expect(string.singular("constructors")).toBe("constructor");
        expect(string.distance("same", "same")).toBe(0);
        expect(string.closest(["apple", "maple"], "appel", ( item ) => item)).toEqual({ item: "apple", distance: 2, similarity: 0.6 });
        expect(string.closest(["apple"], "zzzzz", ( item ) => item, 0.5)).toBeUndefined();

    });
    it("ascii is told from the rest", () => {

        expect(string.isAscii("abc 123")).toBe(true);
        expect(string.isAscii("café")).toBe(false);

    });
    it("grade scores bare text and take refuses a count that is not whole", () => {

        expect(string.grade(string.bare("Cairo, Egypt"), string.bare("EG"))).toBe(string.score("Cairo, Egypt", "EG"));
        expect(string.grade("egypt", "egypt")).toBe(1);
        expect(string.grade("egypt", "eg")).toBe(0.9);
        expect(string.grade("egypt", "")).toBe(0);
        expect(string.rank(["Spain", "Egypt", "مصر"], "مصر", ( item ) => item)).toEqual(["مصر"]);
        expect(string.take("abc", Number.NaN)).toBe("");
        expect(string.take("abc", -0.5)).toBe("");
        expect(string.take("abc", 1.9)).toBe("a");
        expect(string.take("abc", -2)).toBe("bc");

    });
});
