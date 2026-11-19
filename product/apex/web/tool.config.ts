import { existsSync } from "node:fs";
import { resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";
import * as tool from "engine/tool";
import postcss from "postcss";
import { packaging } from "./electrobun.config.ts";
import hutch from "./hutch.config.ts";
import { seeds } from "./seeds/index.ts";
import { specs } from "./specs/index.ts";
import { type Hosted, hosted } from "./src/render/bridge/identity.ts";
import { socket, spoken } from "./src/render/host/contract.ts";
import { part } from "./src/specs/part.ts";

export const project = tool.project({
    specs,
    part,
    seeds,
    assets: { root: "{public}", into: "{public}/{served}", entry: { security: "{public}/.well-known" }, places: { fonts: "{typefaces}", paint: "{paint}" } },
    paths: {
        public: "public",
        served: "_generated",
        typefaces: "{public}/fonts",
        paint: "{public}/appearance.js",
        theme: ".cache/styles/theme.css",
        fonts: ".cache/styles/fonts.css",
        out: "out",
        dist: "dist/{role}",
        current: packaging.current,
        build: packaging.build,
        artifacts: packaging.artifacts,
        devkit: ".hutch/devkit",
        electrobun: `bunx electrobun@${hutch.electrobun.version}`,
    },
    steps: {
        site: [
            { specs: "#spec" },
            { theme: "{theme}" },
            { run: "next build" },
            { spoken: "{out}" },
            { copy: { from: "{out}/index.html", to: "{out}/404.html" } },
            { budget: { js: "{out}/_next/static/chunks/*.js" } },
        ],
        page: [
            { specs: "#spec" },
            { step: "identity {role}", act: ( scope: tool.Scope<Hosted> ) => void hosted(scope.role) },
            { theme: "{theme}" },
            {
                bundle: {
                    from: "src/app/(desk)/index.tsx",
                    to: "{dist}",
                    target: "browser",
                    minify: true,
                    splitting: true,
                    naming: { entry: "app.[ext]", chunk: "chunks/[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
                    plugins: [{
                        name: "electrobun-view",
                        setup ( build ) {
                            build.onResolve({ filter: /^electrobun\/view$/ }, () => ({
                                path: resolve(import.meta.dir, ".hutch/devkit/api/browser/index.ts")
                            }));
                        },
                    }],
                    inline: { NODE_ENV: "production" },
                },
            },
            { css: { from: "#styles.css", to: "{dist}/theme.css", processor: postcss([tailwind()]) } },
            { copy: { from: "{public}", to: "{dist}" } },
            { page: { from: "src/app/(desk)/index.html", to: "{dist}/index.html", sources: { "connect-src": [socket] } } },
            { emit: { to: `{dist}/${spoken}`, content: hosted } },
            { budget: { desk: "{dist}/**/*.js" } },
            { copy: { from: "{dist}", to: "{current}", clean: true } },
        ],
        website: ["compile", { each: "site" }],
        desktop: { target: { platform: "desktop" }, steps: ["compile", "kit", { each: "page" }] },
        kit: { step: "kit", act: ( scope ) => (existsSync(scope.at("{devkit}")) ? undefined : tool.run("{electrobun} prepare")) },
    },
    tasks: {
        compile: [
            { specs: "#spec" },
            { fonts: { into: "{typefaces}", css: "{fonts}" } },
            { theme: "{theme}" },
            { styles: { into: "#styles.css", imports: ["src/styles/globals.css", "{fonts}", "{theme}"] } },
            { call: { module: "engine/world", name: "paint", to: "{paint}" } },
        ],
        analyze: {
            layers: {
                framework: { next: ["app"] },
                bare: ["render/host"],
                only: { "render/bridge": ["app"] },
                owners: { spec: ["specs"], api: ["api"], tool: [] },
                outside: [".cache", "messages"],
                layers: ["render/host", "render/bridge", "api", "specs", "styles", "stores", "hooks", "elements", "components", "features", "app"],
                entries: ["app/**/{layout,page,not-found}.tsx", "app/**/{route,sitemap}.ts", "app/**/index.tsx", "specs/part.ts", "render/host/index.ts", "render/bridge/identity.ts"],
            },
        },
        check: ["compile", { run: "tsc -p ." }, "analyze"],
        lint: { run: "biome ci ." },
        test: ["compile", { run: "bun test ./tests" }],
        build: { option: "release", on: "release", off: { option: "desk", on: "desktop", off: "website" } },
        release: {
            target: { release: true },
            steps: {
                option: "desk",
                on: { target: { platform: "desktop" }, steps: ["compile", "kit", { each: ["page", { run: "{electrobun} build --env=stable" }] }] },
                off: ["compile", { each: ["site", { copy: { from: "{out}", to: "{artifacts}/site", clean: true } }] }],
            },
        },
        dev: { option: "desk", on: ["desktop", { run: "{electrobun} dev --watch" }], off: ["compile", { run: "next dev" }] },
        audit: { run: "bun audit --audit-level=low" },
        gate: ["check", "lint", "test", "website", "desktop", "audit"],
    },
});

export default project;

if ( import.meta.main ) process.exitCode = await tool.start(project, Bun.argv.slice(2), import.meta.dir);
