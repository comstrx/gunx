import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, normalize } from "node:path";
import * as exception from "engine-exception";
import * as net from "engine-net";
import * as spec from "engine-spec";
import * as translate from "engine-translate";
import * as world from "engine-world";
import type { Build, BundleOptions, CopyOptions, Fonts, Layers, Made, Processor, RunOptions, Scope, Sources, Step, Values, Vars } from "./arch.ts";
import { analyze } from "./architecture.ts";
import { assets, counted, members, viewIn, walk, worded } from "./core.ts";
import { step } from "./project.ts";
import { catalogs, csp, pictured, render } from "./surface.ts";

const named = /^[A-Za-z_$][\w$]*$/;

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
export function theme ( to: string ): Step {

    checked(to, "theme");

    return step(`theme → ${to}`, ( scope ) => {

        const role = viewIn(scope);

        if ( role === undefined ) throw exception.fault("internal", "tool.theme", { message: "theme writes a role's own look over the part's tokens, so the project needs specs: define({ specs, part, tasks })" });

        const own = spec.painted(spec.theme(role.themes));
        const others = role.reach.surfaces.filter(( surface ) => surface.id !== role.id).map(( surface ) => ({ id: surface.id, look: spec.painted(spec.theme(surface.themes)) }));
        const named = Object.assign({}, ...others.map(( other ) => other.look.named).reverse(), own.named) as Record<string, string>;
        const filled = ( look: spec.Painted ): boolean => Object.keys(look.base).length + Object.keys(look.dark).length > 0;

        scope.emit(to, [
            ...(Object.keys(named).length > 0 ? [world.css({ base: named, selector: "@theme" })] : []),
            ...(filled(own) ? [world.css({ base: own.base, dark: own.dark })] : []),
            ...others.filter(( other ) => filled(other.look)).map(( other ) => world.css({ base: other.look.base, dark: other.look.dark, selector: `:root[data-surface=${JSON.stringify(other.id)}]` })),
            "",
        ].join("\n"));

    });

}
export function spoken ( root: string ): Step {

    checked(root, "spoken");

    return step(`spoken ${root}`, ( scope ) => {

        const role = viewIn(scope);
        const settings = role?.settings as { localization?: unknown; locales?: unknown; locale?: unknown } | undefined;
        const locales = Array.isArray(settings?.locales) ? settings.locales.filter(( one ): one is string => typeof one === "string") : [];
        let stamped = 0;

        if ( settings?.localization !== true ) return scope.say("the role keeps its language out of the address");

        for ( const locale of locales ) {

            const pages = [...walk(scope.at(`${root}/${locale}`), { extensions: [".html"] }).map(( file ) => `${root}/${locale}/${file.relative}`), `${root}/${locale}.html`];

            for ( const page of pages ) {

                const found = exception.probe(() => readFileSync(scope.at(page), "utf8"));
                const told = found?.replace(/<html\b[^>]*>/, ( tag ) => tag.replace(/\slang="[^"]*"/, ` lang="${locale}"`).replace(/\sdir="[^"]*"/, ` dir="${translate.direction(locale)}"`));

                if ( found !== undefined && told !== undefined && told !== found && scope.emit(page, told) ) stamped += 1;

            }

        }

        scope.say(`${counted(stamped, "page")} stamped with its language`);

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
export function page ( from: string, to: string, values: Values = {}, sources: Sources = {} ): Step {

    checked(from, "page");
    checked(to, "page");

    return step(`page ${from} → ${to}`, ( scope ) => {

        const role = viewIn(scope);
        const addresses = (role?.reach.addresses ?? []).filter(net.isEndpoint);
        const media = (role?.reach.surfaces ?? []).flatMap(( one ) => one.media);
        const known = role === undefined ? {} : { ...role, ...(addresses.length ? { csp: csp(addresses, media.length ? { "img-src": pictured(addresses, media) } : {}, sources) } : {}) };

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
export function brand ( from: string, into: string, home: ( name: string ) => string ): Step {

    checked(from, "brand");
    checked(into, "brand");

    if ( typeof home !== "function" ) throw exception.fault("internal", "tool.brand", { message: "brand takes where a role keeps its brand, such as ( name ) => `specs/${name}/brand`" });

    return step(`brand ${from} → ${into}`, ( scope ) => {

        const build = scope.build;

        if ( build === undefined ) throw exception.fault("internal", "tool.brand", { message: "brand merges every surface's files, so the project needs specs: define({ specs, part, tasks })" });

        const base = existsSync(scope.at(from)) ? readdirSync(scope.at(from), { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && normalize(join(from, entry.name)) !== normalize(into)).map(( entry ) => entry.name) : [];
        let written = 0;

        rmSync(scope.at(into), { recursive: true, force: true });

        for ( const name of build.names ) {

            const { id, brand: tables } = build.carried(name);
            const kept = `${into}/${id}`;

            for ( const folder of base ) written += scope.copy(`${from}/${folder}`, `${kept}/${folder}`);

            for ( const [kind, table] of Object.entries(tables as Readonly<Record<string, Readonly<Record<string, string>>>>) ) {

                for ( const file of new Set(Object.values(table)) ) {

                    const source = `${home(name)}/${kind}/${file}`;

                    if ( file.split("/").includes("..") || !existsSync(scope.at(source)) ) scope.flag(`${name}: brand.${kind}`, `${source}: the brand names a file that is not in its folder`, "brand");
                    else written += scope.copy(source, `${kept}/${kind}/${file}`);

                }

            }

        }

        scope.say(`${counted(build.names.length, "surface")}, ${written} written`);

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
