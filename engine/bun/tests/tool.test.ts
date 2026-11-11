import { describe, expect, test as it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as fs from "engine/fs";
import * as stage from "engine/test";
import * as tool from "engine/tool";

describe("tool", () => {

    it("walks, hashes, json and engine members", () => {

        const temp = stage.tmp();

        mkdirSync(join(temp.path, "a/node_modules/x"), { recursive: true });
        mkdirSync(join(temp.path, "b"), { recursive: true });
        writeFileSync(join(temp.path, "a/one.ts"), "export const one = 1;\n");
        writeFileSync(join(temp.path, "a/node_modules/x/skip.ts"), "skip");
        writeFileSync(join(temp.path, "b/two.tsx"), "export const two = 2;\n");
        writeFileSync(join(temp.path, "b/notes.md"), "# hi\n");

        const all = tool.walk(temp.path);

        expect(all.map(( file ) => file.relative)).toEqual(["a/one.ts", "b/notes.md", "b/two.tsx"]);
        expect(tool.walk(temp.path, { extensions: [".ts", ".tsx"] })).toHaveLength(2);
        expect(tool.walk(temp.path, { ignore: ["b"] })).toHaveLength(1);
        expect(tool.walk(join(temp.path, "missing"))).toEqual([]);
        expect(tool.sizeOf(temp.path, [".md"])).toBe(5);
        expect(tool.hashOf(join(temp.path, "a/one.ts"))).toHaveLength(16);
        expect(tool.hashOf(join(temp.path, "a/one.ts"), 8)).toBe(tool.hashOf(join(temp.path, "a/one.ts")).slice(0, 8));
        tool.writeJson(join(temp.path, "deep/out.json"), { b: 1, a: [1] });
        expect(tool.readJson(join(temp.path, "deep/out.json"))).toEqual({ b: 1, a: [1] });
        expect(tool.readJson(join(temp.path, "nope.json"))).toBeUndefined();

        const members = tool.members(resolve(import.meta.dir, ".."));

        expect(members.map(( member ) => member.name)).toContain("tool");
        expect(members.find(( member ) => member.name === "json")?.dependencies).toEqual(["engine-list", "engine-number", "engine-string"]);
        expect(tool.members(temp.path)).toEqual([]);
        expect(tool.members()).toEqual(members);
        expect(tool.assets()).toBe(tool.assets(resolve(import.meta.dir, "..")));
        temp.remove();

    });
    it("the analyzer keeps layers downward, vendors contained and engine members known", () => {

        const temp = stage.tmp();
        const src = join(temp.path, "src");

        for ( const folder of ["api", "stores", "components", "features", "native"] ) mkdirSync(join(src, folder), { recursive: true });

        writeFileSync(join(src, "api/index.ts"), 'import * as api from "engine/api";\nimport { x } from "../stores/cart.ts";\nexport const a = 1;\n');
        writeFileSync(join(src, "stores/cart.ts"), 'import * as store from "engine/store";\nimport * as nope from "engine/nope";\nimport { a } from "@/api/index.ts";\nexport const x = 1;\n');
        writeFileSync(join(src, "components/button.tsx"), 'import { x } from "@/stores/cart.ts";\nimport motion from "framer-motion";\nimport { readFileSync } from "node:fs";\nexport const b = 2;\n');
        writeFileSync(join(src, "features/hello.tsx"), 'import { b } from "../components/button.tsx";\nimport { useState } from "react";\nimport { out } from "../../outside.ts";\nexport const c = 3;\n');
        writeFileSync(join(src, "native/maps.ts"), 'import mapbox from "mapbox-gl";\nexport const m = mapbox;\n');

        const result = tool.analyze({ root: temp.path, layers: ["api", "stores", "components", "features"], members: ["api", "store"] });

        expect(result.files).toBe(5);
        expect(result.issues.map(( issue ) => `${issue.file}:${issue.line} ${issue.message}`)).toEqual([
            "api/index.ts:2 api reaches up into stores: ../stores/cart.ts",
            "components/button.tsx:2 a third-party import outside native/: framer-motion",
            "components/button.tsx:3 a runtime import in a surface: node:fs",
            "features/hello.tsx:3 an import leaves src: ../../outside.ts",
            "stores/cart.ts:2 unknown engine member: nope",
        ]);
        expect(result.edges["features/hello.tsx"]).toEqual(["components/button.tsx", "outside.ts", "react"]);
        expect(tool.defineRules({ root: "/x", layers: ["a"] })).toMatchObject({ root: "/x", source: "src", alias: "@/", layers: ["a"], vendor: ["native"], engine: "engine", members: [], frameworkLayers: ["app"], outside: [] });
        expect(tool.analyze({ root: temp.path, layers: ["api", "features"], framework: ["next"], frameworkLayers: ["features"], outside: ["outside.ts"] }).issues.map(( issue ) => issue.message)).not.toContain("an import leaves src: ../../outside.ts");
        temp.remove();

    });
    it("the node disk serves the fs port", async () => {

        const temp = stage.tmp();
        const restore = tool.bindDisk();

        try {

            await fs.write(join(temp.path, "deep/a.txt"), "hello");
            await fs.append(join(temp.path, "deep/a.txt"), "!");
            expect(await fs.text(join(temp.path, "deep/a.txt"))).toBe("hello!");
            expect((await fs.stat(join(temp.path, "deep/a.txt")))?.kind).toBe("file");
            expect((await fs.stat(join(temp.path, "deep")))?.kind).toBe("dir");
            expect(await fs.stat(join(temp.path, "nope"))).toBeUndefined();
            await fs.copy(join(temp.path, "deep/a.txt"), join(temp.path, "b/c.txt"));
            await fs.move(join(temp.path, "b/c.txt"), join(temp.path, "b/d.txt"));
            expect((await fs.entries(join(temp.path, "b"))).map(( entry ) => entry.name)).toEqual(["d.txt"]);
            expect((await fs.find(temp.path, "**/*.txt")).map(( entry ) => entry.relative)).toEqual(["b/d.txt", "deep/a.txt"]);
            expect((await fs.temp("engine-")).length).toBeGreaterThan(0);
            await fs.remove(join(temp.path, "deep"));
            expect(await fs.exists(join(temp.path, "deep/a.txt"))).toBe(false);

        } finally {

            restore();
            temp.remove();

        }

        expect(fs.disk.bound()).toBe(false);

    });
    it("the node disk reads what it writes", async () => {

        const temp = stage.tmp();
        const disk = tool.nodeDisk();

        await disk.write(temp.file("a.txt"), "hello");
        expect(new TextDecoder().decode(await disk.read(temp.file("a.txt")))).toBe("hello");
        expect(await disk.stat(temp.file("nope.txt"))).toBeUndefined();
        expect((await disk.list(temp.path)).map(( entry ) => entry.name)).toEqual(["a.txt"]);
        temp.remove();

    });
    it("an api record diff is minor on additions, major on removals, and the growth report names bytes", () => {

        const before = { a: ["x", "y"], b: ["z"] };

        expect(tool.apiDiff(before, { a: ["x", "y"], b: ["z"] })).toEqual({ kind: "none", added: [], removed: [] });
        expect(tool.apiDiff(before, { a: ["x", "y", "w"], b: ["z"], c: ["q"] })).toEqual({ kind: "minor", added: ["a.w", "c.q"], removed: [] });
        expect(tool.apiDiff(before, { a: ["x"], b: ["z", "k"] })).toEqual({ kind: "major", added: ["b.k"], removed: ["a.y"] });
        expect(tool.sizeDiff({ a: 100, b: 50, c: null }, { a: 120, b: 50, c: 10 })).toEqual([{ member: "a", before: 100, after: 120, delta: 20 }]);
        expect(tool.describeChange({ kind: "major", added: ["b.k"], removed: ["a.y"] }, [{ member: "a", before: 100, after: 90, delta: -10 }])).toBe("api: major\n- a.y\n+ b.k\n↓ a 100 → 90 (-10)");

    });
});
