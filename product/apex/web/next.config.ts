import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { NextConfig } from "next";

function shared ( one: string, other: string ): string {

    const parts = one.split(sep);
    const others = other.split(sep);
    const until = parts.findIndex(( part, index ) => part !== others[index]);

    return parts.slice(0, until === -1 ? parts.length : until).join(sep) || sep;

}

const home = import.meta.dirname;
const engine = realpathSync(resolve(home, "node_modules/engine"));
const manifest = JSON.parse(readFileSync(resolve(engine, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
const members = Object.keys(manifest.dependencies ?? {}).filter(( name ) => name.startsWith("engine-"));
const root = shared(home, engine);
const output = process.env.WEB_OUTPUT === "standalone" ? "standalone" : "export";

const config: NextConfig = {
    output,
    reactStrictMode: true,
    env: { API_URL: process.env.API_URL ?? "", ENGINE_ENV: process.env.ENGINE_ENV ?? "" },
    poweredByHeader: false,
    transpilePackages: ["engine", ...members],
    trailingSlash: false,
    images: { unoptimized: true },
    outputFileTracingRoot: root,
    turbopack: { root },
};

export default config;
