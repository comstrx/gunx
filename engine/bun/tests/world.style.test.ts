import { describe, expect, test as it } from "bun:test";
import * as world from "engine/world";

describe("world.style", () => {

    it("classes merge strings, arrays and maps without duplicates", () => {

        expect(world.classes("a b", ["c", null, ["d"]], { e: true, f: false, a: true }, undefined, 0, "")).toBe("a b c d e 0");
        expect(world.classes()).toBe("");

    });
    it("variants pick axes with defaults and compound rules", () => {

        const button = world.variants({
            base: "btn",
            axes: { look: { solid: "bg-brand text-white", ghost: "bg-transparent" }, size: { sm: "h-8 px-3", md: "h-10 px-4" } },
            defaults: { look: "solid", size: "md" },
            compound: [{ when: { look: "ghost", size: "sm" }, add: "border" }],
        });

        expect(button()).toBe("btn bg-brand text-white h-10 px-4");
        expect(button({ look: "ghost", size: "sm", className: "w-full" })).toBe("btn bg-transparent h-8 px-3 border w-full");
        expect(button.options("size")).toEqual(["sm", "md"]);
        expect(button.axes.look.ghost).toBe("bg-transparent");

    });
    it("states become data attributes", () => {

        expect(world.states({ active: true, disabled: false, tone: "danger", count: 3, gone: null })).toEqual({ "data-active": "", "data-tone": "danger", "data-count": "3" });

    });
    it("tokens become css custom properties with a dark art direction", () => {

        expect(world.variables({ brand: "#f00", "ink-muted": "#555", radiusMd: "0.5rem", fast: 140 }, "color")).toEqual(["--color-brand: #f00;", "--color-ink-muted: #555;", "--color-radius-md: 0.5rem;", "--color-fast: 140;"]);
        expect(world.block(".x", ["a: 1;", "b: 2;"])).toBe(".x {\n    a: 1;\n    b: 2;\n}");

        const sheet = world.css({ base: { surface: "#fff" }, dark: { surface: "#000" } });

        expect(sheet).toContain(":root {\n    --surface: #fff;\n}");
        expect(sheet).toContain('@media (prefers-color-scheme: dark) {\n    :root:not([data-theme="light"]) {\n        --surface: #000;\n    }\n}');
        expect(sheet).toContain(':root[data-theme="dark"] {\n    --surface: #000;\n}');
        expect(sheet.endsWith("\n")).toBe(true);
        expect(world.css({ base: { a: 1 }, selector: "@theme", prefix: "t" })).toBe("@theme {\n    --t-a: 1;\n}\n");
        expect(world.css({ base: { a: 1 }, dark: { a: 2 }, selector: "@theme" })).toBe('@theme {\n    --a: 1;\n}\n\n@media (prefers-color-scheme: dark) {\n    :root:not([data-theme="light"]) {\n        --a: 2;\n    }\n}\n\n:root[data-theme="dark"] {\n    --a: 2;\n}\n');
        expect(world.css({ base: { a: 1 }, dark: { a: 2 }, selector: ".a, .b" })).toBe('.a, .b {\n    --a: 1;\n}\n\n@media (prefers-color-scheme: dark) {\n    .a:not([data-theme="light"]), .b:not([data-theme="light"]) {\n        --a: 2;\n    }\n}\n\n.a[data-theme="dark"], .b[data-theme="dark"] {\n    --a: 2;\n}\n');

    });
    it("token values are scanned: control characters, braces, comments, stray semicolons, unbalanced quotes or brackets and infinities are refused, a quoted < is escaped", () => {

        expect(["a}b", "a{b", "a/*b*/", "rgb(1", '"abc', "x\u0001", "a;b", "a</", "a<!", "\\", "url(a) b", "calc(1px + 2px)", "'a;b'", "a\\;b"].map(( value ) => world.isToken(value))).toEqual([false, false, false, false, false, false, false, false, false, false, true, true, true, true]);
        expect([world.isToken(Number.POSITIVE_INFINITY), world.isToken(Number.NaN), world.isToken(1.5), world.isToken(null)]).toEqual([false, false, true, false]);
        expect(world.variables({ a: '"<x"', b: "'</x'" })).toEqual(['--a: "\\3C x";', "--b: '\\3C /x';"]);
        expect([() => world.variables({ a: Number.POSITIVE_INFINITY }), () => world.variables({ "": 1 }), () => world.variables({ a: "x\u0000" }), () => world.block("a{b", []), () => world.block("", []), () => world.block(".a", [], "x"), () => world.css({ base: { a: 1 }, dark: { a: 2 }, darkSelector: "{" })].map(( work ) => { try { work(); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(["refused", "refused", "refused", "refused", "refused", "refused", "refused"]);
        expect(world.variables({ fooBar: 1, "a b": 2, A1: 3 }, "x y")).toEqual(["--x-y-foo-bar: 1;", "--x-y-a-b: 2;", "--x-y-a1: 3;"]);

    });
    it("variants treat unknown choices as no choice, memoise by every axis, refuse a className axis, unknown compound axes and object choices; classes fold nbsp and stop at depth eight", () => {

        const button = world.variants({ base: "btn", axes: { look: { solid: "bg-brand", ghost: "bg-transparent" }, size: { sm: "h-8", md: "h-10" } }, defaults: { look: "solid", size: "md" }, compound: [{ when: { look: ["ghost", "outline" as never], size: "sm" }, add: "border" }] });

        expect([button({ look: "nope" as never }), button({ look: "ghost" }), button({ look: "nope" as never, size: "nope" as never }), button({ look: "ghost", size: "sm" }), button({ look: "outline" as never, size: "sm" }), button({ look: null, size: undefined }), button({ className: ["x", { y: true }] })]).toEqual(["btn h-10", "btn bg-transparent h-10", "btn", "btn bg-transparent h-8 border", "btn h-8 border", "btn bg-brand h-10", "btn bg-brand h-10 x y"]);
        expect([() => world.variants({ axes: { className: { a: "x" } } }), () => world.variants({ axes: { look: { a: "x" } }, compound: [{ when: { size: "sm" } as never, add: "y" }] }), () => world.variants({ axes: { look: { a: "x" } }, compound: [{ when: { look: {} as never }, add: "y" }] }), () => world.variants({ axes: null as never })].map(( work ) => { try { work(); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(["refused", "refused", "refused", "refused"]);
        expect([world.classes("a\u00a0b", "c\u2028d"), world.classes([[[[[[[[[["deep"]]]]]]]]]]), world.classes([[[[[[[["near"]]]]]]]]), world.classes({ "a b": true, c: 0 } as unknown as world.ClassValue, Number.NaN, 2)]).toEqual(["a b c d", "", "near", "a b 2"]);
        expect(world.states({ fooBar: true, off: false, n: Number.NaN, "": true })).toEqual({ "data-foo-bar": "" });

    });

});

