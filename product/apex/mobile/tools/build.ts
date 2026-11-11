import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";
import { current, roles } from "../specs/index.ts";

const root = resolve(import.meta.dirname, "..");
const env = { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL ?? "", EXPO_PUBLIC_ENGINE_ENV: process.env.EXPO_PUBLIC_ENGINE_ENV ?? process.env.ENGINE_ENV ?? "" };

await $`bun ${resolve(root, "tools/compile.ts")}`.cwd(root).env(env);
await $`bunx expo export --platform android --output-dir dist/client`.cwd(root).env(env);

const bundles = resolve(root, "dist/client/_expo/static/js/android");
const shipped = readdirSync(bundles).filter(( file ) => file.endsWith(".hbc")).reduce(( sum, file ) => sum + statSync(resolve(bundles, file)).size, 0);
const budget = roles[current].config.settings.budget.bundle;

console.log(`${current}: ${shipped} bytes of hermes bytecode, budget ${budget}`);

if ( shipped > budget ) {

    console.error(`${current}: the bundle exceeds its budget by ${shipped - budget} bytes`);
    process.exit(1);

}
