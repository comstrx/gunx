import { describe, expect, test as it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";

const root = resolve(import.meta.dir, "..");
const source = resolve(root, "src");
const definitions = new Set([SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.EnumDeclaration]);
const declarations = new Set([SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.EnumDeclaration, SyntaxKind.VariableStatement]);
const executions = new Set([SyntaxKind.CallExpression, SyntaxKind.NewExpression, SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression, SyntaxKind.FunctionDeclaration, SyntaxKind.ClassDeclaration, SyntaxKind.ClassExpression, SyntaxKind.MethodDeclaration, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor, SyntaxKind.TaggedTemplateExpression, SyntaxKind.AwaitExpression]);

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
    if ( classes > 1 ) found.add("multiple implementation classes");
    if ( name === "index.ts" && file.statements.some(( node ) => node.kind !== SyntaxKind.ExportDeclaration) ) found.add("implementation inside index");

    return [...found].sort();

}

describe("source architecture", () => {

    it("every member owns unit, fuzz and benchmark evidence", () => {

        const missing = readdirSync(source, { withFileTypes: true }).filter(( entry ) => entry.isDirectory()).flatMap(( entry ) => [
            resolve(root, "tests", `${entry.name}.test.ts`),
            resolve(root, "fuzz", `${entry.name}.test.ts`),
            resolve(root, "benches", `${entry.name}.bench.ts`),
        ]).filter(( path ) => !existsSync(path));

        expect(missing).toEqual([]);

    });

    it("definitions belong to arch, entries only export, and files own at most one implementation class", async () => {

        const api = new API({ cwd: root });

        try {

            const snapshot = await api.updateSnapshot({ openProjects: [resolve(root, "tsconfig.json")] });

            try {

                const project = snapshot.getProjects()[0];

                if ( !project ) throw new Error("missing engine project");

                const paths = readdirSync(source, { withFileTypes: true }).filter(( entry ) => entry.isDirectory()).flatMap(( entry ) => {
                    const folder = resolve(source, entry.name, "src");

                    return readdirSync(folder).filter(( name ) => name.endsWith(".ts")).map(( name ) => resolve(folder, name));
                });
                const failures: string[] = [];

                for ( const path of paths ) {

                    const file = await project.program.getSourceFile(path);

                    if ( !file ) throw new Error(`missing source: ${path}`);

                    failures.push(...inspect(file, basename(path)).map(( issue ) => `${path.slice(source.length + 1)}: ${issue}`));

                }

                expect(paths.length).toBeGreaterThan(200);
                expect(failures).toEqual([]);

            } finally {

                await snapshot.dispose();

            }

        } finally {

            await api.close();

        }

    }, 15000);
    it("the parser rejects nested violations and ignores misleading text literals", async () => {

        const folder = mkdtempSync(join(tmpdir(), "engine-architecture-"));
        const cases = [
            { name: "index.ts", code: 'export { x } from "./ok.ts"; const x = 1;', expected: ["implementation inside index"] },
            { name: "arch.ts", code: "export const value = (() => 1)();", expected: ["implementation inside arch"] },
            { name: "method/arch.ts", code: "export const value = { read () { return 1; } };", expected: ["implementation inside arch"] },
            { name: "getter/arch.ts", code: "export const value = { get read () { return 1; } };", expected: ["implementation inside arch"] },
            { name: "loop/arch.ts", code: "while (true) {}", expected: ["implementation inside arch"] },
            { name: "nested.ts", code: "export function read () { type Hidden = string; return 1; }", expected: ["definitions outside arch"] },
            { name: "classes.ts", code: "export class First {} export const Second = class {};", expected: ["multiple implementation classes"] },
            { name: "ok.ts", code: 'export const x = "type Wrong = string; class A {} class B {}";', expected: [] },
        ];
        const api = new API({ cwd: folder });

        try {

            writeFileSync(join(folder, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true }, include: ["**/*.ts"] }));

            for ( const one of cases ) {

                mkdirSync(dirname(join(folder, one.name)), { recursive: true });
                writeFileSync(join(folder, one.name), one.code);

            }

            const snapshot = await api.updateSnapshot({ openProjects: [join(folder, "tsconfig.json")] });

            try {

                const project = snapshot.getProjects()[0];

                if ( !project ) throw new Error("missing fixture project");

                for ( const one of cases ) {

                    const file = await project.program.getSourceFile(join(folder, one.name));

                    if ( !file ) throw new Error(`missing fixture: ${one.name}`);

                    expect(inspect(file, basename(one.name))).toEqual(one.expected);

                }

            } finally {

                await snapshot.dispose();

            }

        } finally {

            await api.close();
            rmSync(folder, { recursive: true, force: true });

        }

    }, 15000);
});
