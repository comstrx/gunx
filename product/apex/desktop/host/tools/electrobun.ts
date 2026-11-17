import { resolve } from "node:path";
import { $ } from "bun";
import config from "../hutch.config.ts";

export const version = config.electrobun.version;
export const root = resolve(import.meta.dir, "..");

export async function electrobun ( ...args: string[] ): Promise<void> {

    await $`bunx electrobun@${version} ${args}`.cwd(root);

}

if ( import.meta.main ) await electrobun(...process.argv.slice(2));
