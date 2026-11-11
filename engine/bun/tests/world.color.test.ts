import { describe, expect, test as it } from "bun:test";
import * as world from "engine/world";

const white = world.rgb(255, 255, 255);
const black = world.rgb(0, 0, 0);
const brand = world.color("#ff4500") as world.Rgb;
const cyan = world.rgb(0, 255, 255);
const steps: world.Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function miss ( a: world.Rgb, b: world.Rgb ): number {

    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

}

describe("world.color", () => {

    it("reads hex in every width, the css names and nothing else", () => {

        expect(world.color("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        expect(world.color("#F0A8")).toEqual({ r: 255, g: 0, b: 170, a: 136 / 255 });
        expect(world.color("#ff000080")?.a).toBeCloseTo(0.502, 2);
        expect(world.color("  #FF4500 ")).toEqual(brand);
        expect(world.color("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        expect(world.color("orangered")).toEqual(brand);
        expect(world.color("RebeccaPurple")).toEqual(world.rgb(102, 51, 153));
        expect(world.color(" Teal ")).toEqual(world.rgb(0, 128, 128));
        expect(world.color("grey")).toEqual(world.color("gray"));
        expect(world.color("lightgoldenrodyellow")).toEqual(world.rgb(250, 250, 210));
        expect(world.color("yellowgreen")).toEqual(world.rgb(154, 205, 50));
        expect(world.color("aliceblue")).toEqual(world.rgb(240, 248, 255));

        for ( const text of ["#12345", "#", "#ggg", "", "nope", "constructor", "toString", "x".repeat(200), `#${"f".repeat(129)}`] ) expect(world.color(text)).toBeUndefined();

        expect(world.isColor("#fff") && world.isColor("red") && world.isColor("hsl(0 0% 0%)")).toBe(true);
        expect(world.isColor("nope") || world.isColor(7) || world.isColor(undefined) || world.isColor({ r: 0, g: 0, b: 0, a: 1 })).toBe(false);

    });
    it("reads every functional form: legacy and modern, percent, none, angle units, alpha", () => {

        expect(world.color("rgb(255, 69, 0)")).toEqual(brand);
        expect(world.color("rgba(0,0,0,.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
        expect(world.color("rgb(100% 0% 0% / 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
        expect(world.color("rgb(1e2 0 0)")).toEqual(world.rgb(100, 0, 0));
        expect(world.color("rgb(300 -5 12.6)")).toEqual(world.rgb(255, 0, 13));
        expect(world.color("hsl(16.2 100% 50%)")).toEqual(brand);
        expect(world.color("hsla(0, 0%, 100%, 1)")).toEqual(white);
        expect(world.color("hsl(180deg 100 50)")).toEqual(cyan);
        expect(world.color("hsl(0.5turn 100% 50%)")).toEqual(cyan);
        expect(world.color("hsl(200grad 100% 50%)")).toEqual(cyan);
        expect(world.color("hsl(3.14159265rad 100% 50%)")).toEqual(cyan);
        expect(world.color("hsl(-180 100% 50%)")).toEqual(cyan);
        expect(world.color("hsl(90 50% 50% / none)")).toEqual({ r: 128, g: 191, b: 64, a: 0 });
        expect(world.color("hwb(16.2 0% 0%)")).toEqual(brand);
        expect(world.color("hwb(0 50% 50%)")).toEqual(world.rgb(128, 128, 128));
        expect(world.color("hwb(0 80% 80%)")).toEqual(world.rgb(128, 128, 128));
        expect(world.color("hwb(120 20% 30% / 0.5)")).toEqual({ r: 51, g: 179, b: 51, a: 0.5 });
        expect(world.color("oklab(62.8% 0.2249 0.1258)")).toEqual(world.rgb(255, 0, 0));
        expect(world.color("oklch(none 0 0)")).toEqual(black);
        expect(world.color("oklch(100% 0 0)")).toEqual(white);
        expect(world.color("oklch(0.68 55% 40 / 50%)")).toEqual({ ...(world.color("oklch(68% 0.22 40)") as world.Rgb), a: 0.5 });

        for ( const text of ["rgb(a,b,c)", "rgb()", "rgb(1 2)", "rgb(1 2 3 4 5)", "rgb(1 2 3 / 4 / 5)", "rgb(1 2 3 /)", "rgb(1 2 3 / 0.5 0.5)", "rgb(0x10 0 0)", "rgb(1 2 3", "hwba(0 0% 0%)", "oklcha(1 0 0)", "hsl(1px 0% 0%)", "lab(50% 0 0)", "rgb(Infinity 0 0)"] ) expect(world.color(text)).toBeUndefined();

    });
    it("writes hex, rgb, hsl and oklch that read back", () => {

        expect(world.toHex(brand)).toBe("#ff4500");
        expect(world.toHex({ ...brand, a: 0.5 })).toBe("#ff450080");
        expect(world.toHex({ ...brand, a: 0.5 }, false)).toBe("#ff4500");
        expect(world.toHex(brand, true)).toBe("#ff4500ff");
        expect(world.toCss(brand)).toBe("#ff4500");
        expect(world.toCss(world.alpha(brand, 0.5))).toBe("#ff450080");
        expect(world.toCss(brand, "rgb")).toBe("rgb(255 69 0)");
        expect(world.toCss({ ...brand, a: 0.25 }, "rgb")).toBe("rgb(255 69 0 / 0.25)");
        expect(world.toCss(brand, "hsl")).toBe("hsl(16.2 100% 50%)");
        expect(world.toCss({ ...brand, a: 0.5 }, "hsl")).toBe("hsl(16.2 100% 50% / 0.5)");
        expect(world.toCss(brand, "oklch")).toBe("oklch(66.02% 0.2294 35.4)");
        expect(world.channels(brand)).toBe("16.2 100% 50%");

        const formats: world.ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];

        for ( const given of [white, black, brand, cyan, world.rgb(12, 200, 90), world.rgb(37, 99, 235)] ) {

            for ( const format of formats ) expect(miss(world.color(world.toCss(given, format)) as world.Rgb, given)).toBeLessThanOrEqual(3);

        }

    });
    it("builds values that are always in range, whatever it is handed", () => {

        expect(world.rgb(Number.NaN, 300, -1, 2)).toEqual({ r: 0, g: 255, b: 0, a: 1 });
        expect(world.rgb(12.5, 12.4, 0)).toEqual({ r: 13, g: 12, b: 0, a: 1 });
        expect(world.hsl(Number.NaN, 2, -1)).toEqual({ h: 0, s: 1, l: 0, a: 1 });
        expect(world.hsl(-90, 0.5, 0.5, 0.5)).toEqual({ h: 270, s: 0.5, l: 0.5, a: 0.5 });
        expect(world.oklch(Number.NaN, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ l: 0, c: 0, h: 0, a: 1 });
        expect(world.oklch(2, -1, 725)).toEqual({ l: 1, c: 0, h: 5, a: 1 });
        expect(world.fromOklch({ l: Number.NaN, c: Number.NaN, h: Number.NaN, a: Number.NaN })).toEqual({ r: 0, g: 0, b: 0, a: 0 });

    });
    it("converts between spaces and round trips", () => {

        expect(world.toHsl(brand)).toMatchObject({ s: 1, l: 0.5 });
        expect(world.toHsl(brand).h).toBeCloseTo(16.2, 1);
        expect(world.fromHsl(world.hsl(16.2, 1, 0.5))).toEqual(brand);
        expect(world.toHsl(white)).toEqual({ h: 0, s: 0, l: 1, a: 1 });
        expect(world.toHsl(world.rgb(255, 0, 128)).h).toBeGreaterThan(300);

        for ( const given of [white, black, brand, cyan, world.rgb(12, 200, 90), world.rgb(0, 0, 255), world.rgb(1, 2, 3), world.rgb(254, 253, 252)] ) {

            expect(world.fromOklch(world.toOklch(given))).toEqual(given);
            expect(world.fromHsl(world.toHsl(given))).toEqual(given);

        }

        expect(world.toOklch(white).l).toBeCloseTo(1, 2);
        expect(world.toOklch(black).l).toBeCloseTo(0, 2);
        expect(world.toOklch(black).c).toBeLessThan(1e-6);
        expect(world.toOklch(world.alpha(brand, 0.4)).a).toBe(0.4);

    });
    it("brings a colour outside the gamut back inside without moving its lightness or hue", () => {

        for ( const [l, c, h] of [[0.7, 0.4, 150], [0.5, 0.37, 264], [0.9, 0.3, 30], [0.2, 0.3, 330]] as const ) {

            const landed = world.toOklch(world.fromOklch(world.oklch(l, c, h)));

            expect(landed.c).toBeLessThan(c);
            expect(landed.c).toBeGreaterThan(0.02);
            expect(Math.abs(landed.l - l)).toBeLessThan(0.02);
            expect(Math.abs(landed.h - h)).toBeLessThan(3);

        }

        expect(world.color("oklch(70% 0.4 150)")).toEqual(world.rgb(0, 190, 88));

    });
    it("measures luminance, contrast and readability, composing a see-through ink first", () => {

        expect(world.luminance(white)).toBe(1);
        expect(world.luminance(black)).toBe(0);
        expect(world.luminance({ r: 127.5, g: 127.5, b: 127.5, a: 1 })).toBeCloseTo(0.214, 3);
        expect(world.contrast(black, white)).toBe(21);
        expect(world.contrast(white, black)).toBe(21);
        expect(world.contrast(brand, white)).toBeCloseTo(3.44, 2);
        expect(world.contrast(world.alpha(black, 0.5), white)).toBe(world.contrast(world.rgb(128, 128, 128), white));
        expect(world.contrast(world.alpha(black, 0), white)).toBe(1);
        expect(world.readable(black, white, "AAA")).toBe(true);
        expect(world.readable(brand, white) === false && world.readable(brand, white, "AA", true)).toBe(true);
        expect(world.readable(world.rgb(89, 89, 89), white, "AAA") && !world.readable(world.rgb(118, 118, 118), white, "AAA") && world.readable(world.rgb(118, 118, 118), white, "AAA", true)).toBe(true);
        expect(world.readable(world.alpha(black, 0.3), white)).toBe(false);
        expect(world.isDark(black) && !world.isDark(white) && world.isDark(world.rgb(40, 40, 40))).toBe(true);
        expect(world.onColor(black)).toEqual(white);
        expect(world.onColor(white)).toEqual(black);
        expect(world.readable(world.onColor(brand), brand)).toBe(true);

    });
    it("blends and mixes with alpha as weight", () => {

        expect(world.alpha(brand, 0.3).a).toBe(0.3);
        expect(world.alpha(brand, 7).a).toBe(1);
        expect(world.blend(world.alpha(black, 0.5), white)).toEqual(world.rgb(128, 128, 128));
        expect(world.blend(brand, white)).toEqual(brand);
        expect(world.blend(world.alpha(brand, 0), white)).toEqual(white);
        expect(world.blend(world.alpha(brand, 0.5), world.alpha(white, 0.5))).toEqual({ r: 255, g: 131, b: 85, a: 0.75 });
        expect(world.blend(world.alpha(black, 0), world.alpha(white, 0))).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        expect(world.mix(black, white, 0)).toEqual(black);
        expect(world.mix(black, white, 1)).toEqual(white);
        expect(world.mix(black, white, -3)).toEqual(black);
        expect(world.mix(black, white)).toEqual(world.rgb(99, 99, 99));
        expect(world.mix(brand, world.alpha(white, 0))).toEqual({ ...brand, a: 0.5 });
        expect(world.mix(world.alpha(black, 0), world.alpha(white, 0)).a).toBe(0);
        expect(world.mix(brand, world.grayscale(brand), 0.5).r).toBeGreaterThan(world.mix(brand, world.grayscale(brand), 0.5).b);

        const violet = world.toOklch(world.mix(world.rgb(255, 0, 0), world.rgb(0, 0, 255)));

        expect(violet.h).toBeGreaterThan(300);
        expect(violet.h).toBeLessThan(350);

    });
    it("tones a colour through lightness, chroma and hue", () => {

        expect(world.toOklch(world.lighten(brand, 0.2)).l).toBeGreaterThan(world.toOklch(brand).l);
        expect(world.toOklch(world.darken(brand, 0.2)).l).toBeLessThan(world.toOklch(brand).l);
        expect(world.lighten(brand, 5)).toEqual(white);
        expect(world.darken(brand, 5)).toEqual(black);
        expect(world.toOklch(world.saturate(world.rgb(120, 120, 140), 0.1)).c).toBeGreaterThan(world.toOklch(world.rgb(120, 120, 140)).c);
        expect(world.toOklch(world.saturate(brand, -5)).c).toBeLessThan(0.01);
        expect(Math.abs(world.toOklch(world.rotate(world.rgb(120, 140, 160), 180)).h - ((world.toOklch(world.rgb(120, 140, 160)).h + 180) % 360))).toBeLessThan(3);
        expect(world.rotate(brand, 360)).toEqual(brand);
        expect(world.toOklch(world.grayscale(brand)).c).toBeLessThan(0.01);
        expect(world.alpha(world.lighten(world.alpha(brand, 0.4), 0.1), 1)).toEqual(world.lighten(brand, 0.1));
        expect(world.lighten(world.alpha(brand, 0.4), 0.1).a).toBe(0.4);

    });
    it("draws eleven shades that never cross, around the colour it was given", () => {

        const made = world.shades(brand);

        expect(Object.keys(made).map(Number)).toEqual(steps);
        expect(made[500]).toEqual(brand);
        expect(world.shades(world.alpha(brand, 0.2))[500]).toEqual(brand);
        expect(steps.map(( step ) => world.toHex(made[step]))).toEqual(["#fff2ee", "#ffe3db", "#ffc3b3", "#ffa188", "#ff7a58", "#ff4500", "#ca3400", "#972500", "#681600", "#3c0800", "#270300"]);

        for ( const base of [brand, white, black, cyan, world.rgb(128, 128, 128), world.rgb(37, 99, 235), world.rgb(250, 240, 10), world.rgb(20, 5, 40)] ) {

            const lights = steps.map(( step ) => world.luminance(world.shades(base)[step]));

            expect(lights).toEqual([...lights].sort(( a, b ) => b - a));

        }

        expect(world.readable(made[900], made[50], "AAA") && world.readable(made[50], made[700])).toBe(true);
        expect(Math.abs(world.toOklch(made[200]).h - world.toOklch(brand).h)).toBeLessThan(6);

    });
    it("moves an ink only as far as readability asks, and falls back to black or white", () => {

        expect(world.ensureReadable(black, white)).toEqual(black);
        expect(world.ensureReadable(brand, black)).toEqual(brand);

        const moved = world.ensureReadable(brand, white);

        expect(world.toHex(moved)).toBe("#dc3a00");
        expect(world.readable(moved, white)).toBe(true);
        expect(world.contrast(moved, white)).toBeLessThan(4.7);
        expect(Math.abs(world.toOklch(moved).h - world.toOklch(brand).h)).toBeLessThan(4);
        expect(world.contrast(world.ensureReadable(brand, white, "AAA"), white)).toBeGreaterThanOrEqual(7);
        expect(world.contrast(world.ensureReadable(brand, white, "AAA"), white)).toBeLessThan(7.3);
        expect(world.readable(world.ensureReadable(brand, white, "AA", true), white, "AA", true)).toBe(true);
        expect(world.ensureReadable(brand, white, "AA", true)).toEqual(brand);

        for ( const ground of [white, black, brand, world.rgb(128, 128, 128), world.rgb(119, 119, 119), world.rgb(37, 99, 235)] ) {

            for ( const ink of [brand, white, black, cyan, world.rgb(120, 120, 120)] ) expect(world.readable(world.ensureReadable(ink, ground), ground)).toBe(true);

        }

    });

});
