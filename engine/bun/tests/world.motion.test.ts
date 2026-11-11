import { describe, expect, test as it } from "bun:test";
import * as motion from "engine/world";

describe("world.motion", () => {

    it("springs sample to a monotone-ending linear easing", () => {

        const soft = motion.spring(0.8, 180);
        const sampled = motion.path(soft, 16);

        expect(soft.damping).toBeCloseTo(21.47, 1);
        expect(sampled.points).toHaveLength(17);
        expect(sampled.points[0]).toBe(0);
        expect(sampled.points[16]).toBe(1);
        expect(sampled.duration).toBeGreaterThan(200);
        expect(motion.toLinear(sampled).startsWith("linear(0, ")).toBe(true);

        const bouncy = motion.path(motion.spring(0.3, 300), 32);

        expect(Math.max(...bouncy.points)).toBeGreaterThan(1);

        const critical = motion.path({ damping: 2 * Math.sqrt(100), stiffness: 100, mass: 1 }, 8);

        expect(critical.points.every(( point ) => point <= 1.0001)).toBe(true);

        const heavy = motion.path(motion.spring(1.5, 100), 8);

        expect(heavy.points[8]).toBe(1);

    });
    it("tokens, transitions, tweens and stagger", () => {

        expect(motion.durations.base).toBe(200);
        expect(motion.ease("standard")).toBe("cubic-bezier(0.2, 0, 0, 1)");
        expect(motion.ease([0, 0, 1, 1])).toBe("cubic-bezier(0, 0, 1, 1)");
        expect(motion.transition(["opacity", "transform"], 120, "decelerate", 40)).toBe("opacity 120ms cubic-bezier(0, 0, 0, 1) 40ms, transform 120ms cubic-bezier(0, 0, 0, 1) 40ms");
        expect(motion.reduced(300, true)).toBe(0);
        expect(motion.reduced(300, false)).toBe(300);
        expect(motion.stagger(3)).toBe(120);
        expect(motion.stagger(99, 40, 400)).toBe(400);
        expect(motion.tween(0, 10, 0.5, "linear")).toBe(5);
        expect(motion.tween(0, 10, 0)).toBe(0);
        expect(motion.tween(0, 10, 1)).toBe(10);
        expect(motion.tween(0, 10, 0.5, "decelerate")).toBeGreaterThan(5);
        expect(motion.tween(0, 10, 0.5, "accelerate")).toBeLessThan(5);
        expect(motion.tween(0, 10, 2)).toBe(10);
        expect(motion.easings.overshoot).toContain("1.56");

    });
    it("refuses junk curves, springs, paths and properties; clamps samples, settles within ten seconds and lands the overdamped path", () => {

        expect([() => motion.ease([2, 0, 0, 1]), () => motion.ease([0, 0, 0] as never), () => motion.ease("bounce" as never), () => motion.path({ damping: -1, stiffness: 100, mass: 1 }), () => motion.path({ damping: 1, stiffness: 0, mass: 1 }), () => motion.spring(-1), () => motion.spring(Number.NaN), () => motion.toLinear({ duration: 1, points: [1] }), () => motion.toLinear({ duration: 1, points: [0, Number.NaN] }), () => motion.transition(["1bad"]), () => motion.transition(["opacity"], -1), () => motion.tween(0, 1, 0.5, [0, 0, 2, 1])].map(( work ) => { try { work(); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(Array.from({ length: 12 }, () => "refused"));
        expect([motion.path(motion.spring(), 1).points.length, motion.path(motion.spring(), 10_000).points.length, motion.path(motion.spring(), Number.NaN).points.length, motion.path(motion.spring(1, 1000)).duration < 1000, motion.path(motion.spring(0, 1)).duration]).toEqual([3, 513, 33, true, 10_000]);
        expect(motion.path(motion.spring(1.5, 100), 8)).toEqual({ duration: 1808, points: [0, 0.5067, 0.7918, 0.9122, 0.963, 0.9844, 0.9934, 0.9972, 1] });
        expect([motion.transition(["opacity"], 100, "linear"), motion.transition(["--x", "-webkit-mask"], 0), motion.stagger(-3), motion.stagger(Number.NaN), motion.stagger(2, 10, 15), motion.tween(0, 10, -1), motion.tween(0, 10, Number.NaN)]).toEqual(["opacity 100ms linear", "--x 0ms cubic-bezier(0.2, 0, 0, 1), -webkit-mask 0ms cubic-bezier(0.2, 0, 0, 1)", 0, 0, 15, 0, 0]);

    });

});
