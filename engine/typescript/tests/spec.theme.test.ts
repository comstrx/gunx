import { describe, expect, test as it } from "bun:test";
import * as spec from "engine/spec";

const part = spec.part({ platform: "web" });

describe("spec theme", () => {

    it("a role's themes resolve to the overrides alone: brand tones from one colour, custom colours in both schemes, and only what was written", () => {

        const themed = spec.theme({ brand: "#ff4500", color: { light: { surface: "#fffaf5", ink: "" }, dark: { surface: "#120a05" }, custom: { offer: "#00a86b" } }, shadow: { light: { raised: "0 1px 2px #0002" }, dark: { raised: "" } }, radius: { md: 14, lg: "" }, motion: { fast: 100, base: "", ease: "ease-out" }, font: { sans: ["Figtree", "", "Readex Pro"] } });

        expect(Object.keys(themed.color.light).sort()).toEqual(["brand", "brandSoft", "brandSoftStrong", "brandStrong", "offer", "onBrand", "surface"]);
        expect([themed.color.light.surface, themed.color.dark.surface, themed.color.dark.offer, themed.color.light.brand === themed.color.dark.brand, /^#[0-9a-f]{6}$/.test(themed.color.light.brand ?? "")]).toEqual(["#fffaf5", "#120a05", "#00a86b", false, true]);
        expect([themed.shadow, themed.radius, themed.motion, themed.font]).toEqual([{ light: { raised: "0 1px 2px #0002" }, dark: {} }, { md: 14 }, { fast: 100, ease: "ease-out" }, { sans: ["Figtree", "Readex Pro"] }]);
        expect(spec.theme(undefined)).toEqual({ color: { light: {}, dark: {} }, shadow: { light: {}, dark: {} }, radius: {}, motion: {}, font: {} });
        expect(spec.theme({ brand: "not a colour", color: 5, font: { sans: 7 } })).toEqual(spec.theme({}));

    });
    it("the overrides are named as the variables a sheet carries, with their units, and a custom colour is told apart", () => {

        const look = spec.painted(spec.theme({ color: { light: { surfaceRaised: "#fff" }, dark: { surfaceRaised: "#111" }, custom: { offer: "#00a86b" } }, shadow: { light: { raised: "none" }, dark: {} }, radius: { md: 14, lg: "1.5rem" }, motion: { fast: 100, ease: "ease-out" }, font: { sans: ["Readex Pro", "Figtree"] } }));

        expect(look.base).toEqual({ "color-offer": "#00a86b", "color-surface-raised": "#fff", "shadow-raised": "none", "radius-md": "0.875rem", "radius-lg": "1.5rem", "motion-fast": "100ms", "ease-standard": "ease-out", "font-sans": '"Readex Pro", "Figtree", ui-sans-serif, system-ui, sans-serif' });
        expect([look.dark, look.named, spec.tones.includes("surfaceRaised"), spec.tones.length]).toEqual([{ "color-offer": "#00a86b", "color-surface-raised": "#111" }, { "color-offer": "#00a86b" }, true, 20]);

    });
    it("the engine names every token a role may override, a custom colour is free, and a stranger is told with its nearest name", () => {

        const settled = spec.settle(part, spec.surface({ schema: [], config: { themes: { brand: "#ff4500", color: { light: { surfase: "#fff" }, custom: { anything: "#000" } }, radius: { xl: 30 }, font: { sans: ["Figtree"] } } } }));

        expect(settled.issues.map(( issue ) => [issue.path, issue.rule, issue.near])).toEqual([["config.themes.color.light.surfase", "config.unknown", "surface"], ["config.themes.radius.xl", "config.unknown", undefined]]);
        expect([(settled.config.themes.font as { sans: string[] }).sans, (settled.config.themes.color as { custom: object }).custom]).toEqual([["Figtree"], { anything: "#000" }]);

    });

    it("a role may bend the api contract through its config, and the api member itself refuses a wrong one", () => {

        const bent = spec.settle(part, spec.surface({ schema: [], config: { contracts: { wire: { timeout: 6000, retries: { read: 2 }, headers: { language: "Locale", auth: { name: "X-Token", prefix: "" } }, envelope: { data: "payload" } } } } }));
        const wrong = spec.settle(part, spec.surface({ schema: [], config: { contracts: { wire: { timout: 5 } } } }));

        expect([bent.issues, bent.config.contracts.wire]).toEqual([[], { timeout: 6000, retries: { read: 2 }, headers: { language: "Locale", auth: { name: "X-Token", prefix: "" } }, envelope: { data: "payload" } }]);
        expect(wrong.issues.map(( issue ) => [issue.path, issue.rule])).toEqual([["config.contracts.wire", "config.wire"]]);
        expect(spec.settle(part, spec.surface({ schema: [] })).config.contracts.wire).toEqual({});

        const lived = spec.settle(part, spec.surface({ schema: [], config: { contracts: { live: { path: "/live", channel: "private-{feature}", events: { updated: "{feature}.changed" } } } } }));

        expect([lived.issues, lived.config.contracts.live]).toEqual([[], { path: "/live", channel: "private-{feature}", events: { created: "{feature}.created", updated: "{feature}.changed", deleted: "{feature}.deleted" }, key: "id" }]);
        expect(spec.settle(part, spec.surface({ schema: [], config: { contracts: { live: { chanel: "x" } } } })).issues.map(( issue ) => [issue.path, issue.near])).toEqual([["config.contracts.live.chanel", "channel"]]);

    });

});
