import { existsSync } from "node:fs";
import { resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";
import type { BunPlugin } from "bun";
import * as tool from "engine/tool";
import postcss from "postcss";
import hutch from "./hutch.config.ts";
import { specs } from "./specs/index.ts";
import { type Hosted, hosted } from "./src/render/bridge/identity.ts";
import { part } from "./src/specs/part.ts";

const electrobun = `bunx electrobun@${hutch.electrobun.version}`;
const sdk = ".hutch/devkit/api/browser/index.ts";
const view: BunPlugin = {
    name: "electrobun-view",
    setup ( build ) {

        build.onResolve({ filter: /^electrobun\/view$/ }, () => ({ path: resolve(import.meta.dir, sdk) }));

    },
};

export default tool.define({
    specs,
    part,
    deploy: ( env ) => ({ contracts: { maps: { key: env.GOOGLE_MAPS_KEY ?? "" }, ...(env.API_URL ? { baseUrl: env.API_URL } : {}) } }),
    tasks: {
        compile: [
            tool.specs(".cache/spec"),
            tool.fonts("public/fonts", { css: ".cache/styles/fonts.css" }),
            tool.theme(".cache/styles/theme.css"),
            tool.call("engine/world", "paint", "public/appearance.js"),
        ],
        analyze: [
            tool.layers({
                layers: ["render/host", "render/bridge", "api", "specs", "styles", "stores", "hooks", "elements", "components", "features", "app"],
                bare: ["render/host"],
                only: { "render/bridge": ["app"] },
                framework: { next: ["app"] },
                outside: [".cache"],
                entries: ["app/**/{layout,page,not-found}.tsx", "app/**/{route,sitemap}.ts", "app/**/index.tsx", "specs/part.ts", "render/host/index.ts", "render/bridge/identity.ts"],
            }),
        ],
        check: ["compile", tool.run("tsc -p ."), "analyze"],
        lint: tool.run("biome ci ."),
        test: tool.run("bun test ./tests"),
        kit: tool.step("kit", ( scope ) => (existsSync(scope.at(sdk)) ? undefined : tool.run(`${electrobun} prepare`))),
        site: ["compile", tool.run("next build"), tool.spoken("out"), tool.copy("out/index.html", "out/404.html"), tool.budget({ js: "out/_next/static/chunks/*.js" })],
        page: [
            "compile",
            "kit",
            tool.each([
                tool.specs(".cache/spec"),
                tool.step("identity {role}", ( scope: tool.Scope<Hosted> ) => void hosted(scope.role)),
                tool.theme(".cache/styles/theme.css"),
                tool.bundle("src/app/(desk)/index.tsx", "dist/{role}", {
                    target: "browser",
                    minify: true,
                    splitting: true,
                    naming: { entry: "app.[ext]", chunk: "chunks/[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
                    plugins: [view],
                    inline: { NODE_ENV: "production" },
                }),
                tool.css("src/styles/globals.css", "dist/{role}/theme.css", postcss([tailwind()])),
                tool.copy("public/appearance.js", "dist/{role}/appearance.js"),
                tool.copy("public/fonts", "dist/{role}/fonts"),
                tool.copy("public/images", "dist/{role}/images"),
                tool.page("src/app/(desk)/index.html", "dist/{role}/index.html"),
                tool.emit("dist/{role}/host.json", hosted),
                tool.budget({ desk: "dist/{role}/**/*.js" }),
                tool.copy("dist/{role}", "dist/current", { clean: true }),
            ]),
        ],
        build: tool.option("release", "release", tool.option("desk", "page", "site")),
        release: tool.env({ ENGINE_ENV: "production" }, tool.option("desk", ["page", tool.run(`${electrobun} build --env=stable`)], "site")),
        dev: tool.option("desk", ["page", tool.run(`${electrobun} dev --watch`)], ["compile", tool.run("next dev")]),
        app: ["page", tool.run(`${electrobun} build --env=dev`)],
        audit: tool.run("bun audit --audit-level=low"),
        gate: ["check", "lint", "test", "site", "page", "audit"],
    },
});
