import { describe, expect, test as it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as spec from "engine/spec";
import * as stage from "engine/test";
import * as tool from "engine/tool";

const roles = {
    admin: { config: { settings: { locale: "ar", world: ["countries"], scheme: "dark", app: { name: "Shop Admin", identifier: "test.shop.admin" }, budget: { js: "1 kB" } }, themes: { brand: "#ff4500" } } },
    courier: { config: { settings: { locale: "en", world: [], scheme: "light", budget: { js: 10 } }, themes: { brand: "#0055ff" } } },
} as const;

type Name = keyof typeof roles;

const broken = new Set<Name>();

function compileRole ( name: Name ): spec.Compiled {

    const { locale, world } = roles[name].config.settings;
    const address = process.env.TOOL_TEST_API ?? `https://${name}.example.test`;
    const path = broken.has(name) ? "jobs" : "/";

    return spec.compile(spec.surface({ name: `web-${name}`, role: name, platform: "web", world: [...world], locales: [locale], locale, address, screens: [spec.screen({ name: "home", path, role: name, title: { [locale]: "Home" }, blocks: [] })] }));

}

const specs = spec.roles({ roles, current: "admin", compile: compileRole });

function themed ( role: { name: string; themes: { brand: string } } ): string {

    return `${role.name} ${role.themes.brand}\n`;

}

describe("tool specs", () => {

    it("specs writes every role and the current one with the settings it carries, and stops on a role's problems", async () => {

        const temp = stage.tmp();
        const lines: string[] = [];

        try {

            const project = tool.define({ specs, tasks: { compile: [tool.specs(".cache/spec", { settings: ["app"] }), tool.emit("after.txt", "ran")] } });
            const played = await tool.play(project, ["compile"], { root: temp.path, out: ( line ) => lines.push(line) });
            const admin = JSON.parse(readFileSync(temp.file(".cache/spec/admin.json"), "utf8"));
            const courier = JSON.parse(readFileSync(temp.file(".cache/spec/courier.json"), "utf8"));

            expect([played.failed, admin.app, courier.app, admin.surface.address, spec.revive(courier).surface.role]).toEqual([false, roles.admin.config.settings.app, undefined, "https://admin.example.test", "courier"]);
            expect(readFileSync(temp.file(".cache/spec/current.json"), "utf8")).toBe(readFileSync(temp.file(".cache/spec/admin.json"), "utf8"));
            expect(lines).toContain("  courier: 1 screen, 0 features, 0 topics");

            broken.add("courier");

            const failed = await tool.play(project, ["compile"], { root: temp.path, out: () => undefined });
            const bare = await tool.play(tool.define({ tasks: { compile: tool.specs(".cache/spec") } }), ["compile"], { root: temp.path, out: () => undefined });

            expect([failed.failed, failed.flagged.map(( one ) => one.rule), failed.flagged.at(-1)?.message, failed.steps]).toEqual([true, ["shape", "failed"], "1 problem in the specs; nothing after them runs", 1]);
            expect(bare.flagged[0]?.message).toBe("specs writes the project's roles, so the project needs specs: define({ specs, tasks })");

        } finally {

            broken.clear();
            temp.remove();

        }

    });
    it("each plays its steps for the roles the arguments name, every role under --all, or the current one, with {role} and the role in hand", async () => {

        const temp = stage.tmp();
        const seen: string[] = [];

        try {

            const project = tool.define({
                specs,
                tasks: {
                    build: tool.each([
                        tool.emit("dist/{role}/theme.txt", themed),
                        tool.emit("dist/{role}/view.json", ( role: { name: string; locale: string; dir: string; surface: { address?: string | undefined } } ) => ({ name: role.name, locale: role.locale, dir: role.dir, address: role.surface.address })),
                        tool.run("echo {role} > dist/{role}/shell.txt"),
                        tool.step("seen {role}", ( scope: tool.Scope<{ name: string }> ) => { seen.push(scope.role.name); }),
                    ]),
                    pinned: tool.each(tool.step("pinned {role}", ( scope: tool.Scope<{ name: string }> ) => { seen.push(`pinned ${scope.role.name}`); }), ["courier"]),
                    current: tool.emit("current.txt", themed),
                },
            });
            const lines: string[] = [];
            const play = ( argv: string[], task = "build" ): Promise<tool.Outcome> => tool.play(project, [task], { root: temp.path, argv, out: ( line ) => lines.push(line) });

            expect((await play([])).failed).toBe(false);
            expect([readFileSync(temp.file("dist/admin/theme.txt"), "utf8"), JSON.parse(readFileSync(temp.file("dist/admin/view.json"), "utf8")), readFileSync(temp.file("dist/admin/shell.txt"), "utf8")]).toEqual(["admin #ff4500\n", { name: "admin", locale: "ar", dir: "rtl", address: "https://admin.example.test" }, "admin\n"]);
            expect(lines).toContain("✓ build › emit dist/admin/theme.txt");
            expect(lines).toContain("✓ build › seen admin");
            expect((await play(["courier", "--verbose"])).failed).toBe(false);
            expect((await play(["--all"])).failed).toBe(false);
            expect((await play(["admin"], "pinned")).failed).toBe(false);
            expect((await play([], "current")).failed).toBe(false);
            expect([seen, readFileSync(temp.file("current.txt"), "utf8"), JSON.parse(readFileSync(temp.file("dist/courier/view.json"), "utf8")).dir]).toEqual([["admin", "courier", "admin", "courier", "pinned courier"], "admin #ff4500\n", "ltr"]);
            await expect(play(["ghost"])).rejects.toMatchObject({ reason: "tool.each", message: "no role named ghost; roles: admin, courier" });

            broken.add("courier");

            const refused = await play(["courier"]);

            expect([refused.failed, refused.flagged[0]?.message, seen.length]).toEqual([true, "courier: 1 problem in the spec; the specs step shows them", 5]);

            const bare = tool.define({ tasks: { each: tool.each(tool.emit("x.txt", "x")), token: tool.emit("dist/{role}.txt", "x") } });

            await expect(tool.play(bare, ["each"], { root: temp.path, out: () => undefined })).rejects.toMatchObject({ reason: "tool.each" });
            expect((await tool.play(bare, ["token"], { root: temp.path, out: () => undefined })).flagged[0]?.message).toBe("dist/{role}.txt: {role} names a role, so the project needs specs");

        } finally {

            broken.clear();
            temp.remove();

        }

    });
    it("env plays steps under its variables, so a role compiles against them, and puts every variable back after", async () => {

        const temp = stage.tmp();

        try {

            const project = tool.define({ specs, tasks: { release: tool.env({ TOOL_TEST_API: "https://release.example.test" }, [tool.specs("spec"), tool.each(tool.emit("{role}.txt", ( role: { surface: { address?: string | undefined } } ) => role.surface.address ?? ""))]) } });

            expect((await tool.play(project, ["release"], { root: temp.path, out: () => undefined })).failed).toBe(false);
            expect([JSON.parse(readFileSync(temp.file("spec/courier.json"), "utf8")).surface.address, readFileSync(temp.file("admin.txt"), "utf8"), process.env.TOOL_TEST_API]).toEqual(["https://release.example.test", "https://release.example.test", undefined]);

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

            expect(read("dist/admin/index.html")).toBe("<html lang=\"ar\" dir=\"rtl\"><meta content=\"default-src &#x27;self&#x27;; script-src &#x27;self&#x27;; style-src &#x27;self&#x27;; font-src &#x27;self&#x27;; img-src &#x27;self&#x27; data:; connect-src &#x27;self&#x27; https://admin.example.test wss://admin.example.test; object-src &#x27;none&#x27;; base-uri &#x27;none&#x27;; form-action &#x27;none&#x27;\"><body data-scheme=\"dark\" data-locales=\"ar\" data-title=\"Shop\"></body></html>\n");
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
    it("plan draws the tree a task would play, roles and env included, without playing it", () => {

        const project = tool.define({
            specs,
            tasks: {
                compile: tool.specs(".cache/spec"),
                build: ["compile", tool.each([tool.bundle("src/app.ts", "dist/{role}"), tool.budget({ js: "dist/{role}/*.js" })])],
                release: tool.env({ ENGINE_ENV: "production", DEBUG: undefined }, "build"),
                loop: ["again"],
                again: ["loop"],
            },
        });

        expect(tool.plan(project, ["release"], ["--all"])).toEqual({
            lines: ["release", "  env ENGINE_ENV=production -DEBUG", "    build", "      compile", "        specs .cache/spec", "      role admin", "        bundle src/app.ts → dist/admin", "        budget js", "      role courier", "        bundle src/app.ts → dist/courier", "        budget js"],
            steps: 5,
        });
        expect(tool.plan(project, ["build"]).lines.filter(( line ) => line.includes("role"))).toEqual(["  role admin"]);
        expect(() => tool.plan(project, ["loop"])).toThrow("a task cycle: loop → again → loop");
        expect(() => tool.plan(project, ["build"], ["ghost"])).toThrow("no role named ghost; roles: admin, courier");
        expect(() => tool.plan(project, ["nothing"])).toThrow("no task named nothing");

    });

});
