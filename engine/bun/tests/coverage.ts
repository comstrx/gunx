import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Counts = { lines: number; linesHit: number; functions: number; functionsHit: number };

const totals = { lines: 0.95, functions: 0.9 };
const floors = { lines: 0.75, functions: 0.5 };
const report = readFileSync(resolve(import.meta.dir, "..", "coverage", "lcov.info"), "utf8");
const files = new Map<string, Counts>();
let current: Counts | undefined;

for ( const line of report.split("\n") ) {

    const [key, value = ""] = line.split(":", 2) as [string, string?];

    if ( key === "SF" ) {

        current = { lines: 0, linesHit: 0, functions: 0, functionsHit: 0 };
        files.set(value, current);

    } else if ( current ) {

        if ( key === "LF" ) current.lines = Number(value);
        if ( key === "LH" ) current.linesHit = Number(value);
        if ( key === "FNF" ) current.functions = Number(value);
        if ( key === "FNH" ) current.functionsHit = Number(value);

    }

}

const ratio = ( hit: number, all: number ): number => (all === 0 ? 1 : hit / all);
const sum = [...files.values()].reduce<Counts>(( acc, found ) => ({ lines: acc.lines + found.lines, linesHit: acc.linesHit + found.linesHit, functions: acc.functions + found.functions, functionsHit: acc.functionsHit + found.functionsHit }), { lines: 0, linesHit: 0, functions: 0, functionsHit: 0 });
const lines = ratio(sum.linesHit, sum.lines);
const functions = ratio(sum.functionsHit, sum.functions);
const low = [...files].filter(([, found]) => found.functions > 0 && (ratio(found.linesHit, found.lines) < floors.lines || ratio(found.functionsHit, found.functions) < floors.functions)).map(([file, found]) => `${file} lines ${(ratio(found.linesHit, found.lines) * 100).toFixed(1)}% functions ${(ratio(found.functionsHit, found.functions) * 100).toFixed(1)}%`);
const failed = lines < totals.lines || functions < totals.functions || low.length > 0;
const summary = `coverage: lines ${(lines * 100).toFixed(2)}% (≥ ${totals.lines * 100}) · functions ${(functions * 100).toFixed(2)}% (≥ ${totals.functions * 100}) · ${files.size} files, floors ${floors.lines * 100}/${floors.functions * 100}${low.length ? `\nunder the floor:\n${low.join("\n")}` : ""}\n`;

await Bun.write(failed ? Bun.stderr : Bun.stdout, summary);

if ( failed ) process.exit(1);
