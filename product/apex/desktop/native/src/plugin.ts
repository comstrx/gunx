import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BunPlugin } from "bun";

const root = resolve(import.meta.dir, "..");
const devkit = resolve(root, ".hutch/devkit/api/browser/index.ts");
const view = /^electrobun\/view$/;

export function viewSdk (): string {

    if ( !existsSync(devkit) ) throw new Error("The desktop runtime is not prepared: run `bun run native prepare` first.");

    return devkit;

}
export function nativePlugin (): BunPlugin {

    return {
        name: "desktop-native",
        setup ( build ) {

            build.onResolve({ filter: view }, () => ({ path: viewSdk() }));

        },
    };

}
