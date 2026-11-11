import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";
import { current, roles } from "../specs/index.ts";

const root = resolve(import.meta.dirname, "..");

await $`bun ${resolve(root, "tools/compile.ts")}`.cwd(root);
await $`bunx next build`.cwd(root);

const chunks = resolve(root, "out/_next/static/chunks");
const shipped = readdirSync(chunks).filter(( file ) => file.endsWith(".js")).reduce(( sum, file ) => sum + statSync(resolve(chunks, file)).size, 0);
const budget = roles[current].config.settings.budget.js;

console.log(`${current}: ${shipped} bytes of js, budget ${budget}`);

if ( shipped > budget ) {

    console.error(`${current}: the js exceeds its budget by ${shipped - budget} bytes`);
    process.exit(1);

}
