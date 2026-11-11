import { describe, expect, test as it } from "bun:test";
import * as value from "engine/value";

const text = ( given: value.Decimal ): string => given;
const failing = ( run: () => unknown ): string => {

    try {

        run();

    } catch ( thrown ) {

        return thrown instanceof RangeError ? thrown.message : "not a RangeError";

    }

    return "nothing thrown";

};

describe("value.decimal", () => {

    it("of reads every spelling into one canonical text", () => {

        expect(text(value.decimal.of("1.50"))).toBe("1.5");
        expect(text(value.decimal.of("0010"))).toBe("10");
        expect(text(value.decimal.of(".5"))).toBe("0.5");
        expect(text(value.decimal.of("5."))).toBe("5");
        expect(text(value.decimal.of("+7"))).toBe("7");
        expect(text(value.decimal.of("-0"))).toBe("0");
        expect(text(value.decimal.of("-0.000"))).toBe("0");
        expect(text(value.decimal.of("1e3"))).toBe("1000");
        expect(text(value.decimal.of("1.5E-3"))).toBe("0.0015");
        expect(text(value.decimal.of(0.1))).toBe("0.1");
        expect(text(value.decimal.of(-0))).toBe("0");
        expect(text(value.decimal.of(1e21))).toBe("1000000000000000000000");
        expect(text(value.decimal.of(1e-7))).toBe("0.0000001");
        expect(text(value.decimal.of(12n))).toBe("12");
        expect(text(value.decimal.of(" ١٢٫٥ "))).toBe("12.5");
        expect(text(value.decimal.of("۱۲٫۵"))).toBe("12.5");
        expect(text(value.decimal.of("1,234.50"))).toBe("1234.5");
        expect(text(value.decimal.of("12,34,567.8"))).toBe("1234567.8");
        expect(text(value.decimal.of("1 234 567"))).toBe("1234567");
        expect(text(value.decimal.of("١٬٢٣٤٫٥"))).toBe("1234.5");
        expect(text(value.decimal.of("123456789012345678901234567890.123456789"))).toBe("123456789012345678901234567890.123456789");
        expect(text(value.decimal.of(`0.${"0".repeat(39)}1`))).toBe(`0.${"0".repeat(39)}1`);

    });
    it("of refuses what is not a decimal, parse answers absent, is knows the canonical text", () => {

        const refused: unknown[] = ["abc", "", " ", ".", "+", "e5", "1.2.3", "--1", "0x10", "1e999", "1e", "12,5", "1,00", ",5", "1.5,000", "1,,000", "1٫2٫3", "Infinity", "9".repeat(65), `0.${"1".repeat(41)}`, Number.NaN, Number.POSITIVE_INFINITY];

        for ( const given of refused ) {

            expect(failing(() => value.decimal.of(given as string)), String(given)).toStartWith("not a decimal: ");
            expect(value.decimal.parse(given)).toBeUndefined();

        }

        for ( const given of [null, undefined, true, {}, [], new Date(0)] ) expect(value.decimal.parse(given)).toBeUndefined();

        expect(failing(() => value.decimal.of("x".repeat(500))).length).toBeLessThan(90);
        expect(value.decimal.parse("1.50")).toBe("1.5" as value.Decimal);
        expect(value.decimal.parse(7)).toBe("7" as value.Decimal);
        expect(value.decimal.parse("9".repeat(64))).toBe("9".repeat(64) as value.Decimal);
        expect(value.decimal.is("1.5")).toBe(true);
        expect(value.decimal.is("-0.001")).toBe(true);
        expect(value.decimal.is("0")).toBe(true);

        for ( const given of ["1.50", "01", "-0", "+1", "1e3", "1,000", " 1", "abc", "", 1.5, 1n, null] ) expect(value.decimal.is(given)).toBe(false);

    });
    it("add, subtract, multiply and sum are exact where floats are not", () => {

        expect(text(value.decimal.add("0.1", "0.2"))).toBe("0.3");
        expect(text(value.decimal.add(0.1, 0.2))).toBe("0.3");
        expect(text(value.decimal.add("999999999999999999999999", "1"))).toBe("1000000000000000000000000");
        expect(text(value.decimal.add("1.5", "-1.5"))).toBe("0");
        expect(text(value.decimal.subtract("1", "0.9"))).toBe("0.1");
        expect(text(value.decimal.subtract("0.3", "0.1"))).toBe("0.2");
        expect(text(value.decimal.subtract(5n, "7.25"))).toBe("-2.25");
        expect(text(value.decimal.multiply("1.1", "1.1"))).toBe("1.21");
        expect(text(value.decimal.multiply("-0.5", "4"))).toBe("-2");
        expect(text(value.decimal.multiply("0", "-5"))).toBe("0");
        expect(text(value.decimal.multiply("99999999999999999999.99", "99999999999999999999.99"))).toBe("9999999999999999999998000000000000000000.0001");
        expect(text(value.decimal.multiply("1e-30", "1e-30"))).toBe("0");
        expect(text(value.decimal.multiply("1e-20", "1e-20"))).toBe(`0.${"0".repeat(39)}1`);
        expect(text(value.decimal.sum(["0.1", "0.2", "0.3"]))).toBe("0.6");
        expect(text(value.decimal.sum([1, "2.5", 3n, "-0.5"]))).toBe("6");
        expect(text(value.decimal.sum([]))).toBe("0");
        expect(text(value.decimal.sum(Array.from({ length: 1000 }, () => "0.1")))).toBe("100");
        expect(failing(() => value.decimal.multiply("9".repeat(40), "9".repeat(40)))).toBe("decimal out of range");
        expect(failing(() => value.decimal.add("9".repeat(64), "1"))).toBe("decimal out of range");
        expect(failing(() => value.decimal.sum(["1", "x"]))).toBe("not a decimal: x");

    });
    it("divide keeps the digits asked for and rounds the way it is told", () => {

        expect(text(value.decimal.divide("1", "3"))).toBe("0.33333333333333333333");
        expect(text(value.decimal.divide("2", "3", 4))).toBe("0.6667");
        expect(text(value.decimal.divide("1", "8"))).toBe("0.125");
        expect(text(value.decimal.divide("-1", "8"))).toBe("-0.125");
        expect(text(value.decimal.divide("1.21", "1.1"))).toBe("1.1");
        expect(text(value.decimal.divide("10", "4", 0))).toBe("2");
        expect(text(value.decimal.divide("14", "4", 0))).toBe("4");
        expect(text(value.decimal.divide("1", "3", 2, "up"))).toBe("0.34");
        expect(text(value.decimal.divide("-1", "3", 2, "up"))).toBe("-0.34");
        expect(text(value.decimal.divide("-1", "3", 2, "floor"))).toBe("-0.34");
        expect(text(value.decimal.divide("-1", "3", 2, "ceil"))).toBe("-0.33");
        expect(text(value.decimal.divide("1", "3", 2, "ceil"))).toBe("0.34");
        expect(text(value.decimal.divide("0", "7"))).toBe("0");
        expect(text(value.decimal.divide("1", "3", 40))).toBe(`0.${"3".repeat(40)}`);
        expect(text(value.decimal.divide("0.000001", "1000000", 12))).toBe("0.000000000001");
        expect(failing(() => value.decimal.divide("1", "0"))).toBe("division by zero");
        expect(failing(() => value.decimal.divide("1", "0.000"))).toBe("division by zero");
        expect(failing(() => value.decimal.divide("1", "3", 41))).toBe("not a count of fraction digits: 41");
        expect(failing(() => value.decimal.divide("1", "3", -1))).toBe("not a count of fraction digits: -1");
        expect(failing(() => value.decimal.divide("1", "3", 1.5))).toBe("not a count of fraction digits: 1.5");

    });
    it("round and fixed take every rounding mode on both signs, and negative digits", () => {

        const modes: Record<value.Rounding, [string, string, string, string, string, string]> = {
            "half-even": ["2", "4", "-2", "-4", "1.2", "-1.2"],
            "half-up": ["3", "4", "-3", "-4", "1.2", "-1.2"],
            "half-down": ["2", "3", "-2", "-3", "1.2", "-1.2"],
            up: ["3", "4", "-3", "-4", "1.3", "-1.3"],
            down: ["2", "3", "-2", "-3", "1.2", "-1.2"],
            ceil: ["3", "4", "-2", "-3", "1.3", "-1.2"],
            floor: ["2", "3", "-3", "-4", "1.2", "-1.3"],
        };

        for ( const [mode, wanted] of Object.entries(modes) as [value.Rounding, string[]][] ) {

            expect([text(value.decimal.round("2.5", 0, mode)), text(value.decimal.round("3.5", 0, mode)), text(value.decimal.round("-2.5", 0, mode)), text(value.decimal.round("-3.5", 0, mode)), text(value.decimal.round("1.21", 1, mode)), text(value.decimal.round("-1.21", 1, mode))], mode).toEqual(wanted);

        }

        expect(text(value.decimal.round("2.5"))).toBe("2");
        expect(text(value.decimal.round("1.005", 2))).toBe("1");
        expect(text(value.decimal.round("1.015", 2))).toBe("1.02");
        expect(text(value.decimal.round("1.2", 5))).toBe("1.2");
        expect(text(value.decimal.round("1234.5", -2))).toBe("1200");
        expect(text(value.decimal.round("1250", -2))).toBe("1200");
        expect(text(value.decimal.round("1350", -2))).toBe("1400");
        expect(text(value.decimal.round("49", -2))).toBe("0");
        expect(text(value.decimal.round("-0.4"))).toBe("0");
        expect(value.decimal.fixed("1.5", 2)).toBe("1.50");
        expect(value.decimal.fixed("1.005", 2)).toBe("1.00");
        expect(value.decimal.fixed("1.005", 2, "half-up")).toBe("1.01");
        expect(value.decimal.fixed("-0.001", 2)).toBe("0.00");
        expect(value.decimal.fixed("-0.009", 2)).toBe("-0.01");
        expect(value.decimal.fixed("12", 0)).toBe("12");
        expect(value.decimal.fixed("0.5", 0)).toBe("0");
        expect(value.decimal.fixed("7", 3)).toBe("7.000");
        expect(failing(() => value.decimal.fixed("1.5", -1))).toBe("not a count of fraction digits: -1");
        expect(failing(() => value.decimal.round("1.5", 41))).toBe("not a count of fraction digits: 41");
        expect(failing(() => value.decimal.round("1.5", -41))).toBe("not a count of fraction digits: -41");

    });
    it("percent, negate, absolute, compare and the sign questions agree across spellings", () => {

        expect(text(value.decimal.percent("200", "15"))).toBe("30");
        expect(text(value.decimal.percent("19.99", "14"))).toBe("2.7986");
        expect(text(value.decimal.percent("100", "-2.5"))).toBe("-2.5");
        expect(text(value.decimal.negate("1.5"))).toBe("-1.5");
        expect(text(value.decimal.negate("-1.5"))).toBe("1.5");
        expect(text(value.decimal.negate("0"))).toBe("0");
        expect(text(value.decimal.absolute("-2.50"))).toBe("2.5");
        expect(text(value.decimal.absolute("2.5"))).toBe("2.5");
        expect(value.decimal.compare("1.10", "1.1")).toBe(0);
        expect(value.decimal.compare("-1", "1")).toBe(-1);
        expect(value.decimal.compare("2", "1.999")).toBe(1);
        expect(value.decimal.compare("0.1", 0.1)).toBe(0);
        expect(value.decimal.compare("10", "9")).toBe(1);
        expect(value.decimal.equal("1e2", "100")).toBe(true);
        expect(value.decimal.equal("-0", "0")).toBe(true);
        expect(value.decimal.equal("0.1", "0.10000000000000000001")).toBe(false);
        expect(text(value.decimal.lesser("1.50", "2"))).toBe("1.5");
        expect(text(value.decimal.lesser("2", "-3"))).toBe("-3");
        expect(text(value.decimal.greater("1.5", "2.0"))).toBe("2");
        expect(text(value.decimal.greater("-1", "-2"))).toBe("-1");
        expect(value.decimal.isZero("0.000") && value.decimal.isZero("-0") && value.decimal.isZero(0)).toBe(true);
        expect(value.decimal.isZero("0.001")).toBe(false);
        expect(value.decimal.isNegative("-0.01")).toBe(true);
        expect(value.decimal.isNegative("-0") || value.decimal.isNegative("1")).toBe(false);
        expect(value.decimal.isPositive("0.01")).toBe(true);
        expect(value.decimal.isPositive("0") || value.decimal.isPositive("-1")).toBe(false);
        expect(["10", "9", "-1", "1.5", "1.50", "0"].sort(value.decimal.compare)).toEqual(["-1", "0", "1.5", "1.50", "9", "10"]);

    });
    it("scale, toNumber, units and fromUnits move between text, floats and whole counts", () => {

        expect(value.decimal.scale("1.50")).toBe(1);
        expect(value.decimal.scale("100")).toBe(0);
        expect(value.decimal.scale("0.001")).toBe(3);
        expect(value.decimal.toNumber("1.5")).toBe(1.5);
        expect(value.decimal.toNumber("-0.1")).toBe(-0.1);
        expect(value.decimal.units("12.345", 2)).toBe(1234);
        expect(value.decimal.units(12.345, 2)).toBe(1234);
        expect(value.decimal.units("12.355", 2)).toBe(1236);
        expect(value.decimal.units(12.345, 2, "half-up")).toBe(1235);
        expect(value.decimal.units(1.005, 2, "half-up")).toBe(101);
        expect(value.decimal.units(0.1 + 0.2, 2)).toBe(30);
        expect(value.decimal.units("1e3")).toBe(1000);
        expect(value.decimal.units("0.5")).toBe(0);
        expect(value.decimal.units("1.5")).toBe(2);
        expect(value.decimal.units("-0.4")).toBe(0);
        expect(value.decimal.units(-0.4)).toBe(0);
        expect(value.decimal.units(7n, 3)).toBe(7000);
        expect(value.decimal.units("90071992547409.91", 2)).toBe(Number.MAX_SAFE_INTEGER);
        expect(failing(() => value.decimal.units("90071992547409.92", 2))).toBe("not a safe whole number: 9007199254740992");
        expect(failing(() => value.decimal.units(Number.NaN))).toBe("not a decimal: NaN");
        expect(failing(() => value.decimal.units("x"))).toBe("not a decimal: x");
        expect(failing(() => value.decimal.units("1", 41))).toBe("not a count of fraction digits: 41");
        expect(text(value.decimal.fromUnits(1234, 2))).toBe("12.34");
        expect(text(value.decimal.fromUnits(-5, 3))).toBe("-0.005");
        expect(text(value.decimal.fromUnits(100, 2))).toBe("1");
        expect(text(value.decimal.fromUnits(12n, 1))).toBe("1.2");
        expect(text(value.decimal.fromUnits(7))).toBe("7");
        expect(failing(() => value.decimal.fromUnits(1.5))).toBe("not a whole count of units: 1.5");
        expect(failing(() => value.decimal.fromUnits(2 ** 53))).toBe("not a whole count of units: 9007199254740992");
        expect(failing(() => value.decimal.fromUnits(1, 41))).toBe("not a count of fraction digits: 41");

    });

});
