import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ElectrobunConfig } from "electrobun";
import type { Spoken } from "./src/contract.ts";

const current = resolve(import.meta.dir, "../dist/current/host.json");
const unbuilt: Spoken = {
    identity: "page",
    name: "Page",
    identifier: "com.example.page",
    version: "0.0.0",
    window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 },
};
const host = existsSync(current) ? (JSON.parse(readFileSync(current, "utf8")) as Spoken) : unbuilt;

export default {
    app: { name: host.identifier.split(".").slice(1).join("-"), identifier: host.identifier, version: host.version, description: host.name },
    build: {
        mainProcess: "bun",
        bun: { entrypoint: "src/index.ts", minify: true, sourcemap: false },
        copy: { "../dist/current": "views/page" },
        mac: { bundleCEF: false },
        win: { bundleCEF: false },
        linux: { bundleCEF: false },
    },
    runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
