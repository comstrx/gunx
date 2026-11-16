import tailwind from "@tailwindcss/postcss";
import * as tool from "engine/tool";
import postcss from "postcss";
import { nativePlugin } from "./native/src/plugin.ts";
import { hosted } from "./src/native/host.ts";
import { specs } from "./src/specs/surface.ts";
import { sheet } from "./src/styles/sheet.ts";

export default tool.define({
    specs,
    tasks: {
        compile: [
            tool.specs(".cache/spec", { settings: ["app"] }),
            tool.fonts(".cache/fonts", { css: ".cache/styles/fonts.css" }),
            tool.script("src/native/appearance.ts", ".cache/appearance.js"),
        ],
        analyze: [
            tool.layers({
                layers: ["native", "types", "api", "specs", "stores", "hooks", "styles", "elements", "components", "features", "app"],
                outside: ["specs", ".cache"],
                entries: ["app/index.tsx", "native/appearance.ts", "native/host.ts", "styles/sheet.ts"],
            }),
            tool.nameless(),
        ],
        check: ["compile", tool.run("tsc -p ."), "analyze", tool.run("bun run --cwd native typecheck")],
        lint: [tool.run("biome ci ."), tool.run("bun run --cwd native check")],
        test: [tool.run("bun test ./tests"), tool.run("bun run --cwd native test")],
        build: [
            "compile",
            tool.each([
                tool.emit(".cache/styles/theme.css", sheet),
                tool.bundle("src/app/index.tsx", "dist/{role}", {
                    target: "browser",
                    minify: true,
                    splitting: true,
                    naming: { entry: "app.[ext]", chunk: "chunks/[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
                    plugins: [nativePlugin()],
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
        release: tool.env({ ENGINE_ENV: "production" }, ["build", tool.run("bun run --cwd native app --env=stable")]),
        app: ["build", tool.run("bun run --cwd native app")],
        dev: ["build", tool.run("bun run --cwd native dev")],
        audit: [tool.run("bun audit --audit-level=low"), tool.run("bun run --cwd native audit")],
        gate: ["check", "lint", "test", "build", "audit"],
    },
});
