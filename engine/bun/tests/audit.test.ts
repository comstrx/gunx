import { describe, expect, test as it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Package = { name: string; private?: boolean | undefined; license?: unknown };

const root = resolve(import.meta.dir, "..");
const allowed = new Set(["0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BlueOak-1.0.0", "CC0-1.0", "ISC", "MIT", "MIT OR Apache-2.0", "Unlicense"]);
const grants: Readonly<Record<string, string>> = {};

function installed ( folder: string ): Package[] {

    if ( !existsSync(folder) ) return [];

    return readdirSync(folder, { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && !entry.name.startsWith(".")).flatMap(( entry ) => {

        const home = resolve(folder, entry.name);
        const manifest = resolve(home, "package.json");

        if ( entry.name.startsWith("@") ) return installed(home);
        if ( !existsSync(manifest) ) return [];

        return [JSON.parse(readFileSync(manifest, "utf8")) as Package, ...installed(resolve(home, "node_modules"))];

    });

}
function member ( found: Package ): boolean {

    return found.private === true && /^engine(-[a-z]+)?$/.test(found.name);

}
function licensed ( found: Package ): boolean {

    return (typeof found.license === "string" && allowed.has(found.license)) || grants[found.name] !== undefined;

}

describe("audit", () => {

    it("license: every installed library carries an allowed license or a named grant", () => {

        const libraries = installed(resolve(root, "node_modules")).filter(( found ) => !member(found));

        expect(libraries.length).toBeGreaterThan(0);
        expect(libraries.filter(( found ) => !licensed(found)).map(( found ) => `${found.name}: ${String(found.license)}`)).toEqual([]);

    });
    it("license: the bundled assets carry their license file", () => {

        expect(readFileSync(resolve(root, "src", "world", "asset", "LICENSE.txt"), "utf8").length).toBeGreaterThan(0);

    });

});
