import { describe, expect, test as it } from "bun:test";
import * as world from "engine/world";

type Store = { getItem: ( key: string ) => string | null; setItem: ( key: string, value: string ) => void; writes: number };
type Stage = { root: world.Root; store: Store; timers: (() => void)[] };

const tokens = { light: { surface: "#fff" }, dark: { surface: "#000" } };
const still = { system: (): world.Scheme => "light", watch: () => () => undefined };
const surfaces = [
    { name: "client", id: "acme.client", settings: { locales: ["en", "ar"], locale: "en", scheme: "system" } },
    { name: "admin", id: "acme.admin", settings: { locales: ["ar"], scheme: "dark" } },
];

function store ( held: Record<string, string> = {} ): Store {

    const made: Store = {
        getItem: ( key ) => held[key] ?? null,
        setItem: ( key, value ) => {

            held[key] = value;
            made.writes += 1;

        },
        writes: 0,
    };

    return made;

}
function staged<T> ( given: { surface?: string; languages?: string[]; saved?: string; store?: unknown; lang?: string; address?: string }, work: ( stage: Stage ) => T ): T {

    const target = globalThis as Record<string, unknown>;
    const names = ["document", "localStorage", "navigator", "setTimeout", "location"];
    const before = names.map(( name ) => Object.getOwnPropertyDescriptor(target, name));
    const held = store(given.saved === undefined ? {} : { "world.look": given.saved });
    const stage: Stage = { root: { lang: given.lang ?? "en", dir: "ltr", dataset: {}, style: {} }, store: held, timers: [] };
    const put = ( name: string, value: unknown ): void => void Object.defineProperty(target, name, { value, configurable: true, writable: true });

    put("document", { documentElement: stage.root, currentScript: { dataset: { surface: given.surface ?? "client", surfaces: JSON.stringify(surfaces), ...(given.address === undefined ? {} : { address: "path" }) } } });
    put("location", { pathname: given.address ?? "/" });
    put("localStorage", given.store ?? held);
    put("navigator", { languages: given.languages ?? ["en-US"] });
    put("setTimeout", ( run: () => void ) => stage.timers.push(run));

    try {

        return work(stage);

    } finally {

        names.forEach(( name, index ) => {

            const was = before[index];

            if ( was ) Object.defineProperty(target, name, was);
            else delete target[name];

        });

    }

}

describe("look", () => {

    it("a first visit is painted from the entry surface: its id, the negotiated language and its own scheme", () => {

        staged({ languages: ["ar-EG", "en"] }, ( stage ) => {

            world.paint();

            expect(stage.root).toEqual({ lang: "ar", dir: "rtl", dataset: { surface: "acme.client" }, style: { colorScheme: "light dark" } });
            expect(stage.timers).toEqual([]);

        });
        staged({ surface: "admin", languages: ["fr"], lang: "ar" }, ( stage ) => {

            world.paint();

            expect(stage.root).toEqual({ lang: "ar", dir: "rtl", dataset: { surface: "acme.admin", theme: "dark" }, style: { colorScheme: "dark" } });

        });

    });
    it("an applied look is remembered once and painted back before the first frame", () => {

        staged({}, ( stage ) => {

            const made = world.theme({ tokens, preference: "dark", ...still });

            made.apply(stage.root, { lang: "ar", dir: "rtl" });

            expect(stage.store.writes).toBe(0);

            made.apply(stage.root, { lang: "ar", dir: "rtl", surface: "acme.client" });
            made.apply(stage.root, { lang: "ar", dir: "rtl", surface: "acme.client" });

            expect([stage.store.writes, stage.store.getItem("world.look")]).toEqual([1, JSON.stringify({ surface: "acme.client", lang: "ar", dir: "rtl", preference: "dark" })]);

            made.destroy();

        });
        staged({ saved: JSON.stringify({ surface: "acme.client", lang: "ar", dir: "rtl", preference: "light" }) }, ( stage ) => {

            world.paint();

            expect(stage.root).toEqual({ lang: "ar", dir: "rtl", dataset: { surface: "acme.client", theme: "light" }, style: { colorScheme: "light" } });
            expect(stage.timers).toEqual([]);

        });

    });
    it("a remembered look of another surface holds the page pending until it is restored or the hold runs out", () => {

        staged({ saved: JSON.stringify({ surface: "acme.admin", lang: "ar", dir: "rtl", preference: "system" }) }, ( stage ) => {

            world.paint();

            expect(stage.root.dataset).toEqual({ surface: "acme.admin", pending: "" });
            expect(stage.timers.length).toBe(1);

            stage.timers[0]?.();

            expect(stage.root.dataset).toEqual({ surface: "acme.admin" });

        });

    });
    it("a look of a surface this build does not carry, or a broken one, falls back to the entry; a failing store is told on the root", () => {

        for ( const saved of [JSON.stringify({ surface: "old.role", preference: "dark" }), JSON.stringify({ surface: "acme.admin", preference: "neon" }), "null", "[]"] ) staged({ saved }, ( stage ) => {

            world.paint();

            expect(stage.root.dataset).toEqual({ surface: "acme.client" });

        });
        staged({ saved: "{" }, ( stage ) => {

            world.paint();

            expect(stage.root.dataset).toEqual({ appearance: "unavailable" });

        });
        staged({ store: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } }, ( stage ) => {

            const made = world.theme({ tokens, ...still });

            world.paint();
            made.apply(stage.root, { lang: "en", dir: "ltr", surface: "acme.client" });

            expect(stage.root.dataset).toEqual({ appearance: "unavailable", surface: "acme.client" });

            made.destroy();

        });

    });
    it("where the address carries the language, the address wins over what is remembered or negotiated, and no prefix means the default", () => {

        const saved = JSON.stringify({ surface: "acme.client", lang: "ar", dir: "rtl", preference: "dark" });

        staged({ address: "/ar/offers", languages: ["en-US"] }, ( stage ) => {

            world.paint();

            expect([stage.root.lang, stage.root.dir]).toEqual(["ar", "rtl"]);

        });
        staged({ address: "/offers", saved }, ( stage ) => {

            world.paint();

            expect([stage.root.lang, stage.root.dir, stage.root.dataset?.theme]).toEqual(["en", "ltr", "dark"]);

        });
        staged({ address: "/fr/offers", languages: ["ar"] }, ( stage ) => {

            world.paint();

            expect([stage.root.lang, stage.root.dir]).toEqual(["en", "ltr"]);

        });

    });
    it("a host with no page paints nothing", () => {

        expect(() => world.paint()).not.toThrow();
        expect([world.isPreference("dark"), world.isPreference("neon"), world.preferences]).toEqual([true, false, ["system", "light", "dark"]]);

    });

});
