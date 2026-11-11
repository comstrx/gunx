import { describe, expect, test as it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import recorded from "./api.json" with { type: "json" };

type Manifest = { name: string; description: string; exports: Record<string, string>; dependencies?: Record<string, string> | undefined };

const root = resolve(import.meta.dir, "..");
const source = resolve(root, "src");
const members = readdirSync(source, { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && entry.name !== "engine").map(( entry ) => entry.name).sort();
const workspace = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { catalog: Record<string, string> };
const facade = JSON.parse(readFileSync(resolve(source, "engine", "package.json"), "utf8")) as Manifest;
const reach = /from\s+"engine-([a-z]+)"|import\(\s*"engine-([a-z]+)"\s*\)/g;
const exported = /^export \* as ([a-z]+) from "engine-([a-z]+)";$/;
const library = /(?:from|import)\s*\(?\s*"((?!engine-|\.|node:|bun)[^"]+)"/g;
const terminal = new Set(["api", "spec", "tool"]);
const hosted = new Set(["adapter", "test", "tool"]);
const hostNames = ["globalThis", "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "fetch", "WebSocket", "Notification", "matchMedia", "ResizeObserver", "HermesInternal", "importScripts", "WorkerGlobalScope", "process", "Bun", "Deno", "crypto"];
const hostRead = new RegExp(`(?<![.\\w$])(?:${hostNames.join("|")})\\b(?!\\s*\\??:)`, "g");
const namespaces = /import \* as ([A-Za-z_]+) from "engine-[a-z]+"/g;
const constructors = /^(?:make|build|new|init|setup|construct)[A-Z]|^use[A-Z]/;
const surface = recorded as Record<string, string[]>;

function manifest ( member: string ): Manifest {

    return JSON.parse(readFileSync(resolve(source, member, "package.json"), "utf8")) as Manifest;

}
function sources ( member: string ): [string, string][] {

    const folder = resolve(source, member, "src");

    return readdirSync(folder).filter(( name ) => /\.tsx?$/.test(name)).map(( name ) => [name, readFileSync(resolve(folder, name), "utf8")]);

}
function files ( member: string ): string[] {

    return sources(member).map(([, code]) => code);

}
function masked ( code: string ): string {

    return code.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/(?:\\.|[^/\\\n])+\/[gimsuy]*/g, '""');

}
function travelling ( folder: string ): string[] {

    return readdirSync(folder, { withFileTypes: true }).flatMap(( entry ) => {

        if ( entry.isDirectory() ) return ["node_modules", "coverage", ".bun"].includes(entry.name) ? [] : travelling(resolve(folder, entry.name));

        return entry.isFile() ? [resolve(folder, entry.name)] : [];

    });

}
function escaped ( text: string ): string {

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}
function packageOf ( specifier: string ): string {

    const parts = specifier.split("/");

    return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? specifier;

}
function used ( member: string ): Set<string> {

    return new Set(files(member).flatMap(( code ) => [...code.matchAll(reach)].map(( found ) => found[1] ?? found[2] ?? "")).filter(( name ) => name !== member));

}
function cycle ( edges: Map<string, Set<string>> ): string[] {

    const state = new Map<string, number>();
    const trail: string[] = [];
    const visit = ( node: string ): string[] => {

        if ( state.get(node) === 1 ) return [...trail.slice(trail.indexOf(node)), node];
        if ( state.get(node) === 2 ) return [];

        state.set(node, 1);
        trail.push(node);

        for ( const next of [...(edges.get(node) ?? [])].sort() ) {

            const found = visit(next);

            if ( found.length ) return found;

        }

        trail.pop();
        state.set(node, 2);

        return [];

    };

    for ( const node of [...edges.keys()].sort() ) {

        const found = visit(node);

        if ( found.length ) return found;

    }

    return [];

}

describe("laws", () => {

    it("workspace: every member is a private package declared once in the facade with a short description", () => {

        const declared = Object.keys(facade.dependencies ?? {}).map(( name ) => name.replace(/^engine-/, "")).sort();
        const doors = Object.keys(facade.exports).filter(( key ) => key.startsWith("./") && key !== "./package.json").map(( key ) => key.slice(2)).sort();

        expect(declared).toEqual(members);
        expect(doors).toEqual(members);

        for ( const member of members ) {

            const found = manifest(member);

            expect(found.name).toBe(`engine-${member}`);
            expect(found.exports["."]).toBe("./src/index.ts");
            expect(found.description.length).toBeLessThanOrEqual(80);

            const entries = Object.entries(found.dependencies ?? {});
            const siblings = entries.filter(([name]) => name.startsWith("engine-"));
            const libraries = entries.filter(([name]) => !name.startsWith("engine-"));

            expect(siblings.map(([, version]) => version)).toEqual(siblings.map(() => "workspace:*"));
            expect(libraries.map(([, version]) => version)).toEqual(libraries.map(() => "catalog:"));
            expect(libraries.filter(([name]) => workspace.catalog[name] === undefined)).toEqual([]);

        }

    });
    it("shape: members form a DAG and declare every sibling they import", () => {

        const edges = new Map<string, Set<string>>();

        for ( const member of members ) {

            const reached = used(member);
            const declared = new Set(Object.keys(manifest(member).dependencies ?? {}).filter(( name ) => name.startsWith("engine-")).map(( name ) => name.slice(7)));

            expect([...reached].filter(( name ) => !declared.has(name)), `${member} imports an undeclared member`).toEqual([]);
            expect([...declared].filter(( name ) => !reached.has(name)), `${member} declares an unused member`).toEqual([]);

            edges.set(member, reached);

        }

        expect(cycle(edges)).toEqual([]);

    });
    it("facade: one namespace per member, one door file each", () => {

        const lines = readFileSync(resolve(source, "engine", "src", "index.ts"), "utf8").trimEnd().split("\n");

        expect(lines.map(( line ) => exported.exec(line)?.[1])).toEqual(members);

        for ( const member of members ) expect(readFileSync(resolve(source, "engine", "src", `${member}.ts`), "utf8")).toBe(`export * from "engine-${member}";\n`);

    });
    it("door: a library enters through one file of one member", () => {

        const homes = new Map<string, Set<string>>();

        for ( const member of members ) {

            for ( const [name, code] of sources(member) ) {

                for ( const found of code.matchAll(library) ) {

                    const head = packageOf(found[1] ?? "");

                    homes.set(head, new Set([...(homes.get(head) ?? []), `${member}/${name}`]));

                }

            }

        }

        expect(homes.size).toBeGreaterThan(0);
        expect([...homes].filter(([, found]) => found.size > 1).map(([head, found]) => `${head}: ${[...found].join(" ")}`)).toEqual([]);

    });
    it("terminal: nothing imports api, spec or tool, and they never import each other", () => {

        for ( const member of members ) {

            expect([...used(member)].filter(( name ) => terminal.has(name)), `${member} imports a terminal member`).toEqual([]);

        }

    });
    it("host-free: no member but adapter reads the host; a port's file asks adapter.web for its fallback", () => {

        const offenders: string[] = [];

        for ( const member of members ) {

            if ( hosted.has(member) ) continue;

            for ( const [name, code] of sources(member) ) {

                const imported = new Set([...code.matchAll(namespaces)].map(( hit ) => hit[1]));
                const found = [...new Set([...masked(code).matchAll(hostRead)].map(( hit ) => hit[0]))].filter(( name ) => !imported.has(name));

                if ( found.length ) offenders.push(`${member}/${name}: ${found.join(" ")}`);

            }

        }

        expect(offenders).toEqual([]);

    });
    it("verbs: create, define and open construct; use binds a port; no maker, builder or hook names; no host names; a nested name answers by its last word", () => {

        const offenders: string[] = [];

        for ( const [member, names] of Object.entries(surface) ) {

            for ( const path of names ) {

                const name = path.slice(path.lastIndexOf(".") + 1);

                if ( constructors.test(name) ) offenders.push(`${member}.${path}`);
                if ( name === "use" && member !== "cache" ) offenders.push(`${member}.${path}`);
                if ( hostNames.includes(name) ) offenders.push(`${member}.${path}`);

            }

        }

        expect(offenders).toEqual([]);

    });
    it("proof: every recorded export is named by a test, a nested one by its dotted name", () => {

        const proofs = readdirSync(resolve(root, "tests")).filter(( name ) => name.endsWith(".test.ts")).map(( name ) => readFileSync(resolve(root, "tests", name), "utf8")).join("\n");
        const unnamed: string[] = [];

        for ( const [member, names] of Object.entries(surface) ) {

            for ( const name of names ) if ( !new RegExp(`\\b${escaped(name)}\\b`).test(proofs) ) unnamed.push(`${member}.${name}`);

        }

        expect(unnamed).toEqual([]);

    });
    it("purity: no comments, console, eval or default exports in a member", () => {

        for ( const member of members ) {

            for ( const code of files(member) ) {

                const clean = masked(code);

                expect(clean.includes("//"), `${member}: a line comment`).toBe(false);
                expect(clean.includes("/*"), `${member}: a block comment`).toBe(false);
                expect(/\bconsole\./.test(clean) && member !== "log", `${member}: console`).toBe(false);
                expect(/\beval\(/.test(clean), `${member}: eval`).toBe(false);
                expect(/export default/.test(clean), `${member}: a default export`).toBe(false);

            }

        }

    });
    it("nameless: no file that leaves with the engine names a product or the tree it grew in", () => {

        const home = resolve(root, "..", "..");
        const products = resolve(home, "product");
        const names = existsSync(products) ? [basename(home), ...readdirSync(products, { withFileTypes: true }).filter(( entry ) => entry.isDirectory()).map(( entry ) => entry.name)] : [];
        const named = new RegExp(`\\b(?:${names.map(escaped).join("|")})\\b`, "i");
        const naming = names.length ? travelling(root).filter(( file ) => { const text = readFileSync(file, "utf8"); return !text.includes("\u0000") && named.test(text); }) : [];

        expect(naming.map(( file ) => file.slice(root.length + 1))).toEqual([]);

    });

});
