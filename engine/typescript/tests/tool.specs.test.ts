import { describe, expect, test as it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as spec from "engine/spec";
import * as stage from "engine/test";
import * as tool from "engine/tool";

const defaults = { settings: { budget: { js: 0 as number | string }, app: { name: "", identifier: "" } }, themes: { brand: "#000000" } };
const part = spec.part({ platform: "web", defaults });

function home ( locale: string, path = "/" ): spec.Screen {

    return spec.screen("home", { path, title: { [locale]: "Home" }, blocks: [] });

}
function surfaced ( name: string, settings: object, brand: string, path?: string ): spec.Surface {

    const locale = (settings as { locale: string }).locale;

    return spec.surface({ config: { settings: { ...settings, locales: [locale] }, themes: { brand }, contracts: { baseUrl: `https://${name}.example.test` } }, schema: [home(locale, path)] });

}

const admin = surfaced("admin", { locale: "ar", world: ["countries"], scheme: "dark", app: { name: "Shop Admin", identifier: "test.shop.admin", version: "0.0.0", slug: "", scheme: "" }, budget: { js: "1 kB" } }, "#ff4500");
const specs = spec.define({ admin, courier: surfaced("courier", { locale: "en", scheme: "light", budget: { js: 10 } }, "#0055ff") });
const broken = spec.define({ admin, courier: surfaced("courier", { locale: "en" }, "#0055ff", "jobs") });

function themed ( role: { name: string; themes: { brand: string } } ): string {

    return `${role.name} ${role.themes.brand}\n`;

}

function mapping ( temp: { write: ( path: string, text: string ) => void }, folder: string ): void {

    temp.write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "#spec": [`./${folder}/current.ts`], "#spec.json": [`./${folder}/current.json`] } } }));

}

describe("tool specs", () => {

    it("specs writes every surface's artifact and the current one, settled config included, and stops on a surface's problems", async () => {

        const temp = stage.tmp();
        const lines: string[] = [];

        try {

            mapping(temp, ".cache/spec");
            const tasks = { compile: [tool.specs("#spec"), tool.emit("after.txt", "ran")] };
            const played = await tool.play(tool.define({ specs, part, tasks }), ["compile"], { root: temp.path, out: ( line ) => lines.push(line) });
            const read = ( path: string ): string => readFileSync(temp.file(path), "utf8");
            const light = JSON.parse(read(".cache/spec/current.json"));
            const carried = JSON.parse(read(".cache/spec/surface/admin.json"));
            const courier = JSON.parse(read(".cache/spec/surface/courier.json"));

            expect([played.failed, light.version, light.entry, light.surfaces.admin.id, light.index.map(( one: { name: string } ) => one.name), carried.config.settings.app, courier.config.settings.app, carried.address]).toEqual([false, spec.version, "admin", "admin", ["admin"], { name: "Shop Admin", identifier: "test.shop.admin", version: "0.0.0", slug: "", scheme: "" }, { ...defaults.settings.app, version: "0.0.0", slug: "", scheme: "" }, "https://admin.example.test"]);
            expect(spec.boot<typeof defaults>({ ...light, entry: "courier", index: [], surfaces: { courier } }, { sinks: [] }).app.compiled.surface.role).toBe("courier");
            expect(read(".cache/spec/current.ts")).toBe(`import entry from "./surface/admin.json" with { type: "json" };\n\nexport const compiled = {\n    artifact: ${JSON.stringify({ ...light, surfaces: "@" }).replace('"@"', '{ "admin": entry }')},\n    load: {},\n};\n`);
            expect(lines).toContain("  courier: 1 screen, 0 features, 0 topics");

            const entered = await tool.play(tool.define({ specs, part, tasks }), ["compile"], { root: temp.path, argv: ["--role", "courier"], out: () => undefined });

            expect([entered.failed, JSON.parse(read(".cache/spec/current.json")).entry, tool.plan(tool.define({ specs, part, tasks: { build: tool.emit("{role}.txt", "x") } }), ["build"], ["--role", "courier"]).lines]).toEqual([false, "courier", ["build", "  emit courier.txt"]]);
            await expect(tool.play(tool.define({ specs, part, tasks }), ["compile"], { root: temp.path, argv: ["--role", "ghost"], out: () => undefined })).rejects.toMatchObject({ reason: "tool.role" });
            await expect(tool.play(tool.define({ tasks: { compile: [] } }), ["compile"], { root: temp.path, argv: ["--role", "admin"], out: () => undefined })).rejects.toMatchObject({ reason: "tool.role" });

            const failed = await tool.play(tool.define({ specs: broken, part, tasks }), ["compile"], { root: temp.path, out: () => undefined });
            const bare = await tool.play(tool.define({ tasks: { compile: tool.specs("#spec") } }), ["compile"], { root: temp.path, out: () => undefined });

            expect([failed.failed, failed.flagged.map(( one ) => one.rule), failed.flagged.at(-1)?.message, failed.steps]).toEqual([true, ["shape", "failed"], "1 problem in the specs; nothing after them runs", 1]);
            expect(bare.flagged[0]?.message).toBe("specs writes the project's surfaces, so the project needs specs: define({ specs, part, tasks })");
            expect([() => tool.define({ specs, tasks: {} } as never), () => tool.define({ specs: {}, part, tasks: {} } as never)].map(( run ) => { try { run(); return ""; } catch ( caught ) { return (caught as { reason?: string }).reason; } })).toEqual(["tool.project", "tool.project"]);

        } finally {

            temp.remove();

        }

    });
    it("each plays its steps for the roles the arguments name, every role under --all, or the current one, with {role} and the role in hand", async () => {

        const temp = stage.tmp();
        const seen: string[] = [];

        try {

            const tasks = {
                    build: tool.each([
                        tool.emit("dist/{role}/theme.txt", themed),
                        tool.emit("dist/{role}/view.json", ( role: { name: string; id: string; locale: string; dir: string; address: string | undefined; index: { name: string; settings: object }[]; surface: { address?: string | undefined } } ) => ({ name: role.name, id: role.id, locale: role.locale, dir: role.dir, address: role.address === role.surface.address ? role.address : "", index: role.index.map(( one ) => [one.name, Object.keys(one.settings)]) })),
                        tool.run("echo {role} > dist/{role}/shell.txt"),
                        tool.step("seen {role}", ( scope: tool.Scope<{ name: string }> ) => { seen.push(scope.role.name); }),
                    ]),
                    pinned: tool.each(tool.step("pinned {role}", ( scope: tool.Scope<{ name: string }> ) => { seen.push(`pinned ${scope.role.name}`); }), ["courier"]),
                    current: tool.emit("current.txt", themed),
            };
            const project = tool.define({ specs, part, tasks });
            const lines: string[] = [];
            const play = ( argv: string[], task = "build", given = project ): Promise<tool.Outcome> => tool.play(given, [task], { root: temp.path, argv, out: ( line ) => lines.push(line) });

            expect((await play([])).failed).toBe(false);
            expect([readFileSync(temp.file("dist/admin/theme.txt"), "utf8"), JSON.parse(readFileSync(temp.file("dist/admin/view.json"), "utf8")), readFileSync(temp.file("dist/admin/shell.txt"), "utf8")]).toEqual(["admin #ff4500\n", { name: "admin", id: "admin", locale: "ar", dir: "rtl", address: "https://admin.example.test", index: [["admin", ["locales", "locale", "scheme", "world"]]] }, "admin\n"]);
            expect(lines).toContain("✓ build › emit dist/admin/theme.txt");
            expect(lines).toContain("✓ build › seen admin");
            expect((await play(["courier", "--verbose"])).failed).toBe(false);
            expect((await play(["--all"])).failed).toBe(false);
            expect((await play(["admin"], "pinned")).failed).toBe(false);
            expect((await play([], "current")).failed).toBe(false);
            expect([seen, readFileSync(temp.file("current.txt"), "utf8"), JSON.parse(readFileSync(temp.file("dist/courier/view.json"), "utf8")).dir, JSON.parse(readFileSync(temp.file("dist/courier/view.json"), "utf8")).index]).toEqual([["admin", "courier", "admin", "courier", "pinned courier"], "admin #ff4500\n", "ltr", [["courier", ["locales", "locale", "scheme", "world"]]]]);
            await expect(play(["ghost"])).rejects.toMatchObject({ reason: "tool.each", message: "ghost: no surface carries this name; roles: admin, courier" });
            expect((await play(["--role", "courier"])).failed).toBe(false);
            expect((await play(["--role", "courier", "admin"])).failed).toBe(false);
            expect(seen.slice(-2)).toEqual(["courier", "admin"]);

            const refused = await play(["courier"], "build", tool.define({ specs: broken, part, tasks }));

            expect([refused.failed, refused.flagged[0]?.message, seen.length]).toEqual([true, "courier: 1 problem in the spec; the specs step shows them", 7]);

            const bare = tool.define({ tasks: { each: tool.each(tool.emit("x.txt", "x")), token: tool.emit("dist/{role}.txt", "x") } });

            await expect(tool.play(bare, ["each"], { root: temp.path, out: () => undefined })).rejects.toMatchObject({ reason: "tool.each" });
            expect((await tool.play(bare, ["token"], { root: temp.path, out: () => undefined })).flagged[0]?.message).toBe("dist/{role}.txt: {role} names a role, so the project needs specs");

        } finally {

            temp.remove();

        }

    });
    it("target tells a build it is a release: every pick chooses its release value, and env only sets variables for the steps and puts them back", async () => {

        const temp = stage.tmp();

        try {

            mapping(temp, "spec");
            const staged = spec.surface({ config: { settings: { locale: "en", locales: ["en"] }, contracts: { baseUrl: spec.pick({ dev: "http://localhost:8100", release: "https://release.example.test" }) } }, schema: [home("en")] });
            const address = ( role: { address: string | undefined } ): string => role.address ?? "";
            const project = tool.define({ specs: spec.define({ staged }), part, tasks: { release: tool.target({ release: true }, [tool.specs("#spec"), tool.each(tool.emit("{role}.txt", address))]), plain: tool.emit("plain.txt", address), shell: tool.env({ HELD_BY_TOOL: "set" }, tool.run("echo $HELD_BY_TOOL > shell.txt")) } });

            expect((await tool.play(project, ["release", "plain", "shell"], { root: temp.path, out: () => undefined })).failed).toBe(false);
            expect([JSON.parse(readFileSync(temp.file("spec/surface/staged.json"), "utf8")).address, readFileSync(temp.file("staged.txt"), "utf8"), readFileSync(temp.file("plain.txt"), "utf8"), readFileSync(temp.file("shell.txt"), "utf8"), process.env.HELD_BY_TOOL]).toEqual(["https://release.example.test", "https://release.example.test", "http://localhost:8100", "set\n", undefined]);
            expect(tool.plan(project, ["release"]).lines.slice(0, 2)).toEqual(["release", "  target release=true"]);
            expect([() => tool.target({}, []), () => tool.target({ platform: "tv" as never }, []), () => tool.target({ release: "yes" as never }, []), () => tool.target({ stage: 1 } as never, []), () => tool.target({ release: true }, 7 as never)].map(( make ) => { try { make(); return ""; } catch ( caught ) { return (caught as { reason?: string }).reason; } })).toEqual(Array.from({ length: 5 }, () => "tool.target"));

        } finally {

            temp.remove();

        }

    });
    it("a role's page knows its language, direction, policy and settings; its bundle keeps only its world data; its budget reads its settings", async () => {

        const temp = stage.tmp();

        try {

            temp.write("src/index.html", "<html lang=\"{{locale}}\" dir=\"{{dir}}\"><meta content=\"{{csp}}\"><body data-scheme=\"{{settings.scheme}}\" data-locales=\"{{surface.locales}}\" data-title=\"{{title}}\"></body></html>\n");
            temp.write("src/world/data/countries.json", "{\"eg\":\"Egypt\"}");
            temp.write("src/world/data/emojis.json", "{\"smile\":\"grin\"}");
            temp.write("src/app.ts", "import countries from \"./world/data/countries.json\";\nimport emojis from \"./world/data/emojis.json\";\nconsole.log(JSON.stringify([countries, emojis]));\n");

            const project = tool.define({
                specs,
                part,
                tasks: {
                    build: tool.each([
                        tool.bundle("src/app.ts", "dist/{role}"),
                        tool.bundle("src/app.ts", "dist/{role}/all", { world: "all" }),
                        tool.page("src/index.html", "dist/{role}/index.html", { title: "Shop" }),
                        tool.budget({ js: "dist/{role}/*.js", app: { files: "dist/{role}/app.js", lines: 100 } }),
                    ]),
                },
            });
            const lines: string[] = [];
            const played = await tool.play(project, ["build"], { root: temp.path, argv: ["--all"], out: ( line ) => lines.push(line) });
            const read = ( path: string ): string => readFileSync(temp.file(path), "utf8");

            expect(read("dist/admin/index.html")).toBe("<html lang=\"ar\" dir=\"rtl\"><meta content=\"default-src &#x27;self&#x27;; script-src &#x27;self&#x27;; style-src &#x27;self&#x27;; font-src &#x27;self&#x27;; img-src &#x27;self&#x27; data: https://admin.example.test; media-src &#x27;self&#x27; blob: https://admin.example.test; connect-src &#x27;self&#x27; https://admin.example.test wss://admin.example.test; object-src &#x27;none&#x27;; base-uri &#x27;none&#x27;; form-action &#x27;none&#x27;\"><body data-scheme=\"dark\" data-locales=\"ar\" data-title=\"Shop\"></body></html>\n");
            expect([read("dist/admin/app.js").includes("Egypt"), read("dist/admin/app.js").includes("grin"), read("dist/courier/app.js").includes("Egypt"), read("dist/courier/all/app.js").includes("grin")]).toEqual([true, false, false, true]);
            expect([played.failed, played.flagged.map(( one ) => `${one.rule} ${one.where}`)]).toEqual([true, ["budget.total js"]]);
            expect(lines.some(( line ) => /^ {2}js: 1 file, \d+ B of 1 kB, app: /.test(line))).toBe(false);
            expect(lines.filter(( line ) => /^ {2}js: 1 file, \d+ B of (1 kB|10 B)$/.test(line))).toHaveLength(2);
            expect(lines.filter(( line ) => /^ {2}app: 1 file, \d+ B, longest dist\/(admin|courier)\/app\.js \d+ of 100 lines$/.test(line))).toHaveLength(2);
            expect(existsSync(temp.file("dist/courier/index.html"))).toBe(true);

        } finally {

            temp.remove();

        }

    });
    it("the media origins a surface names join the page's policy, and a project holds no hook into the environment", async () => {

        const temp = stage.tmp();

        try {

            mapping(temp, "spec");
            temp.write("src/index.html", "<meta content=\"{{csp}}\">\n");

            const mapped = spec.surface({ config: { settings: { locales: ["en"] }, contracts: { baseUrl: "https://desk.example.test", media: ["https://maps.example.test/staticmap"] } }, schema: [spec.screen("home", { path: "/", title: "Home" })] });
            const keyed = spec.part({ platform: "web", defaults: { contracts: { maps: { key: "" } } } });
            const tasks = { build: [tool.specs("#spec"), tool.page("src/index.html", "dist/index.html")] };
            const project = tool.define({ specs: spec.define({ desk: mapped }), part: keyed, tasks });
            const played = await tool.play(project, ["build"], { root: temp.path, env: { MAPS_KEY: "k-123" }, out: () => undefined });
            const read = ( path: string ): string => readFileSync(temp.file(path), "utf8");

            expect([played.failed, JSON.parse(read("spec/surface/desk.json")).config.contracts.maps, read("dist/index.html").includes("img-src &#x27;self&#x27; data: https://desk.example.test https://maps.example.test;")]).toEqual([false, { key: "" }, true]);
            expect(() => tool.define({ tasks: {}, deploy: () => ({}) } as never)).toThrow("deploy: a project holds");

        } finally {

            temp.remove();

        }

    });
    it("a role that transfers carries what it reaches: one artifact, every address in its policy, every world catalog in its bundle", async () => {

        const temp = stage.tmp();

        try {

            mapping(temp, "spec");
            temp.write("src/index.html", "<meta content=\"{{csp}}\">\n");
            temp.write("src/world/data/countries.json", "{\"eg\":\"Egypt\"}");
            temp.write("src/app.ts", "import countries from \"./world/data/countries.json\";\nconsole.log(JSON.stringify(countries));\n");

            const desk = spec.surface({ config: { settings: { locales: ["en"] }, contracts: { baseUrl: "https://desk.example.test" } }, schema: [spec.screen("home", { path: "/", title: "Home", on: { load: spec.transfer("admin") } })] });
            const lost = spec.surface({ schema: [spec.screen("home", { path: "/", title: "Home", on: { load: spec.transfer("ghost") } })] });
            const tasks = { build: [tool.specs("#spec"), tool.each([tool.bundle("src/app.ts", "dist/{role}"), tool.page("src/index.html", "dist/{role}/index.html"), tool.emit("dist/{role}/reach.json", ( role: { reach: tool.Reach } ) => role.reach)], ["desk"])] };
            const played = await tool.play(tool.define({ specs: spec.define({ admin, desk }), part, tasks }), ["build"], { root: temp.path, out: () => undefined });
            const read = ( path: string ): string => readFileSync(temp.file(path), "utf8");

            expect([played.failed, JSON.parse(read("spec/current.json")).index.map(( one: { name: string } ) => one.name), JSON.parse(read("spec/surface/desk.json")).links, read("spec/current.ts").includes('"admin": () => import("./surface/admin.json"),'), (( { surfaces: _surfaces, ...rest }: tool.Reach ) => rest)(JSON.parse(read("dist/desk/reach.json")))]).toEqual([false, ["admin"], { admin: "admin" }, false, { names: ["desk", "admin"], addresses: ["https://desk.example.test", "https://admin.example.test"], world: ["countries"] }]);
            expect((JSON.parse(read("dist/desk/reach.json")) as tool.Reach).surfaces.map(( one: tool.Reached ) => [one.name, one.id, one.themes.brand, one.settings.locale])).toEqual([["desk", "desk", "#000000", "en"], ["admin", "admin", "#ff4500", "ar"]]);
            expect([read("dist/desk/index.html").includes("connect-src &#x27;self&#x27; https://desk.example.test wss://desk.example.test https://admin.example.test wss://admin.example.test;"), read("dist/desk/app.js").includes("Egypt"), tool.csp(["https://a.example.test/v1", "https://a.example.test/v2"]).includes("connect-src 'self' https://a.example.test wss://a.example.test;")]).toEqual([true, true, true]);

            const refused = await tool.play(tool.define({ specs: spec.define({ admin, desk: lost }), part, tasks: { build: tool.each(tool.emit("x.txt", ( role: { name: string } ) => role.name), ["desk"]), compile: tool.specs("#spec") } }), ["compile"], { root: temp.path, out: () => undefined });

            expect([refused.failed, refused.flagged.map(( one ) => [one.where, one.rule])]).toEqual([true, [["desk: screens.home.on.load[0]", "surface.unknown"], ["specs #spec", "failed"]]]);
            expect(() => tool.csp([])).toThrow("the API uses http or https");

        } finally {

            temp.remove();

        }

    });
    it("plan draws the tree a task would play, roles and env included, without playing it", () => {

        const project = tool.define({
            specs,
            part,
            tasks: {
                compile: tool.specs("#spec"),
                build: ["compile", tool.each([tool.bundle("src/app.ts", "dist/{role}"), tool.budget({ js: "dist/{role}/*.js" })])],
                release: tool.env({ ENGINE_ENV: "production", DEBUG: undefined }, "build"),
                loop: ["again"],
                again: ["loop"],
            },
        });

        expect(tool.plan(project, ["release"], ["--all"])).toEqual({
            lines: ["release", "  env ENGINE_ENV=production -DEBUG", "    build", "      compile", "        specs #spec", "      role admin", "        bundle src/app.ts → dist/admin", "        budget js", "      role courier", "        bundle src/app.ts → dist/courier", "        budget js"],
            steps: 5,
        });
        expect(tool.plan(project, ["build"]).lines.filter(( line ) => line.includes("role"))).toEqual(["  role admin"]);
        expect(() => tool.plan(project, ["loop"])).toThrow("a task cycle: loop → again → loop");
        expect(() => tool.plan(project, ["build"], ["ghost"])).toThrow("ghost: no surface carries this name; roles: admin, courier");
        expect(() => tool.plan(project, ["nothing"])).toThrow("no task named nothing");

    });

    it("theme writes a role's own look as variables over the part's tokens, a custom color as a theme name, and nothing for a role that overrides nothing", async () => {

        const temp = stage.tmp();

        try {

            const plain = spec.part({ platform: "web" });
            const screens = [spec.screen("home", { path: "/", title: "Home" })];
            const looked = spec.define({ shop: { client: spec.surface({ schema: screens, config: { themes: { brand: "#ff4500", color: { dark: { surface: "#120a05" }, custom: { offer: "#00a86b" } }, radius: { md: 14 } } } }), bare: spec.surface({ schema: screens }) } });
            const project = tool.define({ specs: looked, part: plain, tasks: { look: tool.theme("out/{role}.css") } });
            const played = await tool.play(project, ["look"], { root: temp.path, argv: ["--role", "shop.client"], out: () => undefined });
            const sheet = readFileSync(temp.file("out/shop.client.css"), "utf8");

            expect(played.failed).toBe(false);
            expect(sheet.startsWith("@theme {\n    --color-offer: #00a86b;\n}")).toBe(true);
            expect([sheet.includes(":root {"), sheet.includes("--color-brand: #"), sheet.includes("--radius-md: 0.875rem;"), sheet.includes("--color-surface: #120a05;"), sheet.includes('[data-theme="dark"]')]).toEqual([true, true, true, true, true]);

            await tool.play(project, ["look"], { root: temp.path, argv: ["--role", "shop.bare"], out: () => undefined });

            expect(readFileSync(temp.file("out/shop.bare.css"), "utf8")).toBe("");
            expect(() => tool.theme("")).toThrow("theme: a path is a non-empty string");
            expect((await tool.play(tool.define({ tasks: { look: tool.theme("x.css") } }), ["look"], { root: temp.path, out: () => undefined })).failed).toBe(true);

        } finally {

            temp.remove();

        }

    });

    it("spoken stamps the pages under each language's folder with their language and direction, and leaves a role alone that keeps its language out of the address", async () => {

        const temp = stage.tmp();

        try {

            const screens = [spec.screen("home", { path: "/", title: { en: "Home", ar: "الرئيسية" } })];
            const told = ( localization: boolean ): spec.Surface => spec.surface({ schema: screens, config: { settings: { locales: ["en", "ar"], locale: "en", localization } } });
            const project = tool.define({ specs: spec.define({ shop: { open: told(true), shut: told(false) } }), part: spec.part({ platform: "web" }), tasks: { stamp: tool.spoken("out") } });
            const page = '<!DOCTYPE html><html lang="en" dir="ltr"><head></head><body><p lang="en" dir="ltr">x</p></body></html>';

            for ( const file of ["out/index.html", "out/ar.html", "out/ar/offers.html", "out/ar/deep/page.html", "out/en/offers.html"] ) temp.write(file, page);

            const played = await tool.play(project, ["stamp"], { root: temp.path, argv: ["--role", "shop.open"], out: () => undefined });
            const read = ( file: string ): string => readFileSync(temp.file(file), "utf8");

            expect([played.failed, played.written, read("out/index.html") === page, read("out/en/offers.html") === page]).toEqual([false, 3, true, true]);

            for ( const file of ["out/ar.html", "out/ar/offers.html", "out/ar/deep/page.html"] ) expect(read(file)).toBe('<!DOCTYPE html><html lang="ar" dir="rtl"><head></head><body><p lang="en" dir="ltr">x</p></body></html>');

            const kept = await tool.play(project, ["stamp"], { root: temp.path, argv: ["--role", "shop.shut"], out: () => undefined });

            expect([kept.failed, kept.written]).toEqual([false, 0]);
            expect(() => tool.spoken("")).toThrow("spoken: a path is a non-empty string");

        } finally {

            temp.remove();

        }

    });
    it("specs writes the compiled module where tsconfig points #spec, and places every surface's files with the entry's security beside the site", async () => {

        const temp = stage.tmp();

        try {

            const put = ( path: string, text: string ): void => {

                mkdirSync(dirname(temp.file(path)), { recursive: true });
                writeFileSync(temp.file(path), text);

            };
            const read = ( path: string ): string => readFileSync(temp.file(path), "utf8");
            const shop = spec.surface({ schema: [home("en")], config: { settings: { locale: "en", locales: ["en"] } }, assets: { home: temp.file("specs/shop/assets"), images: { logo: "images/mark.png" }, sounds: { ping: "sounds/missing.mp3" } } });
            const plain = spec.surface({ schema: [home("en")], config: { settings: { locale: "en", locales: ["en"] } } });
            const seeds = { assets: { home: temp.file("seeds/assets"), images: { logo: "images/logo.svg", hero: "images/hero.svg" }, security: { "security.txt": "security/security.txt" } } };
            const project = tool.define({ specs: spec.define({ shop, plain }, { current: "shop" }), part, seeds, paths: { served: "_files", public: "web" }, assets: { root: "{public}", into: "{public}/{served}", entry: { security: "{public}/.well-known" }, places: { paint: "{public}/paint.js" } }, tasks: { compile: tool.specs("#spec"), sheet: tool.styles("#styles", ["src/styles/a.css", "{public}/b.css"]) } });

            put("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "#spec": ["./.made/spec/module.ts"], "#styles": ["./.made/styles/index.css"] } } }));
            put("seeds/assets/images/logo.svg", "seed logo");
            put("seeds/assets/images/hero.svg", "seed hero");
            put("seeds/assets/security/security.txt", "Contact: x");
            put("specs/shop/assets/images/mark.png", "shop mark");
            put("web/_files/stale/old.txt", "stale");

            const played = await tool.play(project, ["compile"], { root: temp.path, out: () => undefined });

            expect([played.flagged.map(( flag ) => [flag.where, flag.rule]), project.paths, project.assets]).toEqual([[["specs.shop.assets.sounds.ping", "assets"]], { served: "_files", public: "web" }, { root: "web", into: "web/_files", url: "/_files", entry: { security: "web/.well-known" }, places: { paint: "web/paint.js" }, urls: { paint: "/paint.js" } }]);
            expect([read("web/_files/shop/images/logo.png"), read("web/_files/shop/images/hero.svg"), read("web/_files/plain/images/logo.svg"), read("web/_files/shop/security/security.txt"), read("web/.well-known/security.txt"), existsSync(temp.file("web/_files/stale"))]).toEqual(["shop mark", "seed hero", "seed logo", "Contact: x", "Contact: x", false]);
            expect([read(".made/spec/module.ts").startsWith('import entry from "./surface/shop.json" with { type: "json" };\n\nexport const compiled = {\n    artifact: '), JSON.parse(read(".made/spec/surface/shop.json")).assets["images.logo"], JSON.parse(read(".made/spec/surface/shop.json")).places]).toEqual([true, "/_files/shop/images/logo.png", { paint: "/paint.js" }]);
            await expect(tool.play(tool.define({ specs: spec.define({ plain }), part, tasks: { compile: tool.specs("#nowhere") } }), ["compile"], { root: temp.path, out: () => undefined })).resolves.toMatchObject({ failed: true });
            expect([(await tool.play(project, ["sheet"], { root: temp.path, out: () => undefined })).failed, read(".made/styles/index.css")]).toEqual([false, '@import "../../src/styles/a.css";\n@import "../../web/b.css";\n']);
            expect([() => tool.styles("#styles", []), () => tool.styles("", ["a.css"])].map(( make ) => { try { make(); return ""; } catch ( caught ) { return (caught as { reason?: string }).reason; } })).toEqual(["tool.styles", "tool.styles"]);
            expect([() => tool.define({ specs: spec.define({ plain }), part, assets: { into: "x" } as never, tasks: {} }), () => tool.define({ specs: spec.define({ plain }), part, assets: { root: "web", into: "elsewhere" }, tasks: {} }), () => tool.define({ seeds: {}, tasks: {} } as never), () => tool.define({ paths: { a: "{b}", b: "{a}" }, tasks: {} })].map(( make ) => { try { make(); return ""; } catch ( caught ) { return (caught as { reason?: string }).reason; } })).toEqual(["tool.project", "tool.project", "tool.project", "tool.project"]);

        } finally {

            temp.remove();

        }

    });
    it("the platform a target names chooses every pick, the part's own platform otherwise", async () => {

        const temp = stage.tmp();

        try {

            temp.write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "#web": ["./web/current.ts"], "#desk": ["./desk/current.ts"] } } }));
            const desk = spec.surface({ schema: [home("en")], config: { settings: { locale: "en", locales: ["en"], scheme: spec.pick({ web: "light", desktop: "dark" }) } } });
            const tasks = { web: tool.specs("#web"), desk: tool.target({ platform: "desktop" }, tool.specs("#desk")) };
            const project = tool.define({ specs: spec.define({ desk }), part, tasks });

            expect((await tool.play(project, ["web", "desk"], { root: temp.path, out: () => undefined })).failed).toBe(false);
            expect([JSON.parse(readFileSync(temp.file("web/surface/desk.json"), "utf8")).config.settings.scheme, JSON.parse(readFileSync(temp.file("desk/surface/desk.json"), "utf8")).config.settings.scheme]).toEqual(["light", "dark"]);

        } finally {

            temp.remove();

        }

    });

});
