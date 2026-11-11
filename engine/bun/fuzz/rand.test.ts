import { describe, expect, test as it } from "bun:test";
import * as rand from "engine/rand";
import * as fc from "fast-check";

const runs = 10_000;
const edge = 2 ** 45;
const bound = fc.integer({ min: -edge, max: edge });
const seed = fc.oneof(fc.string({ maxLength: 20 }), fc.double({ noNaN: true }));
const lower = /[a-z]/;
const upper = /[A-Z]/;
const digit = /\d/;
const symbol = /[^A-Za-z0-9]/;

describe("fuzz rand", () => {

    it("integers stay inside their bounds and a seed repeats them", () => {

        fc.assert(
            fc.property(seed, bound, bound, ( name, a, b ) => {

                const low = Math.min(a, b);
                const high = Math.max(a, b);
                const value = rand.seeded(name).int(a, b);
                const secure = rand.int(a, b);

                expect(Number.isInteger(value) && value >= low && value <= high).toBe(true);
                expect(Number.isInteger(secure) && secure >= low && secure <= high).toBe(true);
                expect(rand.seeded(name).int(a, b)).toBe(value);

            }),
            { numRuns: runs },
        );

    });
    it("floats stay inside their bounds and an index stays inside its length", () => {

        fc.assert(
            fc.property(seed, fc.double({ noNaN: true, noDefaultInfinity: true }), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer({ min: 1, max: 2 ** 50 }), ( name, a, b, length ) => {

                const stream = rand.seeded(name);
                const value = stream.float(Math.min(a, b), Math.max(a, b));
                const at = stream.index(length);

                expect(Number.isFinite(value) && value >= Math.min(a, b) && value <= Math.max(a, b)).toBe(true);
                expect(Number.isInteger(at) && at >= 0 && at < length).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("a shuffle is a permutation and a pick is a set of distinct members", () => {

        fc.assert(
            fc.property(seed, fc.nat(60), fc.integer({ min: -5, max: 80 }), ( name, length, count ) => {

                const items = Array.from({ length }, ( _, at ) => at);
                const stream = rand.seeded(name);
                const mixed = stream.shuffle(items);
                const some = stream.pickMany(items, count);

                expect([...mixed].sort(( x, y ) => x - y)).toEqual(items);
                expect(some).toHaveLength(Math.max(0, Math.min(length, count)));
                expect(new Set(some).size).toBe(some.length);
                expect(some.every(( item ) => item >= 0 && item < length)).toBe(true);
                expect(items).toHaveLength(length);

            }),
            { numRuns: runs },
        );

    });
    it("a weighted pick never answers an entry without weight", () => {

        fc.assert(
            fc.property(seed, fc.array(fc.oneof(fc.constantFrom(0, -1, Number.NaN, Number.POSITIVE_INFINITY), fc.double({ min: 0, max: 1e9, noNaN: true })), { maxLength: 12 }), ( name, weights ) => {

                const entries = weights.map(( weight, item ) => ({ item, weight }));
                const found = rand.seeded(name).weighted(entries);
                const live = weights.some(( weight ) => weight > 0 && Number.isFinite(weight));

                expect(found === undefined).toBe(!live);

                if ( found !== undefined ) expect((weights[found] ?? 0) > 0 && Number.isFinite(weights[found] ?? 0)).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("time ids carry any time inside 48 bits and stay sorted when it repeats", () => {

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), ( at ) => {

                const first = rand.uuid7(at);
                const second = rand.uuid7(at);
                const one = rand.ulid(at);
                const two = rand.ulid(at);

                expect([rand.uuidTime(first), rand.uuidTime(second), rand.ulidTime(one), rand.ulidTime(two)]).toEqual([at, at, at, at]);
                expect(second > first && two > one).toBe(true);
                expect(rand.isUlid(one) && rand.isUlid(two)).toBe(true);
                expect(rand.uuidTime(one)).toBeUndefined();
                expect(rand.ulidTime(first)).toBeUndefined();

            }),
            { numRuns: runs },
        );

    });
    it("text is drawn only from the alphabet it is given", () => {

        fc.assert(
            fc.property(seed, fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }), fc.nat(64), ( name, alphabet, length ) => {

                const drawn = rand.seeded(name).letters(length, alphabet);
                const secure = rand.letters(length, alphabet);

                expect(drawn).toHaveLength(length);
                expect(secure).toHaveLength(length);
                expect([...drawn, ...secure].every(( letter ) => alphabet.includes(letter))).toBe(true);

            }),
            { numRuns: runs },
        );

    });
    it("a password holds every class its rules ask for and nothing else", () => {

        fc.assert(
            fc.property(seed, fc.nat(48), fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()), ( name, length, [low, high, digits, symbols, safe] ) => {

                const rules = { length, lower: low, upper: high, digits, symbols, safe };
                const classes = [low, high, digits, symbols].filter(Boolean).length;

                if ( classes === 0 ) {

                    expect(() => rand.seeded(name).password(rules)).toThrow(RangeError);

                    return;

                }

                const made = rand.seeded(name).password(rules);

                expect(made).toHaveLength(Math.max(classes, length));
                expect([lower.test(made), upper.test(made), digit.test(made), symbol.test(made)]).toEqual([low, high, digits, symbols]);
                expect(safe && /[ilo IO01]/.test(made)).toBe(false);
                expect(rand.seeded(name).password(rules)).toBe(made);

            }),
            { numRuns: runs },
        );

    });
    it("bytes, tokens and codes have exactly the size asked", () => {

        fc.assert(
            fc.property(fc.nat(4096), ( size ) => {

                expect(rand.bytes(size)).toHaveLength(size);
                expect(rand.trace(size)).toHaveLength(size * 2);
                expect(rand.nanoid(size)).toHaveLength(size);
                expect(rand.otp(size)).toMatch(new RegExp(`^\\d{${size}}$`));
                expect(rand.token(size)).toHaveLength(Math.ceil((size * 4) / 3));

            }),
            { numRuns: 2000 },
        );

    });

});
