import tailwind from "@tailwindcss/postcss";
import * as tool from "engine/tool";
import postcss from "postcss";
import { hostPlugin } from "./host/src/plugin.ts";
import { specs } from "./specs/index.ts";
import { sheet } from "./src/app/sheet.ts";
import { hosted } from "./src/host/host.ts";
import { part } from "./src/specs/part.ts";

export default tool.define({
    specs,
    part,
    deploy: ( env ) => ({ contracts: { maps: { key: env.GOOGLE_MAPS_KEY ?? "" }, ...(env.API_URL ? { baseUrl: env.API_URL } : {}) } }),
    tasks: {
        compile: [
            tool.specs(".cache/spec"),
            tool.fonts(".cache/fonts", { css: ".cache/styles/fonts.css" }),
            tool.call("engine/world", "paint", ".cache/appearance.js"),
        ],
        analyze: [
            tool.layers({
                layers: ["host", "types", "api", "specs", "stores", "hooks", "styles", "elements", "components", "features", "app"],
                outside: [".cache"],
                entries: ["app/index.tsx", "host/host.ts", "app/sheet.ts", "specs/part.ts"],
            }),
            tool.nameless(),
        ],
        check: ["compile", tool.run("tsc -p ."), "analyze", tool.run("bun run --cwd host typecheck")],
        lint: [tool.run("biome ci ."), tool.run("bun run --cwd host check")],
        test: [tool.run("bun test ./tests"), tool.run("bun run --cwd host test")],
        build: [
            "compile",
            tool.each([
                tool.specs(".cache/spec"),
                tool.emit(".cache/styles/theme.css", sheet),
                tool.bundle("src/app/index.tsx", "dist/{role}", {
                    target: "browser",
                    minify: true,
                    splitting: true,
                    naming: { entry: "app.[ext]", chunk: "chunks/[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
                    plugins: [hostPlugin()],
                    inline: { NODE_ENV: "production" },
                }),
                tool.css("src/app/globals.css", "dist/{role}/theme.css", postcss([tailwind()])),
                tool.copy(".cache/appearance.js", "dist/{role}/appearance.js"),
                tool.copy(".cache/fonts", "dist/{role}/fonts"),
                tool.page("src/app/index.html", "dist/{role}/index.html"),
                tool.emit("dist/{role}/host.json", hosted),
                tool.budget({ js: "dist/{role}/**/*.js" }),
                tool.copy("dist/{role}", "dist/current", { clean: true }),
            ]),
        ],
        release: tool.env({ ENGINE_ENV: "production" }, ["build", tool.run("bun run --cwd host app --env=stable")]),
        app: ["build", tool.run("bun run --cwd host app")],
        dev: ["build", tool.run("bun run --cwd host dev")],
        audit: [tool.run("bun audit --audit-level=low"), tool.run("bun run --cwd host audit")],
        gate: ["check", "lint", "test", "build", "audit"],
    },
});
