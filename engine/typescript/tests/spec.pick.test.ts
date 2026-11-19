import { describe, expect, test as it } from "bun:test";
import * as spec from "engine/spec";

const part = spec.part({ platform: "web" });
const extra = spec.screen("extra", { title: { en: "Extra", ar: "إضافي" } });
const home = spec.screen("home", { path: "/", title: { en: "Home", ar: "الرئيسية" }, layout: [spec.pick({ desktop: spec.feature("hello") })] });
const shop = spec.surface({
    schema: { screens: [home, spec.pick({ desktop: extra })], signals: [spec.pick({ web: "seen", desktop: "docked" })] },
    config: { settings: spec.pick({ web: { locale: "en", locales: ["en"] }, desktop: { locale: "ar", locales: ["ar"] } }) },
});
const specs = spec.define({ shop });

function seen ( platform?: spec.Platform ): unknown[] {

    const one = spec.build(specs, part, platform === undefined ? {} : { platform }).surface("shop");

    return [one.compiled.screens.map(( screen ) => [screen.name, screen.features.map(( feature ) => feature.name)]), one.config.settings.locale, one.compiled.surface.signals];

}

describe("spec pick", () => {

    it("a pick keeps the value of the platform being built and drops itself where that platform has none", () => {

        expect(seen()).toEqual([[["home", []]], "en", ["seen"]]);
        expect(seen("desktop")).toEqual([[["extra", []], ["home", ["hello"]]], "ar", ["docked"]]);
        expect(seen("mobile")[0]).toEqual([["home", []]]);

    });
    it("a pick nests, leaves untouched pieces as they were, and refuses an unknown platform", () => {

        const nested = spec.pick({ web: spec.pick({ web: 1 }), desktop: 2 });
        const plain = spec.surface({ schema: [extra] });

        expect([spec.isPick(nested), spec.isPick({}), spec.chosen(plain, "web") === plain, spec.chosen(plain, "web").screens === plain.screens]).toEqual([true, false, false, true]);
        expect(spec.chosen(spec.surface({ schema: [home], config: { contents: { n: nested } } }), "web").config).toEqual({ contents: { n: 1 } });
        expect(() => spec.pick({ watch: 1 } as never)).toThrow("pick chooses a value by platform");
        expect(() => spec.pick({})).toThrow("pick chooses a value by platform");
        expect(() => spec.build(specs, part, { platform: "tv" as never }).surface("shop")).toThrow("tv: a platform is web, mobile, desktop");

    });

});
