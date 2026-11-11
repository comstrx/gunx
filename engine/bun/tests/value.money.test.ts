import { describe, expect, test as it } from "bun:test";
import * as value from "engine/value";

const egp = ( minor: number ): value.Money => value.money.minor(minor, "EGP");
const minors = ( given: readonly value.Money[] ): number[] => given.map(( one ) => one.minor);
const failing = ( run: () => unknown ): string => {

    try {

        run();

    } catch ( thrown ) {

        return thrown instanceof RangeError ? thrown.message : "not a RangeError";

    }

    return "nothing thrown";

};

describe("value.money", () => {

    it("of reads a major amount into exact minor units of its currency", () => {

        expect(value.money.of(12.345, "EGP")).toEqual({ minor: 1234, currency: "EGP" });
        expect(value.money.of(12.355, "EGP").minor).toBe(1236);
        expect(value.money.of(1.005, "USD").minor).toBe(100);
        expect(value.money.of(1.005, "USD", "half-up").minor).toBe(101);
        expect(value.money.of(0.1 + 0.2, "USD").minor).toBe(30);
        expect(value.money.of(8.325, "USD", "down").minor).toBe(832);
        expect(value.money.of(-8.325, "USD", "floor").minor).toBe(-833);
        expect(value.money.of("1,234.50", " usd ")).toEqual({ minor: 123_450, currency: "USD" });
        expect(value.money.of("١٢٫٥", "SAR").minor).toBe(1250);
        expect(value.money.of("\u061c-\u0661\u0662\u066b\u0665", "EGP").minor).toBe(-1250);
        expect(value.money.of(1.2345, "KWD").minor).toBe(1234);
        expect(value.money.of(1000, "JPY").minor).toBe(1000);
        expect(value.money.of("0.5", "JPY").minor).toBe(0);
        expect(value.money.of("1.5", "JPY").minor).toBe(2);
        expect(value.money.of("1.23455", "CLF").minor).toBe(12_346);
        expect(value.money.of(5n, "EGP").minor).toBe(500);
        expect(value.money.of("-0.001", "EGP").minor).toBe(0);
        expect(value.money.of(value.decimal.divide("100", "3"), "EGP").minor).toBe(3333);
        expect(value.money.of("90071992547409.91", "EGP").minor).toBe(Number.MAX_SAFE_INTEGER);
        expect(failing(() => value.money.of(1, "dollars"))).toBe("not a currency code: dollars");
        expect(failing(() => value.money.of(1, "x".repeat(500))).length).toBeLessThan(110);
        expect(failing(() => value.money.of("abc", "USD"))).toBe("not an amount: abc");
        expect(failing(() => value.money.of("12,50", "EUR"))).toBe("not an amount: 12,50");
        expect(failing(() => value.money.of("1.250,75", "EUR"))).toBe("not an amount: 1.250,75");
        expect(failing(() => value.money.of(Number.NaN, "USD"))).toBe("not an amount: NaN");
        expect(failing(() => value.money.of(1e20, "USD"))).toBe("not a safe whole number: 10000000000000000000000");
        expect(failing(() => value.money.of("90071992547409.92", "EGP"))).toBe("not a safe whole number: 9007199254740992");

    });
    it("minor, zero, exponent, major and decimal move between the count and the amount", () => {

        expect(value.money.minor(1050, "egp")).toEqual({ minor: 1050, currency: "EGP" });
        expect(value.money.minor(5n, "USD").minor).toBe(5);
        expect(value.money.minor(-0, "USD").minor).toBe(0);
        expect(value.money.zero("jpy")).toEqual({ minor: 0, currency: "JPY" });
        expect(failing(() => value.money.minor(1.5, "USD"))).toBe("not a safe whole number: 1.5");
        expect(failing(() => value.money.minor(2 ** 53, "USD"))).toBe("not a safe whole number: 9007199254740992");
        expect(failing(() => value.money.minor(1, "US"))).toBe("not a currency code: US");
        expect(failing(() => value.money.zero(""))).toBe("not a currency code: ");
        expect(value.money.exponent("EGP")).toBe(2);
        expect(value.money.exponent(" kwd ")).toBe(3);
        expect(value.money.exponent("jpy")).toBe(0);
        expect(value.money.exponent("CLF")).toBe(4);
        expect(value.money.exponent("IQD")).toBe(3);
        expect(value.money.exponent("unknown")).toBe(2);
        expect(value.money.major(egp(1234))).toBe(12.34);
        expect(value.money.major(value.money.minor(1234, "KWD"))).toBe(1.234);
        expect(value.money.major(value.money.minor(1234, "JPY"))).toBe(1234);
        expect(value.money.decimal(egp(123_450))).toBe("1234.5" as value.Decimal);
        expect(value.money.decimal(value.money.minor(-1234, "KWD"))).toBe("-1.234" as value.Decimal);
        expect(value.money.decimal(value.money.minor(Number.MAX_SAFE_INTEGER, "EGP"))).toBe("90071992547409.91" as value.Decimal);

    });
    it("parse reads a worded amount with its code on either side, or nothing", () => {

        expect(value.money.parse("EGP 1,250.75")).toEqual({ minor: 125_075, currency: "EGP" });
        expect(value.money.parse("12.5 sar")).toEqual({ minor: 1250, currency: "SAR" });
        expect(value.money.parse("  ١٢٫٥ SAR ")).toEqual({ minor: 1250, currency: "SAR" });
        expect(value.money.parse("USD-5.5")).toEqual({ minor: -550, currency: "USD" });
        expect(value.money.parse("\u200fEGP\u00a0\u22121,250.75")).toEqual({ minor: -125_075, currency: "EGP" });
        expect(value.money.parse("usd 5 USD")).toEqual({ minor: 500, currency: "USD" });
        expect(value.money.parse("1 250.75 EUR")).toEqual({ minor: 125_075, currency: "EUR" });
        expect(value.money.parse("99", "usd")).toEqual({ minor: 9900, currency: "USD" });
        expect(value.money.parse("99 EGP", "USD")).toEqual({ minor: 9900, currency: "EGP" });
        expect(value.money.parse("1.005 USD", undefined, "half-up")).toEqual({ minor: 101, currency: "USD" });

        for ( const given of ["99", "abc USD", "USD 5 EGP", "12,50 EUR", "1.250,75 EUR", "USD", "", "5 dollars", "US 5", "1.2.3 USD", "9".repeat(30).concat(" USD"), "x".repeat(100), 12, null, undefined, {}] ) expect(value.money.parse(given)).toBeUndefined();

        expect(value.money.parse("99", "dollars")).toBeUndefined();

    });
    it("add, subtract, negate, absolute and total stay inside one currency and the safe range", () => {

        const ten = value.money.of(10, "EGP");
        const pence = egp(10);
        const dollar = value.money.of(1, "USD");

        expect(value.money.add(ten, pence)).toEqual(egp(1010));
        expect(value.money.subtract(pence, ten)).toEqual(egp(-990));
        expect(value.money.negate(ten)).toEqual(egp(-1000));
        expect(value.money.negate(egp(0)).minor).toBe(0);
        expect(value.money.absolute(egp(-5))).toEqual(egp(5));
        expect(value.money.absolute(egp(5))).toEqual(egp(5));
        expect(value.money.total([ten, pence, pence])).toEqual(egp(1020));
        expect(value.money.total([], "egp")).toEqual(egp(0));
        expect(value.money.total([ten], "EGP")).toEqual(ten);
        expect(failing(() => value.money.total([]))).toBe("no currency for an empty total");
        expect(failing(() => value.money.total([ten, dollar]))).toBe("currency mismatch: EGP and USD");
        expect(failing(() => value.money.total([ten], "USD"))).toBe("currency mismatch: USD and EGP");
        expect(failing(() => value.money.add(ten, dollar))).toBe("currency mismatch: EGP and USD");
        expect(failing(() => value.money.subtract(dollar, ten))).toBe("currency mismatch: USD and EGP");
        expect(failing(() => value.money.add(egp(Number.MAX_SAFE_INTEGER), egp(1)))).toBe("not a safe whole number: 9007199254740992");
        expect(failing(() => value.money.total([egp(Number.MAX_SAFE_INTEGER), egp(1)]))).toBe("not a safe whole number: 9007199254740992");

    });
    it("multiply, divide, percent, tax, gross and net round once, the way they are told", () => {

        expect(value.money.multiply(egp(10), 3)).toEqual(egp(30));
        expect(value.money.multiply(egp(5), 0.5).minor).toBe(2);
        expect(value.money.multiply(egp(7), 0.5).minor).toBe(4);
        expect(value.money.multiply(egp(7), 0.5, "down").minor).toBe(3);
        expect(value.money.multiply(egp(-7), "0.5", "half-up").minor).toBe(-4);
        expect(value.money.multiply(egp(100), "1.155").minor).toBe(116);
        expect(value.money.multiply(egp(1999), 3n).minor).toBe(5997);
        expect(value.money.multiply(egp(1), "0.004").minor).toBe(0);
        expect(value.money.multiply(egp(3_000_000_000_000), "1.000000000000001").minor).toBe(3_000_000_000_000);
        expect(value.money.multiply(egp(9_007_199_254_740_991), "0.1").minor).toBe(900_719_925_474_099);
        expect(value.money.divide(egp(100), 3).minor).toBe(33);
        expect(value.money.divide(egp(100), 8).minor).toBe(12);
        expect(value.money.divide(egp(100), 8, "half-up").minor).toBe(13);
        expect(value.money.divide(egp(100), "0.5").minor).toBe(200);
        expect(value.money.divide(egp(-100), 3, "floor").minor).toBe(-34);
        expect(value.money.percent(egp(1000), 14).minor).toBe(140);
        expect(value.money.percent(egp(999), "12.5").minor).toBe(125);
        expect(value.money.percent(egp(999), 100)).toEqual(egp(999));
        expect(value.money.percent(egp(5), 50, "half-up").minor).toBe(3);
        expect(value.money.tax(value.money.of(100, "EGP"), 14).minor).toBe(1400);
        expect(value.money.tax(egp(333), "7.5", "up").minor).toBe(25);
        expect(value.money.gross(value.money.of(100, "EGP"), 14).minor).toBe(11_400);
        expect(value.money.gross(egp(333), 15).minor).toBe(383);
        expect(value.money.net(value.money.of(114, "EGP"), 14).minor).toBe(10_000);
        expect(value.money.net(egp(100), 14).minor).toBe(88);
        expect(value.money.net(egp(383), 15).minor).toBe(333);
        expect(value.money.net(egp(100), 0).minor).toBe(100);
        expect(value.money.multiply(value.money.minor(5, "USD"), 2).currency).toBe("USD");
        expect(failing(() => value.money.multiply(egp(1), Number.NaN))).toBe("not an amount: NaN");
        expect(failing(() => value.money.multiply(egp(Number.MAX_SAFE_INTEGER), 2))).toBe("not a safe whole number: 18014398509481982");
        expect(failing(() => value.money.divide(egp(1), 0))).toBe("division by zero");
        expect(failing(() => value.money.divide(egp(1), "0.00"))).toBe("division by zero");
        expect(failing(() => value.money.percent(egp(1), "x"))).toBe("not an amount: x");
        expect(failing(() => value.money.net(egp(1), -100))).toBe("division by zero");

    });
    it("allocate and split hand out every minor unit, the largest remainder first", () => {

        expect(minors(value.money.allocate(egp(100), [1, 1, 1]))).toEqual([34, 33, 33]);
        expect(minors(value.money.allocate(egp(5), [70, 30]))).toEqual([4, 1]);
        expect(minors(value.money.allocate(egp(-100), [1, 1, 1]))).toEqual([-34, -33, -33]);
        expect(minors(value.money.allocate(egp(101), [0.5, 0.25, 0.25]))).toEqual([51, 25, 25]);
        expect(minors(value.money.allocate(egp(100), [1, 0]))).toEqual([100, 0]);
        expect(minors(value.money.allocate(egp(100), [0.1, 0.2, 0.7]))).toEqual([10, 20, 70]);
        expect(minors(value.money.allocate(egp(1), [1, 1, 1]))).toEqual([1, 0, 0]);
        expect(minors(value.money.allocate(egp(0), [1, 2]))).toEqual([0, 0]);
        expect(minors(value.money.allocate(egp(10), [1, 2, 3, 4]))).toEqual([1, 2, 3, 4]);
        expect(minors(value.money.allocate(egp(Number.MAX_SAFE_INTEGER), [1, 1, 1]))).toEqual([3_002_399_751_580_331, 3_002_399_751_580_330, 3_002_399_751_580_330]);
        expect(minors(value.money.allocate(egp(-Number.MAX_SAFE_INTEGER), [2, 1]))).toEqual([-6_004_799_503_160_661, -3_002_399_751_580_330]);
        expect(value.money.allocate(egp(100), [])).toEqual([]);
        expect(value.money.allocate(value.money.minor(9, "KWD"), [1, 1]).map(( one ) => one.currency)).toEqual(["KWD", "KWD"]);
        expect(failing(() => value.money.allocate(egp(100), [0, 0]))).toBe("no weight to allocate by");
        expect(failing(() => value.money.allocate(egp(100), [1, -1]))).toBe("not a ratio to allocate by");
        expect(failing(() => value.money.allocate(egp(100), [1, Number.NaN]))).toBe("not a ratio to allocate by");
        expect(failing(() => value.money.allocate(egp(100), [1, Number.POSITIVE_INFINITY]))).toBe("not a ratio to allocate by");
        expect(failing(() => value.money.allocate(egp(100), [1, 5e-324]))).toBe("not a ratio to allocate by");
        expect(minors(value.money.split(egp(100), 3))).toEqual([34, 33, 33]);
        expect(minors(value.money.split(egp(-100), 3))).toEqual([-34, -33, -33]);
        expect(minors(value.money.split(egp(2), 4))).toEqual([1, 1, 0, 0]);
        expect(minors(value.money.split(egp(100), 1))).toEqual([100]);
        expect(minors(value.money.split(egp(0), 2))).toEqual([0, 0]);
        expect(failing(() => value.money.split(egp(100), 0))).toBe("not a count of parts: 0");
        expect(failing(() => value.money.split(egp(100), 1.5))).toBe("not a count of parts: 1.5");
        expect(failing(() => value.money.split(egp(100), -2))).toBe("not a count of parts: -2");

    });
    it("compare, equal, lesser, greater and the sign questions order one currency only", () => {

        const small = egp(5);
        const large = egp(9);
        const dollar = value.money.minor(5, "USD");

        expect(value.money.compare(small, large)).toBe(-1);
        expect(value.money.compare(large, small)).toBe(1);
        expect(value.money.compare(small, egp(5))).toBe(0);
        expect(value.money.equal(small, egp(5))).toBe(true);
        expect(value.money.equal(small, dollar)).toBe(false);
        expect(value.money.equal(small, large)).toBe(false);
        expect(value.money.lesser(small, large)).toBe(small);
        expect(value.money.lesser(large, small)).toBe(small);
        expect(value.money.greater(small, large)).toBe(large);
        expect(value.money.greater(large, small)).toBe(large);
        expect(value.money.isZero(egp(0))).toBe(true);
        expect(value.money.isZero(small)).toBe(false);
        expect(value.money.isNegative(egp(-1))).toBe(true);
        expect(value.money.isNegative(egp(0))).toBe(false);
        expect(value.money.isPositive(small)).toBe(true);
        expect(value.money.isPositive(egp(0))).toBe(false);
        expect([large, small, egp(-1)].sort(value.money.compare).map(( one ) => one.minor)).toEqual([-1, 5, 9]);
        expect(failing(() => value.money.compare(small, dollar))).toBe("currency mismatch: EGP and USD");
        expect(failing(() => value.money.lesser(small, dollar))).toBe("currency mismatch: EGP and USD");
        expect(failing(() => value.money.greater(dollar, small))).toBe("currency mismatch: USD and EGP");

    });
    it("convert crosses currencies and their exponents at an exact rate", () => {

        const hundred = value.money.of(100, "USD");

        expect(value.money.convert(hundred, "EGP", "50.25")).toEqual(value.money.of(5025, "EGP"));
        expect(value.money.convert(hundred, "egp", 50.25)).toEqual(value.money.of(5025, "EGP"));
        expect(value.money.convert(hundred, "JPY", 150)).toEqual(value.money.minor(15_000, "JPY"));
        expect(value.money.convert(value.money.of(1000, "JPY"), "KWD", "0.002")).toEqual(value.money.minor(2000, "KWD"));
        expect(value.money.convert(value.money.of(1, "USD"), "KWD", "0.3075")).toEqual(value.money.minor(308, "KWD"));
        expect(value.money.convert(value.money.of(1, "USD"), "KWD", "0.3075", "down")).toEqual(value.money.minor(307, "KWD"));
        expect(value.money.convert(value.money.minor(1, "JPY"), "USD", "0.0064")).toEqual(value.money.minor(1, "USD"));
        expect(value.money.convert(value.money.minor(-1500, "USD"), "EGP", 1)).toEqual(egp(-1500));
        expect(value.money.convert(hundred, "USD", 1)).toEqual(hundred);
        expect(failing(() => value.money.convert(hundred, "EGP", 0))).toBe("not a rate: 0");
        expect(failing(() => value.money.convert(hundred, "EGP", -1))).toBe("not a rate: -1");
        expect(failing(() => value.money.convert(hundred, "EGP", "x"))).toBe("not an amount: x");
        expect(failing(() => value.money.convert(hundred, "pounds", 1))).toBe("not a currency code: pounds");
        expect(failing(() => value.money.convert(egp(Number.MAX_SAFE_INTEGER), "KWD", 1))).toBe("not a safe whole number: 90071992547409910");

    });
    it("format and parts show the amount in its own digits for any locale", () => {

        expect(value.money.format(value.money.of(1234.5, "EGP"))).toBe("EGP 1,234.50");
        expect(value.money.format(value.money.of(1000, "JPY"))).toBe("¥1,000");
        expect(value.money.format(value.money.minor(1234, "KWD"))).toBe("KWD 1.234");
        expect(value.money.format(value.money.of(-5, "USD"))).toBe("-$5.00");
        expect(value.money.format(value.money.of(1234.5, "EGP"), { locale: "ar-EG" })).toContain("١٬٢٣٤٫٥٠");
        expect(value.money.format(value.money.of(1234.5, "EGP"), { digits: 0 })).toBe("EGP 1,235");
        expect(value.money.format(value.money.minor(9_000_000_000_000_093, "EGP"))).toBe("EGP 90,000,000,000,000.93");
        expect(value.money.format(value.money.minor(-9_000_000_000_000_093, "EGP"))).toBe("-EGP 90,000,000,000,000.93");
        expect(value.money.parts(value.money.minor(-9_000_000_000_000_093, "EGP"))).toMatchObject({ amount: "90,000,000,000,000.93", negative: true });
        expect(value.money.format(value.money.minor(Number.MAX_SAFE_INTEGER, "KWD"))).toBe("KWD 9,007,199,254,740.991");

        const parts = value.money.parts(value.money.of(-1234.5, "USD"));

        expect(parts).toEqual({ amount: "1,234.50", symbol: "$", code: "USD", negative: true, text: "-$1,234.50" });
        expect(value.money.parts(egp(0)).negative).toBe(false);

    });
    it("toJson and fromJson carry the amount and the count, and refuse a wire that disagrees", () => {

        const price = value.money.of(1234.5, "EGP");

        expect(value.money.toJson(price)).toEqual({ amount: "1234.50", currency: "EGP", minor: 123_450 });
        expect(value.money.toJson(value.money.minor(1234, "KWD")).amount).toBe("1.234");
        expect(value.money.toJson(value.money.minor(1000, "JPY")).amount).toBe("1000");
        expect(value.money.toJson(value.money.minor(-5, "USD")).amount).toBe("-0.05");
        expect(value.money.toJson(egp(0)).amount).toBe("0.00");
        expect(value.money.fromJson(value.money.toJson(price))).toEqual(price);
        expect(value.money.fromJson(JSON.parse(JSON.stringify(value.money.toJson(price))))).toEqual(price);
        expect(value.money.fromJson({ amount: "1234.50", currency: "egp" })).toEqual(price);
        expect(value.money.fromJson({ amount: 1234.5, currency: "EGP" })).toEqual(price);
        expect(value.money.fromJson({ minor: 123_450, currency: "EGP" })).toEqual(price);
        expect(value.money.fromJson({ amount: "١٢٣٤٫٥", minor: 123_450, currency: "EGP" })).toEqual(price);
        expect(value.money.fromJson({ amount: "12.345", currency: "EGP" })).toEqual(egp(1234));

        const refused: unknown[] = [{ currency: "EGP" }, { amount: "12.34", minor: 1235, currency: "EGP" }, { amount: "12.34" }, { amount: "12.34", currency: "pounds" }, { amount: "abc", currency: "EGP" }, { amount: "12,34", currency: "EGP" }, { amount: true, currency: "EGP" }, { amount: null, currency: "EGP" }, { minor: 1.5, currency: "EGP" }, { minor: "5", currency: "EGP" }, { minor: 2 ** 53, currency: "EGP" }, { amount: "1e30", currency: "EGP" }, { amount: "5", currency: 7 }, "x", 5, null, undefined, [], [{ amount: "5", currency: "EGP" }]];

        for ( const given of refused ) expect(value.money.fromJson(given), JSON.stringify(given)).toBeUndefined();

        const wire: value.Wire = value.money.toJson(price);

        expect(Object.keys(wire).sort()).toEqual(["amount", "currency", "minor"]);

    });
    it("is knows a money value from a look-alike", () => {

        expect(value.money.is({ minor: 5, currency: "EGP" })).toBe(true);
        expect(value.money.is(value.money.zero("USD"))).toBe(true);
        expect(value.money.is({ minor: 5, currency: "EGP", note: "kept" })).toBe(true);

        for ( const given of [{ minor: 5.5, currency: "EGP" }, { minor: 5, currency: "egp" }, { minor: "5", currency: "EGP" }, { minor: 2 ** 53, currency: "EGP" }, { minor: 5 }, { currency: "EGP" }, null, undefined, "5 EGP", 5, []] ) expect(value.money.is(given)).toBe(false);

    });

});
