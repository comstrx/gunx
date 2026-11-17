import * as tool from "engine/tool";
import { specs } from "./specs/index.ts";
import { sheet } from "./src/app/sheet.ts";
import { part } from "./src/specs/part.ts";

export default tool.define({
    specs,
    part,
    deploy: ( env ) => ({ contracts: { maps: { key: env.GOOGLE_MAPS_KEY ?? "" }, ...(env.API_URL ? { baseUrl: env.API_URL } : {}) } }),
    tasks: {
        compile: [
            tool.specs(".cache/spec"),
            tool.fonts("public/fonts", { css: ".cache/styles/fonts.css" }),
            tool.emit(".cache/styles/theme.css", sheet),
            tool.call("engine/world", "paint", "public/appearance.js"),
        ],
        analyze: [
            tool.layers({
                layers: ["types", "api", "specs", "stores", "hooks", "styles", "elements", "components", "features", "app"],
                framework: { next: ["app"] },
                outside: [".cache"],
                entries: ["app/**/{layout,page,not-found}.tsx", "app/{robots,sitemap}.ts", "app/sheet.ts", "specs/part.ts"],
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
