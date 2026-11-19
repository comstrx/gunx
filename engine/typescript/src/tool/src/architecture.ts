import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as exception from "engine-exception";
import type { Analysis, Found, Issue, Resolved, Rule, Rules, Visit } from "./arch.ts";
import { byText, walk } from "./core.ts";

const clause = /^[ \t]*import\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:[\w$]+|\*\s*as\s+[\w$]+|\{[^}]*\})\s*from\s*["']([^"']+)["']/;
const passed = /^[ \t]*export\s+(type\s+)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/;
const bare = /^[ \t]*import\s*["']([^"']+)["']/;
const called = /(?<![.\w$])(?:import|require)\(\s*["']([^"']+)["']/;
const importPattern = new RegExp([clause, passed, bare, called].map(( part ) => part.source).join("|"), "gm");
const commented = /^[ \t]*\/\/[^\n]*|^[ \t]*\/\*[\s\S]*?\*\//gm;
const visible = /[^\n]/g;
const scripted = /\.[cm]?jsx?$/;
const inlineTyped = /\{[^}]*\btype\s+[\w$]/;
const transpilers = new Map<string, Bun.Transpiler>();
const tails: readonly string[] = [".ts", ".tsx", "/index.ts", "/index.tsx"];
const shared: readonly string[] = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "zod"];
const builtins: ReadonlySet<string> = new Set([
    "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel",
    "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http", "http2", "https", "inspector", "inspector/promises", "module", "net", "os",
    "path", "path/posix", "path/win32", "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl", "stream",
    "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers", "timers/promises", "tls", "trace_events", "tty", "url",
    "util", "util/types", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

function slashed ( path: string ): string {

    return path.includes("\\") ? path.split("\\").join("/") : path;

}
function headOf ( path: string ): string {

    const cut = path.indexOf("/");

    return cut === -1 ? path : path.slice(0, cut);

}
function packageOf ( target: string ): string {

    const pieces = target.split("/");

    return target.startsWith("@") ? pieces.slice(0, 2).join("/") : (pieces[0] ?? "");

}
function isRuntime ( target: string ): boolean {

    return target === "bun" || target.startsWith("bun:") || target.startsWith("node:") || builtins.has(target);

}
function settled ( inside: string, known: ReadonlySet<string> ): string {

    if ( known.has(inside) ) return inside;

    const stem = inside.replace(scripted, "");

    for ( const tail of tails ) {

        if ( known.has(`${stem}${tail}`) ) return `${stem}${tail}`;

    }

    return inside;

}
function masked ( text: string ): string {

    if ( !text.includes("//") && !text.includes("/*") ) return text;

    return text.replace(commented, ( found ) => found.replace(visible, " "));

}
function scanned ( given: string ): Found[] {

    const text = masked(given);
    const found: Found[] = [];
    let line = 1;
    let at = 0;

    for ( const match of text.matchAll(importPattern) ) {

        const target = match[2] ?? match[4] ?? match[5] ?? match[6] ?? "";

        for ( let mark = text.indexOf("\n", at); mark !== -1 && mark < match.index; mark = text.indexOf("\n", mark + 1) ) line += 1;

        at = match.index;

        if ( target !== "" ) found.push({ target, line, typed: match[1] !== undefined || match[3] !== undefined, text: match[0] });

    }

    return found;

}
function truthOf ( text: string, loader: "ts" | "tsx" ): ReadonlySet<string> | undefined {

    let made = transpilers.get(loader);

    if ( made === undefined ) {

        made = new Bun.Transpiler({ loader });
        transpilers.set(loader, made);

    }

    return exception.probe(() => new Set(made.scanImports(text).map(( found ) => found.path)));

}
function lineOf ( text: string, target: string ): number {

    const at = Math.max(text.indexOf(`"${target}"`), text.indexOf(`'${target}'`));

    return at === -1 ? 1 : text.slice(0, at).split("\n").length;

}
function imports ( text: string, loader: "ts" | "tsx" ): Found[] {

    const found = scanned(text);
    const truth = truthOf(text, loader);

    if ( truth === undefined ) return found;

    const kept: Found[] = [];
    const seen = new Set<string>();

    for ( const one of found ) {

        seen.add(one.target);

        if ( one.typed || truth.has(one.target) ) kept.push(one);
        else if ( inlineTyped.test(one.text) ) kept.push({ ...one, typed: true });

    }

    for ( const target of truth ) if ( !seen.has(target) ) kept.push({ target, line: lineOf(text, target), typed: false, text: "" });

    return kept.sort(( left, right ) => left.line - right.line);

}
function orphansOf ( files: readonly string[], links: ReadonlyMap<string, readonly string[]>, entries: readonly string[] ): string[] {

    if ( entries.length === 0 ) return [];

    const globs = entries.map(( pattern ) => new Bun.Glob(pattern));
    const pending = files.filter(( file ) => globs.some(( glob ) => glob.match(file)));
    const reached = new Set(pending);

    for ( let next = pending.pop(); next !== undefined; next = pending.pop() ) {

        for ( const target of links.get(next) ?? [] ) {

            if ( reached.has(target) ) continue;

            reached.add(target);
            pending.push(target);

        }

    }

    return files.filter(( file ) => !reached.has(file));

}
function cyclesOf ( graph: ReadonlyMap<string, readonly string[]> ): string[][] {

    const order = new Map<string, number>();
    const low = new Map<string, number>();
    const stacked = new Set<string>();
    const stack: string[] = [];
    const trail: Visit[] = [];
    const found: string[][] = [];

    function entered ( node: string ): void {

        order.set(node, order.size);
        low.set(node, order.size - 1);
        stack.push(node);
        stacked.add(node);
        trail.push({ node, next: 0 });

    }
    function lowered ( node: string, reach: number ): void {

        low.set(node, Math.min(low.get(node) ?? reach, reach));

    }

    for ( const start of graph.keys() ) {

        if ( order.has(start) ) continue;

        entered(start);

        for ( let top = trail.at(-1); top; top = trail.at(-1) ) {

            const target = graph.get(top.node)?.[top.next];

            if ( target !== undefined ) {

                const seen = order.get(target);

                top.next += 1;

                if ( seen === undefined ) entered(target);
                else if ( stacked.has(target) ) lowered(top.node, seen);

                continue;

            }

            const reach = low.get(top.node) ?? 0;
            const parent = trail.at(-2);
            const ring: string[] = [];

            trail.pop();

            if ( parent ) lowered(parent.node, reach);

            if ( reach !== order.get(top.node) ) continue;

            for ( let member = stack.pop(); member !== undefined; member = stack.pop() ) {

                stacked.delete(member);
                ring.push(member);

                if ( member === top.node ) break;

            }

            if ( ring.length > 1 ) found.push(ring.sort(byText));

        }

    }

    return found.sort(( left, right ) => byText(left[0] ?? "", right[0] ?? ""));

}

export function defineRules ( rules: Rules ): Resolved {

    const alias = rules.alias ?? "@/";

    if ( typeof rules.root !== "string" || rules.root === "" ) throw exception.fault("internal", "tool.rules", { message: "rules name the root of a surface" });

    if ( !Array.isArray(rules.layers) || rules.layers.length === 0 ) throw exception.fault("internal", "tool.rules", { message: "rules name the layers, lowest first" });

    if ( typeof alias !== "string" || alias === "/" || !alias.endsWith("/") ) throw exception.fault("internal", "tool.rules", { message: "an alias is a prefix ending in a slash, such as @/" });

    if ( rules.only !== undefined && (typeof rules.only !== "object" || Array.isArray(rules.only) || !Object.values(rules.only).every(Array.isArray)) ) throw exception.fault("internal", "tool.rules", { message: "only names, for a folder, the layers that may import it" });

    if ( rules.owners !== undefined && (typeof rules.owners !== "object" || Array.isArray(rules.owners) || !Object.values(rules.owners).every(Array.isArray)) ) throw exception.fault("internal", "tool.rules", { message: "owners name the layers that alone may import an engine member, such as { spec: [\"specs\"] }" });

    if ( rules.framework !== undefined && (typeof rules.framework !== "object" || Array.isArray(rules.framework) || !Object.values(rules.framework).every(Array.isArray)) ) throw exception.fault("internal", "tool.rules", { message: "a framework names the layers it may enter, such as { next: [\"app\"] }" });

    return {
        root: rules.root,
        source: rules.source ?? "src",
        alias,
        layers: [...rules.layers],
        vendor: [...(rules.vendor ?? ["render"])],
        bare: [...(rules.bare ?? [])],
        only: Object.fromEntries(Object.entries(rules.only ?? {}).map(([folder, layers]) => [folder, [...layers]])),
        engine: rules.engine ?? "engine",
        members: [...(rules.members ?? [])],
        framework: Object.fromEntries(Object.entries(rules.framework ?? {}).map(([name, layers]) => [name, [...layers]])),
        owners: Object.fromEntries(Object.entries(rules.owners ?? {}).map(([name, layers]) => [name, [...layers]])),
        outside: [...(rules.outside ?? [])],
        shared: [...(rules.shared ?? shared)],
        entries: [...(rules.entries ?? [])],
    };

}
function mapped ( root: string ): Readonly<Record<string, string>> {

    const path = resolve(root, "tsconfig.json");
    const config = existsSync(path) ? exception.probe(() => JSON.parse(readFileSync(path, "utf8")) as { compilerOptions?: { paths?: Record<string, unknown> } }) : undefined;
    const paths = config?.compilerOptions?.paths ?? {};

    return Object.fromEntries(Object.entries(paths).filter(( entry ): entry is [string, string[]] => entry[0].startsWith("#") && Array.isArray(entry[1]) && typeof entry[1][0] === "string").map(([name, targets]) => [name, targets[0] ?? ""]));

}
export function analyze ( given: Rules ): Analysis {

    const rules = defineRules(given);
    const root = resolve(rules.root, rules.source);
    const files = walk(root, { extensions: [".ts", ".tsx"] }).filter(( file ) => !file.relative.endsWith(".d.ts"));
    const known = new Set(files.map(( file ) => file.relative));
    const rank = new Map(rules.layers.map(( layer, index ) => [layer, index] as const));
    const nested = rules.layers.filter(( layer ) => layer.includes("/")).sort(( a, b ) => b.length - a.length);
    const layerOf = ( path: string ): string => nested.find(( layer ) => path === layer || path.startsWith(`${layer}/`)) ?? headOf(path);
    const graph = new Map<string, string[]>();
    const links = new Map<string, string[]>();
    const issues: Issue[] = [];
    const edges: Record<string, string[]> = {};
    const prefix = `${rules.engine}/`;
    const mappings = mapped(rules.root);

    for ( const file of files ) {

        const head = layerOf(file.relative);
        const from = rank.get(head);
        const inVendor = rules.vendor.some(( folder ) => file.relative.startsWith(`${folder}/`));
        const bare = rules.bare.find(( folder ) => file.relative.startsWith(`${folder}/`));
        const targets = new Set<string>();
        const reached: string[] = [];
        const linked: string[] = [];
        const told = ( line: number, rule: Rule, message: string ): void => {

            issues.push({ file: file.relative, line, message, rule });

        };

        if ( from === undefined && !inVendor ) told(1, "layer", `not in a layer: ${file.relative}`);

        for ( const { target, line, typed } of imports(readFileSync(file.path, "utf8"), file.relative.endsWith(".tsx") ? "tsx" : "ts") ) {

            if ( target === rules.engine || target.startsWith(prefix) ) {

                const member = target.slice(prefix.length);

                if ( bare !== undefined ) told(line, "bare", `${bare}/ speaks only its platform, never the engine: ${target}`);

                if ( target === rules.engine ) told(line, "member", `the whole engine is imported, name a member: ${target}`);
                else if ( rules.members.length && rules.members.includes(headOf(member)) && member.includes("/") ) told(line, "member", `an import reaches inside an engine member: ${target}`);
                else if ( rules.members.length && !rules.members.includes(member) ) told(line, "member", `unknown engine member: ${member}`);

                const owners = Object.hasOwn(rules.owners, headOf(member)) ? rules.owners[headOf(member)] : undefined;

                if ( owners !== undefined && !owners.includes(head) ) told(line, "owner", `${target} is imported only from ${owners.join(", ")}`);

                targets.add(target);

                continue;

            }

            const mapped = target.startsWith("#") ? mappings[target] : undefined;

            if ( target.startsWith("#") && mapped === undefined ) {

                told(line, "outside", `${target} is mapped by no tsconfig.json path`);

                continue;

            }

            if ( mapped !== undefined || target.startsWith(".") || target.startsWith(rules.alias) ) {

                const absolute = mapped !== undefined ? resolve(rules.root, mapped) : target.startsWith(rules.alias) ? join(root, target.slice(rules.alias.length)) : resolve(dirname(file.path), target);
                const inside = slashed(relative(root, absolute));

                if ( inside === ".." || inside.startsWith("../") ) {

                    const beyond = slashed(relative(rules.root, absolute));

                    if ( !rules.outside.some(( folder ) => beyond === folder || beyond.startsWith(`${folder}/`)) ) told(line, "outside", `an import leaves ${rules.source}: ${target}`);

                    targets.add(beyond);

                    continue;

                }

                const to = settled(inside, known);
                const above = rank.get(layerOf(to));
                const fenced = Object.keys(rules.only).find(( folder ) => to.startsWith(`${folder}/`) && !file.relative.startsWith(`${folder}/`));

                targets.add(to);

                if ( fenced !== undefined && !(rules.only[fenced] ?? []).includes(head) ) told(line, "only", `${fenced}/ is imported only from ${(rules.only[fenced] ?? []).join(", ")}: ${target}`);
                if ( to !== file.relative && known.has(to) ) linked.push(to);
                if ( !typed && to !== file.relative && known.has(to) ) reached.push(to);

                if ( from !== undefined && above !== undefined && above > from ) told(line, "layer", `${head} reaches up into ${layerOf(to)}: ${target}`);

                continue;

            }

            if ( isRuntime(target) ) {

                told(line, "runtime", `a runtime import in a surface: ${target}`);

                continue;

            }

            const name = packageOf(target);
            const framed = from !== undefined && (rules.framework[name]?.includes(head) ?? false);

            if ( from !== undefined && !inVendor && !framed && !rules.shared.includes(name) && !rules.shared.includes(target) ) told(line, "vendor", `a third-party import outside ${rules.vendor.join("|")}/: ${target}`);

            targets.add(target);

        }

        edges[file.relative] = [...targets].sort(byText);
        graph.set(file.relative, reached);
        links.set(file.relative, linked);

    }

    return { files: files.length, issues, edges, cycles: cyclesOf(graph), orphans: orphansOf(files.map(( file ) => file.relative), links, rules.entries) };

}
