import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as stage from "engine/test";
import * as tool from "engine/tool";
import { bench, do_not_optimize, run } from "mitata";

const engine = resolve(import.meta.dir, "..");
const members = readdirSync(join(engine, "src"), { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && entry.name !== "engine").map(( entry ) => entry.name);
const surface: Record<string, string[]> = Object.fromEntries(await Promise.all(members.map(async ( member ) => [member, Object.keys(await import(`engine/${member}`)).sort()] as const)));
const temp = stage.tmp("engine-tool-bench-");
const kilobyte = "x".repeat(1024);
const megabyte = new Uint8Array(1024 * 1024);
const layers = ["api", "stores", "components", "features", "app"];

for ( const [at, layer] of layers.entries() ) {

    mkdirSync(join(temp.path, "src", layer), { recursive: true });

    for ( let index = 0; index < 8; index += 1 ) {

        const below = at === 0 ? "" : `import { v0 } from "../${layers[at - 1]}/f0.ts";\n`;

        writeFileSync(join(temp.path, "src", layer, `f${index}.ts`), `${below}import { v${(index + 1) % 8} } from "./f${(index + 1) % 8}.ts";\nimport * as json from "engine/json";\nimport { useState } from "react";\n// import gone from "node:fs";\nexport const v${index} = ${index};\n`);

    }

}

const written = join(temp.path, "same.json");

tool.writeJson(written, surface);

bench("tool.members", () => do_not_optimize(tool.members(engine)));
bench("tool.walk.src", () => do_not_optimize(tool.walk(resolve(engine, "src"), { extensions: [".ts"] })));
bench("tool.walk.src ignore", () => do_not_optimize(tool.walk(resolve(engine, "src"), { extensions: [".ts"], ignore: ["world/asset", "data"] })));
bench("tool.sizeOf.src", () => do_not_optimize(tool.sizeOf(resolve(engine, "src"), [".ts"])));
bench("tool.measure.src ts", () => do_not_optimize(tool.measure(resolve(engine, "src"), "*/src/**/*.ts")));
bench("tool.measure.src ts gzip", () => do_not_optimize(tool.measure(resolve(engine, "src"), "*/src/**/*.ts", true)));
bench("tool.analyze.40", () => do_not_optimize(tool.analyze({ root: temp.path, layers, members: ["json"] })));
bench("tool.defineRules", () => do_not_optimize(tool.defineRules({ root: temp.path, layers })));
bench("tool.digestOf 1KB", () => do_not_optimize(tool.digestOf(kilobyte)));
bench("tool.digestOf 1MB", () => do_not_optimize(tool.digestOf(megabyte)));
bench("tool.readJson manifest", () => do_not_optimize(tool.readJson(join(engine, "package.json"))));
bench("tool.writeJson unchanged", () => do_not_optimize(tool.writeJson(written, surface)));
bench("tool.render", () => do_not_optimize(tool.render("<html lang=\"{{lang}}\"><meta content=\"{{csp}}\"></html>", { lang: "ar", csp: tool.csp("https://api.example.test/v1") })));

await run();

temp.remove();
