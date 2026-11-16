import { readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as error from "engine-error";
import * as world from "engine-world";
import type { Build, BundleOptions, CopyOptions, Fonts, Layers, Made, Nameless, Problem, Processor, RunOptions, Step, Values, Vars, Written } from "./arch.ts";
import { analyze } from "./architecture.ts";
import { assets, counted, members, viewIn, walk } from "./core.ts";
import { step } from "./project.ts";
import { catalogs, csp, render } from "./surface.ts";

const quiet: readonly string[] = ["out", "coverage", "android", "ios", "tsconfig.tsbuildinfo"];

function escaped ( text: string ): string {

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}
function lineAt ( text: string, index: number ): number {

    return text.slice(0, index).split("\n").length;

}
function checked ( value: unknown, what: string ): string {

    if ( typeof value !== "string" || value.trim() === "" ) throw error.fault("internal", `tool.${what}`, { message: `${what}: a path is a non-empty string` });

    return value;

}
function told ( problem: Problem ): string {

    return `${problem.message}${problem.near ? ` (near: ${problem.near})` : ""}${problem.fix ? ` → ${problem.fix}` : ""}`;

}
function served ( address: string | undefined ): address is string {

    return address !== undefined && URL.canParse(address) && /^https?:$/.test(new URL(address).protocol);

}
function defines ( env: Vars ): Record<string, string> {

    return Object.fromEntries(Object.entries(env).map(([name, value]) => [`process.env.${name}`, JSON.stringify(value ?? "")]));

}

export function run ( command: string, options: RunOptions = {} ): Step {

    if ( typeof command !== "string" || command.trim() === "" ) throw error.fault("internal", "tool.run", { message: "a command is a line of shell" });

    return step(`run ${command}`, ( scope ) => scope.run(command, options));

}
export function emit<V> ( to: string, content: Made<V> ): Step<V>;
export function emit ( to: string, content: unknown ): Step;
export function emit ( to: string, content: unknown ): Step {

    checked(to, "emit");

    return step(`emit ${to}`, async ( scope ) => {

        scope.emit(to, typeof content === "function" ? await (content as Made<unknown>)(scope.role, scope) : content);

    });

}
export function specs ( into: string, options: Written = {} ): Step {

    checked(into, "specs");

    const kept = [...(options.settings ?? [])] as string[];

    return step(`specs ${into}`, ( scope ) => {

        const source = scope.specs;
        let problems = 0;

        if ( source === undefined ) throw error.fault("internal", "tool.specs", { message: "specs writes the project's roles, so the project needs specs: define({ specs, tasks })" });

        for ( const name of Object.keys(source.roles) ) {

            const compiled = source.compile(name);
            const settings = source.roles[name]?.config.settings as Readonly<Record<string, unknown>>;
            const carried = Object.fromEntries(kept.filter(( key ) => settings[key] !== undefined).map(( key ) => [key, settings[key]]));
            const output = { ...(source.serialize(compiled) as object), ...carried };

            problems += compiled.issues.length;

            for ( const problem of compiled.issues ) scope.flag(`${name}: ${problem.path}`, told(problem), problem.rule);

            scope.emit(`${into}/${name}.json`, output);

            if ( name === source.current ) scope.emit(`${into}/current.json`, output);

            scope.say(`${name}: ${counted(compiled.screens.length, "screen")}, ${counted(compiled.features.length, "feature")}, ${counted(compiled.topics.emitted.length, "topic")}`);

        }

        if ( problems ) throw error.fault("validation", "tool.specs", { message: `${counted(problems, "problem")} in the specs; nothing after them runs` });

    });

}
export function copy ( from: string, to: string, options: CopyOptions = {} ): Step {

    checked(from, "copy");
    checked(to, "copy");

    return step(`copy ${from} → ${to}`, ( scope ) => {

        scope.say(`${scope.copy(from, to, options)} written`);

    });

}
export function script ( from: string, to: string, options: Build = {} ): Step {

    checked(from, "script");
    checked(to, "script");

    return step(`script ${from} → ${to}`, async ( scope ) => {

        const built = await Bun.build({ target: "browser", format: "iife", minify: true, ...options, entrypoints: [scope.at(from)], throw: false });
        const first = built.outputs.find(( output ) => output.kind === "entry-point");

        if ( !built.success || first === undefined ) throw new AggregateError(built.logs, `${from}: the script did not build`);

        scope.emit(to, await first.text());

    });

}
export function bundle ( from: string | readonly string[], to: string, options: BundleOptions = {} ): Step {

    const entries = typeof from === "string" ? [from] : [...from];
    const { clean = true, inline, define, world: kept = "role", plugins = [], ...rest } = options;

    for ( const entry of entries ) checked(entry, "bundle");

    checked(to, "bundle");

    return step(`bundle ${entries.join(", ")} → ${to}`, async ( scope ) => {

        const outdir = scope.into(to);

        if ( clean ) rmSync(outdir, { recursive: true, force: true });

        const role = kept === "role" ? viewIn(scope) : undefined;
        const chosen = role === undefined ? plugins : [...plugins, catalogs(role.surface.world)];
        const built = await Bun.build({ ...rest, plugins: chosen, define: { ...defines(inline ?? {}), ...define }, entrypoints: entries.map(( entry ) => scope.at(entry)), outdir, throw: false });

        if ( !built.success ) throw new AggregateError(built.logs, `${to}: the bundle did not build`);

        scope.say(counted(built.outputs.length, "file"));

    });

}
export function css ( from: string, to: string, processor: Processor ): Step {

    checked(from, "css");
    checked(to, "css");

    if ( typeof processor?.process !== "function" ) throw error.fault("internal", "tool.css", { message: "css: a processor answers process(css, { from, to }), such as postcss([tailwind()])" });

    return step(`css ${from} → ${to}`, async ( scope ) => {

        const source = scope.at(from);
        const sheet = await processor.process(readFileSync(source, "utf8"), { from: source, to: scope.at(to) });

        scope.emit(to, sheet.css);

    });

}
export function page ( from: string, to: string, values: Values = {} ): Step {

    checked(from, "page");
    checked(to, "page");

    return step(`page ${from} → ${to}`, ( scope ) => {

        const role = viewIn(scope);
        const address = role?.surface.address;
        const known = role === undefined ? {} : { ...role, ...(served(address) ? { csp: csp(address) } : {}) };

        scope.emit(to, render(readFileSync(scope.at(from), "utf8"), { ...known, ...values }));

    });

}
export function fonts ( into: string, options: Fonts = {} ): Step {

    const { css: sheet, url = "/fonts" } = options;

    checked(into, "fonts");

    if ( sheet !== undefined ) checked(sheet, "fonts");

    return step(`fonts → ${into}`, ( scope ) => {

        const written = scope.copy(join(assets(), "font"), into, { extensions: [".woff2"] });

        if ( sheet !== undefined ) scope.emit(sheet, `${world.fontFaces(url)}\n`);

        scope.say(`${written} written, served from ${url}`);

    });

}
export function layers ( rules: Layers ): Step {

    return step("layers", ( scope ) => {

        const found = analyze({ members: members().map(( member ) => member.name), ...rules, root: scope.root });

        for ( const issue of found.issues ) scope.flag(`${issue.file}:${issue.line}`, issue.message, issue.rule);
        for ( const ring of found.cycles ) scope.flag(ring[0] ?? "", `a cycle joins ${ring.join(", ")}`, "cycle");
        for ( const file of found.orphans ) scope.flag(file, "no entry reaches this file", "orphan");

        scope.say(`${counted(found.files, "file")}, ${counted(found.cycles.length, "cycle")}${rules.entries?.length ? `, ${counted(found.orphans.length, "orphan")}` : ""}`);

    });

}
export function nameless ( options: Nameless = {} ): Step {

    return step("nameless", ( scope ) => {

        const products = dirname(dirname(scope.root));
        const tree = dirname(products);
        const inTree = basename(products) === "product";
        const names = inTree ? [basename(tree), ...readdirSync(products, { withFileTypes: true }).filter(( entry ) => entry.isDirectory()).map(( entry ) => entry.name)] : [];
        const tops = inTree ? readdirSync(tree, { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && !entry.name.startsWith(".")).map(( entry ) => entry.name) : [];
        const named = names.length ? new RegExp(`\\b(?:${names.map(escaped).join("|")})\\b`, "i") : undefined;
        const reaching = tops.length ? new RegExp(`(?:\\.\\./)+(?:${tops.map(escaped).join("|")})/`, "g") : undefined;
        let files = 0;

        for ( const file of walk(scope.root, { ignore: [...quiet, ...(options.ignore ?? [])] }) ) {

            const text = readFileSync(file.path, "utf8");

            if ( text.includes("\u0000") ) continue;

            files += 1;

            const found = named?.exec(text);

            if ( found ) scope.flag(`${file.relative}:${lineAt(text, found.index)}`, `names the tree or a product: ${found[0]}`, "named");

            if ( reaching === undefined || file.relative === "package.json" ) continue;

            for ( const hit of text.matchAll(reaching) ) {

                scope.flag(`${file.relative}:${lineAt(text, hit.index)}`, `reaches into the tree: ${hit[0]}`, "reach");

                break;

            }

        }

        scope.say(inTree ? `${counted(files, "file")}, guarded names: ${names.join(", ")}` : `${counted(files, "file")}, not inside a product tree`);

    });

}
