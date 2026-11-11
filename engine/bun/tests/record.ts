import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { types } from "node:util";
import * as tool from "engine/tool";

const root = resolve(import.meta.dir, "..");
const source = resolve(root, "src");
const members = readdirSync(source, { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && entry.name !== "engine").map(( entry ) => entry.name).sort();
const hosted = new Set(["test", "tool"]);
const apiPath = resolve(root, "tests", "api.json");
const sizePath = resolve(root, "tests", "size.json");

function kept ( path: string ): string | undefined {

    const shown = Bun.spawnSync(["git", "show", `HEAD:engine/bun/tests/${path}`], { cwd: root, stdout: "pipe", stderr: "pipe" });

    return shown.exitCode === 0 ? shown.stdout.toString() : undefined;

}
export async function closureOf ( member: string ): Promise<number> {

    const built = await Bun.build({ entrypoints: [resolve(source, member, "src", "index.ts")], target: "browser", minify: true, splitting: true, external: ["react", "react-dom"], throw: false });

    if ( !built.success ) throw new Error(`${member}: ${built.logs.map(( log ) => log.message).join("; ")}`);

    return built.outputs.filter(( output ) => output.kind === "entry-point").reduce(( sum, output ) => sum + output.size, 0);

}
export function names ( loaded: Record<string, unknown>, prefix = "" ): string[] {

    return Object.entries(loaded).flatMap(([name, found]) => (types.isModuleNamespaceObject(found) ? names(found as Record<string, unknown>, `${prefix}${name}.`) : [`${prefix}${name}`])).sort();

}
export async function surface (): Promise<Record<string, string[]>> {

    const out: Record<string, string[]> = {};

    for ( const member of members ) {

        const loaded: Record<string, unknown> = await import(`engine/${member}`);

        out[member] = names(loaded);

    }

    return out;

}
export async function sizes (): Promise<Record<string, number | null>> {

    const out: Record<string, number | null> = {};

    for ( const member of members ) out[member] = hosted.has(member) ? null : await closureOf(member);

    return out;

}
if ( import.meta.main ) {

    const api = await surface();
    const size = await sizes();
    const beforeApi = kept("api.json");
    const beforeSize = kept("size.json");

    writeFileSync(apiPath, `${JSON.stringify(api, null, 2)}\n`);
    writeFileSync(sizePath, `${JSON.stringify(size, null, 2)}\n`);

    const change = tool.apiDiff(beforeApi ? (JSON.parse(beforeApi) as tool.Surface) : {}, api);
    const growth = tool.sizeDiff(beforeSize ? (JSON.parse(beforeSize) as tool.Sizes) : {}, size);

    await Bun.write(Bun.stdout, `${tool.describeChange(change, growth)}\n${members.length} members · ${Object.values(api).reduce(( sum, list ) => sum + list.length, 0)} exports · ${Object.values(size).reduce<number>(( sum, bytes ) => sum + (bytes ?? 0), 0)} closure bytes\n`);

}
