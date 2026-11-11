import { describe, expect, test as it } from "bun:test";
import * as number from "engine/number";

describe("number", () => {

    it("math is bounded and exact at the edges", () => {

        expect(number.clamp(15, 0, 10)).toBe(10);
        expect(number.clamp(5, 10, 0)).toBe(5);
        expect(number.between(5, 10, 0)).toBe(true);
        expect(number.wrap(370, 0, 360)).toBe(10);
        expect(number.wrap(-10, 0, 360)).toBe(350);
        expect(number.precision(1.005, 2)).toBe(1.01);
        expect(number.round(2.5)).toBe(3);
        expect(number.floor(1.2399, 2)).toBe(1.23);
        expect(number.ceil(1.2301, 2)).toBe(1.24);
        expect(number.trunc(-1.99)).toBe(-1);
        expect(number.sign(-3)).toBe(-1);
        expect(number.isEven(4) && number.isOdd(-3) && !number.isOdd(2.5)).toBe(true);
        expect(number.sum([1, 2, Number.NaN, 3])).toBe(6);
        expect(number.mean([])).toBe(0);
        expect(number.median([5, 1, 3])).toBe(3);
        expect(number.median([4, 1, 3, 2])).toBe(2.5);
        expect(number.min([3, 1, 2])).toBe(1);
        expect(number.max([])).toBe(0);
        expect(number.percent(1, 3)).toBe(33.33);
        expect(number.percent(1, 0)).toBe(0);
        expect(number.ratio(1, 4)).toBe(0.25);
        expect(number.lerp(0, 10, 0.25)).toBe(2.5);
        expect(number.lerp(0, 10, 2)).toBe(10);
        expect(number.scale(5, [0, 10], [0, 100])).toBe(50);
        expect(number.gcd(12, 18)).toBe(6);
        expect(number.lcm(4, 6)).toBe(12);
        expect(number.finite(Number.POSITIVE_INFINITY, 7)).toBe(7);
        expect(number.isNumeric("12.5") && !number.isNumeric("") && !number.isNumeric("x")).toBe(true);

    });
    it("rounding reads the decimal a number was written as, never its binary tail", () => {

        expect(number.precision(8.345, 2)).toBe(8.35);
        expect(number.precision(-8.345, 2)).toBe(-8.35);
        expect(number.precision(1.255, 2)).toBe(1.26);
        expect(number.precision(2.5, 0)).toBe(3);
        expect(number.precision(-2.5, 0)).toBe(-3);
        expect(number.precision(1234.5678, -2)).toBe(1235);
        expect(number.precision(0.1 + 0.2, 99)).toBe(0.3);
        expect(Object.is(number.precision(-0.001, 2), 0)).toBe(true);
        expect(Object.is(number.ceil(-0.5), 0)).toBe(true);
        expect(number.floor(1.15, 2)).toBe(1.15);
        expect(number.trunc(1.15, 2)).toBe(1.15);
        expect(number.trunc(-1.15, 2)).toBe(-1.15);
        expect(number.ceil(1.1, 1)).toBe(1.1);
        expect(number.ceil(1.11, 1)).toBe(1.2);
        expect(number.floor(-1.11, 1)).toBe(-1.2);
        expect(number.precision(Number.NaN, 2)).toBeNaN();
        expect(number.precision(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
        expect(number.precision(1e21, 2)).toBe(1e21);
        expect(number.floor(-1e21, 3)).toBe(-1e21);
        expect(number.precision(1234567.891, 15)).toBe(1234567.891);
        expect(number.ceil(4503599627370495.5, 2)).toBe(4503599627370495.5);
        expect(Object.is(number.trunc(-0), 0)).toBe(true);
        expect(number.percent(2, 3, 1)).toBe(66.7);

    });
    it("sums without drift and reads the edges of a list without the call stack", () => {

        const many = Array.from({ length: 200_000 }, ( _, index ) => index);

        expect(number.sum([0.1, 0.2, 0.3])).toBe(0.6);
        expect(number.sum([1e100, 1, -1e100])).toBe(1);
        expect(number.sum([Number.POSITIVE_INFINITY, 1, Number.NaN])).toBe(1);
        expect(number.sum(Array.from({ length: 10 }, () => 0.1))).toBe(1);
        expect(number.mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 15);
        expect(number.max(many)).toBe(199_999);
        expect(number.min(many)).toBe(0);
        expect(number.min([Number.NaN, 3, Number.NEGATIVE_INFINITY])).toBe(3);
        expect(number.max([Number.POSITIVE_INFINITY, 2, -4])).toBe(2);
        expect(number.min([])).toBe(0);
        expect(number.median([Number.NaN, 4, 2])).toBe(2);
        expect(number.gcd(Number.NaN, 5)).toBe(5);
        expect(number.gcd(Number.POSITIVE_INFINITY, 5)).toBe(5);
        expect(number.gcd(-12, 18)).toBe(6);
        expect(number.gcd(0, 0)).toBe(0);
        expect(number.lcm(0, 5)).toBe(0);
        expect(number.lcm(-4, 6)).toBe(12);
        expect(number.lcm(Number.NaN, 6)).toBe(0);

    });
    it("reads only decimal text as numeric", () => {

        expect(["12", "-12.5", "+.5", "5.", "1e3", " 7 "].every(( text ) => number.isNumeric(text))).toBe(true);
        expect(["0x10", "0b11", "1_000", "12abc", "Infinity", "1e999", ".", "--1", "9".repeat(65)].some(( text ) => number.isNumeric(text))).toBe(false);
        expect(number.isNumeric(Number.NaN) || number.isNumeric(null) || number.isNumeric(12n) || number.isNumeric([1])).toBe(false);
        expect(number.isNumeric(0)).toBe(true);

    });
    it("measures a spread, a change and a grid", () => {

        expect(number.quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
        expect(number.quantile([30, 10, 20], 0.9)).toBeCloseTo(28, 12);
        expect(number.quantile([30, 10, 20], 0)).toBe(10);
        expect(number.quantile([30, 10, 20], 7)).toBe(30);
        expect(number.quantile([5], 0.3)).toBe(5);
        expect(number.quantile([], 0.5)).toBe(0);
        expect(number.quantile([Number.NaN, 4, 2], 1)).toBe(4);
        expect(number.deviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
        expect(number.deviation([7])).toBe(0);
        expect(number.deviation([3, 3, 3])).toBe(0);
        expect(number.change(50, 75)).toBe(50);
        expect(number.change(200, 150)).toBe(-25);
        expect(number.change(-50, -25)).toBe(50);
        expect(number.change(3, 4, 1)).toBe(33.3);
        expect(number.change(0, 5)).toBe(0);
        expect(number.snap(7, 5)).toBe(5);
        expect(number.snap(8, 5)).toBe(10);
        expect(number.snap(-7, 5)).toBe(-5);
        expect(number.snap(0.37, 0.25)).toBe(0.25);
        expect(number.snap(1.23, 0.1)).toBe(1.2);
        expect(number.snap(0.3, 0.1)).toBe(0.3);
        expect(number.snap(12, 5, 2)).toBe(12);
        expect(number.snap(13.2, 5, 0.5)).toBe(15.5);
        expect(number.snap(7, 0)).toBe(7);
        expect(number.snap(7, -5)).toBe(7);
        expect(number.near(0.1 + 0.2, 0.3)).toBe(true);
        expect(number.near(1, 1.1)).toBe(false);
        expect(number.near(1e12, 1e12 + 1)).toBe(true);
        expect(number.near(5, 5.4, 0.1)).toBe(true);
        expect(number.near(Number.NaN, Number.NaN)).toBe(false);

    });
    it("formats through one cached Intl instance per shape", () => {

        expect(number.format(1234567.891, { digits: 2 })).toBe("1,234,567.89");
        expect(number.format(1234.5, { locale: "ar-EG", numerals: "arab" })).toBe("١٬٢٣٤٫٥");
        expect(number.format(1234.5, { locale: "ar", numerals: "latn" })).toBe("1,234.5");
        expect(number.format(0.5, { sign: "always", digits: 1 })).toBe("+0.5");
        expect(number.format(1500, { compact: true })).toBe("1.5K");
        expect(number.formatPercent(12.345, { digits: 1 })).toBe("12.3%");
        expect(number.abbreviate(2_500_000)).toBe("2.5M");
        expect(number.bytes(0)).toBe("0 B");
        expect(number.bytes(1536)).toBe("1.5 KB");
        expect(number.bytes(5 * 1024 ** 4, 0)).toBe("5 TB");
        expect(number.ordinal(1)).toBe("1st");
        expect(number.ordinal(12)).toBe("12th");
        expect(number.ordinal(23)).toBe("23rd");
        expect(number.ordinal(3, "ar")).toBe("3");
        expect(number.pad(7)).toBe("07");
        expect(number.pad(-7, 3)).toBe("-007");
        expect(number.roman(1994)).toBe("MCMXCIV");
        expect(number.roman(0)).toBe("");
        expect(number.numerals("12 of 34", "arab")).toBe("١٢ of ٣٤");
        expect(number.numerals("١٢", "latn")).toBe("12");

        const parts = number.currencyParts(-1234.5, "egp", { locale: "en" });

        expect(parts.code).toBe("EGP");
        expect(parts.negative).toBe(true);
        expect(parts.amount).toBe("1,234.50");
        expect(number.currency(10, "USD")).toBe("$10.00");
        expect(number.currency(10, "SAR", { locale: "ar-SA", digits: 0 })).toContain("١٠");

    });
    it("prints an exact amount whatever its size, and never throws on a bad shape", () => {

        expect(number.format("12345678901234567890.12", { digits: 2 })).toBe("12,345,678,901,234,567,890.12");
        expect(number.format(12345678901234567890n)).toBe("12,345,678,901,234,567,890");
        expect(number.format("-0.50", { digits: 2 })).toBe("-0.50");
        expect(number.format("1e5")).toBe("0");
        expect(number.format("12abc")).toBe("0");
        expect(number.format("9".repeat(65))).toBe("0");
        expect(number.format(Number.NaN)).toBe("0");
        expect(number.format(1234.5, { locale: "ar_EG", numerals: "arab" })).toBe("١٬٢٣٤٫٥");
        expect(number.format(1234.5, { locale: "not a locale" })).toBe("1,234.5");
        expect(number.format(1.5, { digits: 0, minDigits: 3 })).toBe("2");
        expect(number.format(1.5, { minDigits: 3 })).toBe("1.500");
        expect(number.format(1.23456, { digits: 99 })).toBe("1.23456000000000000000");
        expect(number.format(1234.5, { grouping: false })).toBe("1234.5");
        expect(number.format(-5, { sign: "never" })).toBe("5");
        expect(number.formatPercent(50)).toBe("50%");
        expect(number.formatPercent(12.5, { digits: 2, minDigits: 2 })).toBe("12.50%");
        expect(number.formatPercent(12.5, { locale: "ar-EG", numerals: "arab" })).toContain("١٣");
        expect(number.abbreviate(1234, 2)).toBe("1.23K");
        expect(number.abbreviate(1_500_000, 1, "ar_EG")).toBe(number.abbreviate(1_500_000, 1, "ar-EG"));
        expect(number.bytes(1023.9)).toBe("1 KB");
        expect(number.bytes(1_048_575)).toBe("1 MB");
        expect(number.bytes(-5)).toBe("0 B");
        expect(number.bytes(1024 ** 6)).toBe("1024 PB");
        expect(number.pad(-0.5)).toBe("00");
        expect(number.pad(5, 3, "😀")).toBe("😀😀5");
        expect(number.pad(12345, 2)).toBe("12345");
        expect(number.pad(7, 2, "")).toBe("07");
        expect(number.ordinal(-21)).toBe("-21st");
        expect(number.ordinal(112)).toBe("112th");
        expect(number.ordinal(3, "ar_EG")).toBe("3");
        expect(number.roman(3999)).toBe("MMMCMXCIX");
        expect(number.roman(4000)).toBe("");
        expect(number.numerals("۱۲۳ و ٤٥٦", "latn")).toBe("123 و 456");

    });
    it("prints money exactly and falls back to plain text for a code that is not one", () => {

        expect(number.currency("9007199254740993.25", "USD")).toBe("$9,007,199,254,740,993.25");
        expect(number.currency(9007199254740993n, "JPY")).toBe("¥9,007,199,254,740,993");
        expect(number.currency(10, " usd ")).toBe("$10.00");
        expect(number.currency(10, "XTS")).toBe("XTS 10.00");
        expect(number.currency(5, "aß")).toBe("aß 5");
        expect(number.currency(5, "")).toBe("5");
        expect(number.currency(-1234.5, "points", { digits: 1 })).toBe("points -1,234.5");
        expect(number.currencyParts(-1234.5, "points")).toEqual({ amount: "1,234.5", symbol: "points", code: "points", negative: true, text: "points -1,234.5" });
        expect(number.currencyParts("-0.00", "USD").negative).toBe(false);
        expect(number.currencyParts("-0.01", "USD")).toEqual({ amount: "0.01", symbol: "$", code: "USD", negative: true, text: "-$0.01" });
        expect(number.currencyParts(5, "USD", { sign: "always" }).amount).toBe("5.00");
        expect(number.currencyParts(1234.5, "EGP", { locale: "ar-EG" }).text).toBe(number.currency(1234.5, "EGP", { locale: "ar-EG" }));
        expect(number.currencyParts(-0, "USD").negative).toBe(false);

    });
    it("plural categories follow CLDR for Arabic, English, French and Russian without Intl", () => {

        expect([0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103].map(( count ) => number.category(count, "ar"))).toEqual([
            "zero", "one", "two", "few", "few", "many", "many", "other", "other", "other", "few",
        ]);
        expect(number.category(1.5, "ar")).toBe("other");
        expect([0, 1, 2].map(( count ) => number.category(count, "en-US"))).toEqual(["other", "one", "other"]);
        expect([0, 1, 2].map(( count ) => number.category(count, "fr"))).toEqual(["one", "one", "other"]);
        expect([1, 2, 5, 11, 21, 22].map(( count ) => number.category(count, "ru"))).toEqual(["one", "few", "many", "many", "one", "few"]);
        expect(number.category(1, "ja")).toBe("other");
        expect(number.languageOf("ar-EG")).toBe("ar");
        expect(number.languageOf("pt_BR")).toBe("pt");
        expect(number.languageOf("")).toBe("en");

    });
    it("every plural family agrees with the platform's CLDR, whole numbers and fractions", () => {

        const locales = [
            "en", "en-US", "de", "nl", "sv", "nb", "fi", "el", "hu", "bg", "tr", "ur", "sw", "et", "ja", "zh", "ko", "vi", "th", "id", "ms", "my", "km", "lo",
            "hi", "bn", "fa", "gu", "kn", "am", "hy", "da", "fr", "fr-CA", "pt", "pt-BR", "pt-PT", "es", "es-MX", "it", "ca", "ar", "ar-EG", "he",
            "ru", "uk", "be", "pl", "cs", "sk", "ro", "lt", "sl",
        ];
        const counts = [
            ...Array.from({ length: 1201 }, ( _, index ) => index), 1e6, 2e6, 1e6 + 1, 5e6, 1e9, 1e12,
            0.5, 1.5, 2.5, 5.5, 0.1, 1.1, 2.1, 11.5, 100.5, 1_000_000.5, 0.01, 1.01, 21.5, -1, -2, -0.5, -5,
        ];
        const apart = locales.flatMap(( locale ) => {

            const rules = new Intl.PluralRules(locale);

            return counts.filter(( count ) => rules.select(count) !== number.category(count, locale)).map(( count ) => `${locale}:${count}`);

        });

        expect(apart).toEqual([]);
        expect([0, 1, 0.5, 1.5, 1e6].map(( count ) => number.category(count, "pt"))).toEqual(["one", "one", "one", "one", "many"]);
        expect([0, 1, 0.5, 1e6].map(( count ) => number.category(count, "pt_PT"))).toEqual(["other", "one", "other", "many"]);
        expect([0, 0.5, 1, 1.5, 2].map(( count ) => number.category(count, "hi"))).toEqual(["one", "one", "one", "other", "other"]);
        expect([0.5, 1, 1.5, 2].map(( count ) => number.category(count, "da"))).toEqual(["one", "one", "one", "other"]);
        expect([1, 2, 5, 12, 22, 1.5].map(( count ) => number.category(count, "pl"))).toEqual(["one", "few", "many", "many", "few", "other"]);
        expect([1, 2, 5, 1.5].map(( count ) => number.category(count, "cs"))).toEqual(["one", "few", "other", "many"]);
        expect([0, 1, 2, 3, 0.5].map(( count ) => number.category(count, "he"))).toEqual(["other", "one", "two", "other", "one"]);
        expect(number.category(-1, "en")).toBe("one");
        expect(number.category(Number.NaN, "ar")).toBe("other");
        expect(number.category(Number.POSITIVE_INFINITY, "ru")).toBe("other");
        expect(number.category(1, "constructor")).toBe("one");
        expect(number.category(1, "")).toBe("one");

    });
    it("words spell numbers in English and Arabic", () => {

        expect(number.words(0)).toBe("zero");
        expect(number.words(1234)).toBe("one thousand two hundred thirty-four");
        expect(number.words(-21.5)).toBe("minus twenty-one point five zero");
        expect(number.words(1_000_000)).toBe("one million");
        expect(number.words(0, "ar")).toBe("صفر");
        expect(number.words(11, "ar")).toBe("أحد عشر");
        expect(number.words(2000, "ar")).toBe("ألفان");
        expect(number.words(3500, "ar")).toBe("ثلاثة آلاف وخمسمائة");
        expect(number.words(125, "ar")).toBe("مائة وخمسة وعشرون");

    });
    it("words carry a rounded fraction into the whole and never say minus zero", () => {

        expect(number.words(1.999)).toBe("two");
        expect(number.words(1.994)).toBe("one point nine nine");
        expect(number.words(0.05)).toBe("zero point zero five");
        expect(number.words(-0.001)).toBe("zero");
        expect(number.words(-0.01)).toBe("minus zero point zero one");
        expect(number.words(Number.NaN)).toBe("zero");
        expect(number.words(999_999_999_999_999)).toStartWith("nine hundred ninety-nine trillion");
        expect(number.words(1e20)).toBe(number.words(999_999_999_999_999));
        expect(number.words(1.5, "ar-EG")).toBe("واحد فاصلة خمسة صفر");
        expect(number.words(-3, "ar_EG")).toBe("سالب ثلاثة");
        expect(number.words(11_000, "ar")).toBe("أحد عشر ألف");
        expect(number.words(103_000, "ar")).toBe("مائة وثلاثة آلاف");
        expect(number.words(110_000, "ar")).toBe("مائة وعشرة آلاف");
        expect(number.words(111_000, "ar")).toBe("مائة وأحد عشر ألف");
        expect(number.words(5_000_000, "ar")).toBe("خمسة ملايين");

    });

});
