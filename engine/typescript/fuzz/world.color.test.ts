import { describe, expect, test as it } from "bun:test";
import * as world from "engine/world";
import * as fc from "fast-check";

const runs = 20_000;
const byte = fc.integer({ min: 0, max: 255 });
const part = fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: -400, max: 400 })).map(String);
const shaped = fc.tuple(fc.constantFrom("rgb", "rgba", "hsl", "hsla", "hwb", "oklch", "oklab", "lab", ""), fc.array(fc.oneof(part, part.map(( text ) => `${text}%`), fc.constantFrom("none", "", "deg", "1turn", "/", "e", "-")), { maxLength: 6 }), fc.constantFrom(" ", ", ", " / ", ","))
    .map(([kind, parts, glue]) => `${kind}(${parts.join(glue)})`);
const toned = fc.tuple(byte, byte, byte, fc.double({ min: 0, max: 1, noNaN: true })).map(([r, g, b, a]) => world.rgb(r, g, b, a));

function inside ( given: world.Rgb ): boolean {

    return [given.r, given.g, given.b].every(( value ) => Number.isInteger(value) && value >= 0 && value <= 255) && given.a >= 0 && given.a <= 1;

}

describe("fuzz world.color", () => {

    it("color never throws, and whatever it reads is inside the gamut", () => {

        fc.assert(fc.property(fc.oneof(fc.string({ maxLength: 40 }), shaped, fc.string({ unit: fc.constantFrom(..."#0123456789abcdefABCDEFg"), maxLength: 10 })), ( text ) => {

            const read = world.color(text);

            expect(read === undefined || inside(read)).toBe(true);
            expect(world.isColor(text)).toBe(read !== undefined);

        }), { numRuns: runs });

    });
    it("every channel round trips through hex, rgb, hsl and oklch", () => {

        fc.assert(fc.property(byte, byte, byte, ( r, g, b ) => {

            const given = world.rgb(r, g, b);

            expect(world.color(world.toHex(given))).toEqual(given);
            expect(world.color(world.toCss(given, "rgb"))).toEqual(given);
            expect(world.fromHsl(world.toHsl(given))).toEqual(given);

            const back = world.fromOklch(world.toOklch(given));

            expect(Math.abs(back.r - r) + Math.abs(back.g - g) + Math.abs(back.b - b)).toBeLessThanOrEqual(1);
            expect(world.contrast(given, given)).toBe(1);

        }), { numRuns: runs });

    });
    it("every oklch triple lands inside the gamut, and contrast is symmetric and bounded", () => {

        fc.assert(fc.property(fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: -720, max: 720, noNaN: true }), ( l, c, h ) => {

            expect(inside(world.fromOklch({ l, c, h, a: 1 }))).toBe(true);

        }), { numRuns: runs });
        fc.assert(fc.property(toned, toned, ( a, b ) => {

            const solid = world.alpha(a, 1);
            const ground = world.alpha(b, 1);

            expect(world.contrast(solid, ground)).toBe(world.contrast(ground, solid));
            expect(world.contrast(a, ground)).toBeGreaterThanOrEqual(1);
            expect(world.contrast(a, ground)).toBeLessThanOrEqual(21);
            expect(inside(world.blend(a, b)) && inside(world.mix(a, b, a.a))).toBe(true);

        }), { numRuns: runs });

    });
    it("shades never cross and an ensured ink is always readable", () => {

        fc.assert(fc.property(byte, byte, byte, byte, byte, byte, ( r, g, b, x, y, z ) => {

            const made = world.shades(world.rgb(r, g, b));
            const lights = Object.values(made).map(( tone ) => world.luminance(tone));

            expect(made[500]).toEqual(world.rgb(r, g, b));

            expect(lights.every(( light, at ) => at === 0 || light - (lights[at - 1] ?? 1) <= 0.01)).toBe(true);
            expect(world.readable(world.ensureReadable(world.rgb(r, g, b), world.rgb(x, y, z)), world.rgb(x, y, z))).toBe(true);

        }), { numRuns: 5000 });

    });

});
