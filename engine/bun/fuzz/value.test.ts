import { describe, expect, test as it } from "bun:test";
import * as validate from "engine/validate";
import * as value from "engine/value";
import * as fc from "fast-check";

const runs = 20_000;
const modes: readonly value.Rounding[] = ["half-even", "half-up", "half-down", "up", "down", "ceil", "floor"];
const kinds: readonly value.Kind[] = ["null", "boolean", "integer", "number", "date", "text", "list", "record"];
const code = fc.constantFrom("EGP", "USD", "JPY", "KWD", "CLF");
const priced = fc.record({ minor: fc.maxSafeInteger(), currency: code });
const modest = fc.record({ minor: fc.integer({ min: -1e12, max: 1e12 }), currency: code });
const amount = fc.tuple(fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }), fc.integer({ min: 0, max: 9 })).map(([units, digits]) => value.decimal.fromUnits(units, digits));
const anything = fc.anything({ withBigInt: true, withDate: true, withMap: true, withSet: true, withNullPrototype: true, withObjectString: true, withTypedArray: true });
const counting = fc.array(fc.constantFrom(..."-+0123456789.,_ eE٠١٢٣٤٥٦٧٨٩٫٬\u2212\u061c\u200f"), { maxLength: 24 }).map(( letters ) => letters.join(""));
const wild = fc.oneof(fc.string({ maxLength: 300, unit: "binary" }), fc.string({ maxLength: 40 }), counting);
const shaped = fc.oneof(
    wild,
    fc.emailAddress(),
    fc.webUrl(),
    fc.uuid(),
    fc.ulid(),
    fc.stringMatching(/^[A-Za-z0-9_'+.-]{0,12}@[A-Za-z0-9.-]{0,16}$/),
    fc.stringMatching(/^\+?[0-9 ()-]{5,18}$/),
    fc.stringMatching(/^[a-zA-Z]{2,3}([-_][a-zA-Z]{4})?([-_]([a-zA-Z]{2}|[0-9]{3}))?$/),
    fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
);
const readers: Record<string, ( given: unknown ) => string | undefined> = {
    email: value.email,
    url: value.url,
    phone: value.phone,
    slug: value.slug,
    key: value.key,
    uuid: value.uuid,
    ulid: value.ulid,
    currency: value.currency,
    locale: value.locale,
    otp: value.otp,
    plainDate: value.plainDate,
};

function size ( given: bigint ): bigint {

    return given < 0n ? -given : given;

}
function grouped ( text: string ): string {

    const [whole = "", fraction] = text.split(".");
    const spaced = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return fraction === undefined ? spaced : `${spaced}.${fraction}`;

}

describe("fuzz value", () => {

    it("no cast, typed reader or money reader throws on anything", () => {

        fc.assert(
            fc.property(fc.oneof(anything, wild), ( given ) => {

                value.integer(given);
                value.number(given);
                value.boolean(given);
                value.text(given);
                value.date(given);
                value.record(given);
                value.list(given);
                value.listOf(given, value.currency);
                value.oneOf(given, ["draft", "live"]);
                value.scalar(given);

                for ( const read of Object.values(readers) ) read(given);
                for ( const wanted of kinds ) value.cast(wanted, given);

                expect(kinds).toContain(value.kind(given));
                expect(value.decimal.parse(given) === undefined || value.decimal.is(value.decimal.parse(given))).toBe(true);
                expect(value.money.parse(given) === undefined || value.money.is(value.money.parse(given))).toBe(true);
                expect(value.money.fromJson(given) === undefined || value.money.is(value.money.fromJson(given))).toBe(true);
                expect(typeof value.money.is(given)).toBe("boolean");
                expect(typeof value.decimal.is(given)).toBe("boolean");

            }),
            { numRuns: runs },
        );

    });
    it("a cast answers inside its own type or stays absent", () => {

        fc.assert(
            fc.property(fc.oneof(anything, wild), ( given ) => {

                const whole = value.integer(given);
                const measured = value.number(given);
                const dated = value.date(given);
                const word = value.text(given);

                expect(whole === undefined || Number.isSafeInteger(whole)).toBe(true);
                expect(measured === undefined || Number.isFinite(measured)).toBe(true);
                expect(dated === undefined || !Number.isNaN(dated.getTime())).toBe(true);
                expect(word === undefined || (word.length > 0 && word === word.trim())).toBe(true);
                expect(value.list(given).every(( item ) => item.length > 0 && item === item.trim())).toBe(true);
                expect(Object.is(whole, -0) || Object.is(measured, -0)).toBe(false);

            }),
            { numRuns: runs },
        );

    });
    it("a typed reader answers a fixed point of itself that its pattern knows", () => {

        fc.assert(
            fc.property(shaped, ( text ) => {

                for ( const [name, read] of Object.entries(readers) ) {

                    const found = read(text);

                    if ( found === undefined ) continue;

                    expect(read(found), name).toBe(found);

                }

                const email = value.email(text);
                const told = validate.check(validate.email(), text.trim());

                expect(told.ok, text).toBe(email !== undefined);
                expect(told.ok ? told.value : undefined).toBe(email);
                expect(email === undefined || value.patterns.email.test(email)).toBe(true);
                expect(value.phone(text) === undefined || value.patterns.phone.test(value.phone(text) ?? "")).toBe(true);
                expect(value.slug(text) === undefined || value.patterns.slug.test(value.slug(text) ?? "")).toBe(true);
                expect(value.key(text) === undefined || value.patterns.key.test(value.key(text) ?? "")).toBe(true);
                expect(value.currency(text) === undefined || /^[A-Za-z]{3}$/.test(text.trim())).toBe(true);
                expect(value.locale(text) === undefined || value.patterns.locale.test(value.locale(text) ?? "")).toBe(true);
                expect(value.plainDate(text) === undefined || value.patterns.plainDate.test(value.plainDate(text) ?? "")).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("generated identifiers and calendar days are read back unchanged", () => {

        fc.assert(
            fc.property(fc.uuid(), fc.ulid(), fc.date({ noInvalidDate: true, min: new Date("0001-01-01T00:00:00.000Z"), max: new Date("9999-12-31T23:59:59.999Z") }), ( uuid, ulid, day ) => {

                expect(value.uuid(uuid.toUpperCase())).toBe(uuid as value.Uuid);
                expect(value.ulid(ulid.toLowerCase())).toBe(ulid as value.Ulid);
                expect(value.plainDate(day.toISOString().slice(0, 10))).toBe(day.toISOString().slice(0, 10) as value.PlainDate);
                expect(value.date(day.toISOString())?.getTime()).toBe(day.getTime());
                expect(value.date(day.getTime())?.getTime()).toBe(day.getTime());

            }),
            { numRuns: runs },
        );

    });
    it("whole and measured text reads back the number that wrote it, grouped or not", () => {

        fc.assert(
            fc.property(fc.maxSafeInteger(), fc.double({ noNaN: true, noDefaultInfinity: true }), ( whole, measured ) => {

                expect(value.integer(String(whole)) === whole).toBe(true);
                expect(value.integer(grouped(String(whole))) === whole).toBe(true);
                expect(value.integer(whole.toLocaleString("en-IN")) === whole).toBe(true);
                expect(value.integer(whole.toLocaleString("ar-EG")) === whole).toBe(true);
                expect(value.integer(whole.toLocaleString("sv-SE")) === whole).toBe(true);
                expect(value.integer(whole.toLocaleString("fr-FR")) === whole).toBe(true);
                expect(value.number(String(measured)) === measured).toBe(true);
                expect(value.number(measured) === measured).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("one stray separator is refused wherever it does not close a group of three", () => {

        fc.assert(
            fc.property(fc.stringMatching(/^[1-9][0-9]{1,14}$/), fc.nat(), ( digits, seed ) => {

                const cut = 1 + (seed % (digits.length - 1));
                const text = `${digits.slice(0, cut)},${digits.slice(cut)}`;
                const closes = digits.length - cut === 3;
                const minor = Number(digits) * 100;

                expect(value.integer(text)).toBe(closes ? Number(digits) : undefined);
                expect(value.decimal.parse(text)).toBe(closes ? (digits as value.Decimal) : undefined);
                expect(value.money.parse(`${text} EGP`)?.minor).toBe(closes && Number.isSafeInteger(minor) ? minor : undefined);
                expect(value.integer(`${digits}.5,000`)).toBeUndefined();
                expect(value.decimal.parse(`,${digits}`)).toBeUndefined();

            }),
            { numRuns: runs },
        );

    });
    it("decimal arithmetic is exact, canonical and ordered", () => {

        fc.assert(
            fc.property(amount, amount, amount, fc.integer({ min: 0, max: 9 }), fc.constantFrom(...modes), ( a, b, c, digits, mode ) => {

                const divisor = value.decimal.isZero(b) ? value.decimal.of(1) : b;

                expect(value.decimal.is(a)).toBe(true);
                expect(value.decimal.of(a)).toBe(a);
                expect(value.decimal.add(a, b)).toBe(value.decimal.add(b, a));
                expect(value.decimal.multiply(a, b)).toBe(value.decimal.multiply(b, a));
                expect(value.decimal.subtract(value.decimal.add(a, b), b)).toBe(a);
                expect(value.decimal.add(value.decimal.add(a, b), c)).toBe(value.decimal.add(a, value.decimal.add(b, c)));
                expect(value.decimal.sum([a, b, c])).toBe(value.decimal.add(value.decimal.add(a, b), c));
                expect(value.decimal.multiply(a, value.decimal.add(b, c))).toBe(value.decimal.add(value.decimal.multiply(a, b), value.decimal.multiply(a, c)));
                expect(value.decimal.negate(value.decimal.negate(a))).toBe(a);
                expect(value.decimal.isZero(value.decimal.add(a, value.decimal.negate(a)))).toBe(true);
                expect(value.decimal.isNegative(value.decimal.absolute(a))).toBe(false);
                expect(value.decimal.compare(a, b) + value.decimal.compare(b, a)).toBe(0);
                expect(value.decimal.equal(a, b)).toBe(a === b);
                expect(value.decimal.compare(value.decimal.lesser(a, b), value.decimal.greater(a, b))).toBeLessThanOrEqual(0);
                expect(value.decimal.percent(a, 100)).toBe(a);
                expect(value.decimal.compare(value.decimal.round(a, digits, "floor"), a)).toBeLessThanOrEqual(0);
                expect(value.decimal.compare(value.decimal.round(a, digits, "ceil"), a)).toBeGreaterThanOrEqual(0);
                expect(value.decimal.compare(value.decimal.round(a, digits, mode), value.decimal.round(a, digits, "floor"))).toBeGreaterThanOrEqual(0);
                expect(value.decimal.compare(value.decimal.round(a, digits, mode), value.decimal.round(a, digits, "ceil"))).toBeLessThanOrEqual(0);
                expect(value.decimal.scale(value.decimal.round(a, digits, mode))).toBeLessThanOrEqual(digits);
                expect(value.decimal.equal(value.decimal.fixed(a, digits, mode), value.decimal.round(a, digits, mode))).toBe(true);
                expect(value.decimal.fixed(a, digits, mode).split(".")[1]?.length ?? 0).toBe(digits);
                expect(value.decimal.toNumber(a)).toBe(Number(a));
                expect(value.decimal.divide(value.decimal.multiply(a, divisor), divisor)).toBe(a);

            }),
            { numRuns: runs },
        );

    });
    it("decimals agree with whole-number arithmetic and carry units both ways", () => {

        fc.assert(
            fc.property(fc.integer({ min: -1e7, max: 1e7 }), fc.integer({ min: -1e7, max: 1e7 }), fc.maxSafeInteger(), fc.integer({ min: 0, max: 6 }), ( a, b, count, digits ) => {

                expect(value.decimal.add(a, b)).toBe(String(a + b) as value.Decimal);
                expect(value.decimal.subtract(a, b)).toBe(String(a - b) as value.Decimal);
                expect(value.decimal.multiply(a, b)).toBe(String(BigInt(a) * BigInt(b)) as value.Decimal);
                expect(value.decimal.units(value.decimal.fromUnits(count, digits), digits)).toBe(count);
                expect(value.decimal.fromUnits(value.decimal.units(a, digits), digits)).toBe(String(a) as value.Decimal);

            }),
            { numRuns: runs },
        );

    });
    it("allocate hands out every minor unit, each share within one unit of its exact part", () => {

        fc.assert(
            fc.property(priced, fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 }), fc.boolean(), ( price, weights, fractional ) => {

                fc.pre(weights.some(( weight ) => weight > 0));

                const shares = value.money.allocate(price, fractional ? weights.map(( weight ) => weight / 1000) : weights);
                const weight = weights.reduce(( all, one ) => all + BigInt(one), 0n);

                expect(shares.length).toBe(weights.length);
                expect(shares.reduce(( all, share ) => all + share.minor, 0)).toBe(price.minor);
                expect(value.money.total(shares, price.currency)).toEqual(price);
                expect(shares.every(( share ) => share.currency === price.currency && Math.sign(share.minor) * Math.sign(price.minor) >= 0)).toBe(true);
                expect(shares.every(( share, index ) => size(BigInt(share.minor) * weight - BigInt(price.minor) * BigInt(weights[index] ?? 0)) < weight)).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("split is an even allocation whose shares differ by at most one unit", () => {

        fc.assert(
            fc.property(priced, fc.integer({ min: 1, max: 64 }), ( price, count ) => {

                const shares = value.money.split(price, count).map(( share ) => share.minor);

                expect(shares.length).toBe(count);
                expect(shares.reduce(( all, share ) => all + share, 0)).toBe(price.minor);
                expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
                expect(shares).toEqual(value.money.allocate(price, Array.from({ length: count }, () => 1)).map(( share ) => share.minor));

            }),
            { numRuns: runs },
        );

    });
    it("money survives its wire, its decimal, its text and its own inverse operations", () => {

        fc.assert(
            fc.property(priced, modest, modest, fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 1, max: 1000 }), ( price, a, other, rate, by ) => {

                const b = { minor: other.minor, currency: a.currency };
                const wire = value.money.toJson(price);

                expect(value.money.is(price)).toBe(true);
                expect(value.money.fromJson(wire)).toEqual(price);
                expect(value.money.fromJson(JSON.parse(JSON.stringify(wire)))).toEqual(price);
                expect(value.money.fromJson({ amount: wire.amount, currency: wire.currency })).toEqual(price);
                expect(value.money.fromJson({ ...wire, minor: wire.minor === 0 ? 1 : -wire.minor })).toBeUndefined();
                expect(value.money.of(value.money.decimal(price), price.currency)).toEqual(price);
                expect(value.money.parse(`${price.currency} ${grouped(wire.amount)}`)).toEqual(price);
                expect(value.money.parse(`${wire.amount} ${price.currency.toLowerCase()}`)).toEqual(price);
                expect(value.decimal.units(value.money.decimal(price), value.money.exponent(price.currency))).toBe(price.minor);
                expect(value.money.subtract(value.money.add(a, b), b)).toEqual(a);
                expect(value.money.add(a, b)).toEqual(value.money.add(b, a));
                expect(value.money.negate(value.money.negate(a))).toEqual(a);
                expect(value.money.isNegative(value.money.absolute(a))).toBe(false);
                expect(value.money.compare(a, b) + value.money.compare(b, a)).toBe(0);
                expect(value.money.equal(a, b)).toBe(a.minor === b.minor);
                expect(value.money.compare(value.money.lesser(a, b), value.money.greater(a, b))).toBeLessThanOrEqual(0);
                expect(value.money.percent(a, 100)).toEqual(a);
                expect(value.money.multiply(a, 1)).toEqual(a);
                expect(value.money.divide(value.money.multiply(a, by), by)).toEqual(a);
                expect(value.money.net(value.money.gross(a, rate / 100), rate / 100)).toEqual(a);
                expect(value.money.add(value.money.tax(a, rate / 100), a)).toEqual(value.money.gross(a, rate / 100));
                expect(value.money.convert(a, a.currency, 1)).toEqual(a);

            }),
            { numRuns: runs },
        );

    });
    it("every rounding mode lands between floor and ceil, one unit apart at most, around the exact product", () => {

        fc.assert(
            fc.property(modest, fc.integer({ min: -100_000, max: 100_000 }), fc.constantFrom(...modes), ( price, thousandths, mode ) => {

                const by = value.decimal.fromUnits(thousandths, 3);
                const floor = value.money.multiply(price, by, "floor").minor;
                const ceil = value.money.multiply(price, by, "ceil").minor;
                const found = value.money.multiply(price, by, mode).minor;
                const exact = BigInt(price.minor) * BigInt(thousandths);

                expect(BigInt(floor) * 1000n <= exact && exact <= BigInt(ceil) * 1000n).toBe(true);
                expect(ceil - floor).toBeLessThanOrEqual(1);
                expect(found === floor || found === ceil).toBe(true);
                expect(exact % 1000n === 0n ? floor === ceil : ceil - floor === 1).toBe(true);
                expect(Math.abs(value.money.multiply(price, by, "down").minor)).toBeLessThanOrEqual(Math.abs(value.money.multiply(price, by, "up").minor));
                expect(value.money.multiply(price, thousandths / 1000, mode).minor).toBe(found);

            }),
            { numRuns: runs },
        );

    });

});
