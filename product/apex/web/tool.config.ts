import * as tool from "engine/tool";
import { specs } from "./src/specs/surface.ts";
import { sheet } from "./src/styles/sheet.ts";

export default tool.define({
    specs,
    tasks: {
        compile: [
            tool.specs(".cache/spec"),
            tool.fonts("public/fonts", { css: ".cache/styles/fonts.css" }),
            tool.emit(".cache/styles/theme.css", sheet),
            tool.script("src/native/appearance.ts", "public/appearance.js"),
        ],
        analyze: [
            tool.layers({
                layers: ["native", "types", "api", "specs", "stores", "hooks", "styles", "elements", "components", "features", "app"],
                framework: { next: ["app"] },
                outside: ["specs", ".cache"],
                entries: ["app/**/{layout,page,not-found}.tsx", "app/{robots,sitemap}.ts", "native/appearance.ts", "styles/sheet.ts"],
            }),
            tool.nameless(),
        ],
        check: ["compile", tool.run("tsc -p ."), "analyze"],
        lint: tool.run("biome ci ."),
        test: tool.run("bun test ./tests"),
        build: ["compile", tool.run("next build"), tool.budget({ js: "out/_next/static/chunks/*.js" })],
        release: tool.env({ ENGINE_ENV: "production" }, "build"),
        dev: ["compile", tool.run("next dev")],
        audit: tool.run("bun audit --audit-level=low"),
        gate: ["check", "lint", "test", "build", "audit"],
    },
});
