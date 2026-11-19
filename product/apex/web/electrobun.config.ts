import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ElectrobunConfig } from "electrobun";
import { page, type Spoken, spoken } from "./src/render/host/contract.ts";

export const packaging = { current: "dist/current", build: "build/{role}", artifacts: "artifacts/{role}" };

const told = resolve(import.meta.dir, `${packaging.current}/${spoken}`);
const unbuilt: Spoken = {
    identity: "page",
    name: "Page",
    identifier: "com.example.page",
    version: "0.0.0",
    window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 },
};
const host = existsSync(told) ? (JSON.parse(readFileSync(told, "utf8")) as Spoken) : unbuilt;
const placed = ( path: string ): string => path.replaceAll("{role}", host.identity);

export default {
    app: { name: host.identifier.split(".").slice(1).join("-"), identifier: host.identifier, version: host.version, description: host.name },
    build: {
        mainProcess: "bun",
        buildFolder: placed(packaging.build),
        artifactFolder: `${placed(packaging.artifacts)}/desk`,
        bun: { entrypoint: "src/render/host/index.ts", minify: true, sourcemap: false },
        copy: { [packaging.current]: `views/${page}` },
        mac: { bundleCEF: false },
        win: { bundleCEF: false },
        linux: { bundleCEF: false },
    },
    runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
