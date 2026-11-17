import { readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as exception from "engine-exception";
import * as net from "engine-net";
import * as world from "engine-world";
import type { Build, BundleOptions, CopyOptions, Fonts, Layers, Made, Nameless, Processor, RunOptions, Scope, Step, Values, Vars } from "./arch.ts";
import { analyze } from "./architecture.ts";
import { assets, counted, members, viewIn, walk, worded } from "./core.ts";
import { step } from "./project.ts";
import { catalogs, csp, pictured, render } from "./surface.ts";

const quiet: readonly string[] = ["out", "coverage", "android", "ios", "tsconfig.tsbuildinfo"];
const named = /^[A-Za-z_$][\w$]*$/;

function escaped ( text: string ): string {

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}
function lineAt ( text: string, index: number ): number {

    return text.slice(0, index).split("\n").length;

}
function checked ( value: unknown, what: string ): string {

    if ( typeof value !== "string" || value.trim() === "" ) throw exception.fault("internal", `tool.${what}`, { message: `${what}: a path is a non-empty string` });

    return value;

}
function defines ( env: Vars ): Record<string, string> {

    return Object.fromEntries(Object.entries(env).map(([name, value]) => [`process.env.${name}`, JSON.stringify(value ?? "")]));

}

export function run ( command: string, options: RunOptions = {} ): Step {

    if ( typeof command !== "string" || command.trim() === "" ) throw exception.fault("internal", "tool.run", { message: "a command is a line of shell" });

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
export function specs ( into: string ): Step {

    checked(into, "specs");

    return step(`specs ${into}`, ( scope ) => {

        const build = scope.build;
        let problems = 0;

        if ( build === undefined ) throw exception.fault("internal", "tool.specs", { message: "specs writes the project's surfaces, so the project needs specs: define({ specs, part, tasks })" });

        const current = scope.expand("{role}");

        for ( const name of build.names ) {

            const { compiled } = build.surface(name);

            problems += compiled.issues.length;

            for ( const problem of compiled.issues ) scope.flag(`${name}: ${problem.path}`, worded(problem), problem.rule);

            scope.say(`${name}: ${counted(compiled.screens.length, "screen")}, ${counted(compiled.features.length, "feature")}, ${counted(compiled.topics.emitted.length, "topic")}`);

        }

        if ( problems ) throw exception.fault("validation", "tool.specs", { message: `${counted(problems, "problem")} in the specs; nothing after them runs` });

        for ( const name of build.names ) scope.emit(`${into}/surface/${name}.json`, build.carried(name));

        const others = build.reach(current).filter(( name ) => name !== current);

        scope.emit(`${into}/current.json`, build.artifact(current, false));
        scope.emit(`${into}/current.ts`, [
            `import entry from ${JSON.stringify(`./surface/${current}.json`)} with { type: "json" };`,
            "",
            `export const artifact = ${JSON.stringify({ ...build.artifact(current, false), surfaces: "@entry" }).replace("\"@entry\"", `{ ${JSON.stringify(current)}: entry }`)};`,
            "",
            `export const load = {${others.map(( name ) => `\n    ${JSON.stringify(name)}: () => import(${JSON.stringify(`./surface/${name}.json`)}),`).join("")}${others.length ? "\n" : ""}};`,
            "",
        ].join("\n"));

    });

}
export function copy ( from: string, to: string, options: CopyOptions = {} ): Step {

    checked(from, "copy");
    checked(to, "copy");

    return step(`copy ${from} → ${to}`, ( scope ) => {

        scope.say(`${scope.copy(from, to, options)} written`);

    });

}
async function scripted ( scope: Scope, from: string, to: string, options: Build, what: string ): Promise<void> {

    const built = await Bun.build({ target: "browser", format: "iife", minify: true, ...options, entrypoints: [scope.at(from)], throw: false });
    const first = built.outputs.find(( output ) => output.kind === "entry-point");

    if ( !built.success || first === undefined ) throw exception.fault("internal", `tool.${what}`, { message: `${from}: the script did not build`, cause: built.logs });

    scope.emit(to, await first.text());

}

export function script ( from: string, to: string, options: Build = {} ): Step {

    checked(from, "script");
    checked(to, "script");

    return step(`script ${from} → ${to}`, ( scope ) => scripted(scope, from, to, options, "script"));

}
export function call ( module: string, name: string, to: string, options: Build = {} ): Step {

    checked(module, "call");
    checked(to, "call");

    if ( !named.test(name) ) throw exception.fault("internal", "tool.call", { message: `${String(name)}: not the name of an export` });

    const entry = `.cache/call/${name}.ts`;

    return step(`call ${module} ${name} → ${to}`, async ( scope ) => {

        scope.emit(entry, `import { ${name} } from ${JSON.stringify(module)};\n\n${name}();\n`);

        await scripted(scope, entry, to, options, "call");

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
        const chosen = role === undefined ? plugins : [...plugins, catalogs(role.reach.world)];
        const built = await Bun.build({ ...rest, plugins: chosen, define: { ...defines(inline ?? {}), ...define }, entrypoints: entries.map(( entry ) => scope.at(entry)), outdir, throw: false });

        if ( !built.success ) throw exception.fault("internal", "tool.bundle", { message: `${to}: the bundle did not build`, cause: built.logs });

        scope.say(counted(built.outputs.length, "file"));

    });

}
export function css ( from: string, to: string, processor: Processor ): Step {

    checked(from, "css");
    checked(to, "css");

    if ( typeof processor?.process !== "function" ) throw exception.fault("internal", "tool.css", { message: "css: a processor answers process(css, { from, to }), such as postcss([tailwind()])" });

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
        const addresses = (role?.reach.addresses ?? []).filter(net.isEndpoint);
        const media = (role?.reach.surfaces ?? []).flatMap(( one ) => one.media);
        const known = role === undefined ? {} : { ...role, ...(addresses.length ? { csp: csp(addresses, media.length ? { "img-src": pictured(addresses, media) } : {}) } : {}) };

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
