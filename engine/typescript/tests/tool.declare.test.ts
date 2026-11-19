import { describe, expect, test as it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as spec from "engine/spec";
import * as stage from "engine/test";
import * as tool from "engine/tool";

function reasonOf ( make: () => unknown ): string {

    try {

        make();

        return "";

    } catch ( caught ) {

        return `${(caught as { reason?: string }).reason ?? ""} ${(caught as { message?: string }).message ?? ""}`.trim();

    }

}

describe("tool declare", () => {

    it("a project written as plain keys plays like one built by hand: named paths, named steps, each, target, option and env", async () => {

        const temp = stage.tmp();
        const part = spec.part({ platform: "web" });
        const shop = spec.surface({ config: { settings: { locale: "en", locales: ["en"] }, contracts: { baseUrl: spec.pick({ dev: "http://localhost:8100", release: "https://shop.example.test" }) } }, schema: [spec.screen("home", { path: "/", title: "Home" })] });

        try {

            temp.write("assets/a.txt", "a");
            temp.write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "#spec": ["./.cache/spec/current.ts"], "#release": ["./out/release/current.ts"] } } }));

            const project = tool.project({
                specs: spec.define({ shop }),
                part,
                paths: { out: "out", spec: ".cache/spec" },
                steps: {
                    notes: [{ emit: { to: "{out}/note.txt", content: "n" } }, { copy: { from: "assets/a.txt", to: "{out}/a.txt" } }, { copy: { from: "assets/none", to: "{out}/none", optional: true } }],
                    roles: { each: [{ step: "seen {role}", act: ( scope: tool.Scope<{ name: string }> ) => void scope.emit("{out}/{role}.txt", scope.role.name) }] },
                },
                tasks: {
                    build: ["notes", { specs: "#spec" }, "roles", { option: "loud", on: { run: "echo $WORD > out/loud.txt", env: { WORD: "loud" } }, off: { env: { WORD: "soft" }, steps: { run: "echo $WORD > out/soft.txt" } } }],
                    release: { target: { release: true }, steps: { specs: "#release" } },
                },
            });

            const played = await tool.play(project, ["build", "release"], { root: temp.path, out: () => undefined });

            expect([played.failed, played.flagged]).toEqual([false, []]);
            expect(["out/note.txt", "out/a.txt", "out/shop.txt", "out/soft.txt"].map(( path ) => readFileSync(temp.file(path), "utf8"))).toEqual(["n", "a", "shop", "soft\n"]);
            expect([existsSync(temp.file("out/none")), JSON.parse(readFileSync(temp.file("out/release/surface/shop.json"), "utf8")).address]).toEqual([false, "https://shop.example.test"]);
            expect(tool.plan(project, ["build"], ["--loud"]).lines.at(-1)).toBe("    run echo $WORD > out/loud.txt");
            expect([tool.isProject(project), Object.keys(project.steps), project.paths.out]).toEqual([true, ["notes", "roles"], "out"]);

        } finally {

            temp.remove();

        }

    });
    it("every key is fixed: an unknown key, a missing field or a wrong value is refused at its exact place with the nearest name", () => {

        const refused = [
            () => tool.project({ tasks: { build: { copi: { from: "a", to: "b" } } } } as never),
            () => tool.project({ tasks: { build: [{ run: "x", cwdd: "y" }] } } as never),
            () => tool.project({ tasks: { build: { copy: { from: "a" } } } } as never),
            () => tool.project({ tasks: { build: { copy: "a" } } } as never),
            () => tool.project({ tasks: { build: { specs: "" } } }),
            () => tool.project({ tasks: { build: { specs: ".cache/spec" } } }),
            () => tool.project({ tasks: { build: 7 } } as never),
            () => tool.project({ task: {} } as never),
            () => tool.project([] as never),
            () => tool.project({ tasks: [] } as never),
        ].map(reasonOf);

        expect(refused).toEqual([
            "tool.project tasks.build: no step kind among copi; did you mean copy?",
            "tool.project tasks.build[0].cwdd: run takes run, env, cwd; did you mean cwd?",
            "tool.project tasks.build.copy.to: missing",
            "tool.project tasks.build.copy: an object with from, to",
            "tool.project tasks.build.specs: a text",
            "tool.specs .cache/spec: name the compiled module by its tsconfig alias, such as #spec; .cache/spec.json, when mapped, receives the artifact as JSON",
            "tool.project tasks.build: a step is an object such as { run: \"tsc -p .\" }, a name, or a list of them",
            "tool.project task: a project holds specs, part, seeds, assets, paths, steps, tasks; did you mean tasks?",
            "tool.project project: a project is { specs, part, seeds, assets, paths, steps, tasks }",
            "tool.project tasks: an object of named steps",
        ]);
        expect(tool.project({ tasks: { ok: [{ theme: "a.css" }, { styles: { into: "a.css", imports: ["b.css"] } }, { spoken: "out" }, { budget: { js: "out/*.js" } }, { layers: { layers: ["a"] } }, { call: { module: "m", name: "n", to: "t.js" } }, { script: { from: "a.ts", to: "a.js" } }, { bundle: { from: "a.ts", to: "dist" } }, { page: { from: "a.html", to: "b.html" } }, { fonts: { into: "fonts" } }, { css: { from: "a.css", to: "b.css", processor: { process: async ( text ) => ({ css: text }) } } }] } }).tasks.ok).toHaveLength(11);

    });

});
