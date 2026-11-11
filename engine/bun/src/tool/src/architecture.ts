import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as error from "engine-error";
import { byText, walk } from "./core.ts";

export type Rules = {
    root: string;
    source?: string | undefined;
    alias?: string | undefined;
    layers: readonly string[];
    vendor?: readonly string[] | undefined;
    engine?: string | undefined;
    members?: readonly string[] | undefined;
    framework?: readonly string[] | undefined;
    frameworkLayers?: readonly string[] | undefined;
    outside?: readonly string[] | undefined;
    shared?: readonly string[] | undefined;
};
export type Resolved = {
    root: string;
    source: string;
    alias: string;
    layers: readonly string[];
    vendor: readonly string[];
    engine: string;
    members: readonly string[];
    framework: readonly string[];
    frameworkLayers: readonly string[];
    outside: readonly string[];
    shared: readonly string[];
};
export type Rule = "layer" | "member" | "outside" | "runtime" | "vendor";
export type Issue = { file: string; line: number; message: string; rule: Rule };
export type Analysis = { files: number; issues: Issue[]; edges: Record<string, string[]>; cycles: string[][] };

type Found = { target: string; line: number; typed: boolean };
type Visit = { node: string; next: number };

const clause = /^[ \t]*import\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:[\w$]+|\*\s*as\s+[\w$]+|\{[^}]*\})\s*from\s*["']([^"']+)["']/;
const passed = /^[ \t]*export\s+(type\s+)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/;
const bare = /^[ \t]*import\s*["']([^"']+)["']/;
const called = /(?<![.\w$])(?:import|require)\(\s*["']([^"']+)["']/;
const importPattern = new RegExp([clause, passed, bare, called].map(( part ) => part.source).join("|"), "gm");
const commented = /^[ \t]*\/\/[^\n]*|^[ \t]*\/\*[\s\S]*?\*\//gm;
const visible = /[^\n]/g;
const scripted = /\.[cm]?jsx?$/;
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

        if ( target !== "" ) found.push({ target, line, typed: match[1] !== undefined || match[3] !== undefined });

    }

    return found;

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

    if ( typeof rules.root !== "string" || rules.root === "" ) throw error.fault("internal", "tool.rules", { message: "rules name the root of a surface" });

    if ( !Array.isArray(rules.layers) || rules.layers.length === 0 ) throw error.fault("internal", "tool.rules", { message: "rules name the layers, lowest first" });

    if ( typeof alias !== "string" || alias === "/" || !alias.endsWith("/") ) throw error.fault("internal", "tool.rules", { message: "an alias is a prefix ending in a slash, such as @/" });

    return {
        root: rules.root,
        source: rules.source ?? "src",
        alias,
        layers: [...rules.layers],
        vendor: [...(rules.vendor ?? ["native"])],
        engine: rules.engine ?? "engine",
        members: [...(rules.members ?? [])],
        framework: [...(rules.framework ?? [])],
        frameworkLayers: [...(rules.frameworkLayers ?? ["app"])],
        outside: [...(rules.outside ?? [])],
        shared: [...(rules.shared ?? shared)],
    };

}
export function analyze ( given: Rules ): Analysis {

    const rules = defineRules(given);
    const root = resolve(rules.root, rules.source);
    const files = walk(root, { extensions: [".ts", ".tsx"] }).filter(( file ) => !file.relative.endsWith(".d.ts"));
    const known = new Set(files.map(( file ) => file.relative));
    const rank = new Map(rules.layers.map(( layer, index ) => [layer, index] as const));
    const graph = new Map<string, string[]>();
    const issues: Issue[] = [];
    const edges: Record<string, string[]> = {};
    const prefix = `${rules.engine}/`;

    for ( const file of files ) {

        const head = headOf(file.relative);
        const from = rank.get(head);
        const inVendor = rules.vendor.some(( folder ) => file.relative.startsWith(`${folder}/`));
        const targets = new Set<string>();
        const reached: string[] = [];
        const told = ( line: number, rule: Rule, message: string ): void => {

            issues.push({ file: file.relative, line, message, rule });

        };

        if ( from === undefined && !inVendor ) told(1, "layer", `not in a layer: ${file.relative}`);

        for ( const { target, line, typed } of scanned(readFileSync(file.path, "utf8")) ) {

            if ( target === rules.engine || target.startsWith(prefix) ) {

                const member = target.slice(prefix.length);

                if ( target === rules.engine ) told(line, "member", `the whole engine is imported, name a member: ${target}`);
                else if ( rules.members.length && rules.members.includes(headOf(member)) && member.includes("/") ) told(line, "member", `an import reaches inside an engine member: ${target}`);
                else if ( rules.members.length && !rules.members.includes(member) ) told(line, "member", `unknown engine member: ${member}`);

                targets.add(target);

                continue;

            }

            if ( target.startsWith(".") || target.startsWith(rules.alias) ) {

                const absolute = target.startsWith(rules.alias) ? join(root, target.slice(rules.alias.length)) : resolve(dirname(file.path), target);
                const inside = slashed(relative(root, absolute));

                if ( inside === ".." || inside.startsWith("../") ) {

                    const beyond = slashed(relative(rules.root, absolute));

                    if ( !rules.outside.some(( folder ) => beyond === folder || beyond.startsWith(`${folder}/`)) ) told(line, "outside", `an import leaves ${rules.source}: ${target}`);

                    targets.add(beyond);

                    continue;

                }

                const to = settled(inside, known);
                const above = rank.get(headOf(to));

                targets.add(to);

                if ( !typed && to !== file.relative && known.has(to) ) reached.push(to);

                if ( from !== undefined && above !== undefined && above > from ) told(line, "layer", `${head} reaches up into ${headOf(to)}: ${target}`);

                continue;

            }

            if ( isRuntime(target) ) {

                told(line, "runtime", `a runtime import in a surface: ${target}`);

                continue;

            }

            const name = packageOf(target);
            const framed = from !== undefined && rules.framework.includes(name) && rules.frameworkLayers.includes(head);

            if ( from !== undefined && !inVendor && !framed && !rules.shared.includes(name) && !rules.shared.includes(target) ) told(line, "vendor", `a third-party import outside ${rules.vendor.join("|")}/: ${target}`);

            targets.add(target);

        }

        edges[file.relative] = [...targets].sort(byText);
        graph.set(file.relative, reached);

    }

    return { files: files.length, issues, edges, cycles: cyclesOf(graph) };

}
