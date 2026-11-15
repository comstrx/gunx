import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { type Node, SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";

type Counts = { lines: number; linesHit: number; functions: number; functionsHit: number };
type Verdict = { failed: boolean; issues: string[]; files: number; lines: number; functions: number };

const totals = { lines: 0.95, functions: 0.9 };
const floors = { lines: 0.75, functions: 0.5 };
const root = resolve(import.meta.dir, "..");
const fields = { LF: "lines", LH: "linesHit", FNF: "functions", FNH: "functionsHit" } as const;
const executable = new Set([SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression, SyntaxKind.ArrowFunction, SyntaxKind.ClassDeclaration, SyntaxKind.ClassExpression, SyntaxKind.CallExpression, SyntaxKind.NewExpression, SyntaxKind.AwaitExpression, SyntaxKind.ThrowStatement]);
const erased = new Set([SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration]);

function code ( node: Node ): boolean {

    if ( erased.has(node.kind) ) return false;
    if ( executable.has(node.kind) ) return true;

    let found = false;

    node.forEachChild(( child ) => { found ||= code(child); });

    return found;

}
function nameOf ( name: string ): string {

    return relative(root, resolve(root, name)).replaceAll("\\", "/");

}
function ratio ( hit: number, all: number ): number {

    return all === 0 ? 1 : hit / all;

}

export async function inventory (): Promise<string[]> {

    const api = new API({ cwd: root });

    try {

        const snapshot = await api.updateSnapshot({ openProjects: [resolve(root, "tsconfig.json")] });

        try {

            const project = snapshot.getProjects()[0];

            if ( !project ) throw new Error("missing engine project");

            const paths = readdirSync(resolve(root, "src"), { recursive: true, encoding: "utf8" }).filter(( name ) => name.endsWith(".ts"));
            const expected: string[] = [];

            for ( const name of paths ) {

                const path = resolve(root, "src", name);
                const file = await project.program.getSourceFile(path);

                if ( !file ) throw new Error(`missing source: ${path}`);
                if ( code(file) ) expected.push(nameOf(path));

            }

            return expected.sort();

        } finally {

            await snapshot.dispose();

        }

    } finally {

        await api.close();

    }

}
export function inspect ( report: string, expected: readonly string[] ): Verdict {

    const files = new Map<string, Counts>();
    const issues: string[] = [];
    let current: Partial<Counts> | undefined;
    let name = "";

    const finish = (): void => {

        if ( current === undefined ) return;

        const values = Object.values(fields).map(( key ) => current?.[key]);

        if ( values.some(( value ) => value === undefined || !Number.isSafeInteger(value) || value < 0) ) issues.push(`invalid counters: ${name}`);
        else {

            const found = current as Counts;

            if ( found.linesHit > found.lines || found.functionsHit > found.functions ) issues.push(`impossible counters: ${name}`);
            if ( files.has(name) ) issues.push(`duplicate source: ${name}`);

            files.set(name, found);

        }

        current = undefined;

    };

    for ( const line of report.split(/\r?\n/) ) {

        if ( line === "end_of_record" ) { finish(); continue; }

        const at = line.indexOf(":");
        const key = line.slice(0, at);
        const value = line.slice(at + 1);

        if ( key === "SF" ) {

            if ( current !== undefined ) { issues.push(`unfinished record: ${name}`); finish(); }

            name = nameOf(value);

            if ( !name.startsWith("src/") || !value ) issues.push(`unexpected source: ${value}`);

            current = {};

        } else if ( current && Object.hasOwn(fields, key) ) {

            const field = fields[key as keyof typeof fields];

            if ( Object.hasOwn(current, field) ) issues.push(`duplicate counter: ${name}:${key}`);

            current[field] = /^\d+$/.test(value) ? Number(value) : Number.NaN;

        }

    }

    if ( current !== undefined ) { issues.push(`unfinished record: ${name}`); finish(); }
    if ( expected.length === 0 ) issues.push("empty source inventory");

    for ( const name of expected ) {

        const found = files.get(nameOf(name));

        if ( found === undefined ) issues.push(`missing source: ${name}`);
        else if ( found.lines === 0 ) issues.push(`empty source: ${name}`);

    }

    const sum = [...files.values()].reduce<Counts>(( acc, found ) => ({ lines: acc.lines + found.lines, linesHit: acc.linesHit + found.linesHit, functions: acc.functions + found.functions, functionsHit: acc.functionsHit + found.functionsHit }), { lines: 0, linesHit: 0, functions: 0, functionsHit: 0 });

    if ( files.size === 0 || sum.lines === 0 || sum.functions === 0 ) issues.push("empty execution coverage");

    for ( const [name, found] of files ) if ( found.functions > 0 && (ratio(found.linesHit, found.lines) < floors.lines || ratio(found.functionsHit, found.functions) < floors.functions) ) issues.push(`under the floor: ${name}`);

    const lines = ratio(sum.linesHit, sum.lines);
    const functions = ratio(sum.functionsHit, sum.functions);

    if ( lines < totals.lines ) issues.push(`aggregate lines below ${totals.lines}`);
    if ( functions < totals.functions ) issues.push(`aggregate functions below ${totals.functions}`);

    return { failed: issues.length > 0, issues, files: files.size, lines, functions };

}

if ( import.meta.main ) {

    const result = inspect(readFileSync(resolve(root, "coverage", "lcov.info"), "utf8"), await inventory());
    const summary = `coverage: lines ${(result.lines * 100).toFixed(2)}% (≥ ${totals.lines * 100}) · functions ${(result.functions * 100).toFixed(2)}% (≥ ${totals.functions * 100}) · ${result.files} files, floors ${floors.lines * 100}/${floors.functions * 100}\n${result.issues.join("\n")}\n`;

    await Bun.write(result.failed ? Bun.stderr : Bun.stdout, summary);

    if ( result.failed ) process.exit(1);

}
