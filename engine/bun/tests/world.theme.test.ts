import { describe, expect, test as it } from "bun:test";
import * as cache from "engine/cache";
import * as world from "engine/world";

const tokens = { light: { surface: "#fff", ink: "#111", radiusMd: 10 }, dark: { surface: "#000", ink: "#eee", radiusMd: 10 } };

function host (): { system: () => world.Scheme; watch: ( listener: () => void ) => () => void; flip: () => void; listeners: () => number } {

    const listeners = new Set<() => void>();
    let scheme: world.Scheme = "light";

    return {
        system: () => scheme,
        watch: ( listener ) => {

            listeners.add(listener);

            return () => {

                listeners.delete(listener);

            };

        },
        flip: () => {

            scheme = scheme === "light" ? "dark" : "light";

            for ( const listener of listeners ) listener();

        },
        listeners: () => listeners.size,
    };

}

describe("world.theme", () => {

    it("follows the system until a preference is set, toggles, cycles and tells the root", () => {

        const given = host();
        const made = world.theme({ tokens, system: given.system, watch: given.watch });
        const seen: string[] = [];
        const stop = made.subscribe(( state ) => { seen.push(`${state.preference}:${state.scheme}`); });

        expect(made.getState()).toEqual({ preference: "system", system: "light", scheme: "light", palette: tokens.light, ready: true });
        given.flip();
        expect(made.scheme()).toBe("dark");
        expect(made.palette()).toBe(tokens.dark);
        made.set("light");
        expect(made.scheme()).toBe("light");
        given.flip();
        expect(made.scheme()).toBe("light");
        made.toggle();
        expect(made.preference()).toBe("dark");
        made.cycle();
        expect(made.preference()).toBe("system");
        made.cycle();
        made.cycle();
        expect(made.preference()).toBe("dark");
        expect(seen).toEqual(["system:dark", "light:light", "light:light", "dark:dark", "system:light", "light:light", "dark:dark"]);

        const root: world.Root = { dataset: {}, style: {} };

        made.apply(undefined);
        made.apply(root, { lang: "ar", dir: "rtl" });
        expect(root.lang).toBe("ar");
        expect(root.dir).toBe("rtl");
        expect(root.dataset?.theme).toBe("dark");
        expect(root.style?.colorScheme).toBe("dark");
        made.set("system");
        made.apply(root);
        expect(root.dataset?.theme).toBeUndefined();
        expect(root.style?.colorScheme).toBe("light dark");
        stop();
        made.destroy();
        expect(given.listeners()).toBe(0);
        expect(world.isPreference("dark") && world.isPreference("system") && !world.isPreference("blue")).toBe(true);
        expect(world.preferences).toEqual(["system", "light", "dark"]);

    });
    it("renders its tokens as css and variables", () => {

        const made = world.theme({ tokens, system: () => "light", watch: () => () => undefined, prefix: "ui" });

        expect(made.variables()).toEqual({ "--ui-surface": "#fff", "--ui-ink": "#111", "--ui-radius-md": "10" });
        expect(made.variables("dark")["--ui-surface"]).toBe("#000");
        expect(made.css()).toContain(":root {\n    --ui-surface: #fff;");
        expect(made.css()).toContain(':root[data-theme="dark"] {\n    --ui-surface: #000;');
        expect(world.theme({ tokens, system: () => "light", watch: () => () => undefined, selector: "@theme" }).css().startsWith("@theme {")).toBe(true);

    });
    it("persists the preference through a box and hydrates it back", async () => {

        const box = cache.open({ kind: "memory", prefix: "theme-test" });
        const first = world.theme({ tokens, box, key: "scheme", system: () => "light", watch: () => () => undefined });

        expect(first.getState().ready).toBe(false);
        await first.hydrate();
        expect(first.getState().ready).toBe(true);
        expect(first.preference()).toBe("system");
        first.set("dark");
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        expect(await box.get("scheme")).toBe("dark");

        const second = world.theme({ tokens, box, key: "scheme", system: () => "light", watch: () => () => undefined });

        await second.hydrate();
        expect(second.preference()).toBe("dark");
        expect(second.scheme()).toBe("dark");
        await box.set("scheme", "blue");

        const third = world.theme({ tokens, box, key: "scheme", system: () => "dark", watch: () => () => undefined });

        await third.hydrate();
        expect(third.preference()).toBe("system");
        expect(third.scheme()).toBe("dark");
        const plain = world.theme({ tokens });

        expect(plain.getState().ready).toBe(true);
        plain.destroy();

    });
    it("refuses junk, keeps a choice made during hydration, ignores the echo of its own write and hears a foreign one", async () => {

        const junk = world.theme({ tokens, system: () => "light", watch: () => () => undefined });

        expect([() => world.theme({ tokens, preference: "blue" as never }), () => world.theme({ tokens: { light: null, dark: {} } as never }), () => world.theme({ tokens: null as never }), () => junk.set("blue" as never), () => junk.variables("blue" as never)].map(( work ) => { try { work(); return "ok"; } catch ( caught ) { return caught instanceof RangeError ? "refused" : "?"; } })).toEqual(["refused", "refused", "refused", "refused", "refused"]);

        let saved: unknown = "light";
        let fire: (( value: unknown ) => void) | undefined;
        let release: (( value: unknown ) => void) | undefined;
        const box = { get: () => new Promise(( resolve ) => { release = resolve; }), set: async ( _: string, value: unknown ) => { saved = value; }, watch: ( _: string, listener: ( value: unknown ) => void ) => { fire = listener; return () => undefined; } } as unknown as cache.Box;
        const made = world.theme({ tokens, box, system: () => "light", watch: () => () => undefined });
        const hydrated = made.hydrate();

        junk.destroy();
        made.set("dark");
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        release?.("light");
        await hydrated;
        expect([made.preference(), made.getState().ready, saved]).toEqual(["dark", true, "dark"]);
        made.set("light");
        await new Promise(( resolve ) => setTimeout(resolve, 0));
        fire?.("dark");
        expect(made.preference()).toBe("light");
        fire?.("light");
        fire?.("dark");
        expect(made.preference()).toBe("dark");
        fire?.("blue");
        expect(made.preference()).toBe("dark");
        made.destroy();
        fire?.("light");
        expect(made.preference()).toBe("dark");

    });
    it("senses the host's colour scheme through the appearance port when nothing is given", () => {

        const target = globalThis as { matchMedia?: unknown };
        const handlers = new Set<() => void>();
        let dark = true;

        target.matchMedia = ( query: string ) => ({
            get matches () { return dark && query === "(prefers-color-scheme: dark)"; },
            addEventListener: ( _: string, handler: () => void ) => { handlers.add(handler); },
            removeEventListener: ( _: string, handler: () => void ) => { handlers.delete(handler); },
        });

        try {

            const made = world.theme({ tokens });

            expect([made.scheme(), handlers.size]).toEqual(["dark", 1]);
            dark = false;
            for ( const handler of handlers ) handler();
            expect(made.scheme()).toBe("light");
            made.destroy();
            expect(handlers.size).toBe(0);

        } finally {

            delete target.matchMedia;

        }

        const bare = world.theme({ tokens });

        expect(bare.scheme()).toBe("light");
        bare.destroy();

    });
    it("follows a bound appearance, even one bound after the theme was made", () => {

        const given = host();
        const sensing: world.Appearance = { scheme: given.system, watch: given.watch };
        const made = world.theme({ tokens });
        const seen: world.Scheme[] = [];
        const stop = made.subscribe(( state ) => { seen.push(state.scheme); });

        expect([made.scheme(), given.listeners()]).toEqual(["light", 0]);
        given.flip();

        const restore = world.appearance.use(sensing);

        try {

            expect([made.scheme(), given.listeners()]).toEqual(["dark", 1]);
            given.flip();
            expect(made.scheme()).toBe("light");

        } finally {

            restore();

        }

        expect(given.listeners()).toBe(0);
        given.flip();
        expect(made.scheme()).toBe("light");
        made.destroy();
        stop();
        expect(seen).toEqual(["dark", "light"]);
        expect(world.appearance.bound()).toBe(false);

    });

});
