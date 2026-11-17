import { describe, expect, test as it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { types } from "node:util";
import { type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";

type Manifest = { name: string; description: string; private: boolean; type: string; sideEffects: boolean; exports: Record<string, string>; dependencies?: Record<string, string> | undefined };

const root = resolve(import.meta.dir, "..");
const source = resolve(root, "src");
const members = readdirSync(source, { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && entry.name !== "engine").map(( entry ) => entry.name).sort();
const workspace = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { catalog: Record<string, string> };
const facade = JSON.parse(readFileSync(resolve(source, "engine", "package.json"), "utf8")) as Manifest;
const reach = /from\s+"engine-([a-z]+)"|import\(\s*"engine-([a-z]+)"\s*\)/g;
const exported = /^export \* as ([a-z]+) from "engine-([a-z]+)";$/;
const library = /(?:from|import)\s*\(?\s*"((?!engine-|\.|node:|bun)[^"]+)"/g;
const terminal = new Set(["api", "spec", "tool"]);
const leaning: Readonly<Record<string, readonly string[]>> = { spec: ["api"], tool: ["spec"] };
const hosted = new Set(["device", "test", "tool"]);
const hostNames = ["globalThis", "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "fetch", "WebSocket", "Notification", "matchMedia", "ResizeObserver", "HermesInternal", "importScripts", "WorkerGlobalScope", "process", "Bun", "Deno", "crypto"];
const hostRead = new RegExp(`(?<![.\\w$])(?:${hostNames.join("|")})\\b(?!\\s*\\??:)`, "g");
const namespaces = /import \* as ([A-Za-z_]+) from "engine-[a-z]+"/g;
const ladder: readonly (readonly string[])[] = [
    ["date", "error", "exception", "json", "list", "number", "string", "value", "virtual"],
    ["event", "func", "log", "parse", "search", "seo", "translate", "validate"],
    ["crypto", "device", "geo", "history", "rand"],
    ["cache", "fs", "media", "net", "socket"],
    ["auth", "form", "queue", "state", "world"],
    ["api", "fake", "test"],
    ["spec"],
    ["tool"],
];
const rung = new Map(ladder.flatMap(( names, index ) => names.map(( name ) => [name, index] as const)));
const arrowVerb = /^export const [A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>/m;
const definitions = new Set([SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.EnumDeclaration]);
const declarations = new Set([SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.EnumDeclaration, SyntaxKind.VariableStatement]);
const executions = new Set([SyntaxKind.CallExpression, SyntaxKind.NewExpression, SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression, SyntaxKind.FunctionDeclaration, SyntaxKind.ClassDeclaration, SyntaxKind.ClassExpression, SyntaxKind.MethodDeclaration, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor, SyntaxKind.TaggedTemplateExpression, SyntaxKind.AwaitExpression]);

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
function guarded ( code: string ): string[] {

    const out: string[] = [];

    for ( const hit of code.matchAll(/\btry\s*\{/g) ) {

        const start = (hit.index ?? 0) + hit[0].length - 1;
        let depth = 0;
        let at = start;

        for ( ; at < code.length; at += 1 ) {

            if ( code[at] === "{" ) depth += 1;
            else if ( code[at] === "}" ) depth -= 1;

            if ( depth === 0 ) break;

        }

        if ( /^\s*catch\b/.test(code.slice(at + 1)) ) out.push(code.slice(start, at + 1));

    }

    return out;

}
function masked ( code: string ): string {

    return code.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/(?:\\.|[^/\\\n])+\/[gimsuy]*/g, '""');

}
function travelling ( folder: string ): string[] {

    return readdirSync(folder, { withFileTypes: true }).flatMap(( entry ) => {

        if ( entry.isDirectory() ) return ["node_modules", ".bun"].includes(entry.name) ? [] : travelling(resolve(folder, entry.name));

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
function names ( loaded: Record<string, unknown>, prefix = "" ): string[] {

    return Object.entries(loaded).flatMap(([name, found]) => (types.isModuleNamespaceObject(found) ? names(found as Record<string, unknown>, `${prefix}${name}.`) : [`${prefix}${name}`])).sort();

}
function surface (): Promise<[string, string[]][]> {

    return Promise.all(members.map(async ( member ): Promise<[string, string[]]> => [member, names(await import(`engine/${member}`) as Record<string, unknown>)]));

}
function inspect ( file: SourceFile, name: string ): string[] {

    const found = new Set<string>();
    let classes = 0;
    const visit = ( node: Node ): void => {

        if ( definitions.has(node.kind) && name !== "arch.ts" ) found.add("definitions outside arch");
        if ( name === "arch.ts" && executions.has(node.kind) ) found.add("implementation inside arch");
        if ( node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression ) classes += 1;

        node.forEachChild(visit);

    };

    visit(file);

    if ( name === "arch.ts" && file.statements.some(( node ) => !declarations.has(node.kind)) ) found.add("implementation inside arch");
    if ( name === "index.ts" && file.statements.some(( node ) => node.kind !== SyntaxKind.ExportDeclaration) ) found.add("implementation inside index");
    if ( classes > 1 ) found.add("more than one implementation class");

    return [...found].sort();

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
            expect(Object.keys(found).sort()).toEqual(["dependencies", "description", "exports", "name", "private", "sideEffects", "type"]);
            expect([found.private, found.type, found.sideEffects]).toEqual([true, "module", false]);
            expect(["index.ts", "arch.ts"].filter(( file ) => !existsSync(resolve(source, member, "src", file))), `${member} lacks its door or its arch`).toEqual([]);

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
    it("ladder: every member stands on one rung and leans only on members at or below it", () => {

        const climbs: string[] = [];

        expect(ladder.flat().toSorted()).toEqual(members);

        for ( const member of members ) {

            const own = rung.get(member) ?? 0;

            for ( const other of used(member) ) if ( (rung.get(other) ?? 0) > own ) climbs.push(`${member} (${own}) -> ${other} (${rung.get(other)})`);

        }

        expect(climbs).toEqual([]);

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
    it("terminal: tool leans on spec and spec on api, one way; nothing else imports api, spec or tool", () => {

        for ( const member of members ) {

            expect([...used(member)].filter(( name ) => terminal.has(name) && !(leaning[member] ?? []).includes(name)), `${member} imports a terminal member`).toEqual([]);

        }

    });
    it("host-free: no member but device reads the host; every other member asks device.host for its slice", () => {

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
    it("unified: every failure is thrown, caught and told through exception; only a generator keeps a catch around its yields", () => {

        const offenders: string[] = [];

        for ( const member of members ) {

            if ( member === "exception" ) continue;

            for ( const [name, code] of sources(member) ) {

                const bare = masked(code);
                const found = [
                    ...(/\.catch\s*\(/.test(bare) ? ["a promise is caught by hand"] : []),
                    ...(/\bnew\s+(?:[A-Z]\w*)?Error\s*\(/.test(bare) ? ["a native error is made"] : []),
                    ...(/\binstanceof\s+(?:[A-Z]\w*)?Error\b/.test(bare) ? ["a native error is tested"] : []),
                    ...(guarded(bare).some(( block ) => !/\byield\b/.test(block)) ? ["a failure is caught by hand"] : []),
                ];

                if ( found.length ) offenders.push(`${member}/${name}: ${found.join(", ")}`);

            }

        }

        expect(offenders).toEqual([]);

    });
    it("arch: definitions live in arch.ts, index.ts only exports, and a file holds at most one implementation class", async () => {

        const failures: string[] = [];
        const api = new API({ cwd: root });

        try {

            const snapshot = await api.updateSnapshot({ openProjects: [resolve(root, "tsconfig.json")] });

            try {

                const project = snapshot.getProjects()[0];

                expect(project).toBeDefined();

                for ( const member of members ) {

                    for ( const [name] of sources(member) ) {

                        const file = await project?.program.getSourceFile(resolve(source, member, "src", name));

                        failures.push(...(file ? inspect(file, name) : ["unread"]).map(( issue ) => `${member}/${name}: ${issue}`));

                    }

                }

            } finally {

                await snapshot.dispose();

            }

        } finally {

            await api.close();

        }

        expect(failures).toEqual([]);

    }, 15000);
    it("proof: every member owns unit, fuzz and bench files, and every export is named by a test", async () => {

        const proofs = readdirSync(resolve(root, "tests")).filter(( name ) => name.endsWith(".test.ts")).map(( name ) => readFileSync(resolve(root, "tests", name), "utf8")).join("\n");
        const unnamed: string[] = [];
        const owned = ( folder: string, member: string, suffix: string ): boolean => readdirSync(resolve(root, folder)).some(( name ) => name.endsWith(suffix) && (name === `${member}${suffix}` || name.startsWith(`${member}.`)));
        const missing = ["engine", ...members].flatMap(( member ) => [["tests", ".test.ts"], ["fuzz", ".test.ts"], ["benches", ".bench.ts"]].filter(([folder = "", suffix = ""]) => !owned(folder, member, suffix)).map(([folder]) => `${folder}/${member}`));

        expect(missing).toEqual([]);

        for ( const [member, exported] of await surface() ) {

            for ( const name of exported ) if ( !new RegExp(`\\b${escaped(name)}\\b`).test(proofs) ) unnamed.push(`${member}.${name}`);

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
    it("declared: a member's verbs are function declarations, never exported arrows", () => {

        const arrows = members.flatMap(( member ) => sources(member).filter(([, code]) => arrowVerb.test(code)).map(([name]) => `${member}/${name}`));

        expect(arrows).toEqual([]);

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
