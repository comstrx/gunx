import { beforeAll, describe, expect, test as it } from "bun:test";
import * as world from "engine/world";
import * as fc from "fast-check";

const runs = 2_000;
const letters = "abcdefghijklmnopqrstuvwxyz";
const pair = fc.tuple(fc.integer({ min: 0, max: 25 }), fc.integer({ min: 0, max: 25 })).map(([a, b]) => `${letters[a]}${letters[b]}`);
const digits = fc.stringMatching(/^[0-9]{0,16}$/);

beforeAll(async () => {

    await world.load();

});

describe("fuzz world", () => {

    it("phones never throw, keep their shapes, bound their text, and every valid e164 parses back to itself", () => {

        fc.assert(fc.property(fc.string({ maxLength: 80 }), fc.constantFrom("eg", "sa", "us", "gb", "zz", ""), ( text, home ) => {

            const phone = world.countries.phone(text, home);

            expect(typeof phone.valid).toBe("boolean");
            expect(phone.e164 === undefined || (phone.e164.startsWith("+") && phone.valid && phone.e164 === `${phone.key}${phone.national}`)).toBe(true);
            expect(/^[0-9]*$/.test(phone.national) && phone.national.length <= 64).toBe(true);
            expect(phone.valid ? phone.country !== undefined && phone.key !== undefined : phone.e164 === undefined).toBe(true);

            if ( phone.valid && phone.e164 ) {

                const again = world.countries.phone(phone.e164);

                expect([again.e164, again.key, again.national]).toEqual([phone.e164, phone.key, phone.national]);
                expect(world.countries.byPhone(phone.e164)?.key).toBe(phone.key);

            }

            if ( text.length > 64 ) expect(phone).toEqual({ country: undefined, key: undefined, national: "", e164: undefined, valid: false });

        }), { numRuns: runs });
        const counted = new Map<string, number>();

        for ( const country of world.countries.all ) if ( country.key !== null ) counted.set(country.key, (counted.get(country.key) ?? 0) + 1);

        fc.assert(fc.property(fc.constantFrom(...world.countries.all.filter(( country ) => country.key !== null && country.lengths !== null && counted.get(country.key) === 1)), fc.integer({ min: 0, max: 1e15 }), ( country, seed ) => {

            const [low, high] = country.lengths as readonly [number, number];
            const size = low + (seed % (high - low + 1));
            const national = `${1 + (seed % 9)}${String(seed).padStart(size, "7").slice(0, size - 1)}`;
            const typed = `${country.key}${national}`;
            const parsed = world.countries.phone(typed);

            expect(parsed.valid && parsed.e164 === typed && parsed.national === national).toBe(true);
            expect(parsed.key).toBe(country.key as string);
            expect(world.countries.phone(national, country.code).key).toBe(country.key as string);

        }), { numRuns: runs });

    });
    it("key search answers with keys whose codes start with or equal the typed digits, honours limits and never throws on text", () => {

        fc.assert(fc.property(digits, fc.integer({ min: -2, max: 30 }), ( typed, limit ) => {

            const found = world.keys.search(typed, limit);

            expect(found.length <= Math.max(0, limit)).toBe(true);
            expect(new Set(found.map(( key ) => key.code)).size).toBe(found.length);

            if ( typed !== "" && found.length > 0 && limit > 0 ) {

                const first = found[0] as world.Key;
                const codes = world.dialings(first.key, first.areas).map(( code ) => code.replace(/\D/g, ""));

                expect(codes.some(( code ) => code === typed.replace(/^0+/, "") || code.startsWith(typed) || typed.startsWith(code))).toBe(true);

            }

        }), { numRuns: runs });
        fc.assert(fc.property(fc.string({ maxLength: 12 }), ( text ) => {

            world.keys.search(text, 5);
            world.countries.search(text, 5);
            world.currencies.search(text, 5);
            world.languages.search(text, 5);
            world.emojis.browse({ query: text, limit: 5 });

        }), { numRuns: 300 });

    });
    it("currency minor and major round trip at every currency's digits and rounding lands on the grid", () => {

        fc.assert(fc.property(fc.constantFrom(...world.currencies.all), fc.integer({ min: -1e9, max: 1e9 }), ( currency, units ) => {

            const code = currency.code;
            const amount = world.currencies.major(units, code);

            const shown = world.currencies.digitsOf(code);

            expect(world.currencies.minor(amount, code)).toBe(units);
            expect(Math.abs(world.currencies.round(amount, code) - amount) <= 0.5 * 10 ** -shown + 1e-9).toBe(true);
            expect(shown <= world.currencies.exponentOf(code) && Number.isInteger(shown)).toBe(true);
            expect(world.currencies.format(amount, code).length > 0).toBe(true);
            expect(world.currencies.symbolOf(code).length > 0 && world.currencies.nameOf(code).length > 0).toBe(true);

        }), { numRuns: runs });

    });
    it("every catalog emoji codes and decodes to its plain glyph, is found by its glyph and shortcode, and images are files", () => {

        fc.assert(fc.property(fc.constantFrom(...world.emojis.all), ( emoji ) => {

            const plain = world.plainEmoji(emoji.glyph);

            expect(world.emojiGlyph(world.emojiCode(emoji.glyph))).toBe(plain);
            expect(world.emojiGlyph(emoji.code)).toBe(plain);
            expect(world.emojis.get(emoji.glyph)).toBe(emoji);
            expect(world.isEmoji(emoji.glyph) && world.onlyEmoji(emoji.glyph)).toBe(true);
            expect(world.emojisIn(`a ${emoji.glyph} b`)).toEqual([emoji.glyph]);
            expect(world.emojis.byShortcode(world.emojis.shortcode(emoji.glyph) ?? "")?.name.en === emoji.name.en).toBe(true);
            expect((world.emojis.imageOf(emoji.glyph) ?? "").endsWith(world.isFlag(emoji.glyph) ? ".svg" : ".webp")).toBe(true);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.string({ maxLength: 40, unit: "grapheme" }), ( text ) => {

            const found = world.emojisIn(text);

            expect(found.every(( glyph ) => world.isEmoji(glyph))).toBe(true);
            expect(world.stripEmoji(text).length).toBeLessThanOrEqual(text.length);
            expect(world.emojiGlyph(world.emojiCode(found[0] ?? "😀")).length).toBeGreaterThan(0);

        }), { numRuns: runs });

    });
    it("flags round trip for every two-letter pair and refuse everything else", () => {

        fc.assert(fc.property(pair, fc.constantFrom("svg", "webp", undefined), ( code, format ) => {

            const glyph = world.flagEmoji(code);

            expect(glyph.length).toBe(4);
            expect(world.flagCode(glyph)).toBe(code.toUpperCase());
            expect(world.flagCode(world.flagEmoji(code.toUpperCase()))).toBe(code.toUpperCase());
            expect(world.isFlag(glyph)).toBe(true);
            expect(world.flagFile(code, { format })).toBe(`/world/flag/${code}.${format ?? "svg"}`);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.string({ maxLength: 6 }), ( text ) => {

            const glyph = world.flagEmoji(text);

            expect(glyph === "" || world.flagCode(glyph) === text.trim().toUpperCase()).toBe(true);
            expect(world.flagFile(text) === "" || /^\/world\/flag\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/.test(world.flagFile(text))).toBe(true);

        }), { numRuns: runs });

    });
    it("languages agree with themselves on direction and script, and every country's languages and currencies resolve", () => {

        fc.assert(fc.property(fc.constantFrom(...world.languages.all), fc.constantFrom("", "-EG", "_eg", "-Latn", "-Arab-EG", "-TW"), ( language, tail ) => {

            const code = `${language.code}${tail}`;
            const direction = world.languages.directionOf(code);

            expect(world.languages.isRtl(code)).toBe(direction === "rtl");
            expect(world.languages.get(code)).toBe(language);
            expect(world.languages.scriptOf(code)).toBe(tail === "-Latn" ? "Latn" : tail === "-Arab-EG" ? "Arab" : tail === "-TW" && language.code === "zh" ? "Hant" : language.script);
            expect(direction).toBe(tail === "-Latn" ? "ltr" : tail === "-Arab-EG" ? "rtl" : language.direction);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.constantFrom(...world.countries.all), ( country ) => {

            for ( const code of country.currencies ) expect(world.currencies.has(code)).toBe(true);
            for ( const code of country.languages ) expect(world.languages.has(code)).toBe(true);

            expect(world.countries.byAlpha3(country.alpha3)).toBe(country);
            expect(world.countries.byNumeric(country.numeric)).toBe(country);
            expect(world.countries.get(country.code.toLowerCase())).toBe(country);
            expect(world.flagCode(world.flagEmoji(country.code))).toBe(country.code);

            if ( country.key !== null ) expect(world.keys.of(country.code)).toBe(country.key);

        }), { numRuns: runs });

    });

});
