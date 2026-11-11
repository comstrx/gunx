import { describe, expect, test as it } from "bun:test";
import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as error from "engine/error";
import * as stage from "engine/test";
import * as tool from "engine/tool";

const reasonOf = ( work: () => unknown ): string => { try { work(); return "ok"; } catch ( caught ) { return error.isFault(caught) ? caught.reason ?? "?" : "?"; } };

describe("tool.edges", () => {

    it("imports are read in every form with their lines, line-start comments are skipped, cycles ignore types and self imports, and an alias ends in a slash", () => {

        const temp = stage.tmp();
        const src = join(temp.path, "src");

        try {

            for ( const folder of ["api", "stores", "features", "app"] ) mkdirSync(join(src, folder), { recursive: true });

            writeFileSync(join(src, "api/a.ts"), [
                "import {", "    one,", "    two,", '} from "./b.ts";', 'import def, { named } from "./c.js";', 'import def2, * as ns from "./d";', 'import type { T } from "./e.ts";', 'export * from "./f.ts";', 'export type { U } from "./g.ts";', 'export { h } from "./h.ts";',
                'import "./side.ts";', 'const lazy = await import("./lazy.ts");', 'const old = require("./old.ts");', '// import fake from "./commented.ts";', "/*", 'import blocked from "./blocked.ts";', "*/", '   // const later = await import("node:os");', 'import x from "@scope/pkg";', 'import y from "engine/json/src/x";', 'import z from "engine";',
            ].join("\n"));

            for ( const name of ["b", "c", "d", "e", "f", "g", "h", "side", "lazy", "old"] ) writeFileSync(join(src, `api/${name}.ts`), name === "b" ? 'import { a } from "./a.ts";\nexport const one = 1;\n' : "export const v = 1;\n");

            writeFileSync(join(src, "stores/s.ts"), 'import { t } from "./t.ts";\n');
            writeFileSync(join(src, "stores/t.ts"), 'import { u } from "./u.ts";\n');
            writeFileSync(join(src, "stores/u.ts"), 'import { s } from "./s.ts";\nimport type { v } from "./v.ts";\n');
            writeFileSync(join(src, "stores/v.ts"), 'import type { u } from "./u.ts";\n');
            writeFileSync(join(src, "stores/self.ts"), 'import { self } from "./self.ts";\n');
            writeFileSync(join(src, "app/page.tsx"), 'import Link from "next/link";\nimport { z } from "zod";\n');
            writeFileSync(join(src, "features/f.tsx"), 'import Link from "next/link";\nimport { s } from "../stores/s.ts";\n');
            writeFileSync(join(src, "stores/up.ts"), 'import { f } from "@/features/f.tsx";\n');
            writeFileSync(join(src, "index.ts"), "export const root = 1;\n");
            writeFileSync(join(src, "types.d.ts"), 'import x from "nowhere";\n');

            const result = tool.analyze({ root: temp.path, layers: ["api", "stores", "features", "app"], members: ["json"], framework: ["next"] });

            expect(result.issues.map(( issue ) => `${issue.file}:${issue.line} ${issue.rule} ${issue.message}`)).toEqual([
                "api/a.ts:19 vendor a third-party import outside native/: @scope/pkg",
                "api/a.ts:20 member an import reaches inside an engine member: engine/json/src/x",
                "api/a.ts:21 member the whole engine is imported, name a member: engine",
                "features/f.tsx:1 vendor a third-party import outside native/: next/link",
                "index.ts:1 layer not in a layer: index.ts",
                "stores/up.ts:1 layer stores reaches up into features: @/features/f.tsx",
            ]);
            expect(result.edges["api/a.ts"]).toEqual(["@scope/pkg", "api/b.ts", "api/c.ts", "api/d.ts", "api/e.ts", "api/f.ts", "api/g.ts", "api/h.ts", "api/lazy.ts", "api/old.ts", "api/side.ts", "engine", "engine/json/src/x"]);
            expect([result.cycles, result.files]).toEqual([[["api/a.ts", "api/b.ts"], ["stores/s.ts", "stores/t.ts", "stores/u.ts"]], 20]);
            expect(tool.analyze({ root: temp.path, layers: ["api", "stores", "features", "app"], shared: ["@scope/pkg", "next", "zod"] }).issues.filter(( issue ) => issue.rule === "vendor")).toEqual([]);
            expect(tool.analyze({ root: temp.path, layers: ["api", "stores", "features", "app"], shared: ["@scope/pkg", "next"] }).issues.filter(( issue ) => issue.rule === "vendor").map(( issue ) => `${issue.file}:${issue.line}`)).toEqual(["app/page.tsx:2"]);
            expect(tool.analyze({ root: temp.path, layers: ["api", "stores", "features", "app"], members: ["json"] }).issues.filter(( issue ) => issue.file === "app/page.tsx").map(( issue ) => issue.message)).toEqual(["a third-party import outside native/: next/link"]);
            expect([() => tool.defineRules({ root: temp.path, layers: ["a"], alias: "@" }), () => tool.defineRules({ root: temp.path, layers: ["a"], alias: "/" }), () => tool.defineRules({ root: temp.path, layers: ["a"], alias: "" }), () => tool.defineRules({ root: "", layers: ["a"] }), () => tool.defineRules({ root: temp.path, layers: [] }), () => tool.defineRules({ root: temp.path, layers: ["a"], alias: "~/" })].map(reasonOf)).toEqual(["tool.rules", "tool.rules", "tool.rules", "tool.rules", "tool.rules", "ok"]);

        } finally {

            temp.remove();

        }

    });
    it("a vendor folder inside a layer may import anything, an outside folder is matched whole, and a type-only re-export closes no cycle", () => {

        const temp = stage.tmp();
        const src = join(temp.path, "src");

        try {

            for ( const folder of ["components/native", "stores"] ) mkdirSync(join(src, folder), { recursive: true });

            mkdirSync(join(temp.path, "shared-other"), { recursive: true });
            writeFileSync(join(src, "components/native/map.ts"), 'import mapbox from "mapbox-gl";\n');
            writeFileSync(join(src, "components/card.ts"), 'import mapbox from "mapbox-gl";\nimport { a } from "../../shared/a.ts";\nimport { b } from "../../shared-other/b.ts";\n');
            writeFileSync(join(src, "stores/p.ts"), 'export type { Q } from "./q.ts";\n');
            writeFileSync(join(src, "stores/q.ts"), 'import { p } from "./p.ts";\nexport type Q = 1;\n');

            const result = tool.analyze({ root: temp.path, layers: ["stores", "components"], vendor: ["components/native"], outside: ["shared"] });

            expect(result.issues.map(( issue ) => `${issue.file}:${issue.line} ${issue.rule}`)).toEqual(["components/card.ts:1 vendor", "components/card.ts:3 outside"]);
            expect(result.cycles).toEqual([]);

        } finally {

            temp.remove();

        }

    });
    it("walk stops at 64 levels, skips symlinked folders, ignores names and slash or dot framed paths; json helpers strip a BOM, refuse junk and write only exact json, and only on change", () => {

        const temp = stage.tmp();

        try {

            let deep = join(temp.path, "deep");

            for ( let level = 0; level < 70; level += 1 ) deep = join(deep, "d");

            mkdirSync(deep, { recursive: true });
            writeFileSync(join(deep, "x.ts"), "");
            expect(reasonOf(() => tool.walk(join(temp.path, "deep")))).toBe("tool.depth");
            mkdirSync(join(temp.path, "loop/inner"), { recursive: true });
            symlinkSync(join(temp.path, "loop"), join(temp.path, "loop", "self"));
            writeFileSync(join(temp.path, "loop", "f.txt"), "x");
            writeFileSync(join(temp.path, "loop", "inner", "g.ts"), "y");
            symlinkSync(join(temp.path, "loop", "f.txt"), join(temp.path, "loop", "link.txt"));
            expect(tool.walk(join(temp.path, "loop")).map(( file ) => `${file.relative}:${file.size}`)).toEqual(["f.txt:1", "inner/g.ts:1", "link.txt:1"]);
            expect([tool.walk(join(temp.path, "loop"), { ignore: ["/inner/"] }).length, tool.walk(join(temp.path, "loop"), { ignore: ["./inner"] }).length, tool.walk(join(temp.path, "loop"), { ignore: ["inner/g.ts"] }).length, tool.walk(join(temp.path, "loop"), { ignore: ["", "/"] }).length, tool.walk(join(temp.path, "loop"), { extensions: [".ts"] }).length]).toEqual([2, 2, 2, 3, 1]);
            writeFileSync(join(temp.path, "bom.json"), "﻿{\"a\":1}");
            writeFileSync(join(temp.path, "bad.json"), "{nope");
            expect([tool.readJson(join(temp.path, "bom.json")), reasonOf(() => tool.readJson(join(temp.path, "bad.json"))), reasonOf(() => tool.readJson(temp.path)), tool.readJson(join(temp.path, "missing/x.json"))]).toEqual([{ a: 1 }, "tool.json", "tool.json", undefined]);

            const out = join(temp.path, "out/o.json");
            const loop: Record<string, unknown> = {};

            loop.self = loop;
            expect([tool.writeJson(out, { a: 1 }), tool.writeJson(out, { a: 1 }), tool.writeJson(out, { a: 2 }), readdirSync(dirname(out)), tool.readJson(out)]).toEqual([true, false, true, ["o.json"], { a: 2 }]);
            expect([() => tool.writeJson(out, undefined), () => tool.writeJson(out, loop), () => tool.writeJson(out, { n: 10n }), () => tool.writeJson(out, () => 1)].map(reasonOf)).toEqual(["tool.json", "tool.json", "tool.json", "tool.json"]);
            expect(tool.readJson(out)).toEqual({ a: 2 });

        } finally {

            temp.remove();

        }

    });
    it("the node disk refuses an empty path, the working folder and every folder holding it, and keeps temp folders inside the system temp", async () => {

        const temp = stage.tmp();
        const home = process.cwd();
        const disk = tool.nodeDisk();
        const inner = join(temp.path, "a", "b");

        mkdirSync(inner, { recursive: true });
        mkdirSync(join(temp.path, "other"), { recursive: true });

        try {

            process.chdir(inner);

            const refused = async ( path: string ): Promise<string> => disk.remove(path, true).then(() => "ok", ( caught: unknown ) => (error.isFault(caught) ? `${caught.code}/${caught.reason}` : "?"));

            expect([await refused(""), await refused("."), await refused(inner), await refused(join(temp.path, "a")), await refused(".."), await refused("x\u0000y")]).toEqual(["validation/fs.path", "forbidden/fs.root", "forbidden/fs.root", "forbidden/fs.root", "forbidden/fs.root", "validation/fs.path"]);
            expect(await refused(join(temp.path, "other"))).toBe("ok");
            expect(readdirSync(temp.path)).toEqual(["a"]);

        } finally {

            process.chdir(home);

        }

        const made = await disk.temp("../x y");

        try {

            expect([dirname(made), made.slice(dirname(made).length + 1).startsWith("..xy")]).toEqual([tmpdir(), true]);

        } finally {

            await disk.remove(made, true);
            temp.remove();

        }

        const listed = stage.tmp();

        try {

            for ( const file of ["c.txt", "a.txt", "b.txt"] ) writeFileSync(join(listed.path, file), file);

            expect((await disk.list(listed.path)).map(( entry ) => `${entry.name}:${entry.kind}`)).toEqual(["a.txt:file", "b.txt:file", "c.txt:file"]);

        } finally {

            listed.remove();

        }

    });
    it("digests clamp their length and agree on bytes and text; diffs ignore junk entries, sort growth by size then name and describe both directions", () => {

        expect([tool.digestOf("x", 0).length, tool.digestOf("x", 100).length, tool.digestOf("x", Number.NaN).length, tool.digestOf("x", 1.5).length, tool.digestOf(new Uint8Array([120])) === tool.digestOf("x"), tool.digestOf("x", 8) === tool.digestOf("x").slice(0, 8)]).toEqual([1, 64, 16, 16, true, true]);
        expect(tool.apiDiff({ a: "x" as never, b: [1 as never, "y"] }, { b: ["y", "z"] })).toEqual({ kind: "minor", added: ["b.z"], removed: [] });
        expect(tool.sizeDiff({ a: 100, b: 50, c: 10, d: 5, e: 20, f: 30 }, { a: 90, b: 70, c: 10, d: null, e: 30, f: 20, g: 3 })).toEqual([{ member: "b", before: 50, after: 70, delta: 20 }, { member: "a", before: 100, after: 90, delta: -10 }, { member: "e", before: 20, after: 30, delta: 10 }, { member: "f", before: 30, after: 20, delta: -10 }]);
        expect(tool.describeChange({ kind: "minor", added: ["a.x"], removed: [] }, [{ member: "b", before: 1, after: 3, delta: 2 }])).toBe("api: minor\n+ a.x\n↑ b 1 → 3 (+2)");
        expect(tool.describeChange({ kind: "none", added: [], removed: [] }, [])).toBe("api: none");
        expect(tool.sizeDiff({ f: 30, a: 100 }, { f: 20, a: 90 }).map(( growth ) => growth.member)).toEqual(["a", "f"]);

        const members = tool.members();

        expect([members.some(( member ) => member.name === "engine"), (members.find(( member ) => member.name === "tool")?.description ?? "").length > 0]).toEqual([false, true]);

    });

});
