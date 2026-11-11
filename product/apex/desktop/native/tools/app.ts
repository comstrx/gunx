import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { electrobun, root } from "./electrobun.ts";

export type Env = "dev" | "canary" | "stable";

const envs: readonly Env[] = ["dev", "canary", "stable"];

export function envOf ( argument: string | undefined ): Env {

    const chosen = argument?.slice("--env=".length);
    const found = envs.find(( env ) => env === chosen);

    if ( argument && !found ) throw new Error(`Unknown build environment ${chosen}; expected one of ${envs.join(", ")}.`);

    return found ?? "dev";

}

if ( import.meta.main ) {

    if ( !existsSync(resolve(root, "../dist/current/host.json")) ) throw new Error("No built page under dist/current: run `bun run build` first.");

    const env = envOf(process.argv.find(( argument ) => argument.startsWith("--env=")));

    await electrobun("build", `--env=${env}`);

}
