import { describe, expect, test as it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import * as string from "engine/string";
import * as tool from "engine/tool";
import { rules } from "../tools/rules.ts";

const root = resolve(import.meta.dir, "..");

describe("architecture", () => {

    it("layers only reach down, engine members are known, no vendor outside its home", () => {

        const result = tool.analyze(rules(root));

        expect(result.files).toBeGreaterThan(10);
        expect(result.issues).toEqual([]);
        expect(result.cycles).toEqual([]);

    });
    it("nameless: no file that leaves with the surface names a product or its tree, and only the manifest reaches out of it", () => {

        const products = resolve(root, "..", "..");
        const names = basename(products) === "product" ? [basename(resolve(products, "..")), ...readdirSync(products, { withFileTypes: true }).filter(( entry ) => entry.isDirectory()).map(( entry ) => entry.name)] : [];
        const named = new RegExp(`\\b(?:${names.map(string.escapeRegExp).join("|")})\\b`, "i");
        const reaching = /\.\.\/(?:\.\.\/)*(?:engine|product|tutor)\//;
        const leaving = tool.walk(root, { ignore: ["out", "coverage", "tsconfig.tsbuildinfo"] }).map(( file ) => ({ name: file.relative, text: readFileSync(file.path, "utf8") })).filter(( file ) => !file.text.includes("\u0000"));

        expect(leaving.length).toBeGreaterThan(10);
        expect(names.length ? leaving.filter(( file ) => named.test(file.text)).map(( file ) => file.name) : []).toEqual([]);
        expect(leaving.filter(( file ) => file.name !== "package.json" && reaching.test(file.text)).map(( file ) => file.name)).toEqual([]);

    });

});
