import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as exception from "engine-exception";
import * as json from "engine-json";
import type { Bounded, Budget, Limits, Measured, Size, Step } from "./arch.ts";
import { byText, counted, viewIn } from "./core.ts";
import { step } from "./project.ts";

const units: Readonly<Record<string, number>> = { "": 1, b: 1, kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
const sized = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i;
const known: readonly string[] = ["total", "each", "gzip", "lines"];
const vendored = /(?:^|\/)node_modules\//;

function linesOf ( bytes: Uint8Array ): number {

    let count = 0;

    for ( const byte of bytes ) if ( byte === 10 ) count += 1;

    return bytes.length > 0 && bytes[bytes.length - 1] !== 10 ? count + 1 : count;

}
function limitOf ( given: Size | undefined, name: string ): number | undefined {

    if ( given === undefined ) return undefined;

    const found = typeof given === "string" ? sized.exec(given) : undefined;
    const unit = units[found?.[2]?.toLowerCase() ?? ""];
    const value = typeof given === "number" ? given : found && unit !== undefined ? Math.round(Number(found[1]) * unit) : Number.NaN;

    if ( !Number.isFinite(value) || value < 0 ) throw exception.fault("internal", "tool.budget", { message: `${name}: a size is bytes or text such as 800 kB, 3.5 MB or 1 MiB` });

    return value;

}
function ruleOf ( name: string, given: Budget ): Bounded {

    const shaped = typeof given === "string" || Array.isArray(given) ? { files: given as string | readonly string[] } : given as Limits & { files?: unknown };
    const files = shaped.files;
    const patterns = typeof files === "string" ? [files] : Array.isArray(files) ? [...files] as unknown[] : [];

    if ( !/^[\w.-]+$/.test(name) ) throw exception.fault("internal", "tool.budget", { message: `${name}: a budget's name is a word, such as js or bundle` });
    if ( !json.isRecord(shaped) || patterns.length === 0 || !patterns.every(( pattern ) => typeof pattern === "string" && pattern.trim() !== "") ) throw exception.fault("internal", "tool.budget", { message: `${name}: a budget measures a glob or a list of them, such as dist/**/*.js` });

    for ( const key of Object.keys(shaped) ) if ( key !== "files" && !known.includes(key) ) throw exception.fault("internal", "tool.budget", { message: `${name}.${key}: a budget limits ${known.join(", ")}` });

    if ( shaped.lines !== undefined && !(Number.isInteger(shaped.lines) && shaped.lines > 0) ) throw exception.fault("internal", "tool.budget", { message: `${name}.lines: the most lines a file may hold, a whole number` });

    return { name, patterns: patterns as string[], total: limitOf(shaped.total, `${name}.total`), each: limitOf(shaped.each, `${name}.each`), gzip: limitOf(shaped.gzip, `${name}.gzip`), lines: shaped.lines };

}
function format ( size: number ): string {

    if ( size < 1e3 ) return `${size} B`;

    const [unit, scale] = size < 1e6 ? ["kB", 1e3] as const : size < 1e9 ? ["MB", 1e6] as const : ["GB", 1e9] as const;

    return `${Number((size / scale).toFixed(1))} ${unit}`;

}

export function measure ( root: string, files: string | readonly string[], gzip = false ): Measured[] {

    const patterns = typeof files === "string" ? [files] : [...files];
    const vendor = patterns.some(( pattern ) => pattern.includes("node_modules"));
    const found = new Map<string, Measured>();

    for ( const pattern of patterns ) {

        for ( const relative of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true }) ) {

            const path = relative.split("\\").join("/");

            if ( found.has(path) || (!vendor && vendored.test(path)) ) continue;

            const content = readFileSync(join(root, path));

            found.set(path, { path, size: content.length, lines: linesOf(content), gzip: gzip ? Bun.gzipSync(content).length : 0 });

        }

    }

    return [...found.values()].sort(( left, right ) => byText(left.path, right.path));

}
export function budget ( budgets: Readonly<Record<string, Budget>> ): Step {

    if ( !json.isRecord(budgets) || Object.keys(budgets).length === 0 ) throw exception.fault("internal", "tool.budget", { message: "a budget names what it measures, such as { js: \"dist/**/*.js\" }" });

    const rules = Object.entries(budgets).map(([name, given]) => ruleOf(name, given));

    return step(`budget ${rules.map(( rule ) => rule.name).join(", ")}`, ( scope ) => {

        const role = viewIn(scope);
        const planned = json.isRecord(role?.settings) && json.isRecord(role.settings.budget) ? role.settings.budget : {};

        for ( const rule of rules ) {

            const total = rule.total ?? (typeof planned[rule.name] === "number" || typeof planned[rule.name] === "string" ? limitOf(planned[rule.name] as Size, rule.name) : undefined);
            const measured = measure(scope.root, rule.patterns.map(( pattern ) => scope.expand(pattern)), rule.gzip !== undefined);
            const sum = measured.reduce(( all, file ) => all + file.size, 0);
            const packed = measured.reduce(( all, file ) => all + file.gzip, 0);
            const largest = measured.reduce<Measured | undefined>(( top, file ) => (top === undefined || file.size > top.size ? file : top), undefined);
            const longest = measured.reduce<Measured | undefined>(( top, file ) => (top === undefined || file.lines > top.lines ? file : top), undefined);
            const of = ( value: number, limit: number | undefined ): string => (limit === undefined ? format(value) : `${format(value)} of ${format(limit)}`);

            if ( measured.length === 0 ) {

                scope.flag(rule.name, `${rule.patterns.join(", ")} matches no file`, "budget");

                continue;

            }

            if ( total !== undefined && sum > total ) scope.flag(rule.name, `${format(sum)} is ${format(sum - total)} over ${format(total)}`, "budget.total");
            if ( rule.gzip !== undefined && packed > rule.gzip ) scope.flag(rule.name, `${format(packed)} gzipped is ${format(packed - rule.gzip)} over ${format(rule.gzip)}`, "budget.gzip");

            for ( const file of measured ) {

                if ( rule.each !== undefined && file.size > rule.each ) scope.flag(file.path, `${format(file.size)} is over ${format(rule.each)} a file`, "budget.each");
                if ( rule.lines !== undefined && file.lines > rule.lines ) scope.flag(file.path, `${file.lines} lines, over ${rule.lines} a file`, "budget.lines");

            }

            scope.say([
                `${rule.name}: ${counted(measured.length, "file")}, ${of(sum, total)}`,
                ...(rule.gzip === undefined ? [] : [`gzip ${of(packed, rule.gzip)}`]),
                ...(largest && rule.each !== undefined ? [`largest ${largest.path} ${of(largest.size, rule.each)}`] : []),
                ...(longest && rule.lines !== undefined ? [`longest ${longest.path} ${longest.lines} of ${rule.lines} lines`] : []),
            ].join(", "));

        }

    });

}
