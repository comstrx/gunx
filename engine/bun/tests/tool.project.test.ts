import { afterEach, describe, expect, test as it, spyOn } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as stage from "engine/test";
import * as tool from "engine/tool";

const door = resolve(import.meta.dir, "../src/tool/src/index.ts");

function quiet (): { lines: string[]; restore: () => void } {

    const lines: string[] = [];
    const spy = spyOn(process.stdout, "write").mockImplementation(( chunk: unknown ) => { lines.push(String(chunk).trimEnd()); return true; });

    return { lines, restore: () => spy.mockRestore() };

}
function reasonOf ( run: () => unknown ): string {

    try {

        run();

        return "ok";

    } catch ( caught ) {

        return ( caught as { reason?: string } ).reason ?? "thrown";

    }

}

let restore: (() => void) | undefined;

afterEach(() => {

    restore?.();
    restore = undefined;

});

describe("tool project", () => {

    it("a project is named tasks of steps, functions, task names or lists of them, and refuses anything else", () => {

        const project = tool.define({ tasks: { build: ["compile", tool.run("true")], compile: tool.step("noop", () => undefined), check: [() => undefined, ["compile"]] } });

        expect([tool.isProject(project), tool.isProject({ tasks: {} }), Object.isFrozen(project.tasks)]).toEqual([true, false, true]);
        expect([
            () => tool.define([] as never),
            () => tool.define({ tasks: { "two words": "x" } }),
            () => tool.define({ tasks: { build: 7 as never } }),
            () => tool.define({ tasks: { build: [{ name: "half" }] as never } }),
            () => tool.step("", () => undefined),
            () => tool.step("x", 1 as never),
            () => tool.run(" "),
            () => tool.emit("", "x"),
            () => tool.copy("a", " "),
            () => tool.bundle([""], "dist"),
            () => tool.css("a.css", "b.css", {} as never),
            () => tool.fonts(""),
            () => tool.define({ tasks: {}, extra: 1 } as never),
            () => tool.define({ specs: { roles: {} }, tasks: {} } as never),
            () => tool.each(7 as never),
            () => tool.each([], []),
            () => tool.env({}, []),
            () => tool.env({ "two words": "x" }, []),
            () => tool.env({ MODE: 1 as never }, []),
        ].map(reasonOf)).toEqual(["tool.project", "tool.project", "tool.project", "tool.project", "tool.step", "tool.step", "tool.run", "tool.emit", "tool.copy", "tool.bundle", "tool.css", "tool.fonts", "tool.project", "tool.project", "tool.each", "tool.each", "tool.env", "tool.env", "tool.env"]);

    });
    it("tasks play in order, reuse each other by name, expand what a step returns, and keep a ledger of writes and issues", async () => {

        const temp = stage.tmp();
        const lines: string[] = [];
        const seen: string[] = [];

        try {

            temp.write("assets/a.woff2", "a");
            temp.write("assets/deep/b.woff2", "b");
            temp.write("assets/c.txt", "c");

            const project = tool.define({ tasks: {
                compile: [
                    tool.emit("out/note.txt", "hello\n"),
                    tool.emit("out/data.json", ( _role: undefined, scope: tool.Scope ) => ({ argv: scope.argv, mode: scope.env.MODE })),
                    tool.copy("assets", "out/fonts", { extensions: [".woff2"] }),
                    tool.copy("assets/c.txt", "out/c.txt"),
                ],
                roles: ( scope ) => scope.argv.map(( role ) => tool.step(`role ${role}`, ( inner ) => { seen.push(role); inner.say(`made ${role}`); })),
                build: ["compile", "roles", tool.run("printf built > out/shell.txt")],
                lint: [tool.step("look", ( scope ) => { scope.flag("a.ts:3", "too loud", "style"); scope.flag("b.ts:1", "again"); }), tool.step("after", () => { seen.push("after"); })],
                broken: [tool.step("boom", () => { throw new Error("down"); }), tool.step("never", () => { seen.push("never"); })],
                loop: ["again"],
                again: ["loop"],
                lost: ["nowhere"],
            } });
            const played = await tool.play(project, ["build"], { root: temp.path, argv: ["admin", "courier"], env: { MODE: "lab" }, out: ( line ) => lines.push(line) });

            expect([played.failed, played.steps, played.written, played.flagged]).toEqual([false, 7, 5, []]);
            expect(readFileSync(temp.file("out/note.txt"), "utf8")).toBe("hello\n");
            expect(JSON.parse(readFileSync(temp.file("out/data.json"), "utf8"))).toEqual({ argv: ["admin", "courier"], mode: "lab" });
            expect([existsSync(temp.file("out/fonts/a.woff2")), existsSync(temp.file("out/fonts/deep/b.woff2")), existsSync(temp.file("out/fonts/c.txt")), readFileSync(temp.file("out/shell.txt"), "utf8")]).toEqual([true, true, false, "built"]);
            expect(seen).toEqual(["admin", "courier"]);
            expect(lines).toContain("✓ compile › emit out/note.txt");
            expect(lines).toContain("  made courier");

            const again = await tool.play(project, ["compile"], { root: temp.path, argv: ["admin", "courier"], env: { MODE: "lab" }, out: () => undefined });

            expect(again.written).toBe(0);

            const lint = await tool.play(project, ["lint"], { root: temp.path, out: ( line ) => lines.push(line) });

            expect([lint.failed, lint.flagged.map(( one ) => `${one.task}/${one.step} ${one.where} ${one.message} ${one.rule}`), seen.at(-1)]).toEqual([true, ["lint/look a.ts:3 too loud style", "lint/look b.ts:1 again issue"], "after"]);

            const broken = await tool.play(project, ["broken", "compile"], { root: temp.path, out: ( line ) => lines.push(line) });

            expect([broken.failed, broken.steps, broken.flagged[0]?.rule, broken.flagged[0]?.message, seen.includes("never")]).toEqual([true, 1, "failed", "down", false]);
            expect(lines).toContain("✗ broken › boom");
            await expect(tool.play(project, ["loop"], { root: temp.path, out: () => undefined })).rejects.toMatchObject({ reason: "tool.task" });
            await expect(tool.play(project, ["lost"], { root: temp.path, out: () => undefined })).rejects.toMatchObject({ reason: "tool.task" });
            await expect(tool.play(project, ["ghost"], { root: temp.path, out: () => undefined })).rejects.toMatchObject({ reason: "tool.task" });

            const odd = await tool.play(tool.define({ tasks: { odd: () => 7 } }), ["odd"], { root: temp.path, out: () => undefined });

            expect([odd.failed, odd.flagged[0]?.message]).toEqual([true, "odd: a step returns nothing or more steps"]);

            const shell = await tool.play(tool.define({ tasks: { fail: tool.run("exit 3") } }), ["fail"], { root: temp.path, out: () => undefined });

            expect([shell.failed, shell.flagged[0]?.step]).toEqual([true, "run exit 3"]);

            const fenced = await tool.play(tool.define({ tasks: { out: tool.emit("../beyond.txt", "x") } }), ["out"], { root: temp.path, out: () => undefined });
            const self = await tool.play(tool.define({ tasks: { self: tool.copy("assets/c.txt", ".") } }), ["self"], { root: temp.path, out: () => undefined });

            expect([fenced.flagged[0]?.message, self.flagged[0]?.rule, existsSync(join(temp.path, "..", "beyond.txt"))]).toEqual(["../beyond.txt: a step writes inside the project, never the project itself or beyond it", "failed", false]);

            const env = await tool.play(tool.define({ tasks: { env: tool.run("echo $HELD:$KEPT > out/env.txt", { env: { HELD: undefined, KEPT: "kept" } }) } }), ["env"], { root: temp.path, env: { HELD: "held" }, out: () => undefined });

            expect([env.failed, readFileSync(temp.file("out/env.txt"), "utf8")]).toEqual([false, "held:kept\n"]);

            temp.write("deep/node_modules/.bin/hello", "#!/bin/sh\necho from-bin > made.txt\n");
            chmodSync(temp.file("deep/node_modules/.bin/hello"), 0o755);
            temp.write("node_modules/.bin/hello", "#!/bin/sh\necho \"$MODE $(pwd)\" > \"$1\"\n");
            chmodSync(temp.file("node_modules/.bin/hello"), 0o755);

            const scoped = tool.define({ tasks: {
                inside: tool.run("hello ../out/where.txt", { cwd: "deep" }),
                staged: tool.env({ MODE: "staged" }, [tool.run("hello out/staged.txt"), tool.step("seen", ( scope ) => { seen.push(`${process.env.MODE}:${scope.env.MODE}`); })]),
            } });

            process.env.MODE = "outer";

            expect((await tool.play(scoped, ["inside", "staged"], { root: temp.path, out: () => undefined })).failed).toBe(false);
            expect([readFileSync(temp.file("out/where.txt"), "utf8").trim().endsWith("/deep"), readFileSync(temp.file("out/staged.txt"), "utf8").startsWith("staged "), seen.at(-1), process.env.MODE]).toEqual([true, true, "staged:staged", "outer"]);

            delete process.env.MODE;

        } finally {

            temp.remove();

        }

    });
    it("script writes one built file, bundle builds a folder it may clean with the given env inlined, and neither writes the project itself", async () => {

        const temp = stage.tmp();

        try {

            temp.write("src/boot.ts", "const hello: string = \"boot\";\ndocument.title = hello;\n");
            temp.write("src/app.ts", "import { shown } from \"./shown.ts\";\nconsole.log(shown, process.env.API_URL, process.env.MODE);\n");
            temp.write("src/shown.ts", "export const shown = 42;\n");
            temp.write("dist/stale.js", "stale");
            temp.write("src/hello.ts", "export function hello (): void { document.title = \"called\"; }\n");

            const project = tool.define({ tasks: {
                build: [tool.script("src/boot.ts", "public/boot.js"), tool.bundle("src/app.ts", "dist", { target: "browser", minify: true, inline: { API_URL: "https://api.example.test", MODE: undefined } })],
                kept: tool.bundle(["src/app.ts"], "kept", { clean: false }),
                root: tool.bundle("src/app.ts", "."),
                wrong: tool.script("src/missing.ts", "public/x.js"),
                called: tool.call("../../src/hello.ts", "hello", "public/hello.js"),
                absent: tool.call("../../src/hello.ts", "bye", "public/bye.js"),
            } });
            const played = await tool.play(project, ["build"], { root: temp.path, out: () => undefined });
            const boot = readFileSync(temp.file("public/boot.js"), "utf8");

            const app = readFileSync(temp.file("dist/app.js"), "utf8");

            expect([played.failed, boot.includes("boot"), boot.trimStart().startsWith("("), existsSync(temp.file("dist/stale.js")), app.includes("42"), app.includes("https://api.example.test"), app.includes("process")]).toEqual([false, true, true, false, true, true, false]);

            const called = await tool.play(project, ["called"], { root: temp.path, out: () => undefined });
            const hello = readFileSync(temp.file("public/hello.js"), "utf8");

            expect([called.failed, hello.includes("called"), hello.trimStart().startsWith("("), (await tool.play(project, ["absent"], { root: temp.path, out: () => undefined })).failed]).toEqual([false, true, true, true]);
            expect(() => tool.call("engine/world", "not a name", "public/x.js")).toThrow("not the name of an export");

            temp.write("kept/old.js", "old");

            expect((await tool.play(project, ["kept"], { root: temp.path, out: () => undefined })).failed).toBe(false);
            expect(existsSync(temp.file("kept/old.js"))).toBe(true);

            const refused = await tool.play(project, ["root"], { root: temp.path, out: () => undefined });
            const missing = await tool.play(project, ["wrong"], { root: temp.path, out: () => undefined });

            expect([refused.flagged[0]?.message, existsSync(temp.file("src/app.ts")), missing.failed]).toEqual([".: a step writes inside the project, never the project itself or beyond it", true, true]);

        } finally {

            temp.remove();

        }

    });
    it("css runs a processor over a sheet, page fills a template, fonts copy the engine's faces with their sheet, and a clean copy replaces its target", async () => {

        const temp = stage.tmp();
        const seen: { from: string; to: string }[] = [];

        try {

            temp.write("src/globals.css", "@import \"tailwindcss\";\n");
            temp.write("src/index.html", "<html lang=\"{{lang}}\" dir=\"{{dir}}\"><script data-locales=\"{{surface.locales}}\" data-appearance=\"{{appearance}}\"></script></html>\n");

            const project = tool.define({ tasks: {
                build: [
                    tool.css("src/globals.css", "dist/theme.css", { process: async ( css, options ) => { seen.push(options); return { css: css.toUpperCase() }; } }),
                    tool.page("src/index.html", "dist/index.html", { lang: "ar", dir: "rtl", surface: { locales: ["ar", "en"] }, appearance: { scheme: "system" } }),
                    tool.fonts("dist/fonts", { css: "dist/fonts.css" }),
                    tool.fonts("dist/static", { url: "./static" }),
                ],
                lost: tool.page("src/index.html", "dist/lost.html", { lang: "ar" }),
                publish: [tool.copy("dist/admin", "dist/current", { clean: true })],
            } });
            const played = await tool.play(project, ["build"], { root: temp.path, out: () => undefined });
            const faces = readFileSync(temp.file("dist/fonts.css"), "utf8");

            expect([played.failed, readFileSync(temp.file("dist/theme.css"), "utf8"), seen[0]?.to]).toEqual([false, "@IMPORT \"TAILWINDCSS\";\n", temp.file("dist/theme.css")]);
            expect(readFileSync(temp.file("dist/index.html"), "utf8")).toBe("<html lang=\"ar\" dir=\"rtl\"><script data-locales=\"ar en\" data-appearance=\"{&quot;scheme&quot;:&quot;system&quot;}\"></script></html>\n");
            expect([faces.includes("@font-face"), faces.includes("/fonts/figtree-latin.woff2"), existsSync(temp.file("dist/fonts/figtree-latin.woff2")), existsSync(temp.file("dist/static/figtree-latin.woff2")), existsSync(temp.file("dist/static.css"))]).toEqual([true, true, true, true, false]);
            expect((await tool.play(project, ["lost"], { root: temp.path, out: () => undefined })).flagged[0]?.message).toBe("the template names {{dir}}, which was not given as text or json");

            temp.write("dist/admin/app.js", "new");
            temp.write("dist/current/old.js", "old");

            expect((await tool.play(project, ["publish"], { root: temp.path, out: () => undefined })).failed).toBe(false);
            expect([existsSync(temp.file("dist/current/old.js")), readFileSync(temp.file("dist/current/app.js"), "utf8")]).toEqual([false, "new"]);

        } finally {

            temp.remove();

        }

    });
    it("layers flags layer breaks, cycles and files no entry reaches; nameless guards the tree's names and paths", async () => {

        const temp = stage.tmp();
        const part = join(temp.path, "forest", "product", "shop", "web");

        try {

            for ( const folder of ["engine", "product/shop/web/src/api", "product/shop/web/src/app", "product/other", "tutor"] ) mkdirSync(join(temp.path, "forest", folder), { recursive: true });

            writeFileSync(join(part, "src/api/a.ts"), "import { b } from \"./b.ts\";\nexport const a = 1;\n");
            writeFileSync(join(part, "src/api/b.ts"), "import { a } from \"./a.ts\";\nimport { page } from \"../app/page.tsx\";\nexport const b = 2;\n");
            writeFileSync(join(part, "src/api/lone.ts"), "export const lone = \"no one imports me\";\n");
            writeFileSync(join(part, "src/app/page.tsx"), "import { a } from \"../api/a.ts\";\nconst text = `\nimport ghost from \"../api/ghost.ts\";\n`;\nexport const page = [a, text];\n");
            writeFileSync(join(part, "src/app/brand.ts"), "export const title = \"Shop admin\";\n");
            writeFileSync(join(part, "notes.md"), "see ../../../engine/bun for the engine\n");
            writeFileSync(join(part, "package.json"), "{\"scripts\":{\"deps\":\"cd ../../../engine/bun\"}}\n");

            const project = tool.define({ tasks: { check: [tool.layers({ layers: ["api", "app"], entries: ["app/page.tsx"] }), tool.nameless()] } });
            const played = await tool.play(project, ["check"], { root: part, out: () => undefined });

            expect(played.flagged.map(( one ) => `${one.rule} ${one.where} ${one.message}`)).toEqual([
                "layer api/b.ts:2 api reaches up into app: ../app/page.tsx",
                "cycle api/a.ts a cycle joins api/a.ts, api/b.ts, app/page.tsx",
                "orphan api/lone.ts no entry reaches this file",
                "orphan app/brand.ts no entry reaches this file",
                "reach notes.md:1 reaches into the tree: ../../../engine/",
                "named src/app/brand.ts:1 names the tree or a product: Shop",
            ]);

            const outside = await tool.play(tool.define({ tasks: { check: tool.nameless() } }), ["check"], { root: join(temp.path, "forest", "tutor"), out: () => undefined });

            expect(outside.failed).toBe(false);

        } finally {

            temp.remove();

        }

    });
    it("csp names the api and its socket, render fills a template safely, and catalogs keep only the chosen world data", async () => {

        expect(tool.csp("http://localhost:8100/api")).toBe("default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: http://localhost:8100; media-src 'self' blob: http://localhost:8100; connect-src 'self' http://localhost:8100 ws://localhost:8100; object-src 'none'; base-uri 'none'; form-action 'none'");
        expect(tool.csp("https://api.example.test:8443/v1", { "img-src": "'self' https://cdn.example.test" })).toContain("img-src 'self' https://cdn.example.test; media-src 'self' blob: https://api.example.test:8443; connect-src 'self' https://api.example.test:8443 wss://api.example.test:8443;");
        expect(["file:///x", "nope", "ws://x.test"].map(( api ) => reasonOf(() => tool.csp(api)))).toEqual(["tool.csp", "tool.csp", "tool.csp"]);
        expect(tool.render("<html lang=\"{{lang}}\"><title>{{ title }}</title><i>{{count}}</i></html>", { lang: "ar", title: "<b>\"x\" & 'y'</b>", count: 3 })).toBe("<html lang=\"ar\"><title>&lt;b&gt;&quot;x&quot; &amp; &#x27;y&#x27;&lt;/b&gt;</title><i>3</i></html>");
        expect(tool.render("{{ a.b.c }}|{{list}}|{{mixed}}|{{flag}}", { a: { b: { c: "deep" } }, list: ["x", 2, true], mixed: ["x", { y: 1 }], flag: false })).toBe("deep|x 2 true|[&quot;x&quot;,{&quot;y&quot;:1}]|false");
        expect([reasonOf(() => tool.render("{{missing}}", {})), reasonOf(() => tool.render("{{lazy}}", { lazy: () => "x" })), reasonOf(() => tool.render("{{a.z}}", { a: { b: 1 } }))]).toEqual(["tool.render", "tool.render", "tool.render"]);

        const temp = stage.tmp();

        try {

            temp.write("world/data/countries.json", "{\"eg\":\"Egypt\"}");
            temp.write("world/data/emojis.json", "{\"smile\":1}");
            temp.write("entry.ts", "import countries from \"./world/data/countries.json\";\nimport emojis from \"./world/data/emojis.json\";\nconsole.log(JSON.stringify([countries, emojis]));\n");

            const built = await Bun.build({ entrypoints: [temp.file("entry.ts")], plugins: [tool.catalogs(["countries"])] });
            const text = await built.outputs[0]?.text() ?? "";

            expect([text.includes("Egypt"), text.includes("unavailable"), text.includes("smile")]).toEqual([true, true, false]);

        } finally {

            temp.remove();

        }

    });
    it("main loads tool.config.ts, runs the leading task names with the rest as arguments, and says what went wrong", async () => {

        const temp = stage.tmp();
        const screen = quiet();

        restore = screen.restore;

        try {

            temp.write("tool.config.ts", `import * as tool from ${JSON.stringify(door)};\nexport default tool.define({ tasks: {\n    show: tool.emit("seen.json", ( _role, scope ) => scope.argv),\n    fail: tool.step("fail", ( scope ) => scope.flag("x", "bad")),\n    both: ["show", tool.env({ MODE: "plan" }, [tool.emit("planned.txt", "x"), () => undefined])],\n} });\n`);
            temp.write("other.ts", `import * as tool from ${JSON.stringify(door)};\nexport default tool.define({ tasks: { other: tool.emit("other.txt", "o") } });\n`);
            temp.write("plain.ts", "export default { tasks: {} };\n");
            temp.write("broken.ts", "export default (\n");

            expect(await tool.main(["show", "admin", "--", "--all"], temp.path)).toBe(0);
            expect(JSON.parse(readFileSync(temp.file("seen.json"), "utf8"))).toEqual(["admin", "--all"]);
            expect(await tool.main([], temp.path)).toBe(0);
            expect(await tool.main(["fail"], temp.path)).toBe(1);
            expect(await tool.main(["nothing"], temp.path)).toBe(1);
            expect(await tool.main(["other", "--config", "other.ts"], temp.path)).toBe(0);
            expect(existsSync(temp.file("other.txt"))).toBe(true);
            expect(await tool.main(["show", "--config", "plain.ts"], temp.path)).toBe(1);
            expect(await tool.main(["show", "--config", "broken.ts"], temp.path)).toBe(1);
            expect(await tool.main(["show", "--config", "absent.ts"], temp.path)).toBe(1);
            expect(await tool.main(["both", "--plan"], temp.path)).toBe(0);
            expect(existsSync(temp.file("planned.txt"))).toBe(false);
            expect(screen.lines).toContain("tasks: show, fail, both");
            expect(screen.lines.join("\n")).toContain("both\n  show\n    emit seen.json\n  env MODE=plan\n    emit planned.txt\n    step\n3 steps planned");
            expect(screen.lines).toContain("tool: no task named nothing");
            expect(screen.lines.some(( line ) => line.includes("exports no project"))).toBe(true);
            expect(screen.lines.some(( line ) => line.startsWith("✗ fail: 1 step, 0 files written, 1 issue"))).toBe(true);

        } finally {

            screen.restore();
            restore = undefined;
            temp.remove();

        }

    });

});
