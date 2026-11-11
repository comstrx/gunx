import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as stage from "engine/test";
import * as tool from "engine/tool";
import { bench, do_not_optimize, run } from "mitata";

const engine = resolve(import.meta.dir, "..");
const record = join(engine, "tests", "api.json");
const surface = tool.readJson<tool.Surface>(record) ?? {};
const grown = Object.fromEntries(Object.entries(surface).map(([member, names]) => [member, [...names, "extra"]]));
const sizes = Object.fromEntries(Object.keys(surface).map(( member, at ) => [member, at * 100]));
const resized = Object.fromEntries(Object.keys(surface).map(( member, at ) => [member, at * 100 + (at % 3)]));
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
bench("tool.analyze.40", () => do_not_optimize(tool.analyze({ root: temp.path, layers, members: ["json"] })));
bench("tool.defineRules", () => do_not_optimize(tool.defineRules({ root: temp.path, layers })));
bench("tool.apiDiff record", () => do_not_optimize(tool.apiDiff(surface, grown)));
bench("tool.sizeDiff", () => do_not_optimize(tool.sizeDiff(sizes, resized)));
bench("tool.describeChange", () => do_not_optimize(tool.describeChange(tool.apiDiff(surface, grown), tool.sizeDiff(sizes, resized))));
bench("tool.digestOf 1KB", () => do_not_optimize(tool.digestOf(kilobyte)));
bench("tool.digestOf 1MB", () => do_not_optimize(tool.digestOf(megabyte)));
bench("tool.readJson record", () => do_not_optimize(tool.readJson(record)));
bench("tool.writeJson unchanged", () => do_not_optimize(tool.writeJson(written, surface)));

await run();

temp.remove();
