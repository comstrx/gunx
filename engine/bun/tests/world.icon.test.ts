import { describe, expect, test as it } from "bun:test";
import * as world from "engine/world";

describe("world.icon", () => {

    it("registries resolve names, aliases and mirroring", () => {

        const icons = world.icons({ arrowRight: { path: "M5 12h14", mirror: true }, Check: "M20 6L9 17l-4-4", star: { path: ["M1", "M2"], filled: true, viewBox: "0 0 16 16" } }, { next: "arrowRight", ok: "check" });

        expect(icons.names()).toEqual(["arrow-right", "check", "star"]);
        expect(icons.has("ArrowRight") && icons.has("next") && !icons.has("nope")).toBe(true);
        expect(icons.resolve("next")).toEqual({ name: "arrow-right", path: ["M5 12h14"], viewBox: "0 0 24 24", mirror: false, filled: false });
        expect(icons.resolve("arrow-right", "rtl")?.mirror).toBe(true);
        expect(icons.resolve("check", "rtl")?.mirror).toBe(false);
        expect(icons.resolve("star")).toEqual({ name: "star", path: ["M1", "M2"], viewBox: "0 0 16 16", mirror: false, filled: true });
        expect(icons.resolve("missing")).toBeUndefined();
        expect(icons.search("arrow")).toEqual(["arrow-right"]);

        const more = icons.extend({ heart: "M12 21" }, { love: "heart" });

        expect(more.resolve("love")?.name).toBe("heart");
        expect(more.resolve("ok")?.name).toBe("check");
        expect(icons.has("heart")).toBe(false);
        expect([icons.search("arrow", -1), icons.search("arrow", Number.NaN).length, icons.search("", 5), icons.search("arrow", 0), icons.resolve("arrow_right")?.name, icons.nameOf("Next"), icons.nameOf("nope")]).toEqual([[], 1, [], [], "arrow-right", "arrow-right", undefined]);
        expect([() => world.icons({ a: { path: "M", viewBox: "x" } }), () => world.icons({ a: { path: [] } }), () => world.icons({ a: "" }), () => world.icons({ a: 7 as never }), () => world.icons({ a: "M" }, { x: "y", y: "x" }), () => world.icons({ a: "M" }, { "": "a" }), () => world.icons({ "": "M" })].map(( work ) => { try { work(); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(Array.from({ length: 7 }, () => "refused"));
        expect([world.icons({ a: "M" }, { x: "x" }).has("x"), world.icons({ a: "M" }, { a: "a" }).resolve("a")?.name, world.icons({ a: "M", b: "N" }, { b: "a" }).resolve("b")?.path, world.icons({ a: "M" }, { x: "a" }).extend({ x: "N" }).resolve("x")?.path, world.icons({ a: { path: "M", viewBox: " 0 0 16,16 " } }).resolve("a")?.viewBox]).toEqual([false, "a", ["N"], ["N"], "0 0 16,16"]);

    });

});
